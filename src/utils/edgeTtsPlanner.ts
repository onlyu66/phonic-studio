import { TtsRequestBody, VoicePreset } from '../shared/ttsTypes';
import { analyzeScript, splitSentences, stripVocalCues } from './scriptAnalysis';

export interface EdgeVoiceMapping {
  edgeVoice: string;
  shortLabel: string;
  gender: 'Male' | 'Female';
  baseRateDelta: number;
}

export interface EdgeTtsSegmentPlan {
  text: string;
  rawText: string;
  edgeVoice: string;
  rate: string;
  playbackMultiplier: number;
  pauseAfterMs: number;
  segmentRole: 'opening' | 'body' | 'turn';
}

export function mapVoicePresetToEdgeVoice(preset: VoicePreset): EdgeVoiceMapping {
  switch (preset) {
    case 'Puck':
      return {
        edgeVoice: 'vi-VN-NamMinhNeural',
        shortLabel: 'vi-VN-NamMinhNeural (Puck)',
        gender: 'Male',
        baseRateDelta: 4,
      };
    case 'Charon':
      return {
        edgeVoice: 'vi-VN-NamMinhNeural',
        shortLabel: 'vi-VN-NamMinhNeural (Charon)',
        gender: 'Male',
        baseRateDelta: -4,
      };
    case 'Fenrir':
      return {
        edgeVoice: 'vi-VN-NamMinhNeural',
        shortLabel: 'vi-VN-NamMinhNeural (Fenrir)',
        gender: 'Male',
        baseRateDelta: 6,
      };
    case 'Kore':
      return {
        edgeVoice: 'vi-VN-HoaiMyNeural',
        shortLabel: 'vi-VN-HoaiMyNeural (Kore)',
        gender: 'Female',
        baseRateDelta: -1,
      };
    case 'Zephyr':
      return {
        edgeVoice: 'vi-VN-HoaiMyNeural',
        shortLabel: 'vi-VN-HoaiMyNeural (Zephyr)',
        gender: 'Female',
        baseRateDelta: 5,
      };
  }
}

export function formatEdgeRatePercent(rateDelta: number): string {
  const clamped = Math.max(-35, Math.min(50, Math.round(rateDelta)));
  return clamped >= 0 ? `+${clamped}%` : `${clamped}%`;
}

export function rateDeltaToPlaybackMultiplier(rateDelta: number): number {
  const clamped = Math.max(-15, Math.min(24, rateDelta));
  return Math.round((1 + clamped / 100) * 100) / 100;
}

export function escapeXmlForSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Splits arbitrary text into <= maxChars chunks along sentence, clause, or word boundaries
 * so both Edge TTS and free HTTP TTS endpoints handle long scripts reliably.
 */
