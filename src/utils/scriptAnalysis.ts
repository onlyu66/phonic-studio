import {
  BgmScriptPayload,
  TtsScriptPayload,
  VALID_VOICES,
  VoicePreset,
} from '../shared/ttsTypes';

// Calibrated for energetic Vietnamese short-form voiceover pacing (~5.2 spoken words/sec),
// matching the 156-word reference script at ~30 seconds.
export const DEFAULT_WORDS_PER_SECOND = 5.2;

export interface ScriptMetrics {
  wordCount: number;
  charCount: number;
  sentenceCount: number;
  cueCount: number;
  estimatedDurationSec: number;
  targetDeltaSec: number | null;
  paceStatus: 'on-target' | 'slightly-fast' | 'slightly-long' | 'unbounded';
  segments: string[];
}

export function stripVocalCues(text: string): string {
  return text
    .replace(/<(breath|laugh|gasp)>/gi, ' ')
    .replace(/\|(yeah|mhm)\|/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countVocalCues(text: string): number {
  const angleMatches = text.match(/<(breath|laugh|gasp)>/gi) ?? [];
  const pipeMatches = text.match(/\|(yeah|mhm)\|/gi) ?? [];
  return angleMatches.length + pipeMatches.length;
}

export function splitSentences(text: string): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function analyzeScript(
  text: string,
  targetDurationSec?: number,
  wordsPerSecond: number = DEFAULT_WORDS_PER_SECOND,
): ScriptMetrics {
  const trimmed = text.trim();
  const spokenText = stripVocalCues(trimmed);
  const words = spokenText ? spokenText.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const charCount = trimmed.length;
  const segments = splitSentences(trimmed);
  const sentenceCount = segments.length;
  const cueCount = countVocalCues(trimmed);

  const safeWps = wordsPerSecond > 0 ? wordsPerSecond : DEFAULT_WORDS_PER_SECOND;
  const rawSeconds = wordCount === 0 ? 0 : Math.max(1, Math.round(wordCount / safeWps + cueCount * 0.45));

  let targetDeltaSec: number | null = null;
  let paceStatus: ScriptMetrics['paceStatus'] = 'unbounded';

  if (typeof targetDurationSec === 'number' && targetDurationSec > 0) {
    targetDeltaSec = rawSeconds - targetDurationSec;
    if (Math.abs(targetDeltaSec) <= 3) {
      paceStatus = 'on-target';
    } else if (targetDeltaSec < -3) {
      paceStatus = 'slightly-fast';
    } else {
      paceStatus = 'slightly-long';
    }
  }

  return {
    wordCount,
    charCount,
    sentenceCount,
    cueCount,
    estimatedDurationSec: rawSeconds,
    targetDeltaSec,
    paceStatus,
    segments,
  };
}

export function insertCueAtSelection(
  text: string,
  cue: string,
  selectionStart: number,
  selectionEnd: number,
): { nextText: string; nextCursor: number } {
  const safeStart = Math.max(0, Math.min(selectionStart, text.length));
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, text.length));
  const before = text.slice(0, safeStart);
  const after = text.slice(safeEnd);

  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
  const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);

  const insertion = `${needsLeadingSpace ? ' ' : ''}${cue}${needsTrailingSpace ? ' ' : ''}`;
  const nextText = `${before}${insertion}${after}`;
  const nextCursor = before.length + insertion.length;

  return { nextText, nextCursor };
}

export interface JsonParseResult {
  ok: true;
  payload: TtsScriptPayload;
}

export interface JsonParseError {
  ok: false;
  error: string;
}

