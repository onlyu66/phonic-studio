import { Download, Play, Trash2 } from 'lucide-react';
import { AudioTake } from '../shared/ttsTypes';
import { formatTimeClock } from '../utils/scriptAnalysis';

interface TakeHistoryProps {
  takes: AudioTake[];
  activeVoiceTakeId: string | null;
  activeBgmTakeId: string | null;
  onSelectTake: (take: AudioTake) => void;
  onDeleteTake: (id: string) => void;
  onClearAll: () => void;
}

export function TakeHistory({
  takes,
  activeVoiceTakeId,
  activeBgmTakeId,
  onSelectTake,
  onDeleteTake,
  onClearAll,
}: TakeHistoryProps) {
  return (
    <section
      id="take-history"
      aria-labelledby="take-history-heading"
      className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-zinc-100 pb-3.5">
        <div>
          <h2 id="take-history-heading" className="font-display text-base font-semibold text-zinc-950">
            Take History
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Saved Voiceover &amp; BGM WAV files (persists across reloads)
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-xs text-zinc-500 tabular-nums">
            {takes.length} {takes.length === 1 ? 'file' : 'files'}
          </span>
          {takes.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-red-700 hover:underline whitespace-nowrap shrink-0"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {takes.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-6 text-center">
          <p className="text-sm font-medium text-zinc-700">No audio outputs rendered yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            Click Generate 2 Outputs to synthesize separate Voiceover and BGM WAV downloads.
          </p>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-zinc-100">
          {takes.map((take, index) => {
            const isActive =
              take.kind === 'voiceover'
                ? take.id === activeVoiceTakeId
                : take.id === activeBgmTakeId;
            const kindLabel = take.kind === 'bgm' ? 'BGM' : 'Voiceover';
            const filename =
              take.kind === 'bgm'
                ? `bgm-${take.voiceLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.wav`
                : `voiceover-${take.voiceLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.wav`;

            return (
              <div
                key={take.id}
                className={`flex items-center justify-between gap-3 py-3 transition-colors ${
                  isActive ? 'bg-zinc-50 -mx-2 px-2 rounded-lg' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span
                      className={`font-semibold ${
                        take.kind === 'bgm' ? 'text-teal-700' : 'text-blue-700'
                      }`}
                    >
                      {kindLabel}
                    </span>
                    <span aria-hidden="true" className="text-zinc-300">
                      ·
                    </span>
                    <span className="font-medium text-zinc-800 truncate">{take.voiceLabel}</span>
                    <span aria-hidden="true" className="text-zinc-300">
                      ·
                    </span>
                    <span className="font-mono text-zinc-600 tabular-nums">
                      {formatTimeClock(take.durationSec)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">{take.scriptPreview}</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label={`Load ${kindLabel} #${takes.length - index}`}
                    onClick={() => onSelectTake(take)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-colors focus-visible:outline-2 focus-visible:outline-blue-700 ${
                      isActive
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <a
                    href={take.audioUrl}
                    download={filename}
                    aria-label={`Download ${kindLabel} #${takes.length - index}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-700"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    aria-label={`Delete ${kindLabel} #${takes.length - index}`}
                    onClick={() => onDeleteTake(take.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-blue-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
