import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BGM_PAYLOAD, DEFAULT_SCRIPT_PAYLOAD } from '../shared/ttsTypes';
import {
  analyzeScript,
  deriveBgmSynthProfile,
  formatTimeClock,
  insertCueAtSelection,
  parseBgmJsonPayload,
  parseTtsJsonPayload,
  serializeBgmJsonPayload,
  serializeTtsJsonPayload,
  stripVocalCues,
} from './scriptAnalysis';

test('analyzeScript estimates ~30 seconds for the default Friday Excel script', () => {
  const metrics = analyzeScript(
    DEFAULT_SCRIPT_PAYLOAD.clean_text_vi,
    DEFAULT_SCRIPT_PAYLOAD.estimated_duration_sec,
  );
  assert.equal(metrics.wordCount > 130, true);
  assert.equal(metrics.sentenceCount, 8);
  assert.equal(metrics.estimatedDurationSec, 30);
  assert.equal(metrics.paceStatus, 'on-target');
  assert.equal(metrics.targetDeltaSec, 0);
});

test('analyzeScript handles empty input cleanly', () => {
  const metrics = analyzeScript('   ', 30);
  assert.equal(metrics.wordCount, 0);
  assert.equal(metrics.sentenceCount, 0);
  assert.equal(metrics.estimatedDurationSec, 0);
  assert.equal(metrics.paceStatus, 'slightly-fast');
});

test('stripVocalCues removes vocal burst and backchanneling tags without collapsing words', () => {
  const cleaned = stripVocalCues('Xin chao <breath> hom nay |yeah| chung ta hoc <laugh> phim tat.');
  assert.equal(cleaned, 'Xin chao hom nay chung ta hoc phim tat.');
});

test('insertCueAtSelection inserts cue with clean spacing and accurate cursor position', () => {
  const res = insertCueAtSelection('Chao buoi sang cac ban', '<breath>', 14, 14);
  assert.equal(res.nextText, 'Chao buoi sang <breath> cac ban');
  assert.equal(res.nextCursor, 23);
});

test('parseTtsJsonPayload validates and round-trips DEFAULT_SCRIPT_PAYLOAD', () => {
  const json = serializeTtsJsonPayload(DEFAULT_SCRIPT_PAYLOAD);
  const parsed = parseTtsJsonPayload(json);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.payload, DEFAULT_SCRIPT_PAYLOAD);
  }
});

test('parseTtsJsonPayload rejects invalid voice_preset and empty text', () => {
  const badVoice = parseTtsJsonPayload(
    JSON.stringify({
      voice_preset: 'UnknownVoice',
      speaking_style_prompt: 'Fast',
      clean_text_vi: 'Xin chao',
      estimated_duration_sec: 5,
    }),
  );
  assert.equal(badVoice.ok, false);

  const emptyText = parseTtsJsonPayload(
    JSON.stringify({
      voice_preset: 'Puck',
      speaking_style_prompt: 'Fast',
      clean_text_vi: '   ',
      estimated_duration_sec: 5,
    }),
  );
  assert.equal(emptyText.ok, false);
});

test('parseBgmJsonPayload validates and round-trips DEFAULT_BGM_PAYLOAD', () => {
  const json = serializeBgmJsonPayload(DEFAULT_BGM_PAYLOAD);
  const parsed = parseBgmJsonPayload(json);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.payload, DEFAULT_BGM_PAYLOAD);
  }
});

test('parseBgmJsonPayload rejects out-of-range bpm and ducking_gain', () => {
  const badBpm = parseBgmJsonPayload(
    JSON.stringify({ ...DEFAULT_BGM_PAYLOAD, bpm: 300 }),
  );
  assert.equal(badBpm.ok, false);

  const badDuck = parseBgmJsonPayload(
    JSON.stringify({ ...DEFAULT_BGM_PAYLOAD, ducking_gain: 1.5 }),
  );
  assert.equal(badDuck.ok, false);
});

test('deriveBgmSynthProfile selects lofi-corporate groove for default BGM prompt', () => {
  const profile = deriveBgmSynthProfile(DEFAULT_BGM_PAYLOAD);
  assert.equal(profile.groove, 'lofi-corporate');
});

test('formatTimeClock formats seconds into MM:SS', () => {
  assert.equal(formatTimeClock(0), '00:00');
  assert.equal(formatTimeClock(30.4), '00:30');
  assert.equal(formatTimeClock(95), '01:35');
  assert.equal(formatTimeClock(-4), '00:00');
});
