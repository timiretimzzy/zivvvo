import type { AttemptRow, SyncBackend } from "./sync";
import { SyncManager, rowToAttempt } from "./sync";
import type { AttemptEvent } from "@zivvvo/assessment-engine";
import { db, type StoredLearner } from "./db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewState } from "@zivvvo/learning-engine";
import type { EngagementState } from "@zivvvo/learning-engine";

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
      auth: { persistSession: true, autoRefreshToken: true },
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
    const { data: { user } } = await c.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const userIdRows = rows.map(r => ({ ...r, user_id: user.id }));
    const { error } = await c.from("attempts").upsert(userIdRows, { onConflict: "attempt_id" });
    if (error) throw new Error(error.message);
  }

  async pull(_deviceId: string): Promise<AttemptRow[]> {
    const c = await getClient();
    if (!c) throw new Error("Supabase not configured");
    const { data: { user } } = await c.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await c
      .from("attempts")
      .select("*")
      .eq("user_id", user.id)
      .order("ts", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as AttemptRow[];
  }
}

// ─── Full state sync (learner profile + reviews + engagement) ────────────────────

export interface LearnerStateRow {
  user_id: string;
  learner_id: string;
  display_name: string | null;
  goal: string | null;
  exam_date: number | null;
  daily_minutes: number | null;
  initial_confidence: string | null;
  diagnostic_completed: boolean;
  created_at: number | null;
  reviews: ReviewState[];
  engagement: EngagementState | null;
  updated_at: number | null;
}

export async function pushLearnerState(
  learner: StoredLearner,
  reviews: ReviewState[],
  engagement: EngagementState,
): Promise<void> {
  const c = await getClient();
  if (!c) return;
  const { data: { user } } = await c.auth.getUser();
  if (!user) return;

  const row: LearnerStateRow = {
    user_id: user.id,
    learner_id: learner.id,
    display_name: learner.name,
    goal: learner.goal ?? null,
    exam_date: learner.examDate ?? null,
    daily_minutes: learner.dailyMinutes ?? null,
    initial_confidence: learner.initialConfidence ?? null,
    diagnostic_completed: learner.diagnosticCompleted,
    created_at: learner.createdAt,
    reviews,
    engagement,
    updated_at: Date.now(),
  };

  const { error } = await c.from("learner_state").upsert(row, { onConflict: "user_id" });
  if (error) console.error("[Zivvvo] pushLearnerState error:", error.message);
}

export async function pullLearnerState(): Promise<LearnerStateRow | null> {
  const c = await getClient();
  if (!c) return null;
  const { data: { user } } = await c.auth.getUser();
  if (!user) return null;

  const { data, error } = await c
    .from("learner_state")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (error || !data) return null;
  return data as LearnerStateRow;
}

export async function restoreFromCloud(): Promise<{
  learner: StoredLearner | null;
  reviews: ReviewState[];
  engagement: EngagementState | null;
} | null> {
  const state = await pullLearnerState();
  if (!state) return null;

  const learner: StoredLearner = {
    id: state.learner_id,
    name: state.display_name ?? "Learner",
    diagnosticCompleted: state.diagnostic_completed ?? false,
    createdAt: state.created_at ?? Date.now(),
    goal: state.goal as StoredLearner["goal"],
    examDate: state.exam_date ?? undefined,
    dailyMinutes: state.daily_minutes ?? undefined,
    initialConfidence: state.initial_confidence as StoredLearner["initialConfidence"],
  };

  return {
    learner,
    reviews: (state.reviews as ReviewState[]) ?? [],
    engagement: (state.engagement as EngagementState) ?? null,
  };
}

export async function clearCloudData(): Promise<void> {
  const c = await getClient();
  if (!c) return;
  const { data: { user } } = await c.auth.getUser();
  if (!user) return;
  await c.from("learner_state").delete().eq("user_id", user.id);
  await c.from("attempts").delete().eq("user_id", user.id);
}

// ─── Wired singleton ────────────────────────────────────────────────────────────

const dexieHost = {
  async readPending() {
    return db.attempts.filter((a) => a.syncedAt === null).toArray();
  },
  async markSynced(ids: string[], at: number) {
    await db.transaction("rw", db.attempts, async () => {
      for (const id of ids) await db.attempts.update(id, { syncedAt: at });
    });
  },
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
