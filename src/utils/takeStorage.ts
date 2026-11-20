import { AudioTake, TtsMode, VoiceEngine } from '../shared/ttsTypes';
import { InputViewMode } from '../components/ScriptEditor';

const DB_NAME = 'phonic-studio-db';
const DB_VERSION = 1;
const STORE_NAME = 'audio_takes';
const DRAFT_STORAGE_KEY = 'phonic-studio-draft-v1';

export interface StoredAudioTakeRecord {
  id: string;
  kind: 'voiceover' | 'bgm';
  createdAt: string;
  mode: TtsMode;
  voiceLabel: string;
  styleSummary: string;
  scriptPreview: string;
  durationSec: number;
  estimatedDurationSec: number;
  sizeBytes: number;
  audioBlob: Blob;
}

export interface StudioDraftState {
  inputView: InputViewMode;
  voiceEngine?: VoiceEngine;
  rawVoiceJson: string;
  rawBgmJson: string;
  applyDuckingToBgmExport: boolean;
  activeVoiceTakeId: string | null;
  activeBgmTakeId: string | null;
}

export function sortTakesNewestFirst<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function pickActiveTakeIds(
  takes: Array<{ id: string; kind: 'voiceover' | 'bgm' }>,
  savedVoiceId?: string | null,
  savedBgmId?: string | null,
): { voiceId: string | null; bgmId: string | null } {
  const voiceExists = savedVoiceId
    ? takes.some((t) => t.id === savedVoiceId && t.kind === 'voiceover')
    : false;
  const bgmExists = savedBgmId
    ? takes.some((t) => t.id === savedBgmId && t.kind === 'bgm')
    : false;

  const voiceId = voiceExists
    ? savedVoiceId!
    : (takes.find((t) => t.kind === 'voiceover')?.id ?? null);
  const bgmId = bgmExists
    ? savedBgmId!
    : (takes.find((t) => t.kind === 'bgm')?.id ?? null);

  return { voiceId, bgmId };
}

export function parseDraftState(raw: string | null): Partial<StudioDraftState> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const result: Partial<StudioDraftState> = {};

    if (parsed.inputView === 'json' || parsed.inputView === 'form' || parsed.inputView === 'dual') {
      result.inputView = parsed.inputView;
    }
    if (parsed.voiceEngine === 'edge-free' || parsed.voiceEngine === 'gemini') {
      result.voiceEngine = parsed.voiceEngine;
    }
    if (typeof parsed.rawVoiceJson === 'string') {
      result.rawVoiceJson = parsed.rawVoiceJson;
    }
    if (typeof parsed.rawBgmJson === 'string') {
      result.rawBgmJson = parsed.rawBgmJson;
    }
    if (typeof parsed.applyDuckingToBgmExport === 'boolean') {
      result.applyDuckingToBgmExport = parsed.applyDuckingToBgmExport;
    }
    if (typeof parsed.activeVoiceTakeId === 'string' || parsed.activeVoiceTakeId === null) {
      result.activeVoiceTakeId = parsed.activeVoiceTakeId;
    }
    if (typeof parsed.activeBgmTakeId === 'string' || parsed.activeBgmTakeId === null) {
      result.activeBgmTakeId = parsed.activeBgmTakeId;
    }
    return result;
  } catch {
    return null;
  }
}

export function saveStudioDraft(draft: StudioDraftState): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function loadStudioDraft(): Partial<StudioDraftState> | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return parseDraftState(window.localStorage.getItem(DRAFT_STORAGE_KEY));
  } catch {
    return null;
  }
}

function openTakesDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      resolve(null);
      return;
    }
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveAudioTakeRecord(record: StoredAudioTakeRecord): Promise<void> {
  const db = await openTakesDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function loadAllAudioTakes(): Promise<
  Array<{ take: AudioTake; blob: Blob }>
> {
  const db = await openTakesDb();
  if (!db) return [];
  const records = await new Promise<StoredAudioTakeRecord[]>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result as StoredAudioTakeRecord[]) ?? []);
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });

  const sorted = sortTakesNewestFirst(records);
  return sorted
    .filter((r) => r && r.audioBlob instanceof Blob)
    .map((r) => ({
      blob: r.audioBlob,
      take: {
        id: r.id,
        kind: r.kind === 'bgm' ? 'bgm' : 'voiceover',
        createdAt: r.createdAt,
        mode: r.mode ?? 'single',
        voiceLabel: r.voiceLabel,
        styleSummary: r.styleSummary,
        scriptPreview: r.scriptPreview,
        durationSec: r.durationSec,
        estimatedDurationSec: r.estimatedDurationSec,
        audioUrl: URL.createObjectURL(r.audioBlob),
        sizeBytes: r.sizeBytes,
      },
    }));
}

export async function deleteAudioTakeRecord(id: string): Promise<void> {
  const db = await openTakesDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function clearAllAudioTakeRecords(): Promise<void> {
  const db = await openTakesDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