export function parseTtsJsonPayload(rawJson: string): JsonParseResult | JsonParseError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: 'Invalid Voiceover JSON syntax. Check quotes, commas, and braces.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Voiceover JSON root must be an object.' };
  }

  const record = parsed as Record<string, unknown>;
  const voiceRaw = record.voice_preset;
  if (typeof voiceRaw !== 'string' || !VALID_VOICES.includes(voiceRaw as VoicePreset)) {
    return {
      ok: false,
      error: `voice_preset must be one of: ${VALID_VOICES.join(', ')}.`,
    };
  }

  const styleRaw = record.speaking_style_prompt;
  if (typeof styleRaw !== 'string') {
    return { ok: false, error: 'speaking_style_prompt must be a string.' };
  }

  const textRaw = record.clean_text_vi;
  if (typeof textRaw !== 'string' || textRaw.trim().length === 0) {
    return { ok: false, error: 'clean_text_vi must be a non-empty string.' };
  }

  const durRaw = record.estimated_duration_sec;
  const estimatedDurationSec =
    typeof durRaw === 'number' && Number.isFinite(durRaw) && durRaw > 0
      ? Math.round(durRaw)
      : analyzeScript(textRaw).estimatedDurationSec;

  return {
    ok: true,
    payload: {
      voice_preset: voiceRaw as VoicePreset,
      speaking_style_prompt: styleRaw.trim(),
      clean_text_vi: textRaw.trim(),
      estimated_duration_sec: estimatedDurationSec,
    },
  };
}

export function serializeTtsJsonPayload(payload: TtsScriptPayload): string {
  return JSON.stringify(
    {
      voice_preset: payload.voice_preset,
      speaking_style_prompt: payload.speaking_style_prompt,
      clean_text_vi: payload.clean_text_vi,
      estimated_duration_sec: payload.estimated_duration_sec,
    },
    null,
    2,
  );
}

export interface BgmParseResult {
  ok: true;
  payload: BgmScriptPayload;
}

export function parseBgmJsonPayload(rawJson: string): BgmParseResult | JsonParseError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: 'Invalid BGM JSON syntax. Check quotes, commas, and braces.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'BGM JSON root must be an object.' };
  }

  const record = parsed as Record<string, unknown>;
  const promptRaw = record.lyria_prompt_en;
  if (typeof promptRaw !== 'string' || promptRaw.trim().length === 0) {
    return { ok: false, error: 'lyria_prompt_en must be a non-empty string.' };
  }

  const bpmRaw = record.bpm;
  if (typeof bpmRaw !== 'number' || !Number.isFinite(bpmRaw) || bpmRaw < 40 || bpmRaw > 220) {
    return { ok: false, error: 'bpm must be a number between 40 and 220.' };
  }

  const moodRaw = record.mood;
  if (typeof moodRaw !== 'string') {
    return { ok: false, error: 'mood must be a string.' };
  }

  const duckRaw = record.ducking_gain;
  if (
    typeof duckRaw !== 'number' ||
    !Number.isFinite(duckRaw) ||
    duckRaw <= 0 ||
    duckRaw > 1
  ) {
    return { ok: false, error: 'ducking_gain must be a number between 0.01 and 1.0.' };
  }

  return {
    ok: true,
    payload: {
      lyria_prompt_en: promptRaw.trim(),
      bpm: Math.round(bpmRaw),
      mood: moodRaw.trim(),
      ducking_gain: Math.round(duckRaw * 1000) / 1000,
    },
  };
}

export function serializeBgmJsonPayload(payload: BgmScriptPayload): string {
  return JSON.stringify(
    {
      lyria_prompt_en: payload.lyria_prompt_en,
      bpm: payload.bpm,
      mood: payload.mood,
      ducking_gain: payload.ducking_gain,
    },
    null,
    2,
  );
}

export interface BgmSynthProfile {
  groove: 'lofi-corporate' | 'driving-synth' | 'ambient-pad';
  label: string;
  filterCutoffHz: number;
  swingRatio: number;
}

export function deriveBgmSynthProfile(payload: BgmScriptPayload): BgmSynthProfile {
  const lower = `${payload.lyria_prompt_en} ${payload.mood}`.toLowerCase();

  if (lower.includes('ambient') || lower.includes('calm') || lower.includes('chill') || payload.bpm < 85) {
    return {
      groove: 'ambient-pad',
      label: 'Ambient Warm Synth',
      filterCutoffHz: 1800,
      swingRatio: 0.02,
    };
  }

  if (
    lower.includes('lo-fi') ||
    lower.includes('lofi') ||
    lower.includes('hip hop') ||
    lower.includes('corporate')
  ) {
    return {
      groove: 'lofi-corporate',
      label: 'Lo-Fi Productivity Beat',
      filterCutoffHz: 2600,
      swingRatio: 0.06,
    };
  }

  return {
    groove: 'driving-synth',
    label: 'Upbeat Driving Synth',
    filterCutoffHz: 3600,
    swingRatio: 0.02,
  };
}

export function formatTimeClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
