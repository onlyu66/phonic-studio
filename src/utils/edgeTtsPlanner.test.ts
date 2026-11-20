import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCRIPT_PAYLOAD } from '../shared/ttsTypes';
import {
  escapeXmlForSsml,
  formatEdgeRatePercent,
  mapVoicePresetToEdgeVoice,
  planEdgeTtsSegments,
  splitTextForFreeTts,
} from './edgeTtsPlanner';

test('mapVoicePresetToEdgeVoice maps male and female studio presets to Vietnamese Neural voices', () => {
  assert.equal(mapVoicePresetToEdgeVoice('Puck').edgeVoice, 'vi-VN-NamMinhNeural');
  assert.equal(mapVoicePresetToEdgeVoice('Charon').edgeVoice, 'vi-VN-NamMinhNeural');
  assert.equal(mapVoicePresetToEdgeVoice('Kore').edgeVoice, 'vi-VN-HoaiMyNeural');
  assert.equal(mapVoicePresetToEdgeVoice('Zephyr').edgeVoice, 'vi-VN-HoaiMyNeural');
});

test('planEdgeTtsSegments splits default Friday script into faster opening chunks and steady body chunks', () => {
  const plan = planEdgeTtsSegments({
    mode: 'single',
    voicePreset: DEFAULT_SCRIPT_PAYLOAD.voice_preset,
    speakingStylePrompt: DEFAULT_SCRIPT_PAYLOAD.speaking_style_prompt,
    text: DEFAULT_SCRIPT_PAYLOAD.clean_text_vi,
    estimatedDurationSec: DEFAULT_SCRIPT_PAYLOAD.estimated_duration_sec,
  });

  const openingSegs = plan.segments.filter((s) => s.segmentRole === 'opening');
  const bodySegs = plan.segments.filter((s) => s.segmentRole === 'body');

  assert.ok(openingSegs.length >= 1);
  assert.ok(bodySegs.length >= 1);
  assert.equal(openingSegs[0].edgeVoice, 'vi-VN-NamMinhNeural');
  assert.ok(
    parseInt(openingSegs[0].rate, 10) > parseInt(bodySegs[0].rate, 10),
    'Opening hook should be paced faster than instructional body',
  );
  assert.ok(
    openingSegs[0].playbackMultiplier > bodySegs[0].playbackMultiplier,
    'Opening playbackMultiplier should be higher than body playbackMultiplier',
  );
  assert.ok(
    plan.segments.every((s) => s.rawText.length <= 175),
    'All chunks must stay within 175 characters for reliable free synthesis',
  );
});

test('planEdgeTtsSegments strips vocal cues and escapes XML characters for SSML safety', () => {
  const plan = planEdgeTtsSegments({
    mode: 'single',
    voicePreset: 'Kore',
    speakingStylePrompt: 'Ấm áp, chậm rãi',
    text: '<breath> Chào bạn & mọi người <laugh> hôm nay!',
  });

  assert.equal(plan.segments.length, 1);
  assert.equal(plan.segments[0].edgeVoice, 'vi-VN-HoaiMyNeural');
  assert.equal(plan.segments[0].text, 'Chào bạn &amp; mọi người hôm nay!');
  assert.equal(plan.segments[0].rawText, 'Chào bạn & mọi người hôm nay!');
  assert.ok(plan.segments[0].rate.startsWith('-'));
});

test('splitTextForFreeTts splits long scripts cleanly under character limit without losing words', () => {
  const chunks = splitTextForFreeTts(DEFAULT_SCRIPT_PAYLOAD.clean_text_vi, 160);
  assert.ok(chunks.length >= 4);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 160);
  }
  assert.equal(chunks.join(' '), DEFAULT_SCRIPT_PAYLOAD.clean_text_vi);
});

test('formatEdgeRatePercent clamps extreme rates safely and escapeXmlForSsml escapes markup', () => {
  assert.equal(formatEdgeRatePercent(80), '+50%');
  assert.equal(formatEdgeRatePercent(-60), '-35%');
  assert.equal(formatEdgeRatePercent(0), '+0%');
  assert.equal(escapeXmlForSsml(`A < B & "C"`), 'A &lt; B &amp; &quot;C&quot;');
});
