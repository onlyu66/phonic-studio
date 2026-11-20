import { AudioLines, Loader2 } from 'lucide-react';

interface TopBarProps {
  isGenerating: boolean;
  onGenerate: () => void;
}

export function TopBar({ isGenerating, onGenerate }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
        <a
          href="#script-editor"
          className="font-display text-lg font-bold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
        >
          Phonic Studio
        </a>

        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600"
        >
          <a
            href="#script-editor"
            className="whitespace-nowrap shrink-0 py-1 hover:text-zinc-950 hover:underline underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
          >
            JSON Inputs
          </a>
          <a
            href="#audio-outputs"
            className="whitespace-nowrap shrink-0 py-1 hover:text-zinc-950 hover:underline underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
          >
            Audio Outputs
          </a>
          <a
            href="#voice-cast"
            className="whitespace-nowrap shrink-0 py-1 hover:text-zinc-950 hover:underline underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
          >
            Voice Cast
          </a>
          <a
            href="#take-history"
            className="whitespace-nowrap shrink-0 py-1 hover:text-zinc-950 hover:underline underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
          >
            Take History
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <AudioLines className="h-4 w-4" aria-hidden="true" />
                <span>Generate 2 Outputs</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
