import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Loader2,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import { AudioTake } from '../shared/ttsTypes';
import { formatTimeClock } from '../utils/scriptAnalysis';

interface WaveformPlayerProps {
  title: string;
  subtitle: string;
  accentColor: 'blue' | 'teal';
  downloadFilename: string;
  downloadLabel: string;
  generateLabel: string;
  idleLabel: string;
  activeTake: AudioTake | null;
  isGenerating: boolean;
  errorMessage: string | null;
  onDismissError: () => void;
  onGenerate: () => void;
}

const SPEED_OPTIONS = [0.85, 1, 1.15, 1.25] as const;

export function WaveformPlayer({
  title,
  subtitle,
  accentColor,
  downloadFilename,
  downloadLabel,
  generateLabel,
  idleLabel,
  activeTake,
  isGenerating,
  errorMessage,
  onDismissError,
  onGenerate,
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [peaks, setPeaks] = useState<number[]>([]);

  const hexAccent = accentColor === 'teal' ? '#0F766E' : '#1D4ED8';
  const btnBg =
    accentColor === 'teal'
      ? 'bg-teal-700 hover:bg-teal-800 focus-visible:outline-teal-700'
      : 'bg-blue-700 hover:bg-blue-800 focus-visible:outline-blue-700';

  // Decode WAV peaks for crisp studio waveform display
  useEffect(() => {
    let cancelled = false;
    setIsPlaying(false);
    setCurrentTime(0);

    if (!activeTake) {
      setPeaks([]);
      setDuration(0);
      return;
    }

    setDuration(activeTake.durationSec);

    async function decodePeaks(url: string) {
      try {
        const res = await fetch(url);
        const arrayBuf = await res.arrayBuffer();
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        const channelData = decoded.getChannelData(0);
        const barCount = 96;
        const step = Math.max(1, Math.floor(channelData.length / barCount));
        const nextPeaks: number[] = [];

        for (let i = 0; i < barCount; i++) {
          let max = 0;
          const start = i * step;
          const end = Math.min(start + step, channelData.length);
          for (let j = start; j < end; j++) {
            const amp = Math.abs(channelData[j]);
            if (amp > max) max = amp;
          }
          nextPeaks.push(Math.max(0.08, Math.min(1, max)));
        }

        await ctx.close();
        if (!cancelled) {
          setPeaks(nextPeaks);
          setDuration(decoded.duration || activeTake!.durationSec);
        }
      } catch {
        if (!cancelled) {
          setPeaks(
            Array.from({ length: 96 }, (_, i) => 0.22 + 0.55 * Math.abs(Math.sin(i * 0.45))),
          );
        }
      }
    }

    decodePeaks(activeTake.audioUrl);

    return () => {
      cancelled = true;
    };
  }, [activeTake]);

  // Draw waveform onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const bars = peaks.length > 0 ? peaks : Array.from({ length: 96 }, () => 0.14);
    const barGap = 2;
    const barWidth = Math.max(2, (width - barGap * (bars.length - 1)) / bars.length);
    const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

    bars.forEach((amp, idx) => {
      const x = idx * (barWidth + barGap);
      const barHeight = Math.max(4, amp * (height - 10));
      const y = (height - barHeight) / 2;
      const barRatio = idx / bars.length;

      if (!activeTake) {
        ctx.fillStyle = '#E4E4E7';
      } else if (barRatio <= progress) {
        ctx.fillStyle = hexAccent;
      } else {
        ctx.fillStyle = '#D4D4D8';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1.5);
      ctx.fill();
    });
  }, [peaks, currentTime, duration, activeTake, hexAccent]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, activeTake]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !activeTake) return;

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !activeTake || duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * duration;
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleRewind = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, audio.currentTime - 5);
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const Icon = accentColor === 'teal' ? Music2 : Volume2;

  return (
    <section
      aria-label={title}
      className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3.5">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-zinc-700" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-zinc-950">{title}</h2>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-500 tabular-nums">
          <span>{subtitle}</span>
          {activeTake && (
            <>
              <span aria-hidden="true" className="text-zinc-300">
                ·
              </span>
              <span className="font-medium text-zinc-800">{activeTake.voiceLabel}</span>
            </>
          )}
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Synthesis error</p>
              <p className="mt-0.5 text-xs leading-relaxed text-red-800 [overflow-wrap:anywhere]">
                {errorMessage}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            className="text-xs font-semibold text-red-700 underline-offset-2 hover:underline whitespace-nowrap shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTake && (
        <audio
          ref={audioRef}
          src={activeTake.audioUrl}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            if (Number.isFinite(e.currentTarget.duration)) {
              setDuration(e.currentTarget.duration);
            }
          }}
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        />
      )}

      {/* Waveform surface */}
      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/70 px-4 py-3.5">
        {isGenerating ? (
          <div className="flex h-16 flex-col items-center justify-center gap-1.5">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-800">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Rendering 24kHz WAV track...</span>
            </div>
          </div>
        ) : (
          <div className="relative">
            <canvas
              ref={canvasRef}
              data-testid={`waveform-canvas-${accentColor}`}
              onClick={handleSeek}
              aria-label={
                activeTake
                  ? `${title} waveform timeline, click to seek`
                  : `${title} waveform preview area`
              }
              className={`h-16 w-full block ${activeTake ? 'cursor-pointer' : 'cursor-default'}`}
            />
            {!activeTake && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-md bg-white/90 px-3 py-1 text-xs font-medium text-zinc-600 border border-zinc-200">
                  {idleLabel}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transport Controls */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {activeTake ? (
            <>
              <button
                type="button"
                onClick={togglePlay}
                aria-label={`${isPlaying ? 'Pause' : 'Play'} ${title}`}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-zinc-950 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-700"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Play</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleRewind}
                aria-label={`Rewind ${title} 5 seconds`}
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>-5s</span>
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0 focus-visible:outline-2 ${btnBg}`}
          >
            <span>{activeTake ? `Re-render` : generateLabel}</span>
          </button>

          <span className="ml-1 font-mono text-xs font-medium text-zinc-700 tabular-nums">
            {formatTimeClock(currentTime)} / {formatTimeClock(duration)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label={`${title} playback speed`}
            className="inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
          >
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                aria-pressed={playbackRate === rate}
                onClick={() => setPlaybackRate(rate)}
                className={`rounded-md px-2 py-1 font-mono text-xs font-medium tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                  playbackRate === rate
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {activeTake && (
            <a
              href={activeTake.audioUrl}
              download={downloadFilename}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 hover:text-zinc-950 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-700"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{downloadLabel}</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
