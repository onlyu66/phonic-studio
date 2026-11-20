import { useEffect, useMemo, useRef, useState } from 'react';
import { JsonInspector } from './components/JsonInspector';
import { InputViewMode, ScriptEditor } from './components/ScriptEditor';
import { TakeHistory } from './components/TakeHistory';
import { TopBar } from './components/TopBar';
import { VoiceSelector } from './components/VoiceSelector';
import { WaveformPlayer } from './components/WaveformPlayer';
import {
  AudioTake,
  BgmScriptPayload,
  DEFAULT_BGM_PAYLOAD,
  DEFAULT_DUAL_CONFIG,
  DEFAULT_SCRIPT_PAYLOAD,
  DualSpeakerConfig,
  EdgeTtsResponseBody,
  TtsMode,
  TtsRequestBody,
  TtsResponseBody,
  TtsScriptPayload,
  VoiceEngine,
  VoicePreset,
} from './shared/ttsTypes';
import {
  analyzeScript,
  deriveBgmSynthProfile,
  parseBgmJsonPayload,
  parseTtsJsonPayload,
  serializeBgmJsonPayload,
  serializeTtsJsonPayload,
} from './utils/scriptAnalysis';
import {
  decodeAndStitchMp3SegmentsToWav,
  synthesizeProceduralBgmWav,
} from './utils/wavEncoder';
import {
  clearAllAudioTakeRecords,
  deleteAudioTakeRecord,
  loadAllAudioTakes,
  loadStudioDraft,
  pickActiveTakeIds,
  saveAudioTakeRecord,
  saveStudioDraft,
} from './utils/takeStorage';

function base64WavToBlob(base64: string): { blob: Blob; url: string; sizeBytes: number } {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'audio/wav' });
  return { blob, url: URL.createObjectURL(blob), sizeBytes: len };
}

