import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateWavDurationSeconds, validateTtsRequest } from './ttsValidation';

test('validateTtsRequest accepts valid single-speaker payload', () => {
  const result = validateTtsRequest({
    mode: 'single',
    voicePreset: 'Puck',
    speakingStylePrompt: 'Giọng nam trẻ trung, năng động',
    text: 'Xin chào anh em văn phòng chiều thứ Sáu.',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.mode, 'single');
    assert.equal(result.data.voicePreset, 'Puck');
  }
});

test('validateTtsRequest accepts direct user JSON schema (voice_preset, speaking_style_prompt, clean_text_vi)', () => {
  const result = validateTtsRequest({
    voice_preset: 'Puck',
    speaking_style_prompt: 'Giọng nam trẻ trung, năng động.',
    clean_text_vi: 'Lai la chieu thu Sau va sep gui mot bang Ec xen dai dang dac.',
    estimated_duration_sec: 30,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.mode, 'single');
    assert.equal(result.data.voicePreset, 'Puck');
    assert.equal(result.data.speakingStylePrompt, 'Giọng nam trẻ trung, năng động.');
    assert.equal(result.data.text, 'Lai la chieu thu Sau va sep gui mot bang Ec xen dai dang dac.');
  }
});

test('validateTtsRequest rejects empty text and invalid voice', () => {
  const empty = validateTtsRequest({
    mode: 'single',
    voicePreset: 'Puck',
    speakingStylePrompt: 'Warm',
    text: '   ',
  });
  assert.equal(empty.ok, false);

  const badVoice = validateTtsRequest({
    mode: 'single',
    voicePreset: 'Robot',
    speakingStylePrompt: 'Warm',
    text: 'Hello',
  });
  assert.equal(badVoice.ok, false);
});

test('validateTtsRequest validates dual-speaker distinct names and turns', () => {
  const sameNames = validateTtsRequest({
    mode: 'dual',
    speakerA: { name: 'Alex', voicePreset: 'Puck', style: 'Host' },
    speakerB: { name: 'alex', voicePreset: 'Kore', style: 'Guest' },
    turns: [{ speakerKey: 'A', text: 'Hello' }],
  });
  assert.equal(sameNames.ok, false);

  const validDual = validateTtsRequest({
    mode: 'dual',
    speakerA: { name: 'Minh', voicePreset: 'Puck', style: 'Upbeat' },
    speakerB: { name: 'Linh', voicePreset: 'Kore', style: 'Calm' },
    turns: [
      { speakerKey: 'A', text: 'Chiều thứ Sáu rồi!' },
      { speakerKey: 'B', text: '|mhm| Bấm Ctrl Shift L ngay đi.' },
    ],
  });
  assert.equal(validDual.ok, true);
});

test('estimateWavDurationSeconds computes duration from RIFF header byteRate', () => {
  // Construct minimal 44-byte RIFF header + 48000 bytes (1.0 second at 24kHz mono 16-bit)
  const buffer = new Uint8Array(44 + 48000);
  buffer[0] = 0x52; // R
  buffer[1] = 0x49; // I
  buffer[2] = 0x46; // F
  buffer[3] = 0x46; // F
  const view = new DataView(buffer.buffer);
  view.setUint32(28, 48000, true); // byteRate = 48000 bytes/sec
  assert.equal(estimateWavDurationSeconds(buffer), 1);
});
