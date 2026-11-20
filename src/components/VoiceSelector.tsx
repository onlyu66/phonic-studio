import { Check } from 'lucide-react';
import { VOICE_CAST, VoiceEngine, VoicePreset } from '../shared/ttsTypes';
import { mapVoicePresetToEdgeVoice } from '../utils/edgeTtsPlanner';

interface VoiceSelectorProps {
  selectedVoice: VoicePreset;
  onSelectVoice: (voice: VoicePreset) => void;
  voiceEngine: VoiceEngine;
  disabled?: boolean;
}

export function VoiceSelector({
  selectedVoice,
  onSelectVoice,
  voiceEngine,
  disabled = false,
}: VoiceSelectorProps) {
  return (
    <section
      id="voice-cast"
      aria-labelledby="voice-cast-heading"
      className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-zinc-100 pb-3.5">
        <div>
          <h2
            id="voice-cast-heading"
            className="font-display text-base font-semibold text-zinc-950"
          >
            Voice Cast
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {voiceEngine === 'edge-free'
              ? 'Mapped to Vietnamese Neural voices (No-Key Edge TTS)'
              : 'Prebuilt studio personas for gemini-3.8-flash-tts'}
          </p>
        </div>
        <span className="font-mono text-xs font-medium text-zinc-600 tabular-nums whitespace-nowrap shrink-0">
          {selectedVoice} active
        </span>
      </div>

      <div className="mt-4 space-y-2" role="radiogroup" aria-label="Voice preset">
        {VOICE_CAST.map((voice) => {
          const isSelected = voice.id === selectedVoice;
          const edgeMap = mapVoicePresetToEdgeVoice(voice.id);
          return (
            <button
              key={voice.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onSelectVoice(voice.id)}
              className={`w-full rounded-lg border p-3.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-60 ${
                isSelected
                  ? 'border-blue-700 bg-blue-50/40'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/70'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-display text-sm font-semibold text-zinc-950">
                    {voice.name}
                  </span>
                  <span aria-hidden="true" className="text-zinc-300">
                    ·
                  </span>
                  <span className="text-xs font-medium text-zinc-600 truncate">
                    {voiceEngine === 'edge-free' ? edgeMap.edgeVoice : voice.register}
                  </span>
                </div>
                {isSelected && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 whitespace-nowrap shrink-0">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Selected
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                {voice.character}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Best for: {voice.bestFor}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