export default function App() {
  const initialDraft = useMemo(() => loadStudioDraft(), []);

  const initialVoiceParsed = useMemo(() => {
    if (initialDraft?.rawVoiceJson) {
      const parsed = parseTtsJsonPayload(initialDraft.rawVoiceJson);
      if (parsed.ok) return parsed.payload;
    }
    return DEFAULT_SCRIPT_PAYLOAD;
  }, [initialDraft]);

  const initialBgmParsed = useMemo(() => {
    if (initialDraft?.rawBgmJson) {
      const parsed = parseBgmJsonPayload(initialDraft.rawBgmJson);
      if (parsed.ok) return parsed.payload;
    }
    return DEFAULT_BGM_PAYLOAD;
  }, [initialDraft]);

  const [inputView, setInputView] = useState<InputViewMode>(initialDraft?.inputView ?? 'json');
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngine>(
    initialDraft?.voiceEngine ?? 'gemini',
  );

  // Voiceover JSON state
  const [voicePreset, setVoicePreset] = useState<VoicePreset>(initialVoiceParsed.voice_preset);
  const [speakingStylePrompt, setSpeakingStylePrompt] = useState<string>(
    initialVoiceParsed.speaking_style_prompt,
  );
  const [scriptText, setScriptText] = useState<string>(initialVoiceParsed.clean_text_vi);
  const [targetDurationSec, setTargetDurationSec] = useState<number>(
    initialVoiceParsed.estimated_duration_sec,
  );
  const [rawVoiceJson, setRawVoiceJson] = useState<string>(
    () => initialDraft?.rawVoiceJson ?? serializeTtsJsonPayload(DEFAULT_SCRIPT_PAYLOAD),
  );
  const [voiceJsonError, setVoiceJsonError] = useState<string | null>(() => {
    if (!initialDraft?.rawVoiceJson) return null;
    const check = parseTtsJsonPayload(initialDraft.rawVoiceJson);
    return check.ok ? null : check.error;
  });

  // Background Music JSON state
  const [bgmPayload, setBgmPayload] = useState<BgmScriptPayload>(initialBgmParsed);
  const [rawBgmJson, setRawBgmJson] = useState<string>(
    () => initialDraft?.rawBgmJson ?? serializeBgmJsonPayload(DEFAULT_BGM_PAYLOAD),
  );
  const [bgmJsonError, setBgmJsonError] = useState<string | null>(() => {
    if (!initialDraft?.rawBgmJson) return null;
    const check = parseBgmJsonPayload(initialDraft.rawBgmJson);
    return check.ok ? null : check.error;
  });
  const [applyDuckingToBgmExport, setApplyDuckingToBgmExport] = useState<boolean>(
    initialDraft?.applyDuckingToBgmExport ?? false,
  );

  const [dualConfig, setDualConfig] = useState<DualSpeakerConfig>(DEFAULT_DUAL_CONFIG);

  // Separate output states (hydrated from IndexedDB)
  const [takes, setTakes] = useState<AudioTake[]>([]);
  const [activeVoiceTakeId, setActiveVoiceTakeId] = useState<string | null>(
    initialDraft?.activeVoiceTakeId ?? null,
  );
  const [activeBgmTakeId, setActiveBgmTakeId] = useState<string | null>(
    initialDraft?.activeBgmTakeId ?? null,
  );

  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [isGeneratingBgm, setIsGeneratingBgm] = useState(false);
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | null>(null);
  const [bgmErrorMessage, setBgmErrorMessage] = useState<string | null>(null);

  const blobUrlsRef = useRef<Set<string>>(new Set());
  const mode: TtsMode = inputView === 'dual' ? 'dual' : 'single';

  // Hydrate persisted WAV takes from IndexedDB on startup
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const loaded = await loadAllAudioTakes();
      if (cancelled) {
        loaded.forEach((item) => URL.revokeObjectURL(item.take.audioUrl));
        return;
      }

      if (loaded.length === 0) return;

      loaded.forEach((item) => blobUrlsRef.current.add(item.take.audioUrl));
      const restoredTakes = loaded.map((item) => item.take);

      setTakes((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const merged = [...prev, ...restoredTakes.filter((t) => !existingIds.has(t.id))];
        return merged;
      });

      const picked = pickActiveTakeIds(
        restoredTakes,
        initialDraft?.activeVoiceTakeId,
        initialDraft?.activeBgmTakeId,
      );
      setActiveVoiceTakeId((prev) => prev ?? picked.voiceId);
      setActiveBgmTakeId((prev) => prev ?? picked.bgmId);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [initialDraft]);

  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Persist draft JSON inputs, selected voice engine & active take IDs across reloads
  useEffect(() => {
    saveStudioDraft({
      inputView,
      voiceEngine,
      rawVoiceJson,
      rawBgmJson,
      applyDuckingToBgmExport,
      activeVoiceTakeId,
      activeBgmTakeId,
    });
  }, [
    inputView,
    voiceEngine,
    rawVoiceJson,
    rawBgmJson,
    applyDuckingToBgmExport,
    activeVoiceTakeId,
    activeBgmTakeId,
  ]);

  const metrics = useMemo(
    () => analyzeScript(scriptText, targetDurationSec),
    [scriptText, targetDurationSec],
  );

  const bgmProfile = useMemo(() => deriveBgmSynthProfile(bgmPayload), [bgmPayload]);

  const currentVoicePayload: TtsScriptPayload = useMemo(
    () => ({
      voice_preset: voicePreset,
      speaking_style_prompt: speakingStylePrompt,
      clean_text_vi: scriptText,
      estimated_duration_sec: targetDurationSec,
    }),
    [voicePreset, speakingStylePrompt, scriptText, targetDurationSec],
  );

  const syncVoiceJsonFromFields = (next: TtsScriptPayload) => {
    setRawVoiceJson(serializeTtsJsonPayload(next));
    setVoiceJsonError(null);
  };

  const applyVoicePayloadToState = (next: TtsScriptPayload, updateRawJson: boolean) => {
    setVoicePreset(next.voice_preset);
    setSpeakingStylePrompt(next.speaking_style_prompt);
    setScriptText(next.clean_text_vi);
    setTargetDurationSec(next.estimated_duration_sec);
    if (updateRawJson) {
      setRawVoiceJson(serializeTtsJsonPayload(next));
    }
    setVoiceJsonError(null);
  };

  const handleRawVoiceJsonChange = (raw: string) => {
    setRawVoiceJson(raw);
    const parsed = parseTtsJsonPayload(raw);
    if (!parsed.ok) {
      setVoiceJsonError(parsed.error);
      return;
    }
    applyVoicePayloadToState(parsed.payload, false);
  };

  const handleFormatVoiceJson = () => {
    const parsed = parseTtsJsonPayload(rawVoiceJson);
    if (!parsed.ok) {
      setVoiceJsonError(parsed.error);
      return;
    }
    applyVoicePayloadToState(parsed.payload, true);
  };

  const handleCopyVoiceJson = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(
        voiceJsonError ? rawVoiceJson : serializeTtsJsonPayload(currentVoicePayload),
      );
      return true;
    } catch {
      return false;
    }
  };

  const handleRawBgmJsonChange = (raw: string) => {
    setRawBgmJson(raw);
    const parsed = parseBgmJsonPayload(raw);
    if (!parsed.ok) {
      setBgmJsonError(parsed.error);
      return;
    }
    setBgmPayload(parsed.payload);
    setBgmJsonError(null);
  };

  const handleFormatBgmJson = () => {
    const parsed = parseBgmJsonPayload(rawBgmJson);
    if (!parsed.ok) {
      setBgmJsonError(parsed.error);
      return;
    }
    setBgmPayload(parsed.payload);
    setRawBgmJson(serializeBgmJsonPayload(parsed.payload));
    setBgmJsonError(null);
  };

  const handleCopyBgmJson = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(
        bgmJsonError ? rawBgmJson : serializeBgmJsonPayload(bgmPayload),
      );
      return true;
    } catch {
      return false;
    }
  };

  const handleBgmPayloadChange = (next: BgmScriptPayload) => {
    setBgmPayload(next);
    setRawBgmJson(serializeBgmJsonPayload(next));
    setBgmJsonError(null);
  };

  const isVoiceModified = useMemo(
    () =>
      voicePreset !== DEFAULT_SCRIPT_PAYLOAD.voice_preset ||
      speakingStylePrompt !== DEFAULT_SCRIPT_PAYLOAD.speaking_style_prompt ||
      scriptText !== DEFAULT_SCRIPT_PAYLOAD.clean_text_vi ||
      targetDurationSec !== DEFAULT_SCRIPT_PAYLOAD.estimated_duration_sec ||
      voiceJsonError !== null,
    [voicePreset, speakingStylePrompt, scriptText, targetDurationSec, voiceJsonError],
  );

  const isBgmModified = useMemo(
    () =>
      bgmPayload.lyria_prompt_en !== DEFAULT_BGM_PAYLOAD.lyria_prompt_en ||
      bgmPayload.bpm !== DEFAULT_BGM_PAYLOAD.bpm ||
      bgmPayload.mood !== DEFAULT_BGM_PAYLOAD.mood ||
      bgmPayload.ducking_gain !== DEFAULT_BGM_PAYLOAD.ducking_gain ||
      bgmJsonError !== null,
    [bgmPayload, bgmJsonError],
  );

  const activeVoiceTake = useMemo(
    () => takes.find((t) => t.id === activeVoiceTakeId && t.kind === 'voiceover') ?? null,
    [takes, activeVoiceTakeId],
  );

  const activeBgmTake = useMemo(
    () => takes.find((t) => t.id === activeBgmTakeId && t.kind === 'bgm') ?? null,
    [takes, activeBgmTakeId],
  );

  const handleRestoreVoiceDefault = () => {
    applyVoicePayloadToState(DEFAULT_SCRIPT_PAYLOAD, true);
    setVoiceErrorMessage(null);
  };

  const handleRestoreBgmDefault = () => {
    handleBgmPayloadChange(DEFAULT_BGM_PAYLOAD);
    setBgmErrorMessage(null);
  };

  const handleSelectVoice = (voice: VoicePreset) => {
    setVoicePreset(voice);
    if (inputView === 'dual') {
      setInputView('json');
    }
    syncVoiceJsonFromFields({
      ...currentVoicePayload,
      voice_preset: voice,
    });
  };

  const handleSpeakingStyleChange = (style: string) => {
    setSpeakingStylePrompt(style);
    syncVoiceJsonFromFields({
      ...currentVoicePayload,
      speaking_style_prompt: style,
    });
  };

  const handleScriptTextChange = (text: string) => {
    setScriptText(text);
    syncVoiceJsonFromFields({
      ...currentVoicePayload,
      clean_text_vi: text,
    });
  };

  const handleTargetDurationChange = (sec: number) => {
    setTargetDurationSec(sec);
    syncVoiceJsonFromFields({
      ...currentVoicePayload,
      estimated_duration_sec: sec,
    });
  };

  const handleGenerateVoiceover = async (): Promise<number | null> => {
    if (isGeneratingVoice) return null;
    setVoiceErrorMessage(null);

    let requestBody: TtsRequestBody | TtsScriptPayload;
    let activeStyleSummary = speakingStylePrompt;
    let activeScriptPreview = scriptText.trim();
    let activeEstimatedSec = metrics.estimatedDurationSec;

    if (inputView === 'json') {
      const parsed = parseTtsJsonPayload(rawVoiceJson);
      if (!parsed.ok) {
        setVoiceJsonError(parsed.error);
        setVoiceErrorMessage(`Invalid Voiceover JSON: ${parsed.error}`);
        return null;
      }
      applyVoicePayloadToState(parsed.payload, false);
      requestBody = parsed.payload;
      activeStyleSummary = parsed.payload.speaking_style_prompt;
      activeScriptPreview = parsed.payload.clean_text_vi;
      activeEstimatedSec = parsed.payload.estimated_duration_sec;
    } else if (inputView === 'form') {
      if (!scriptText.trim()) {
        setVoiceErrorMessage('Please enter a script before generating speech.');
        return null;
      }
      requestBody = {
        mode: 'single',
        voicePreset,
        speakingStylePrompt,
        text: scriptText,
        estimatedDurationSec: targetDurationSec,
      };
    } else {
      const nonEmptyTurns = dualConfig.turns.filter((t) => t.text.trim().length > 0);
      if (nonEmptyTurns.length === 0) {
        setVoiceErrorMessage('Please add at least one non-empty dialogue turn in Dual-Speaker mode.');
        return null;
      }
      requestBody = {
        mode: 'dual',
        speakerA: dualConfig.speakerA,
        speakerB: dualConfig.speakerB,
        turns: nonEmptyTurns.map((t) => ({
          speakerKey: t.speakerKey,
          text: t.text,
        })),
      };
      activeStyleSummary = `${dualConfig.speakerA.name} & ${dualConfig.speakerB.name}`;
      activeScriptPreview = nonEmptyTurns.map((t) => t.text.trim()).join(' ');
    }

    setIsGeneratingVoice(true);

    try {
      let blob: Blob;
      let url: string;
      let sizeBytes: number;
      let finalDuration: number;
      let voiceLabel = voicePreset as string;

      if (voiceEngine === 'edge-free') {
        const res = await fetch('/api/tts-edge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const body = (await res.json()) as Partial<EdgeTtsResponseBody> & { error?: string };
        if (!res.ok || !Array.isArray(body.segments) || body.segments.length === 0) {
          throw new Error(body.error || `No-Key Edge TTS returned status ${res.status}.`);
        }

        const decoded = await decodeAndStitchMp3SegmentsToWav(body.segments);
        blob = decoded.blob;
        url = decoded.blobUrl;
        sizeBytes = decoded.sizeBytes;
        finalDuration = decoded.durationSec || activeEstimatedSec;
        voiceLabel = body.voiceLabel || voicePreset;
        if (body.appliedRatesSummary) {
          activeStyleSummary = `${body.appliedRatesSummary} · ${activeStyleSummary}`;
        }
      } else {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const body = (await res.json()) as Partial<TtsResponseBody> & { error?: string };

        if (!res.ok || !body.audioBase64) {
          throw new Error(body.error || `Server returned status ${res.status}.`);
        }

        const converted = base64WavToBlob(body.audioBase64);
        blob = converted.blob;
        url = converted.url;
        sizeBytes = converted.sizeBytes;
        finalDuration = body.durationSec ?? activeEstimatedSec;
        voiceLabel = body.voiceLabel || voicePreset;
      }

      blobUrlsRef.current.add(url);

      const createdAt = new Date().toISOString();
      const takeId = `take-voice-${Date.now()}`;
      const newTake: AudioTake = {
        id: takeId,
        kind: 'voiceover',
        createdAt,
        mode,
        voiceLabel,
        styleSummary: activeStyleSummary,
        scriptPreview: activeScriptPreview,
        durationSec: finalDuration,
        estimatedDurationSec: activeEstimatedSec,
        audioUrl: url,
        sizeBytes,
      };

      void saveAudioTakeRecord({
        id: takeId,
        kind: 'voiceover',
        createdAt,
        mode,
        voiceLabel: newTake.voiceLabel,
        styleSummary: newTake.styleSummary,
        scriptPreview: newTake.scriptPreview,
        durationSec: finalDuration,
        estimatedDurationSec: activeEstimatedSec,
        sizeBytes,
        audioBlob: blob,
      });

      setTakes((prev) => [newTake, ...prev]);
      setActiveVoiceTakeId(takeId);
      return finalDuration;
    } catch (err) {
      setVoiceErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to synthesize speech. Please verify server connectivity and try again.',
      );
      return null;
    } finally {
      setIsGeneratingVoice(false);
    }
  };

  const handleGenerateBgm = async (overrideDurationSec?: number) => {
    if (isGeneratingBgm) return;
    setBgmErrorMessage(null);

    let activeBgm = bgmPayload;
    if (inputView === 'json') {
      const parsed = parseBgmJsonPayload(rawBgmJson);
      if (!parsed.ok) {
        setBgmJsonError(parsed.error);
        setBgmErrorMessage(`Invalid BGM JSON: ${parsed.error}`);
        return;
      }
      activeBgm = parsed.payload;
      setBgmPayload(parsed.payload);
      setBgmJsonError(null);
    }

    const targetBgmDuration = Math.max(
      5,
      Math.round(overrideDurationSec ?? activeVoiceTake?.durationSec ?? targetDurationSec),
    );

    setIsGeneratingBgm(true);
    try {
      const rendered = await synthesizeProceduralBgmWav(
        activeBgm,
        targetBgmDuration,
        applyDuckingToBgmExport,
      );
      blobUrlsRef.current.add(rendered.blobUrl);

      const createdAt = new Date().toISOString();
      const takeId = `take-bgm-${Date.now()}`;
      const newTake: AudioTake = {
        id: takeId,
        kind: 'bgm',
        createdAt,
        mode: 'single',
        voiceLabel: `${activeBgm.bpm} BPM`,
        styleSummary: rendered.styleLabel,
        scriptPreview: `${activeBgm.mood} · ${activeBgm.lyria_prompt_en}`,
        durationSec: rendered.durationSec,
        estimatedDurationSec: targetBgmDuration,
        audioUrl: rendered.blobUrl,
        sizeBytes: rendered.sizeBytes,
      };

      void saveAudioTakeRecord({
        id: takeId,
        kind: 'bgm',
        createdAt,
        mode: 'single',
        voiceLabel: newTake.voiceLabel,
        styleSummary: newTake.styleSummary,
        scriptPreview: newTake.scriptPreview,
        durationSec: rendered.durationSec,
        estimatedDurationSec: targetBgmDuration,
        sizeBytes: rendered.sizeBytes,
        audioBlob: rendered.blob,
      });

      setTakes((prev) => [newTake, ...prev]);
      setActiveBgmTakeId(takeId);
    } catch (err) {
      setBgmErrorMessage(
        err instanceof Error ? err.message : 'Unable to synthesize BGM audio track.',
      );
    } finally {
      setIsGeneratingBgm(false);
    }
  };

  const handleGenerateBoth = async () => {
    const voiceDuration = await handleGenerateVoiceover();
    await handleGenerateBgm(voiceDuration ?? targetDurationSec);
  };

  const handleDeleteTake = (id: string) => {
    void deleteAudioTakeRecord(id);
    setTakes((prev) => {
      const target = prev.find((t) => t.id === id);
      if (target) {
        URL.revokeObjectURL(target.audioUrl);
        blobUrlsRef.current.delete(target.audioUrl);
      }
      const next = prev.filter((t) => t.id !== id);
      if (activeVoiceTakeId === id) {
        setActiveVoiceTakeId(next.find((t) => t.kind === 'voiceover')?.id ?? null);
      }
      if (activeBgmTakeId === id) {
        setActiveBgmTakeId(next.find((t) => t.kind === 'bgm')?.id ?? null);
      }
      return next;
    });
  };

  const handleClearAllTakes = () => {
    void clearAllAudioTakeRecords();
    setTakes((prev) => {
      prev.forEach((t) => {
        URL.revokeObjectURL(t.audioUrl);
        blobUrlsRef.current.delete(t.audioUrl);
      });
      return [];
    });
    setActiveVoiceTakeId(null);
    setActiveBgmTakeId(null);
  };

  const isAnyGenerating = isGeneratingVoice || isGeneratingBgm;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-zinc-900">
      <TopBar isGenerating={isAnyGenerating} onGenerate={handleGenerateBoth} />

      <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Primary Column: Dual JSON Inputs + 2 Separate Audio Outputs */}
          <div className="min-w-0 space-y-6 lg:col-span-7">
            <ScriptEditor
              inputView={inputView}
              onInputViewChange={(nextView) => {
                if (nextView === 'json') {
                  if (!voiceJsonError) setRawVoiceJson(serializeTtsJsonPayload(currentVoicePayload));
                  if (!bgmJsonError) setRawBgmJson(serializeBgmJsonPayload(bgmPayload));
                }
                setInputView(nextView);
              }}
              voiceEngine={voiceEngine}
              onVoiceEngineChange={(nextEngine) => {
                setVoiceEngine(nextEngine);
                setVoiceErrorMessage(null);
              }}
              selectedVoice={voicePreset}
              rawVoiceJson={rawVoiceJson}
              onRawVoiceJsonChange={handleRawVoiceJsonChange}
              voiceJsonError={voiceJsonError}
              onFormatVoiceJson={handleFormatVoiceJson}
              onCopyVoiceJson={handleCopyVoiceJson}
              onRestoreVoiceDefault={handleRestoreVoiceDefault}
              isVoiceModified={isVoiceModified}
              rawBgmJson={rawBgmJson}
              onRawBgmJsonChange={handleRawBgmJsonChange}
              bgmJsonError={bgmJsonError}
              onFormatBgmJson={handleFormatBgmJson}
              onCopyBgmJson={handleCopyBgmJson}
              onRestoreBgmDefault={handleRestoreBgmDefault}
              isBgmModified={isBgmModified}
              bgmPayload={bgmPayload}
              onBgmPayloadChange={handleBgmPayloadChange}
              bgmProfile={bgmProfile}
              applyDuckingToBgmExport={applyDuckingToBgmExport}
              onToggleApplyDucking={setApplyDuckingToBgmExport}
              speakingStylePrompt={speakingStylePrompt}
              onSpeakingStyleChange={handleSpeakingStyleChange}
              scriptText={scriptText}
              onScriptTextChange={handleScriptTextChange}
              targetDurationSec={targetDurationSec}
              onTargetDurationChange={handleTargetDurationChange}
              metrics={metrics}
              dualConfig={dualConfig}
              onDualConfigChange={setDualConfig}
              onGenerateShortcut={handleGenerateBoth}
            />

            <div id="audio-outputs" className="space-y-6">
              <WaveformPlayer
                title="Output 1 · Voiceover Audio"
                subtitle={
                  voiceEngine === 'edge-free'
                    ? '24kHz WAV · No-Key Edge Neural TTS'
                    : '24kHz WAV · gemini-3.8-flash-tts'
                }
                accentColor="blue"
                downloadFilename={`voiceover-${voicePreset.toLowerCase()}.wav`}
                downloadLabel="Download Voiceover (.wav)"
                generateLabel="Generate Voiceover"
                idleLabel="Ready to render Output 1 (Voiceover WAV)"
                activeTake={activeVoiceTake}
                isGenerating={isGeneratingVoice}
                errorMessage={voiceErrorMessage}
                onDismissError={() => setVoiceErrorMessage(null)}
                onGenerate={() => void handleGenerateVoiceover()}
              />

              <WaveformPlayer
                title="Output 2 · Background Music"
                subtitle={`24kHz WAV · Free Synth · ${bgmPayload.bpm} BPM`}
                accentColor="teal"
                downloadFilename={`bgm-${bgmPayload.bpm}bpm${applyDuckingToBgmExport ? '-ducked' : ''}.wav`}
                downloadLabel="Download BGM (.wav)"
                generateLabel="Generate BGM"
                idleLabel="Ready to synthesize Output 2 (Free BGM WAV)"
                activeTake={activeBgmTake}
                isGenerating={isGeneratingBgm}
                errorMessage={bgmErrorMessage}
                onDismissError={() => setBgmErrorMessage(null)}
                onGenerate={() => void handleGenerateBgm()}
              />
            </div>
          </div>

          {/* Secondary Inspector Column: Voice Cast + Summary + Take History */}
          <aside className="min-w-0 space-y-6 lg:col-span-5">
            <VoiceSelector
              selectedVoice={voicePreset}
              onSelectVoice={handleSelectVoice}
              voiceEngine={voiceEngine}
            />

            <JsonInspector
              inputView={inputView}
              voicePayload={currentVoicePayload}
              bgmPayload={bgmPayload}
            />

            <TakeHistory
              takes={takes}
              activeVoiceTakeId={activeVoiceTakeId}
              activeBgmTakeId={activeBgmTakeId}
              onSelectTake={(take) => {
                if (take.kind === 'bgm') {
                  setActiveBgmTakeId(take.id);
                } else {
                  setActiveVoiceTakeId(take.id);
                }
              }}
              onDeleteTake={handleDeleteTake}
              onClearAll={handleClearAllTakes}
            />
          </aside>
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-4 py-4 text-xs text-zinc-500 sm:px-6 lg:px-8">
          <span>Phonic Studio · Dual Audio Output Workbench</span>
          <span>
            Voiceover: {voiceEngine === 'edge-free' ? 'No-Key Edge Neural TTS' : 'gemini-3.8-flash-tts'} · BGM: Free Web Audio Synth
          </span>
        </div>
      </footer>
    </div>
  );
}
