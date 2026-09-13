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
  reduceEngagement,
  type EngagementEvent,
  type EngagementState,
  type ReviewState,
} from "@zivvvo/learning-engine";
import { db, loadLearnerData, persistAttempt, persistEngagement, persistReview, persistSession, type StoredLearner } from "./db";
import { syncManager } from "./sync-supabase";
import { getSupabaseUserId, signOut as authSignOut } from "./auth";
import { DEMO_LEARNERS, demoEngagement, demoLearnerRecord, sealedAttemptsFor } from "./seed";
import { pack } from "./catalog";
import type { ConfidenceBand, GoalId } from "./onboarding";

export type Tab = "home" | "learn" | "practice" | "progress" | "coach" | "settings";

/** Guard so the XP-granting daily-goal bonus is awarded at most once per day. */
let dailyGoalRewardedDay = -1;

export interface AppStore {
  ready: boolean;
  learners: StoredLearner[];
  activeLearnerId: string | null;
  attempts: AttemptEvent[];
  reviews: ReviewState[];
  sessions: LearningSession[];
  engagement: EngagementState;
  activeSession: LearningSession | null;
  tab: Tab;
  init: () => Promise<void>;
  pickLearner: (id: string) => Promise<void>;
  seedDemos: () => Promise<void>;
  completeOnboarding: (input: {
    name: string;
    goal: GoalId;
    examDate: number;
    dailyMinutes: number;
    initialConfidence: ConfidenceBand;
  }) => Promise<string>;
  startSession: (s: LearningSession) => Promise<void>;
  recordAnswer: (q: Question, selected: number[], confidence: Confidence, durationMs: number) => Promise<AttemptEvent>;
completeSession: () => Promise<void>;
  abandonSession: () => void;
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

export const useApp = create<AppStore>((set, get) => ({
  ready: false,
  learners: [],
  activeLearnerId: null,
  attempts: [],
  reviews: [],
  sessions: [],
  engagement: initialEngagementState(),
  activeSession: null,
  tab: "home",

  init: async () => {
    const learners = await db.learners.toArray();
    const meta = await db.meta.get("activeLearner");
    const activeLearnerId = (meta?.value as string | undefined) ?? null;
    if (activeLearnerId && learners.some((l) => l.id === activeLearnerId)) {
      const data = await loadLearnerData(activeLearnerId);
      const learner = learners.find((l) => l.id === activeLearnerId);
      const engagement = data.engagement ?? initialEngagementState(learner?.dailyMinutes);
      set({ ready: true, learners, activeLearnerId, ...data, engagement, tab: "home" });
    } else if (!activeLearnerId) {
      const supabaseUserId = getSupabaseUserId();
      const matched = supabaseUserId
        ? learners.find((l) => l.supabaseUserId === supabaseUserId)
        : undefined;
      if (matched) {
        await get().pickLearner(matched.id);
        set({ ready: true, learners });
      } else {
        set({ ready: true, learners, activeLearnerId });
      }
    } else {
      set({ ready: true, learners, activeLearnerId });
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
      ...(supabaseUserId ? { supabaseUserId } : {}),
    };
    await db.learners.put(learner);
    await persistEngagement(id, initialEngagementState(dailyMinutes));
    set((s) => ({ learners: [...s.learners, learner], activeLearnerId: id }));
    await get().pickLearner(id);
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
    await persistSession(s);
    set({ activeSession: s });
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
    set({ activeSession: null });

    const now = Date.now();
    const day = dayOfEpoch(now);
    const sessionAttempts = get().attempts.filter((a) => a.sessionId === s.id);
    const perfect = sessionAttempts.length >= 3 && sessionAttempts.every((a) => a.isCorrect);
    get().advanceEngagement({ type: "session", perfect, questionCount: sessionAttempts.length, day });

    const todayStart = now - (now % DAY_MS);
    const allSessions = await db.sessions.where("learnerId").equals(learnerId).toArray();
    const todayMin = allSessions
      .filter((r) => r.completedAt && r.createdAt >= todayStart)
      .reduce((sum, r) => sum + (r.estimatedMinutes ?? 0), 0);
    if (todayMin >= get().engagement.dailyGoalMin && dailyGoalRewardedDay !== day) {
      dailyGoalRewardedDay = day;
      get().advanceEngagement({ type: "daily-goal", day });
    }
    void syncManager.sync();
  },

  abandonSession: () => set({ activeSession: null }),

  setTab: (t) => set({ tab: t }),

  updateLearner: async (id, patch) => {
    await db.learners.update(id, patch);
    set((s) => ({ learners: s.learners.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  },

  advanceEngagement: (event) => {
    const learnerId = get().activeLearnerId;
    if (!learnerId) return;
    const next = reduceEngagement(get().engagement, event, defaultConfig);
    void persistEngagement(learnerId, next);
    set({ engagement: next });
  },

  resetDemo: async () => {
    dailyGoalRewardedDay = -1;
    await db.delete();
    await db.open();
    set({
      ready: true,
      learners: [],
      activeLearnerId: null,
      attempts: [],
      reviews: [],
      sessions: [],
      engagement: initialEngagementState(),
      activeSession: null,
      tab: "home",
    });
  },

  signOut: async () => {
    dailyGoalRewardedDay = -1;
    await authSignOut();
    set({
      ready: true,
      learners: get().learners,
      activeLearnerId: null,
      attempts: [],
      reviews: [],
      sessions: [],
      engagement: initialEngagementState(),
      activeSession: null,
      tab: "home",
    });
  },
}));

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