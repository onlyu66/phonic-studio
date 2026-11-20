import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDraftState,
  pickActiveTakeIds,
  sortTakesNewestFirst,
} from './takeStorage';

test('sortTakesNewestFirst orders takes in descending createdAt order', () => {
  const sorted = sortTakesNewestFirst([
    { id: '1', createdAt: '2026-11-15T10:00:00.000Z' },
    { id: '3', createdAt: '2026-11-15T12:00:00.000Z' },
    { id: '2', createdAt: '2026-11-15T11:00:00.000Z' },
  ]);
  assert.deepEqual(
    sorted.map((x) => x.id),
    ['3', '2', '1'],
  );
});

test('pickActiveTakeIds preserves saved valid IDs and falls back to latest by kind', () => {
  const takes = [
    { id: 'bgm-2', kind: 'bgm' as const },
    { id: 'voice-2', kind: 'voiceover' as const },
    { id: 'bgm-1', kind: 'bgm' as const },
    { id: 'voice-1', kind: 'voiceover' as const },
  ];

  assert.deepEqual(pickActiveTakeIds(takes, 'voice-1', 'bgm-1'), {
    voiceId: 'voice-1',
    bgmId: 'bgm-1',
  });

  assert.deepEqual(pickActiveTakeIds(takes, 'missing-id', null), {
    voiceId: 'voice-2',
    bgmId: 'bgm-2',
  });
});

test('parseDraftState safely validates draft JSON and rejects malformed input', () => {
  assert.equal(parseDraftState(null), null);
  assert.equal(parseDraftState('{bad json'), null);

  const valid = parseDraftState(
    JSON.stringify({
      inputView: 'form',
      voiceEngine: 'edge-free',
      rawVoiceJson: '{"voice_preset":"Puck"}',
      applyDuckingToBgmExport: true,
      activeVoiceTakeId: 'voice-1',
    }),
  );
  assert.deepEqual(valid, {
    inputView: 'form',
    voiceEngine: 'edge-free',
    rawVoiceJson: '{"voice_preset":"Puck"}',
    applyDuckingToBgmExport: true,
    activeVoiceTakeId: 'voice-1',
  });
});
