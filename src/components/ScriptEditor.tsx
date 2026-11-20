import { useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Code2,
  Copy,
  FileText,
  Music2,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from 'lucide-react';
import {
  BgmScriptPayload,
  DualSpeakerConfig,
  STYLE_QUICK_PROMPTS,
  VALID_VOICES,
  VOCAL_CUES,
  VoiceEngine,
  VoicePreset,
} from '../shared/ttsTypes';
import { mapVoicePresetToEdgeVoice } from '../utils/edgeTtsPlanner';
import {
  BgmSynthProfile,
  ScriptMetrics,
  insertCueAtSelection,
} from '../utils/scriptAnalysis';

export type InputViewMode = 'json' | 'form' | 'dual';

interface ScriptEditorProps {
  inputView: InputViewMode;
  onInputViewChange: (view: InputViewMode) => void;
  voiceEngine: VoiceEngine;
  onVoiceEngineChange: (engine: VoiceEngine) => void;
  selectedVoice: VoicePreset;
  rawVoiceJson: string;
  onRawVoiceJsonChange: (raw: string) => void;
  voiceJsonError: string | null;
  onFormatVoiceJson: () => void;
  onCopyVoiceJson: () => Promise<boolean>;
  onRestoreVoiceDefault: () => void;
  isVoiceModified: boolean;
  rawBgmJson: string;
  onRawBgmJsonChange: (raw: string) => void;
  bgmJsonError: string | null;
  onFormatBgmJson: () => void;
  onCopyBgmJson: () => Promise<boolean>;
  onRestoreBgmDefault: () => void;
  isBgmModified: boolean;
  bgmPayload: BgmScriptPayload;
  onBgmPayloadChange: (next: BgmScriptPayload) => void;
  bgmProfile: BgmSynthProfile;
  applyDuckingToBgmExport: boolean;
  onToggleApplyDucking: (next: boolean) => void;
  speakingStylePrompt: string;
  onSpeakingStyleChange: (style: string) => void;
  scriptText: string;
  onScriptTextChange: (text: string) => void;
  targetDurationSec: number;
  onTargetDurationChange: (sec: number) => void;
  metrics: ScriptMetrics;
  dualConfig: DualSpeakerConfig;
  onDualConfigChange: (config: DualSpeakerConfig) => void;
  onGenerateShortcut: () => void;
}

export function ScriptEditor({
  inputView,
  onInputViewChange,
  voiceEngine,
  onVoiceEngineChange,
  selectedVoice,
  rawVoiceJson,
  onRawVoiceJsonChange,
  voiceJsonError,
  onFormatVoiceJson,
  onCopyVoiceJson,
  onRestoreVoiceDefault,
  isVoiceModified,
  rawBgmJson,
  onRawBgmJsonChange,
  bgmJsonError,
  onFormatBgmJson,
  onCopyBgmJson,
  onRestoreBgmDefault,
  isBgmModified,
  bgmPayload,
  onBgmPayloadChange,
  bgmProfile,
  applyDuckingToBgmExport,
  onToggleApplyDucking,
  speakingStylePrompt,
  onSpeakingStyleChange,
  scriptText,
  onScriptTextChange,
  targetDurationSec,
  onTargetDurationChange,
  metrics,
  dualConfig,
  onDualConfigChange,
  onGenerateShortcut,
}: ScriptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [copiedVoice, setCopiedVoice] = useState(false);
  const [copiedBgm, setCopiedBgm] = useState(false);
  const edgeVoiceInfo = mapVoicePresetToEdgeVoice(selectedVoice);

  const handleInsertCue = (cue: string) => {
    const el = textareaRef.current;
    if (!el) {
      onScriptTextChange(`${scriptText.trim()} ${cue}`.trim());
      return;
    }
    const start = el.selectionStart ?? scriptText.length;
    const end = el.selectionEnd ?? scriptText.length;
    const { nextText, nextCursor } = insertCueAtSelection(scriptText, cue, start, end);
    onScriptTextChange(nextText);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCursor, nextCursor);
      }
    });
  };

  const handleCopyVoice = async () => {
    const ok = await onCopyVoiceJson();
    if (ok) {
      setCopiedVoice(true);
      setTimeout(() => setCopiedVoice(false), 1800);
    }
  };

  const handleCopyBgm = async () => {
    const ok = await onCopyBgmJson();
    if (ok) {
      setCopiedBgm(true);
      setTimeout(() => setCopiedBgm(false), 1800);
    }
  };

  const handleAddTurn = () => {
    const lastTurn = dualConfig.turns[dualConfig.turns.length - 1];
    const nextSpeakerKey: 'A' | 'B' = lastTurn?.speakerKey === 'A' ? 'B' : 'A';
    onDualConfigChange({
      ...dualConfig,
      turns: [
        ...dualConfig.turns,
        {
          id: `turn-${Date.now()}`,
          speakerKey: nextSpeakerKey,
          text: '',
        },
      ],
    });
  };

  const handleUpdateTurn = (id: string, patch: Partial<{ speakerKey: 'A' | 'B'; text: string }>) => {
    onDualConfigChange({
      ...dualConfig,
      turns: dualConfig.turns.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)),
    });
  };

  const handleRemoveTurn = (id: string) => {
    if (dualConfig.turns.length <= 1) return;
    onDualConfigChange({
      ...dualConfig,
      turns: dualConfig.turns.filter((turn) => turn.id !== id),
    });
  };

  const paceLabel =
    metrics.paceStatus === 'on-target'
      ? 'On target'
      : metrics.paceStatus === 'slightly-fast'
        ? `${Math.abs(metrics.targetDeltaSec ?? 0)}s under target`
        : metrics.paceStatus === 'slightly-long'
          ? `+${metrics.targetDeltaSec ?? 0}s over target`
          : 'Unbounded';

  return (
    <section
      id="script-editor"
      aria-labelledby="script-editor-heading"
      className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-4">
        <div>
          <h1
            id="script-editor-heading"
            className="font-display text-xl font-bold tracking-tight text-zinc-950 text-balance"
          >
            Dual JSON Input Studio
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Separate Voiceover (
            <span className="font-mono text-xs text-zinc-800">
              {voiceEngine === 'edge-free' ? 'No-Key Edge Neural TTS' : 'gemini-3.8-flash-tts'}
            </span>
            ) and Background Music (<span className="font-mono text-xs text-zinc-800">Free Web Audio Synth</span>) into 2 downloadable WAV tracks.
          </p>
        </div>

        <div
          role="group"
          aria-label="Input mode"
          className="inline-flex flex-wrap items-center rounded-lg border border-zinc-200 bg-zinc-100 p-1"
        >
          <button
            type="button"
            aria-pressed={inputView === 'json'}
            onClick={() => onInputViewChange('json')}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
              inputView === 'json'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>JSON Input</span>
          </button>
          <button
            type="button"
            aria-pressed={inputView === 'form'}
            onClick={() => onInputViewChange('form')}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
              inputView === 'form'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Visual Form</span>
          </button>
          <button
            type="button"
            aria-pressed={inputView === 'dual'}
            onClick={() => onInputViewChange('dual')}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
              inputView === 'dual'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Dual Speaker</span>
          </button>
        </div>
      </div>

      {/* Voice Engine Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50/70 px-3.5 py-2.5">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-zinc-900">Voiceover Engine</span>
          <p className="mt-0.5 text-xs text-zinc-600">
            {voiceEngine === 'edge-free' ? (
              <>
                No API key required · Maps <span className="font-mono text-zinc-800">{selectedVoice}</span>{' '}
                → <span className="font-mono text-zinc-800">{edgeVoiceInfo.edgeVoice}</span> &amp; adapts pacing from{' '}
                <span className="font-mono text-zinc-800">speaking_style_prompt</span>
              </>
            ) : (
              <>
                Uses server <span className="font-mono text-zinc-800">GEMINI_API_KEY</span> for expressive AI acting on{' '}
                <span className="font-mono text-zinc-800">speaking_style_prompt</span>
              </>
            )}
          </p>
        </div>

        <div
          role="group"
          aria-label="Voiceover synthesis engine"
          className="inline-flex items-center rounded-lg border border-zinc-200 bg-white p-0.5 shrink-0"
        >
          <button
            type="button"
            aria-pressed={voiceEngine === 'gemini'}
            onClick={() => onVoiceEngineChange('gemini')}
            className={`inline-flex min-h-[30px] items-center rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-700 ${
              voiceEngine === 'gemini'
                ? 'bg-blue-700 text-white'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            Gemini 3.8 TTS
          </button>
          <button
            type="button"
            aria-pressed={voiceEngine === 'edge-free'}
            onClick={() => onVoiceEngineChange('edge-free')}
            className={`inline-flex min-h-[30px] items-center rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-700 ${
              voiceEngine === 'edge-free'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            No-Key (Edge TTS)
          </button>
        </div>
      </div>

      {inputView === 'json' && (
        <div className="mt-5 space-y-6">
          {/* Input 1: Voiceover JSON */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label htmlFor="primary-json-input" className="text-sm font-semibold text-zinc-900">
                  Input 1 · Voiceover JSON (Output 1)
                </label>
                <p className="text-xs text-zinc-500">
                  Ctrl/Cmd + Enter generates both WAV tracks
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={onFormatVoiceJson}
                  className="inline-flex min-h-[32px] items-center rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950 whitespace-nowrap shrink-0"
                >
                  Format
                </button>
                <button
                  type="button"
                  onClick={handleCopyVoice}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950 whitespace-nowrap shrink-0"
                >
                  {copiedVoice ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" aria-hidden="true" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                {isVoiceModified && (
                  <button
                    type="button"
                    onClick={onRestoreVoiceDefault}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950 whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    <span>Restore</span>
                  </button>
                )}
              </div>
            </div>

            <textarea
              id="primary-json-input"
              rows={9}
              spellCheck={false}
              value={rawVoiceJson}
              onChange={(e) => onRawVoiceJsonChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  onGenerateShortcut();
                }
              }}
              className={`w-full rounded-lg border bg-zinc-50/70 p-3.5 font-mono text-[13px] leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-2 ${
                voiceJsonError
                  ? 'border-red-400 focus:border-red-600 focus:ring-red-600/15'
                  : 'border-zinc-300 focus:border-blue-700 focus:ring-blue-700/15'
              }`}
            />

            {voiceJsonError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{voiceJsonError}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-600 tabular-nums">
                <span className="font-semibold text-emerald-700">Valid Voiceover JSON</span>
                <span aria-hidden="true" className="text-zinc-300">
                  ·
                </span>
                <span className="font-medium text-zinc-900">{metrics.wordCount} words</span>
                <span aria-hidden="true" className="text-zinc-300">
                  ·
                </span>
                <span>{metrics.sentenceCount} sentences</span>
                <span aria-hidden="true" className="text-zinc-300">
                  ·
                </span>
                <span className="font-mono font-medium text-zinc-900">
                  ~{metrics.estimatedDurationSec}s est.
                </span>
                <span aria-hidden="true" className="text-zinc-300">
                  ·
                </span>
                <span
                  className={
                    metrics.paceStatus === 'on-target'
                      ? 'font-medium text-emerald-700'
                      : 'font-medium text-amber-700'
                  }
                >
                  {paceLabel}
                </span>
              </div>
            )}
          </div>

          <hr className="border-zinc-100" />

          {/* Input 2: Background Music JSON */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Music2 className="h-4 w-4 text-teal-700" aria-hidden="true" />
                <div>
                  <label htmlFor="bgm-json-input" className="text-sm font-semibold text-zinc-900">
                    Input 2 · Background Music JSON (Output 2 · Free Synth)
                  </label>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={onFormatBgmJson}
                  className="inline-flex min-h-[32px] items-center rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950 whitespace-nowrap shrink-0"
                >
                  Format
                </button>
                <button
                  type="button"
                  onClick={handleCopyBgm}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950 whitespace-nowrap shrink-0"
                >
                  {copiedBgm ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" aria-hidden="true" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                {isBgmModified && (
                  <button
                    type="button"
                    onClick={onRestoreBgmDefault}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950 whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    <span>Restore</span>
                  </button>
                )}
              </div>
            </div>

            <textarea
              id="bgm-json-input"
              rows={6}
              spellCheck={false}
              value={rawBgmJson}
              onChange={(e) => onRawBgmJsonChange(e.target.value)}
              className={`w-full rounded-lg border bg-zinc-50/70 p-3.5 font-mono text-[13px] leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-2 ${
                bgmJsonError
                  ? 'border-red-400 focus:border-red-600 focus:ring-red-600/15'
                  : 'border-zinc-300 focus:border-teal-700 focus:ring-teal-700/15'
              }`}
            />

            {bgmJsonError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{bgmJsonError}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-600 tabular-nums">
                  <span className="font-semibold text-teal-700">Valid BGM JSON</span>
                  <span aria-hidden="true" className="text-zinc-300">
                    ·
                  </span>
                  <span className="font-mono font-medium text-zinc-900">{bgmPayload.bpm} BPM</span>
                  <span aria-hidden="true" className="text-zinc-300">
                    ·
                  </span>
                  <span>{bgmProfile.label}</span>
                  <span aria-hidden="true" className="text-zinc-300">
                    ·
                  </span>
                  <span className="font-mono">ducking_gain {bgmPayload.ducking_gain}</span>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-700">
                  <input
                    type="checkbox"
                    checked={applyDuckingToBgmExport}
                    onChange={(e) => onToggleApplyDucking(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-700"
                  />
                  <span>Pre-apply ducking ({bgmPayload.ducking_gain}) to BGM WAV</span>
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {inputView === 'form' && (
        <div className="mt-5 space-y-5">
          {/* Speaking Style Prompt */}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label
                htmlFor="speaking-style-input"
                className="text-sm font-semibold text-zinc-900"
              >
                Speaking Style Prompt
              </label>
              <span className="font-mono text-xs text-zinc-500 tabular-nums">
                {speakingStylePrompt.length} / 600 chars
              </span>
            </div>
            <textarea
              id="speaking-style-input"
              rows={2}
              value={speakingStylePrompt}
              onChange={(e) => onSpeakingStyleChange(e.target.value)}
              placeholder="Describe vocal tone, pacing shifts, and emotional delivery..."
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-zinc-500">Quick styles:</span>
              {STYLE_QUICK_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onSpeakingStyleChange(item.prompt)}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-700"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clean Vietnamese Script */}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label
                htmlFor="script-text-input"
                className="text-sm font-semibold text-zinc-900"
              >
                Narration Script (clean_text_vi)
              </label>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <label htmlFor="target-duration-input" className="font-medium text-zinc-600">
                  Target duration (sec)
                </label>
                <input
                  id="target-duration-input"
                  type="number"
                  min={5}
                  max={300}
                  value={targetDurationSec}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val > 0) {
                      onTargetDurationChange(Math.round(val));
                    }
                  }}
                  className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right font-mono text-xs text-zinc-900 tabular-nums focus:border-blue-700 focus:outline-none"
                />
              </div>
            </div>

            <textarea
              ref={textareaRef}
              id="script-text-input"
              rows={6}
              value={scriptText}
              onChange={(e) => onScriptTextChange(e.target.value)}
              placeholder="Enter Vietnamese or multilingual narration script..."
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-3 text-[15px] leading-[1.65] text-zinc-950 placeholder:text-zinc-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
            />

            {/* Vocal Cues Toolbar */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-zinc-500">Insert vocal cue:</span>
              {VOCAL_CUES.map((cue) => (
                <button
                  key={cue.token}
                  type="button"
                  title={cue.description}
                  onClick={() => handleInsertCue(cue.token)}
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-xs text-zinc-700 transition-colors hover:border-blue-700/40 hover:bg-blue-50/40 hover:text-blue-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-700"
                >
                  {cue.label}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-zinc-100" />

          {/* BGM Visual Controls */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-900">
              Background Music Settings (Output 2)
            </h2>
            <div>
              <label htmlFor="bgm-prompt-input" className="block text-xs font-medium text-zinc-600">
                Music Prompt (lyria_prompt_en)
              </label>
              <textarea
                id="bgm-prompt-input"
                rows={2}
                value={bgmPayload.lyria_prompt_en}
                onChange={(e) =>
                  onBgmPayloadChange({ ...bgmPayload, lyria_prompt_en: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="bgm-bpm-input" className="block text-xs font-medium text-zinc-600">
                  BPM (40–220)
                </label>
                <input
                  id="bgm-bpm-input"
                  type="number"
                  min={40}
                  max={220}
                  value={bgmPayload.bpm}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 40 && v <= 220) {
                      onBgmPayloadChange({ ...bgmPayload, bpm: Math.round(v) });
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-sm text-zinc-900 tabular-nums focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="bgm-duck-input" className="block text-xs font-medium text-zinc-600">
                  Ducking Gain (0.01–1.0)
                </label>
                <input
                  id="bgm-duck-input"
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.02}
                  value={bgmPayload.ducking_gain}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v > 0 && v <= 1) {
                      onBgmPayloadChange({ ...bgmPayload, ducking_gain: v });
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-sm text-zinc-900 tabular-nums focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="bgm-mood-input" className="block text-xs font-medium text-zinc-600">
                  Mood Label
                </label>
                <input
                  id="bgm-mood-input"
                  type="text"
                  value={bgmPayload.mood}
                  onChange={(e) => onBgmPayloadChange({ ...bgmPayload, mood: e.target.value })}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {inputView === 'dual' && (
        /* Dual-Speaker Screenplay Mode */
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Speaker A */}
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-xs font-semibold uppercase tracking-wider text-zinc-700">
                  Speaker A
                </span>
                <select
                  aria-label="Speaker A voice"
                  value={dualConfig.speakerA.voicePreset}
                  onChange={(e) =>
                    onDualConfigChange({
                      ...dualConfig,
                      speakerA: {
                        ...dualConfig.speakerA,
                        voicePreset: e.target.value as VoicePreset,
                      },
                    })
                  }
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-900 focus:border-blue-700 focus:outline-none"
                >
                  {VALID_VOICES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="speaker-a-name" className="block text-xs font-medium text-zinc-600">
                  Speaker name
                </label>
                <input
                  id="speaker-a-name"
                  type="text"
                  value={dualConfig.speakerA.name}
                  onChange={(e) =>
                    onDualConfigChange({
                      ...dualConfig,
                      speakerA: { ...dualConfig.speakerA, name: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-700 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="speaker-a-style" className="block text-xs font-medium text-zinc-600">
                  Style prompt
                </label>
                <input
                  id="speaker-a-style"
                  type="text"
                  value={dualConfig.speakerA.style}
                  onChange={(e) =>
                    onDualConfigChange({
                      ...dualConfig,
                      speakerA: { ...dualConfig.speakerA, style: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-700 focus:outline-none"
                />
              </div>
            </div>

            {/* Speaker B */}
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-xs font-semibold uppercase tracking-wider text-zinc-700">
                  Speaker B
                </span>
                <select
                  aria-label="Speaker B voice"
                  value={dualConfig.speakerB.voicePreset}
                  onChange={(e) =>
                    onDualConfigChange({
                      ...dualConfig,
                      speakerB: {
                        ...dualConfig.speakerB,
                        voicePreset: e.target.value as VoicePreset,
                      },
                    })
                  }
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-900 focus:border-blue-700 focus:outline-none"
                >
                  {VALID_VOICES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="speaker-b-name" className="block text-xs font-medium text-zinc-600">
                  Speaker name
                </label>
                <input
                  id="speaker-b-name"
                  type="text"
                  value={dualConfig.speakerB.name}
                  onChange={(e) =>
                    onDualConfigChange({
                      ...dualConfig,
                      speakerB: { ...dualConfig.speakerB, name: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-700 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="speaker-b-style" className="block text-xs font-medium text-zinc-600">
                  Style prompt
                </label>
                <input
                  id="speaker-b-style"
                  type="text"
                  value={dualConfig.speakerB.style}
                  onChange={(e) =>
                    onDualConfigChange({
                      ...dualConfig,
                      speakerB: { ...dualConfig.speakerB, style: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-700 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Dialogue Turns */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">Dialogue Screenplay</h3>
              <button
                type="button"
                onClick={handleAddTurn}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-700"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add Turn
              </button>
            </div>

            {dualConfig.turns.map((turn, idx) => (
              <div
                key={turn.id}
                className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 sm:flex-row sm:items-start"
              >
                <div className="flex items-center justify-between gap-2 sm:w-36 sm:shrink-0">
                  <select
                    aria-label={`Turn ${idx + 1} speaker`}
                    value={turn.speakerKey}
                    onChange={(e) =>
                      handleUpdateTurn(turn.id, { speakerKey: e.target.value as 'A' | 'B' })
                    }
                    className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-xs font-semibold text-zinc-900 focus:border-blue-700 focus:outline-none"
                  >
                    <option value="A">{dualConfig.speakerA.name || 'Speaker A'}</option>
                    <option value="B">{dualConfig.speakerB.name || 'Speaker B'}</option>
                  </select>
                </div>

                <textarea
                  aria-label={`Turn ${idx + 1} dialogue line`}
                  rows={2}
                  value={turn.text}
                  onChange={(e) => handleUpdateTurn(turn.id, { text: e.target.value })}
                  placeholder="Enter dialogue line (supports <breath>, <laugh>, <gasp>, |yeah|, |mhm|)..."
                  className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-700 focus:outline-none"
                />

                <button
                  type="button"
                  aria-label={`Remove turn ${idx + 1}`}
                  disabled={dualConfig.turns.length <= 1}
                  onClick={() => handleRemoveTurn(turn.id)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-blue-700"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
