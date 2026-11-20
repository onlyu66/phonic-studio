import { BgmScriptPayload, EdgeTtsSegmentAudio } from '../shared/ttsTypes';
import { deriveBgmSynthProfile } from './scriptAnalysis';

/**
 * Encodes mono Float32 PCM samples (-1.0 to 1.0) into a standard 16-bit PCM RIFF WAV byte array.
 */
export function encodePcmToWavBytes(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataByteLength = samples.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM subchunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Generates a 100% free procedural instrumental WAV track in the browser using OfflineAudioContext,
 * driven by BPM, mood/prompt profile, target duration, and optional ducking gain.
 */
export async function synthesizeProceduralBgmWav(
  payload: BgmScriptPayload,
  durationSec: number,
  applyDuckingGain: boolean,
): Promise<{
  blob: Blob;
  blobUrl: string;
  sizeBytes: number;
  durationSec: number;
  styleLabel: string;
}> {
  const sampleRate = 24000;
  const safeDuration = Math.max(4, Math.min(180, Math.round(durationSec)));
  const totalFrames = safeDuration * sampleRate;

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!OfflineCtx) {
    throw new Error('OfflineAudioContext is not supported in this browser.');
  }

  const ctx = new OfflineCtx(1, totalFrames, sampleRate);
  const profile = deriveBgmSynthProfile(payload);

  // Master bus with warm lowpass + optional ducking_gain scaling + fade in/out
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(profile.filterCutoffHz, 0);
  lowpass.Q.setValueAtTime(0.7, 0);

  const masterGain = ctx.createGain();
  const baseGain = applyDuckingGain ? payload.ducking_gain : 0.72;
  masterGain.gain.setValueAtTime(0.001, 0);
  masterGain.gain.linearRampToValueAtTime(baseGain, Math.min(0.6, safeDuration * 0.1));
  masterGain.gain.setValueAtTime(baseGain, Math.max(0.6, safeDuration - 1.2));
  masterGain.gain.linearRampToValueAtTime(0.001, safeDuration);

  lowpass.connect(masterGain);
  masterGain.connect(ctx.destination);

  // Create reusable white noise buffer for snare & hi-hat
  const noiseBuf = ctx.createBuffer(1, Math.floor(sampleRate * 0.25), sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  let seed = 1337;
  for (let i = 0; i < noiseData.length; i++) {
    seed = (seed * 16807) % 2147483647;
    noiseData[i] = (seed / 2147483647) * 2 - 1;
  }

  const stepSec = 60 / payload.bpm / 2; // 8th-note grid
  const totalSteps = Math.floor(safeDuration / stepSec);

  // Corporate/Lo-Fi uplifting progression: Fmaj7 -> G6 -> Em7 -> Am9 (in Hz)
  const chords: number[][] = [
    [174.61, 220.0, 261.63, 329.63], // Fmaj7
    [196.0, 246.94, 293.66, 329.63], // G6
    [164.81, 196.0, 246.94, 293.66], // Em7
    [220.0, 261.63, 329.63, 392.0], // Am7
  ];

  const melodyNotes = [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 440.0];

  const triggerKick = (time: number) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    g.gain.setValueAtTime(0.85, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    osc.connect(g);
    g.connect(lowpass);
    osc.start(time);
    osc.stop(time + 0.24);
  };

  const triggerSnare = (time: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1750, time);
    bp.Q.setValueAtTime(0.9, time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    src.connect(bp);
    bp.connect(g);
    g.connect(lowpass);
    src.start(time);
    src.stop(time + 0.15);
  };

  const triggerHat = (time: number, accent: boolean) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(6200, time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(accent ? 0.12 : 0.06, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
    src.connect(hp);
    hp.connect(g);
    g.connect(lowpass);
    src.start(time);
    src.stop(time + 0.05);
  };

  const triggerChord = (time: number, freqs: number[], lengthSec: number) => {
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = profile.groove === 'driving-synth' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, time);
      g.gain.setValueAtTime(0.001, time);
      g.gain.linearRampToValueAtTime(0.085, time + 0.08);
      g.gain.exponentialRampToValueAtTime(0.015, time + lengthSec);
      osc.connect(g);
      g.connect(lowpass);
      osc.start(time);
      osc.stop(time + lengthSec + 0.02);
    }
  };

  const triggerSynthPluck = (time: number, freq: number) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(0.11, time + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, time + stepSec * 1.4);
    osc.connect(g);
    g.connect(lowpass);
    osc.start(time);
    osc.stop(time + stepSec * 1.5);
  };

  for (let step = 0; step < totalSteps; step++) {
    const isOffbeat = step % 2 === 1;
    const swingOffset = isOffbeat ? stepSec * profile.swingRatio : 0;
    const t = step * stepSec + swingOffset;
    if (t >= safeDuration - 0.1) break;

    const barStep = step % 8; // 8 eighth-notes per 4/4 bar

    if (profile.groove !== 'ambient-pad') {
      // Steady driving lo-fi beat
      if (barStep === 0 || barStep === 3 || barStep === 4) {
        triggerKick(t);
      }
      if (barStep === 2 || barStep === 6) {
        triggerSnare(t);
      }
      triggerHat(t, barStep % 2 === 0);
    }

    // Chord at the start of every bar (8 steps)
    if (barStep === 0) {
      const barIndex = Math.floor(step / 8);
      const chord = chords[barIndex % chords.length];
      triggerChord(t, chord, stepSec * 7.8);
    }

    // Light synthesizer melody plucks on syncopated steps
    if (barStep === 0 || barStep === 3 || barStep === 5 || barStep === 7) {
      const noteFreq = melodyNotes[(step + Math.floor(step / 8)) % melodyNotes.length];
      triggerSynthPluck(t, noteFreq);
    }
  }

  const rendered = await ctx.startRendering();
  const pcm = rendered.getChannelData(0);
  const wavBytes = encodePcmToWavBytes(pcm, sampleRate);
  const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
  const blobUrl = URL.createObjectURL(blob);

  return {
    blob,
    blobUrl,
    sizeBytes: wavBytes.byteLength,
    durationSec: safeDuration,
    styleLabel: `${profile.label} · ${payload.bpm} BPM`,
  };
}

