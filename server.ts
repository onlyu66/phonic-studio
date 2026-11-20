import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { planEdgeTtsSegments } from './src/utils/edgeTtsPlanner';
import { estimateWavDurationSeconds, validateTtsRequest } from './src/utils/ttsValidation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const TTS_MODEL = 'gemini-3.8-flash-tts';

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1alpha',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractInlineAudioBase64(response: GenerateContentResponse): string | null {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;

  for (const part of parts) {
    if (part.inlineData?.data) {
      return part.inlineData.data;
    }
  }
  return null;
}

function extractCleanRpcMessage(rawMessage: string): string {
  try {
    const jsonStart = rawMessage.indexOf('{');
    if (jsonStart !== -1) {
      const parsed = JSON.parse(rawMessage.slice(jsonStart)) as {
        error?: { message?: string };
      };
      if (parsed?.error?.message) {
        return parsed.error.message;
      }
    }
  } catch {
    // Fall back to raw message
  }
  return rawMessage;
}

function parseApiErrorStatus(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const cleanMsg = extractCleanRpcMessage(raw);
  const lower = raw.toLowerCase();

  if (lower.includes('api_key_invalid') || lower.includes('api key not valid')) {
    return {
      status: 400,
      message: 'Invalid Gemini API key. Verify your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (lower.includes('invalid_argument') || lower.includes('400')) {
    return {
      status: 400,
      message: `Gemini TTS rejected the request: ${cleanMsg}`,
    };
  }
  if (lower.includes('permission_denied') || lower.includes('403')) {
    return {
      status: 403,
      message: 'Permission denied by Gemini API. Please check your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      message: `TTS model "${TTS_MODEL}" was not found or is unavailable for this key (${cleanMsg}).`,
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return {
      status: 429,
      message: 'Rate limit or quota reached on Gemini TTS API. Please wait a moment or check your plan in Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: cleanMsg || 'Failed to synthesize speech via Gemini 3.8 Flash TTS.',
  };
}

async function generateWithRetry(
  fn: () => Promise<GenerateContentResponse>,
  maxRetries = 2,
): Promise<GenerateContentResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('500') ||
        msg.includes('429') ||
        msg.toLowerCase().includes('unavailable') ||
        msg.toLowerCase().includes('timeout');
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 600 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      model: TTS_MODEL,
      configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      edgeNoKeyAvailable: true,
    });
  });

  app.post('/api/tts-edge', async (req: Request, res: Response) => {
    const validated = validateTtsRequest(req.body);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const plan = planEdgeTtsSegments(validated.data);
    if (plan.segments.length === 0) {
      res.status(400).json({ error: 'No speakable text remained after stripping vocal cues.' });
      return;
    }

    const synthesizeEdgeSegment = async (
      edgeVoice: string,
      escapedXmlText: string,
      rate: string,
    ): Promise<Buffer> => {
      const tts = new MsEdgeTTS({ connectionTimeoutMs: 2500, synthesisTimeoutMs: 3200 });
      try {
        await tts.setMetadata(edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream(escapedXmlText, {
          pitch: '+0Hz',
          rate,
          volume: '100',
        });
        const chunks: Buffer[] = [];
        for await (const chunk of audioStream) {
          chunks.push(Buffer.from(chunk));
        }
        const buf = Buffer.concat(chunks);
        if (buf.length === 0) {
          throw new Error('Edge TTS returned an empty audio stream.');
        }
        return buf;
      } finally {
        tts.close();
      }
    };

    const synthesizeFreeFallbackSegment = async (rawText: string): Promise<Buffer> => {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=vi&q=${encodeURIComponent(rawText)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`Free TTS fallback returned HTTP ${response.status}`);
      }
      const arr = await response.arrayBuffer();
      const buf = Buffer.from(arr);
      if (buf.length === 0) {
        throw new Error('Free TTS fallback returned empty audio.');
      }
      return buf;
    };

    try {
      const renderedSegments: Array<{
        audioBase64: string;
        mimeType: 'audio/mpeg';
        pauseAfterMs: number;
        rate: string;
        edgeVoice: string;
        playbackMultiplier: number;
      }> = [];

      let edgeDisabledForRequest = false;
      let usedEdgeCount = 0;
      let usedFallbackCount = 0;

      for (let i = 0; i < plan.segments.length; i++) {
        const seg = plan.segments[i];

        if (!edgeDisabledForRequest) {
          try {
            const audioBuf = await synthesizeEdgeSegment(seg.edgeVoice, seg.text, seg.rate);
            usedEdgeCount++;
            renderedSegments.push({
              audioBase64: audioBuf.toString('base64'),
              mimeType: 'audio/mpeg',
              pauseAfterMs: seg.pauseAfterMs,
              rate: seg.rate,
              edgeVoice: seg.edgeVoice,
              playbackMultiplier: 1,
            });
            continue;
          } catch {
            // Edge Read Aloud throttles or drops some datacenter IPs; fail over cleanly for remaining chunks
            edgeDisabledForRequest = true;
          }
        }

        // Synthesize remaining segments in parallel via free fallback
        const remaining = plan.segments.slice(i);
        const fallbackBuffers = await Promise.all(
          remaining.map((rSeg) => synthesizeFreeFallbackSegment(rSeg.rawText)),
        );
        remaining.forEach((rSeg, idx) => {
          usedFallbackCount++;
          renderedSegments.push({
            audioBase64: fallbackBuffers[idx].toString('base64'),
            mimeType: 'audio/mpeg',
            pauseAfterMs: rSeg.pauseAfterMs,
            rate: rSeg.rate,
            edgeVoice: rSeg.edgeVoice,
            playbackMultiplier: rSeg.playbackMultiplier,
          });
        });
        break;
      }

      const provider =
        usedFallbackCount > 0 && usedEdgeCount === 0
          ? ('free-tts-fallback' as const)
          : ('edge-neural' as const);

      const finalVoiceLabel =
        provider === 'free-tts-fallback'
          ? `Free Vietnamese TTS (${plan.voiceLabel.replace(/vi-VN-\w+\s*/, '').replace(/[()]/g, '') || 'Standard'})`
          : plan.voiceLabel;

      res.json({
        segments: renderedSegments,
        model: 'edge-neural-tts' as const,
        provider,
        voiceLabel: finalVoiceLabel,
        appliedRatesSummary: plan.appliedRatesSummary,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to synthesize speech without an API key.';
      res.status(502).json({
        error: `No-Key TTS error: ${message}`,
      });
    }
  });

  app.post('/api/tts', async (req: Request, res: Response) => {
    const validated = validateTtsRequest(req.body);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured in the server environment. Add your key in Settings > Secrets to generate speech.',
      });
      return;
    }

    try {
      const data = validated.data;
      let response: GenerateContentResponse;
      let voiceLabel = '';

      if (data.mode === 'single') {
        voiceLabel = data.voicePreset;
        response = await generateWithRetry(() =>
          ai.models.generateContent({
            model: TTS_MODEL,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: data.text,
                    ...(data.speakingStylePrompt
                      ? { speechMetadata: { style: data.speakingStylePrompt } }
                      : {}),
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: data.voicePreset },
                },
              },
            },
          }),
        );
      } else {
        voiceLabel = `${data.speakerA.name} (${data.speakerA.voicePreset}) & ${data.speakerB.name} (${data.speakerB.voicePreset})`;
        response = await generateWithRetry(() =>
          ai.models.generateContent({
            model: TTS_MODEL,
            contents: [
              {
                role: 'user',
                parts: data.turns.map((turn) => {
                  const speaker = turn.speakerKey === 'A' ? data.speakerA : data.speakerB;
                  return {
                    text: `${speaker.name}: ${turn.text}`,
                    speechMetadata: {
                      speaker: speaker.name,
                      ...(speaker.style ? { style: speaker.style } : {}),
                    },
                  };
                }),
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: [
                    {
                      speaker: data.speakerA.name,
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: data.speakerA.voicePreset },
                      },
                    },
                    {
                      speaker: data.speakerB.name,
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: data.speakerB.voicePreset },
                      },
                    },
                  ],
                },
              },
            },
          }),
        );
      }

      const audioBase64 = extractInlineAudioBase64(response);
      if (!audioBase64) {
        res.status(502).json({
          error: 'Gemini 3.8 Flash TTS returned a response without audio data. Try adjusting the script or style prompt.',
        });
        return;
      }

      const wavBytes = Buffer.from(audioBase64, 'base64');
      const durationSec = estimateWavDurationSeconds(wavBytes);

      res.json({
        audioBase64,
        mimeType: 'audio/wav',
        durationSec,
        model: TTS_MODEL,
        voiceLabel,
      });
    } catch (err) {
      const mapped = parseApiErrorStatus(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Phonic Studio server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
