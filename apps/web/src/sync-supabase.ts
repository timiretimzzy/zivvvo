import type { AttemptRow, SyncBackend } from "./sync";
import { SyncManager, getDeviceId, rowToAttempt } from "./sync";
import type { AttemptEvent } from "@zivvvo/assessment-engine";
import { db } from "./db";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Real sync backend for the live Supabase project. The client is loaded lazily
 * (dynamic import) so the main PWA bundle stays offline-first: supabase-js is
 * only fetched after a sync-worthy change when the env is configured. When
 * VITE_SUPABASE_* are absent, the backend reports `configured: false` and the
 * app stays local-only. It targets the isolated `zivvvo` schema (migration
 * 001) and sends `x-device-id` so the RLS gate can scope rows to this device.
 */
let clientPromise: Promise<SupabaseClient<any, any, any> | null> | null = null;

async function getClient(): Promise<SupabaseClient | null> {
  if (clientPromise) return clientPromise;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    clientPromise = Promise.resolve(null);
    return null;
  }
  clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, key, {
      db: { schema: "zivvvo" },
      global: { headers: { "x-device-id": getDeviceId() } },
    }),
  );
  return clientPromise;
}

export class SupabaseSyncBackend implements SyncBackend {
  async configured(): Promise<boolean> {
    try {
      return (await getClient()) !== null;
    } catch {
      return false;
    }
  }

  async push(rows: AttemptRow[]): Promise<void> {
    const c = await getClient();
    if (!c) throw new Error("Supabase not configured");
    const { error } = await c.from("attempts").upsert(rows, { onConflict: "attempt_id" });
    if (error) throw new Error(error.message);
  }

  async pull(deviceId: string): Promise<AttemptRow[]> {
    const c = await getClient();
    if (!c) throw new Error("Supabase not configured");
    const { data, error } = await c
      .from("attempts")
      .select("*")
      .eq("device_id", deviceId)
      .order("ts", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as AttemptRow[];
  }
}

const dexieHost = {
  async readPending() {
    return db.attempts.filter((a) => a.syncedAt === null).toArray();
  },
  async markSynced(ids: string[], at: number) {
    await db.transaction("rw", db.attempts, async () => {
      for (const id of ids) await db.attempts.update(id, { syncedAt: at });
    });
  },
  /** Insert server rows this device has never seen; local rows always win. */
  async mergeRemote(rows: AttemptRow[]): Promise<AttemptEvent[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.attempt_id);
    const existing = new Set(
      (await db.attempts.bulkGet(ids)).filter((a): a is AttemptEvent => Boolean(a)).map((a) => a.id),
    );
    const fresh = rows.filter((r) => !existing.has(r.attempt_id)).map(rowToAttempt);
    if (fresh.length > 0) await db.attempts.bulkPut(fresh);
    return fresh;
  },
};

export const syncManager = new SyncManager(dexieHost, new SupabaseSyncBackend());