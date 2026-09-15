import { create } from "zustand";
import type { Question } from "@zivvvo/content";
import {
  gradeQuestion,
  type AttemptEvent,
  type Confidence,
  type LearningSession,
  type LearningMode,
} from "@zivvvo/assessment-engine";
import {
  applyAnswer,
  DAY_MS,
  defaultConfig,
  dayOfEpoch,
  initialEngagementState,
  levelInfo,
  reduceEngagement,
  type EngagementEvent,
  type EngagementState,
  type ReviewState,
} from "@zivvvo/learning-engine";
import { db, loadLearnerData, persistAttempt, persistEngagement, persistReview, persistSession, type StoredLearner } from "./db";
import { syncManager, pushLearnerState, restoreFromCloud, clearCloudData, fetchPlanStatus } from "./sync-supabase";
import { initAuth, getSupabaseUserId, isAuthenticated, signOut as authSignOut } from "./auth";
import { isSoundMuted, play as playSound } from "./sound";
import { DEMO_LEARNERS, demoEngagement, demoLearnerRecord, sealedAttemptsFor } from "./seed";
import { pack } from "./catalog";
import type { ConfidenceBand, GoalId } from "./onboarding";

export type Tab = "home" | "learn" | "practice" | "progress" | "coach" | "settings" | "pricing";

/** Guard so the XP-granting daily-goal bonus is awarded at most once per day. */
let dailyGoalRewardedDay = -1;

export interface AppStore {
  ready: boolean;
  /** Tracks the Supabase user for the current session so we can detect user switches. */
  currentSupabaseUserId: string | null;
  learners: StoredLearner[];
  activeLearnerId: string | null;
  attempts: AttemptEvent[];
  reviews: ReviewState[];
  sessions: LearningSession[];
  engagement: EngagementState;
  activeSession: LearningSession | null;
  tab: Tab;
  plan: "free" | "premium";
  planExpiresAt?: number;
  init: (authUserId?: string) => Promise<void>;
  pickLearner: (id: string) => Promise<void>;
  seedDemos: () => Promise<void>;
  completeOnboarding: (input: {
    name: string;
    goal: GoalId;
    examDate: number;
    dailyMinutes: number;
    initialConfidence: ConfidenceBand;
  }) => Promise<string>;
  startSession: (s: LearningSession) => Promise<boolean>;
  recordAnswer: (q: Question, selected: number[], confidence: Confidence, durationMs: number) => Promise<AttemptEvent>;
completeSession: () => Promise<void>;
  abandonSession: () => void;
  sessionsToday: () => { diagnostic: number; other: number };
  canStartSession: (type: string) => boolean;
  setPlan: (plan: "free" | "premium", expiresAt?: number) => void;
  setTab: (t: Tab) => void;
  updateLearner: (id: string, patch: Partial<StoredLearner>) => Promise<void>;
  /** Reduce one engagement event, persist, and re-render. */
  advanceEngagement: (event: EngagementEvent) => void;
  resetDemo: () => Promise<void>;
  signOut: () => Promise<void>;
}

const MODE_BY_TYPE: Record<LearningSession["type"], LearningMode> = {
  diagnostic: "diagnostic",
  smart: "smart",
  quick: "quick",
  review: "review",
  recovery: "weakness",
  weakness: "weakness",
  mock: "mock",
  "mistake-review": "review",
};

/** Push full learner state to Supabase cloud (fire-and-forget). */
function pushToCloud() {
  const { activeLearnerId, learners, reviews, engagement } = useApp.getState();
  if (!activeLearnerId || !isAuthenticated()) return;
  const learner = learners.find((l) => l.id === activeLearnerId);
  if (!learner) return;
  void pushLearnerState(learner, reviews, engagement);
}

