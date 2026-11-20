import { useState } from 'react';
import { Check, Copy, FileText } from 'lucide-react';
import { BgmScriptPayload, TtsScriptPayload } from '../shared/ttsTypes';
import {
  serializeBgmJsonPayload,
  serializeTtsJsonPayload,
} from '../utils/scriptAnalysis';
import { InputViewMode } from './ScriptEditor';

interface JsonInspectorProps {
  inputView: InputViewMode;
  voicePayload: TtsScriptPayload;
  bgmPayload: BgmScriptPayload;
}

export function JsonInspector({
  inputView,
  voicePayload,
  bgmPayload,
}: JsonInspectorProps) {
  const [copied, setCopied] = useState(false);

  const combinedJson = JSON.stringify(
    {
      voiceover: voicePayload,
      bgm: bgmPayload,
    },
    null,
    2,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(combinedJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  return (
    <section
      id="json-payload"
      aria-labelledby="json-payload-heading"
      className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3.5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-zinc-700" aria-hidden="true" />
          <h2 id="json-payload-heading" className="font-display text-base font-semibold text-zinc-950">
            {inputView === 'json' ? 'Parsed Outputs Summary' : 'Synced JSON Output'}
          </h2>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Copy Combined</span>
            </>
          )}
        </button>
      </div>

      {inputView === 'json' ? (
        <div className="mt-4 space-y-4 text-sm">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-600 tabular-nums">
              <span className="font-semibold text-blue-700">Output 1 (Voiceover)</span>
              <span aria-hidden="true" className="text-zinc-300">
                ·
              </span>
              <span>Voice: {voicePayload.voice_preset}</span>
              <span aria-hidden="true" className="text-zinc-300">
                ·
              </span>
              <span>Target: {voicePayload.estimated_duration_sec}s</span>
            </div>
            <p className="rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 py-2 text-xs leading-relaxed text-zinc-700">
              {voicePayload.speaking_style_prompt}
            </p>
          </div>

          <div className="space-y-2 border-t border-zinc-100 pt-3">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-600 tabular-nums">
              <span className="font-semibold text-teal-700">Output 2 (BGM)</span>
              <span aria-hidden="true" className="text-zinc-300">
                ·
              </span>
              <span className="font-mono">{bgmPayload.bpm} BPM</span>
              <span aria-hidden="true" className="text-zinc-300">
                ·
              </span>
              <span>Ducking: {bgmPayload.ducking_gain}</span>
            </div>
            <p className="rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 py-2 text-xs leading-relaxed text-zinc-700">
              {bgmPayload.mood} — {bgmPayload.lyria_prompt_en}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-3.5 space-y-3">
          <pre className="max-h-40 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-800">
            {serializeTtsJsonPayload(voicePayload)}
          </pre>
          <pre className="max-h-36 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-800">
            {serializeBgmJsonPayload(bgmPayload)}
          </pre>
        </div>
      )}
    </section>
  );
}
