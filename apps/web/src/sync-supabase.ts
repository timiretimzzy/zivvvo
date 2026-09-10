import type { AttemptRow, SyncBackend } from "./sync";
import { SyncManager, getDeviceId } from "./sync";
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
    return (await getClient()) !== null;
  }

  async push(rows: AttemptRow[]): Promise<void> {
    const c = await getClient();
    if (!c) throw new Error("Supabase not configured");
    const { error } = await c.from("attempts").upsert(rows, { onConflict: "attempt_id" });
    if (error) throw new Error(error.message);
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
};

export const syncManager = new SyncManager(dexieHost, new SupabaseSyncBackend());