export function splitTextForFreeTts(text: string, maxChars = 175): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = splitSentences(cleaned);
  const chunks: string[] = [];

  const pushLongClause = (clause: string) => {
    const words = clause.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      if (line && line.length + 1 + w.length > maxChars) {
        chunks.push(line);
        line = w;
      } else {
        line = line ? `${line} ${w}` : w;
      }
    }
    if (line) chunks.push(line);
  };

  let current = '';
  for (const s of sentences) {
    if (s.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      const subClauses = s.split(/(?<=[,;:])\s+/);
      for (const sc of subClauses) {
        if (sc.length > maxChars) {
          pushLongClause(sc);
        } else if (current && current.length + 1 + sc.length > maxChars) {
          chunks.push(current);
          current = sc;
        } else {
          current = current ? `${current} ${sc}` : sc;
        }
      }
      continue;
    }

    if (current && current.length + 1 + s.length > maxChars) {
      chunks.push(current);
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function analyzeStylePromptRates(stylePrompt: string): {
  hasDynamicSplit: boolean;
  openingDelta: number;
  bodyDelta: number;
} {
  const lower = stylePrompt.toLowerCase();

  const wantsUrgentOpening =
    lower.includes('hối hả') ||
    lower.includes('gấp') ||
    lower.includes('đoạn đầu') ||
    lower.includes('urgent') ||
    lower.includes('hook');

  const wantsConfidentBody =
    lower.includes('tự tin') ||
    lower.includes('chuyên nghiệp') ||
    lower.includes('hướng dẫn') ||
    lower.includes('rõ') ||
    lower.includes('confident');

  const wantsEnergetic =
    lower.includes('năng động') ||
    lower.includes('trẻ trung') ||
    lower.includes('nhanh') ||
    lower.includes('energetic') ||
    lower.includes('upbeat') ||
    lower.includes('punchy');

  const wantsCalmSlow =
    lower.includes('chậm') ||
    lower.includes('điềm tĩnh') ||
    lower.includes('ấm áp') ||
    lower.includes('nhẹ nhàng') ||
    lower.includes('calm') ||
    lower.includes('slow');

  if (wantsUrgentOpening && wantsConfidentBody) {
    return {
      hasDynamicSplit: true,
      openingDelta: 12,
      bodyDelta: 2,
    };
  }

  if (wantsUrgentOpening || wantsEnergetic) {
    return {
      hasDynamicSplit: false,
      openingDelta: 8,
      bodyDelta: 8,
    };
  }

  if (wantsCalmSlow) {
    return {
      hasDynamicSplit: false,
      openingDelta: -6,
      bodyDelta: -6,
    };
  }

  return {
    hasDynamicSplit: false,
    openingDelta: 0,
    bodyDelta: 0,
  };
}

export function planEdgeTtsSegments(req: TtsRequestBody): {
  voiceLabel: string;
  appliedRatesSummary: string;
  segments: EdgeTtsSegmentPlan[];
} {
  if (req.mode === 'dual') {
    const mapA = mapVoicePresetToEdgeVoice(req.speakerA.voicePreset);
    const mapB = mapVoicePresetToEdgeVoice(req.speakerB.voicePreset);

    const segments: EdgeTtsSegmentPlan[] = [];
    for (let i = 0; i < req.turns.length; i++) {
      const turn = req.turns[i];
      const speaker = turn.speakerKey === 'A' ? req.speakerA : req.speakerB;
      const mapping = turn.speakerKey === 'A' ? mapA : mapB;
      const styleRates = analyzeStylePromptRates(speaker.style);
      const cleaned = stripVocalCues(turn.text);
      if (!cleaned) continue;

      const delta = mapping.baseRateDelta + styleRates.openingDelta;
      const subChunks = splitTextForFreeTts(cleaned, 175);
      subChunks.forEach((chunkText, chunkIdx) => {
        const isLastTurnChunk = chunkIdx === subChunks.length - 1;
        segments.push({
          text: escapeXmlForSsml(chunkText),
          rawText: chunkText,
          edgeVoice: mapping.edgeVoice,
          rate: formatEdgeRatePercent(delta),
          playbackMultiplier: rateDeltaToPlaybackMultiplier(delta),
          pauseAfterMs: isLastTurnChunk ? (i < req.turns.length - 1 ? 200 : 0) : 60,
          segmentRole: 'turn',
        });
      });
    }

    return {
      voiceLabel: `${req.speakerA.name} (${mapA.edgeVoice}) & ${req.speakerB.name} (${mapB.edgeVoice})`,
      appliedRatesSummary: 'Multi-voice Vietnamese TTS',
      segments,
    };
  }

  const mapping = mapVoicePresetToEdgeVoice(req.voicePreset);
  const cleanedText = stripVocalCues(req.text);
  const styleRates = analyzeStylePromptRates(req.speakingStylePrompt);

  let durationNudge = 0;
  if (req.estimatedDurationSec && req.estimatedDurationSec > 0) {
    const metrics = analyzeScript(cleanedText, req.estimatedDurationSec);
    if (metrics.estimatedDurationSec > 0) {
      const ratio = metrics.estimatedDurationSec / req.estimatedDurationSec;
      if (ratio > 1.08) {
        durationNudge = Math.min(10, Math.round((ratio - 1) * 40));
      } else if (ratio < 0.92) {
        durationNudge = Math.max(-10, Math.round((ratio - 1) * 40));
      }
    }
  }

  const sentences = splitSentences(cleanedText);
  if (styleRates.hasDynamicSplit && sentences.length >= 3) {
    const splitIndex = Math.max(1, Math.min(2, Math.floor(sentences.length * 0.35)));
    const openingText = sentences.slice(0, splitIndex).join(' ');
    const bodyText = sentences.slice(splitIndex).join(' ');

    const openingDelta = mapping.baseRateDelta + styleRates.openingDelta + durationNudge;
    const bodyDelta = mapping.baseRateDelta + styleRates.bodyDelta + durationNudge;
    const openingRate = formatEdgeRatePercent(openingDelta);
    const bodyRate = formatEdgeRatePercent(bodyDelta);

    const segments: EdgeTtsSegmentPlan[] = [];
    const openingChunks = splitTextForFreeTts(openingText, 175);
    const bodyChunks = splitTextForFreeTts(bodyText, 175);

    openingChunks.forEach((chunkText, idx) => {
      const isLast = idx === openingChunks.length - 1;
      segments.push({
        text: escapeXmlForSsml(chunkText),
        rawText: chunkText,
        edgeVoice: mapping.edgeVoice,
        rate: openingRate,
        playbackMultiplier: rateDeltaToPlaybackMultiplier(openingDelta),
        pauseAfterMs: isLast ? 140 : 50,
        segmentRole: 'opening',
      });
    });

    bodyChunks.forEach((chunkText, idx) => {
      const isLast = idx === bodyChunks.length - 1;
      segments.push({
        text: escapeXmlForSsml(chunkText),
        rawText: chunkText,
        edgeVoice: mapping.edgeVoice,
        rate: bodyRate,
        playbackMultiplier: rateDeltaToPlaybackMultiplier(bodyDelta),
        pauseAfterMs: isLast ? 0 : 60,
        segmentRole: 'body',
      });
    });

    return {
      voiceLabel: mapping.shortLabel,
      appliedRatesSummary: `Opening ${openingRate} -> Guide ${bodyRate}`,
      segments,
    };
  }

  const singleDelta = mapping.baseRateDelta + styleRates.bodyDelta + durationNudge;
  const singleRate = formatEdgeRatePercent(singleDelta);
  const chunks = splitTextForFreeTts(cleanedText, 175);

  return {
    voiceLabel: mapping.shortLabel,
    appliedRatesSummary: `Rate ${singleRate}`,
    segments: chunks.map((chunkText, idx) => ({
      text: escapeXmlForSsml(chunkText),
      rawText: chunkText,
      edgeVoice: mapping.edgeVoice,
      rate: singleRate,
      playbackMultiplier: rateDeltaToPlaybackMultiplier(singleDelta),
      pauseAfterMs: idx === chunks.length - 1 ? 0 : 60,
      segmentRole: 'body',
    })),
  };
}
