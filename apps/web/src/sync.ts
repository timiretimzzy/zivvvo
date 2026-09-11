import { create } from "zustand";
import type { AttemptEvent } from "@zivvvo/assessment-engine";

/**
 * Offline-first sync spine (docs/OFFLINE_STRATEGY.md, DATABASE.md).
 * Core types and pure logic live here so they are testable without IndexedDB
 * or any network dependency (tests import this module directly).
 * The Supabase bindings + the wired singleton live in ./sync-supabase.
 */

export interface AttemptRow {
  attempt_id: string;
  device_id: string;
  learner_id: string;
  qid: string;
  session_id: string | null;
  mode: string;
  selected: number[];
  is_correct: boolean;
  confidence: string;
  duration_ms: number;
  ts: number;
  synced_at: number | null;
}

export interface SyncBackend {
  /** True when the backend is wired (env present). Resolves without network.
   *   Never throws — returns false when the backend is unreachable. */
  configured(): Promise<boolean>;
  /** Upsert pending rows into the remote store. */
  push(rows: AttemptRow[]): Promise<void>;
  /** Fetch every attempt row this device is allowed to read (device-scoped). */
  pull(deviceId: string): Promise<AttemptRow[]>;
}

export interface SyncHost {
  /** Pending = rows whose syncedAt is still null. */
  readPending(): Promise<AttemptEvent[]>;
  markSynced(ids: string[], at: number): Promise<void>;
  /** Persist remote rows that are not yet stored locally; returns the new ones. */
  mergeRemote(rows: AttemptRow[], deviceId: string): Promise<AttemptEvent[]>;
}

export type SyncState = "idle" | "syncing" | "error";

export interface SyncSnapshot {
  configured: boolean;
  state: SyncState;
  pending: number;
  lastRun: number | null;
  lastError: string | null;
}

interface SyncStore extends SyncSnapshot {
  setSnapshot: (p: Partial<SyncSnapshot>) => void;
}

export const useSync = create<SyncStore>((set) => ({
  configured: false,
  state: "idle",
  pending: 0,
  lastRun: null,
  lastError: null,
  setSnapshot: (p) => set(p),
}));

export const DEFAULT_SNAPSHOT: SyncSnapshot = {
  configured: false,
  state: "idle",
  pending: 0,
  lastRun: null,
  lastError: null,
};

const DEVICE_KEY = "zivvvo_device_id";
let memoryDeviceId: string | null = null;

/** Stable per-browser device id, persisted in localStorage when available. */
export function getDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;
  try {
    const ls = typeof localStorage !== "undefined" ? localStorage : null;
    const stored = ls?.getItem(DEVICE_KEY);
    if (stored) {
      memoryDeviceId = stored;
      return stored;
    }
  } catch {
    /* storage unavailable */
  }
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  memoryDeviceId = id;
  try {
    const ls = typeof localStorage !== "undefined" ? localStorage : null;
    ls?.setItem(DEVICE_KEY, id);
  } catch {
    /* storage unavailable */
  }
  return id;
}

/** Map an attempt spine onto the server row shape (snake_case). */
export function attemptToRow(a: AttemptEvent, deviceId: string): AttemptRow {
  return {
    attempt_id: a.id,
    device_id: deviceId,
    learner_id: a.learnerId,
    qid: a.qid,
    session_id: a.sessionId,
    mode: a.mode,
    selected: a.selected,
    is_correct: a.isCorrect,
    confidence: a.confidence,
    duration_ms: a.durationMs,
    ts: a.ts,
    synced_at: a.syncedAt,
  };
}

/** Map a server row back onto the local attempt spine (camelCase). */
export function rowToAttempt(row: AttemptRow): AttemptEvent {
  return {
    id: row.attempt_id,
    learnerId: row.learner_id,
    qid: row.qid,
    sessionId: row.session_id,
    mode: row.mode as AttemptEvent["mode"],
    selected: row.selected,
    isCorrect: row.is_correct,
    confidence: row.confidence as AttemptEvent["confidence"],
    durationMs: row.duration_ms ?? 0,
    ts: row.ts,
    syncedAt: row.synced_at ?? null,
  };
}

export class SyncManager {
  /** Invoked with newly-merged attempt events after a successful pull, so the
   *   in-memory store can absorb server data without a reload. */
  onMerged: ((events: AttemptEvent[]) => void) | null = null;

  constructor(private host: SyncHost, private backend: SyncBackend) {}

  async refreshPending(): Promise<number> {
    let configured = false;
    try {
      configured = await this.backend.configured();
    } catch {
      /* backend unreachable — report as offline-only */
    }
    let pending = 0;
    try {
      pending = (await this.host.readPending()).length;
    } catch {
      /* IndexedDB unavailable — keep the last known snapshot */
    }
    useSync.getState().setSnapshot({ pending, configured });
    return pending;
  }

  async sync(deviceId = getDeviceId()): Promise<SyncSnapshot> {
    const set = useSync.getState().setSnapshot;
    let configured = false;
    try {
      configured = await this.backend.configured();
    } catch {
      configured = false;
    }
    if (!configured) {
      set({ configured: false, state: "idle" });
      return { ...DEFAULT_SNAPSHOT, configured: false, pending: await this.pendingCount() };
    }
    try {
      const pending = await this.host.readPending();
      set({ configured: true, state: "syncing", pending: pending.length, lastError: null });

      if (pending.length > 0) {
        const rows = pending.map((a) => attemptToRow(a, deviceId));
        await this.backend.push(rows);
        const now = Date.now();
        await this.host.markSynced(
          rows.map((r) => r.attempt_id),
          now,
        );
      }

      // Third phase: fetch whatever this device can read back (another device,
      // a reinstall, or rows this session produced) and merge locally.
      const remote = await this.backend.pull(deviceId);
      const fresh = await this.host.mergeRemote(remote, deviceId);
      if (fresh.length > 0) this.onMerged?.(fresh);

      const lastRun = Date.now();
      set({ configured: true, state: "idle", pending: 0, lastRun, lastError: null });
      return { configured: true, state: "idle", pending: 0, lastRun, lastError: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ configured: true, state: "error", lastError: message });
      return { configured: true, state: "error", pending: await this.pendingCount(), lastRun: useSync.getState().lastRun, lastError: message };
    }
  }

  private async pendingCount(): Promise<number> {
    try {
      return (await this.host.readPending()).length;
    } catch {
      return 0;
    }
  }
}