export const useApp = create<AppStore>((set, get) => ({
  ready: false,
  currentSupabaseUserId: null,
  learners: [],
  activeLearnerId: null,
  attempts: [],
  reviews: [],
  sessions: [],
  engagement: initialEngagementState(),
  activeSession: null,
  tab: "home",
  plan: "free",
  planExpiresAt: undefined,

  init: async (authUserId?: string) => {
    // Skip if already initialized for this user
    const current = get();
    const targetUserId = authUserId ?? getSupabaseUserId();
    if (current.ready && current.currentSupabaseUserId === (targetUserId ?? null)) return;
    try {
    await initAuth();
    // Re-check after await: user may have signed out during initAuth
    const supabaseUserId = authUserId ?? getSupabaseUserId();
    if (get().currentSupabaseUserId && supabaseUserId && get().currentSupabaseUserId !== supabaseUserId) return;
    const previousUserId = get().currentSupabaseUserId;
    const userSwitched = supabaseUserId && previousUserId && supabaseUserId !== previousUserId;

    // If a different user signed in, clear the old user's data from IndexedDB
    if (userSwitched) {
      console.log("[Zivvvo] User switch detected, clearing old data");
      await db.learners.clear();
      // Re-check after await
      if (get().currentSupabaseUserId && supabaseUserId && get().currentSupabaseUserId !== supabaseUserId) return;
      await db.attempts.clear();
      await db.reviews.clear();
      await db.sessions.clear();
      await db.engagements.clear();
      await db.meta.put({ key: "activeLearner", value: null });
    }

    const learners = await db.learners.toArray();
    const meta = await db.meta.get("activeLearner");
    const activeLearnerId = (meta?.value as string | undefined) ?? null;

    // If logged in and no local learner (or no learner matching this user), try to restore from cloud
    const hasMatchingLearner = supabaseUserId
      ? learners.some((l) => l.supabaseUserId === supabaseUserId)
      : learners.length > 0;
    if (isAuthenticated() && !hasMatchingLearner) {
      const cloud = await restoreFromCloud();
      // Re-check after await
      if (get().currentSupabaseUserId && supabaseUserId && get().currentSupabaseUserId !== supabaseUserId) return;
      if (cloud?.learner) {
        const learner = cloud.learner;
        if (supabaseUserId) learner.supabaseUserId = supabaseUserId;
        await db.learners.put(learner);
        if (cloud.reviews.length > 0) {
          await db.reviews.bulkPut(cloud.reviews.map(r => ({
            ...r,
            id: `${r.learnerId}:${r.qid}`,
          })));
        }
        if (cloud.engagement) {
          await db.engagements.put({ id: learner.id, ...cloud.engagement });
        }
        await db.meta.put({ key: "activeLearner", value: learner.id });
        const data = await loadLearnerData(learner.id);
        const engagement = data.engagement ?? initialEngagementState(learner.dailyMinutes);
        set({ ready: true, currentSupabaseUserId: supabaseUserId ?? null, learners: [learner], activeLearnerId: learner.id, ...data, engagement, tab: "home", plan: learner.plan ?? "free", planExpiresAt: learner.planExpiresAt });
        void syncManager.sync();
        return;
      }
    }

    if (activeLearnerId && learners.some((l) => l.id === activeLearnerId)) {
      const data = await loadLearnerData(activeLearnerId);
      // Re-check after await
      if (get().currentSupabaseUserId && supabaseUserId && get().currentSupabaseUserId !== supabaseUserId) return;
      // Clean up abandoned sessions older than 24h (never completed)
      const dayAgo = Date.now() - DAY_MS;
      const orphaned = data.sessions.filter((s) => s.completedAt === null && s.createdAt < dayAgo);
      if (orphaned.length > 0) {
        await db.sessions.bulkDelete(orphaned.map((s) => s.id));
        data.sessions = data.sessions.filter((s) => !orphaned.includes(s));
      }
      const learner = learners.find((l) => l.id === activeLearnerId);
      const engagement = data.engagement ?? initialEngagementState(learner?.dailyMinutes);
      set({ ready: true, currentSupabaseUserId: supabaseUserId ?? null, learners, activeLearnerId, ...data, engagement, tab: "home", plan: learner?.plan ?? "free", planExpiresAt: learner?.planExpiresAt });
      // Sync plan from server in case it was updated (e.g. payment, admin whitelist)
      if (isAuthenticated()) {
        fetchPlanStatus().then((ps) => {
          if (ps && ps.plan !== get().plan) {
            set({ plan: ps.plan, planExpiresAt: ps.planExpiresAt });
            void get().updateLearner(activeLearnerId, { plan: ps.plan, planExpiresAt: ps.planExpiresAt });
          }
        }).catch(() => {});
      }
    } else if (!activeLearnerId) {
      const matched = supabaseUserId
        ? learners.find((l) => l.supabaseUserId === supabaseUserId)
        : undefined;
      if (matched) {
        await get().pickLearner(matched.id);
        set({ ready: true, currentSupabaseUserId: supabaseUserId ?? null, learners });
      } else {
        set({ ready: true, currentSupabaseUserId: supabaseUserId ?? null, learners, activeLearnerId });
      }
    } else {
      set({ ready: true, currentSupabaseUserId: supabaseUserId ?? null, learners, activeLearnerId });
    }
    } catch (err) {
      console.error("[Zivvvo] init() failed, falling back to onboarding:", err);
      set({ ready: true, currentSupabaseUserId: null, learners: [], activeLearnerId: null });
    }
  },

  seedDemos: async () => {
    const qids = pack.questions
      .filter((q) => q.status === "answered" && q.options.length >= 2)
      .map((q) => ({ topic: q.topicId, qid: q.qid }));
    const learners: StoredLearner[] = [];
    const attempts: AttemptEvent[] = [];
    for (const dl of DEMO_LEARNERS) {
      learners.push(demoLearnerRecord(dl));
      attempts.push(...sealedAttemptsFor(dl, qids));
    }
    await db.transaction("rw", db.learners, db.attempts, db.engagements, async () => {
      await db.learners.bulkPut(learners);
      await db.attempts.bulkPut(attempts);
      await db.engagements.bulkPut(DEMO_LEARNERS.map((dl) => ({ id: dl.id, ...demoEngagement() })));
    });
    await db.meta.put({ key: "activeLearner", value: DEMO_LEARNERS[0]!.id });
    set({ learners });
    await get().pickLearner(DEMO_LEARNERS[0]!.id);
  },

  completeOnboarding: async ({ name, goal, examDate, dailyMinutes, initialConfidence }) => {
    const id = `lrn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const supabaseUserId = getSupabaseUserId();
    const learner: StoredLearner = {
      id,
      name: name.trim() || "Learner",
      diagnosticCompleted: false,
      createdAt: Date.now(),
      goal,
      examDate,
      dailyMinutes,
      initialConfidence,
      plan: "free",
      ...(supabaseUserId ? { supabaseUserId } : {}),
    };
    await db.learners.put(learner);
    await persistEngagement(id, initialEngagementState(dailyMinutes));
    set((s) => ({ learners: [...s.learners, learner], activeLearnerId: id }));
    await get().pickLearner(id);
    pushToCloud();
    return id;
  },

  pickLearner: async (id: string) => {
    const learner = get().learners.find((l) => l.id === id);
    const data = await loadLearnerData(id);
    const engagement = data.engagement ?? initialEngagementState(learner?.dailyMinutes);
    await db.meta.put({ key: "activeLearner", value: id });
    set({ activeLearnerId: id, ...data, engagement, tab: "home", activeSession: null });
    if (!learner?.diagnosticCompleted) {
      // learners without a diagnostic completion get guided to it first
      set({ tab: "home" });
    }
  },

  startSession: async (s: LearningSession) => {
    // Enforce XP gate for free users
    const { plan, engagement } = get();
    if (plan === "free") {
      const level = levelInfo(engagement.xp, defaultConfig).level;
      if (level >= 3) return false;
    }
    await persistSession(s);
    set((state) => ({
      activeSession: s,
      sessions: state.sessions.some((sess) => sess.id === s.id)
        ? state.sessions
        : [...state.sessions, s],
    }));
    return true;
  },

  recordAnswer: async (q: Question, selected: number[], confidence: Confidence, durationMs: number) => {
    const s = get().activeSession;
    const learnerId = get().activeLearnerId;
    if (!s || !learnerId) return Promise.reject(new Error("no active session or learner"));
    const isCorrect = gradeQuestion(q, selected);
    const a: AttemptEvent = {
      id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      learnerId,
      qid: q.qid,
      sessionId: s.id,
      mode: MODE_BY_TYPE[s.type],
      selected,
      isCorrect,
      confidence,
      durationMs,
      ts: Date.now(),
      syncedAt: null,
    };
    await persistAttempt(a);

    const prev = get().reviews.find((r) => r.qid === q.qid);
    const next = applyAnswer(prev ?? null, learnerId, { isCorrect, confidence }, defaultConfig);
    await persistReview(next);

    set({
      attempts: [...get().attempts, a],
      reviews: [...get().reviews.filter((r) => r.qid !== q.qid), next],
    });
    get().advanceEngagement({ type: "answer", correct: isCorrect, hard: q.difficulty === "hard", day: dayOfEpoch(Date.now()) });
    return a;
  },

  completeSession: async () => {
    const s = get().activeSession;
    const learnerId = get().activeLearnerId;
    if (!s) return;
    if (!learnerId) return;
    const completed = { ...s, completedAt: Date.now() };
    await persistSession(completed);
    set((state) => ({
      activeSession: null,
      sessions: state.sessions.map((sess) => (sess.id === completed.id ? completed : sess)),
    }));

    // Mark diagnostic as completed when a diagnostic session finishes
    if (s.type === "diagnostic") {
      const learner = get().learners.find((l) => l.id === learnerId);
      if (learner && !learner.diagnosticCompleted) {
        await get().updateLearner(learnerId, { diagnosticCompleted: true });
      }
    }

    const now = Date.now();
    const day = dayOfEpoch(now);
    const sessionAttempts = get().attempts.filter((a) => a.sessionId === s.id);
    const perfect = sessionAttempts.length >= 3 && sessionAttempts.every((a) => a.isCorrect);
    get().advanceEngagement({ type: "session", perfect, questionCount: sessionAttempts.length, day });

    const todayStart = now - (now % DAY_MS);
    const allSessions = await db.sessions.where("learnerId").equals(learnerId).toArray();
    const todayMin = allSessions
      .filter((r) => r.completedAt && r.completedAt >= todayStart)
      .reduce((sum, r) => sum + (r.estimatedMinutes ?? 0), 0);
    if (todayMin >= get().engagement.dailyGoalMin && dailyGoalRewardedDay !== day) {
      dailyGoalRewardedDay = day;
      get().advanceEngagement({ type: "daily-goal", day });
    }
    pushToCloud();
    void syncManager.sync();
  },

  abandonSession: () => set({ activeSession: null }),

  /** Get today's completed session counts for the current learner. */
  sessionsToday: () => {
    const { activeLearnerId, sessions } = get();
    if (!activeLearnerId) return { diagnostic: 0, other: 0 };
    const now = Date.now();
    const todayStart = now - (now % DAY_MS);
    const today = sessions.filter((s) => s.completedAt && s.completedAt >= todayStart);
    return {
      diagnostic: today.filter((s) => s.type === "diagnostic").length,
      other: today.filter((s) => s.type !== "diagnostic").length,
    };
  },

  /** Can this session type be started? Premium users have no limits. Free users are gated at Level 3. */
  canStartSession: (_type: string) => {
    const { plan, engagement } = get();
    if (plan === "premium") return true;
    const level = levelInfo(engagement.xp, defaultConfig).level;
    return level < 3;
  },

  /** Set plan from Supabase sync or payment confirmation. */
  setPlan: (plan: "free" | "premium", expiresAt?: number) => {
    set({ plan, planExpiresAt: expiresAt });
    const learnerId = get().activeLearnerId;
    if (learnerId) {
      void get().updateLearner(learnerId, { plan, planExpiresAt: expiresAt });
    }
  },

  setTab: (t) => set({ tab: t }),

  updateLearner: async (id, patch) => {
    await db.learners.update(id, patch);
    set((s) => ({ learners: s.learners.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
    pushToCloud();
  },

  advanceEngagement: (event) => {
    const learnerId = get().activeLearnerId;
    if (!learnerId) return;
    const prevLevel = levelInfo(get().engagement.xp, defaultConfig).level;
    const next = reduceEngagement(get().engagement, event, defaultConfig);
    const nextLevel = levelInfo(next.xp, defaultConfig).level;
    set({ engagement: next });
    if (nextLevel > prevLevel && !isSoundMuted()) {
      playSound("levelUp");
    }
    // Persist to IDB — if it fails, retry once after a short delay
    persistEngagement(learnerId, next).catch(() => {
      setTimeout(() => { void persistEngagement(learnerId, get().engagement); }, 1000);
    });
    pushToCloud();
  },

  resetDemo: async () => {
    dailyGoalRewardedDay = -1;
    void clearCloudData();
    await db.delete();
    await db.open();
    set({
      ready: true,
      currentSupabaseUserId: getSupabaseUserId(),
      learners: [],
      activeLearnerId: null,
      attempts: [],
      reviews: [],
      sessions: [],
      engagement: initialEngagementState(),
      activeSession: null,
      tab: "home",
      plan: "free",
      planExpiresAt: undefined,
    });
  },

  signOut: async () => {
    dailyGoalRewardedDay = -1;
    await authSignOut();
    await db.learners.clear();
    await db.attempts.clear();
    await db.reviews.clear();
    await db.sessions.clear();
    await db.engagements.clear();
    await db.meta.put({ key: "activeLearner", value: null });
    set({
      ready: true,
      currentSupabaseUserId: null,
      learners: [],
      activeLearnerId: null,
      attempts: [],
      reviews: [],
      sessions: [],
      engagement: initialEngagementState(),
      activeSession: null,
      tab: "home",
      plan: "free",
      planExpiresAt: undefined,
    });
  },
}));

// ─── Periodic plan expiry detection ─────────────────────────────────────────
// Checks plan status on visibility change (tab focus) and every 5 minutes.
// If a server-side payment was made or plan expired, the client picks it up
// without requiring a page reload.
let planCheckTimer: ReturnType<typeof setInterval> | null = null;

function checkPlanExpiry() {
  const state = useApp.getState();
  if (!state.ready || !isAuthenticated()) return;
  fetchPlanStatus().then((ps) => {
    const cur = useApp.getState();
    if (!cur.ready) return;
    if (ps && ps.plan !== cur.plan) {
      console.log("[Zivvvo] Plan changed:", cur.plan, "->", ps.plan);
      useApp.setState({ plan: ps.plan, planExpiresAt: ps.planExpiresAt });
      if (cur.activeLearnerId) {
        void cur.updateLearner(cur.activeLearnerId, { plan: ps.plan, planExpiresAt: ps.planExpiresAt });
      }
    }
  }).catch(() => {});
}

// Start on first init
const unsubInit = useApp.subscribe(
  (s) => s.ready,
  (ready) => {
    if (!ready) return;
    unsubInit();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkPlanExpiry();
    });
    planCheckTimer = setInterval(checkPlanExpiry, 5 * 60 * 1000);
  },
);

// After a successful pull, absorb server attempts for the active learner into
// memory so the UI reflects fetched data without a reload. Rows for other
// learners on this device are persisted but kept out of the live view.
syncManager.onMerged = (events) => {
  const activeLearnerId = useApp.getState().activeLearnerId;
  const existing = new Set(useApp.getState().attempts.map((a) => a.id));
  const fresh = activeLearnerId ? events.filter((a) => a.learnerId === activeLearnerId && !existing.has(a.id)) : [];
  if (fresh.length > 0) {
    useApp.setState({ attempts: [...useApp.getState().attempts, ...fresh] });
  }
};