export function resampleMonoPcm(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate || samples.length === 0) {
    return samples;
  }
  const ratio = fromRate / toRate;
  const targetLength = Math.max(1, Math.round(samples.length / ratio));
  const out = new Float32Array(targetLength);
  for (let i = 0; i < targetLength; i++) {
    const srcIdx = i * ratio;
    const low = Math.floor(srcIdx);
    const high = Math.min(samples.length - 1, low + 1);
    const frac = srcIdx - low;
    out[i] = samples[low] * (1 - frac) + samples[high] * frac;
  }
  return out;
}

export function stitchMonoPcmSegments(
  segments: Array<{ samples: Float32Array; pauseAfterMs: number }>,
  sampleRate: number,
): Float32Array {
  const totalSamples = segments.reduce((sum, seg) => {
    const pauseSamples = Math.max(0, Math.round((seg.pauseAfterMs / 1000) * sampleRate));
    return sum + seg.samples.length + pauseSamples;
  }, 0);

  const combined = new Float32Array(totalSamples);
  let offset = 0;
  for (const seg of segments) {
    combined.set(seg.samples, offset);
    offset += seg.samples.length;
    const pauseSamples = Math.max(0, Math.round((seg.pauseAfterMs / 1000) * sampleRate));
    offset += pauseSamples;
  }
  return combined;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function decodeAndStitchMp3SegmentsToWav(
  segments: EdgeTtsSegmentAudio[],
): Promise<{
  blob: Blob;
  blobUrl: string;
  sizeBytes: number;
  durationSec: number;
}> {
  if (segments.length === 0) {
    throw new Error('No synthesized audio segments returned by No-Key Edge TTS.');
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  const targetSampleRate = 24000;
  const ctx = new AudioCtx();
  try {
    const decodedSegments: Array<{ samples: Float32Array; pauseAfterMs: number }> = [];

    for (const seg of segments) {
      const mp3Buffer = base64ToArrayBuffer(seg.audioBase64);
      const audioBuf = await ctx.decodeAudioData(mp3Buffer);

      let mono: Float32Array;
      if (audioBuf.numberOfChannels === 1) {
        mono = audioBuf.getChannelData(0);
      } else {
        mono = new Float32Array(audioBuf.length);
        for (let ch = 0; ch < audioBuf.numberOfChannels; ch++) {
          const chData = audioBuf.getChannelData(ch);
          for (let i = 0; i < audioBuf.length; i++) {
            mono[i] += chData[i] / audioBuf.numberOfChannels;
          }
        }
      }

      const speedMultiplier =
        seg.playbackMultiplier && seg.playbackMultiplier > 0.5 && seg.playbackMultiplier < 1.8
          ? seg.playbackMultiplier
          : 1;
      const resampled = resampleMonoPcm(
        mono,
        audioBuf.sampleRate * speedMultiplier,
        targetSampleRate,
      );
      decodedSegments.push({
        samples: resampled,
        pauseAfterMs: seg.pauseAfterMs,
      });
    }

    const combinedPcm = stitchMonoPcmSegments(decodedSegments, targetSampleRate);
    const wavBytes = encodePcmToWavBytes(combinedPcm, targetSampleRate);
    const durationSec = Math.round((combinedPcm.length / targetSampleRate) * 10) / 10;
    const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
    const blobUrl = URL.createObjectURL(blob);

    return {
      blob,
      blobUrl,
      sizeBytes: wavBytes.byteLength,
      durationSec,
    };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
