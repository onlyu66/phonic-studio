import {
  TtsDualRequest,
  TtsRequestBody,
  TtsSingleRequest,
  VALID_VOICES,
  VoicePreset,
} from '../shared/ttsTypes';

export const MAX_SCRIPT_CHARS = 5000;
export const MAX_STYLE_CHARS = 600;
export const MAX_DUAL_TURNS = 24;

export interface ValidationSuccess {
  ok: true;
  data: TtsRequestBody;
}

export interface ValidationFailure {
  ok: false;
  error: string;
}

function isValidVoice(value: unknown): value is VoicePreset {
  return typeof value === 'string' && VALID_VOICES.includes(value as VoicePreset);
}

export function validateTtsRequest(body: unknown): ValidationSuccess | ValidationFailure {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const raw = body as Record<string, unknown>;

  if (raw.mode === 'single' || ('clean_text_vi' in raw && !('mode' in raw))) {
    const voiceRaw = raw.mode === 'single' ? raw.voicePreset : raw.voice_preset;
    const textRaw = raw.mode === 'single' ? raw.text : raw.clean_text_vi;
    const styleRaw =
      raw.mode === 'single' ? raw.speakingStylePrompt : raw.speaking_style_prompt;

    if (!isValidVoice(voiceRaw)) {
      return {
        ok: false,
        error: `voice_preset must be one of: ${VALID_VOICES.join(', ')}.`,
      };
    }

    if (typeof textRaw !== 'string' || textRaw.trim().length === 0) {
      return { ok: false, error: 'Script text (clean_text_vi) cannot be empty.' };
    }

    if (textRaw.length > MAX_SCRIPT_CHARS) {
      return {
        ok: false,
        error: `Script text exceeds maximum length of ${MAX_SCRIPT_CHARS} characters.`,
      };
    }

    const style = typeof styleRaw === 'string' ? styleRaw.trim() : '';
    if (style.length > MAX_STYLE_CHARS) {
      return {
        ok: false,
        error: `Speaking style prompt exceeds maximum length of ${MAX_STYLE_CHARS} characters.`,
      };
    }

    const rawDuration =
      raw.mode === 'single' ? raw.estimatedDurationSec : raw.estimated_duration_sec;
    const estimatedDurationSec =
      typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0
        ? Math.round(rawDuration)
        : undefined;

    const data: TtsSingleRequest = {
      mode: 'single',
      voicePreset: voiceRaw,
      speakingStylePrompt: style,
      text: textRaw.trim(),
      ...(estimatedDurationSec ? { estimatedDurationSec } : {}),
    };
    return { ok: true, data };
  }

  if (raw.mode === 'dual') {
    const speakerA = raw.speakerA as Record<string, unknown> | undefined;
    const speakerB = raw.speakerB as Record<string, unknown> | undefined;
    if (!speakerA || !speakerB) {
      return { ok: false, error: 'Dual-speaker mode requires both speakerA and speakerB configs.' };
    }

    const nameA = typeof speakerA.name === 'string' ? speakerA.name.trim() : '';
    const nameB = typeof speakerB.name === 'string' ? speakerB.name.trim() : '';
    if (!nameA || !nameB) {
      return { ok: false, error: 'Both speakers must have non-empty names.' };
    }
    if (nameA.toLowerCase() === nameB.toLowerCase()) {
      return { ok: false, error: 'Speaker A and Speaker B must have distinct names.' };
    }

    if (!isValidVoice(speakerA.voicePreset) || !isValidVoice(speakerB.voicePreset)) {
      return {
        ok: false,
        error: `Speaker voices must be one of: ${VALID_VOICES.join(', ')}.`,
      };
    }

    if (!Array.isArray(raw.turns) || raw.turns.length === 0) {
      return { ok: false, error: 'Dual-speaker mode requires at least one dialogue turn.' };
    }

    if (raw.turns.length > MAX_DUAL_TURNS) {
      return { ok: false, error: `Dialogue cannot exceed ${MAX_DUAL_TURNS} turns.` };
    }

    const cleanedTurns: TtsDualRequest['turns'] = [];
    let totalChars = 0;

    for (const turn of raw.turns) {
      if (!turn || typeof turn !== 'object') {
        return { ok: false, error: 'Each dialogue turn must be an object.' };
      }
      const t = turn as Record<string, unknown>;
      if (t.speakerKey !== 'A' && t.speakerKey !== 'B') {
        return { ok: false, error: 'Each dialogue turn must specify speakerKey "A" or "B".' };
      }
      if (typeof t.text !== 'string' || t.text.trim().length === 0) {
        return { ok: false, error: 'Dialogue turns cannot be empty.' };
      }
      const trimmedText = t.text.trim();
      totalChars += trimmedText.length;
      cleanedTurns.push({
        speakerKey: t.speakerKey,
        text: trimmedText,
      });
    }

    if (totalChars > MAX_SCRIPT_CHARS) {
      return {
        ok: false,
        error: `Combined dialogue exceeds maximum length of ${MAX_SCRIPT_CHARS} characters.`,
      };
    }

    const data: TtsDualRequest = {
      mode: 'dual',
      speakerA: {
        name: nameA,
        voicePreset: speakerA.voicePreset,
        style: typeof speakerA.style === 'string' ? speakerA.style.trim() : '',
      },
      speakerB: {
        name: nameB,
        voicePreset: speakerB.voicePreset,
        style: typeof speakerB.style === 'string' ? speakerB.style.trim() : '',
      },
      turns: cleanedTurns,
    };

    return { ok: true, data };
  }

  return { ok: false, error: 'mode must be "single" or "dual".' };
}

export function estimateWavDurationSeconds(wavBytes: Uint8Array): number {
  // Standard Gemini 3.8 TTS unary output: 24kHz, mono, 16-bit PCM inside 44-byte RIFF WAV header
  if (wavBytes.byteLength <= 44) return 0;

  // Check RIFF header for sample rate & byte rate if present
  if (
    wavBytes[0] === 0x52 &&
    wavBytes[1] === 0x49 &&
    wavBytes[2] === 0x46 &&
    wavBytes[3] === 0x46
  ) {
    const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
    const byteRate = view.getUint32(28, true);
    if (byteRate > 0) {
      const pcmBytes = wavBytes.byteLength - 44;
      return Math.round((pcmBytes / byteRate) * 10) / 10;
    }
  }

  // Fallback to 24kHz mono 16-bit (48,000 bytes/sec)
  const pcmBytes = wavBytes.byteLength - 44;
  return Math.round((pcmBytes / 48000) * 10) / 10;
}
