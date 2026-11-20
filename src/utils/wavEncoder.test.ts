import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodePcmToWavBytes,
  resampleMonoPcm,
  stitchMonoPcmSegments,
} from './wavEncoder';
import { estimateWavDurationSeconds } from './ttsValidation';

test('encodePcmToWavBytes produces valid RIFF WAV header and accurate duration', () => {
  const sampleRate = 24000;
  const samples = new Float32Array(sampleRate * 2); // 2 seconds
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
  }

  const wav = encodePcmToWavBytes(samples, sampleRate);
  assert.equal(wav.byteLength, 44 + sampleRate * 2 * 2);
  assert.equal(String.fromCharCode(wav[0], wav[1], wav[2], wav[3]), 'RIFF');
  assert.equal(String.fromCharCode(wav[8], wav[9], wav[10], wav[11]), 'WAVE');
  assert.equal(estimateWavDurationSeconds(wav), 2);
});

test('resampleMonoPcm scales sample count accurately between sample rates', () => {
  const input48k = new Float32Array(4800).fill(0.25);
  const out24k = resampleMonoPcm(input48k, 48000, 24000);
  assert.equal(out24k.length, 2400);
  assert.ok(Math.abs(out24k[100] - 0.25) < 0.001);
});

test('stitchMonoPcmSegments appends silence pauses cleanly between segments', () => {
  const seg1 = new Float32Array([0.5, 0.5]);
  const seg2 = new Float32Array([-0.5, -0.5]);
  const stitched = stitchMonoPcmSegments(
    [
      { samples: seg1, pauseAfterMs: 100 },
      { samples: seg2, pauseAfterMs: 0 },
    ],
    1000,
  );
  // 2 + 100 silence samples + 2 = 104
  assert.equal(stitched.length, 104);
  assert.equal(stitched[0], 0.5);
  assert.equal(stitched[50], 0);
  assert.equal(stitched[102], -0.5);
});
