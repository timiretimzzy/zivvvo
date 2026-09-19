import { describe, it, expect } from "vitest";
import type {
  AttemptEvent,
  LearningSession,
  SessionResult,
} from "@zivvvo/assessment-engine";
import {
  ZVID_MOCK_DEFAULT,
  buildDiagnostic,
  buildMockSession,
  buildQuickSession,
  buildReviewSession,
  buildSmartSession,
  buildWeaknessSession,
  buildSessionSummary,
  computeReadiness,
  gradeQuestion,
  mockScore,
} from "@zivvvo/assessment-engine";
import { getFamilyId } from "@zivvvo/content";
import {
  DAY_MS,
  applyAnswer,
  buildPlan,
  defaultConfig,
  dayOfEpoch,
  detectWeakness,
  initialEngagementState,
  levelInfo,
  planCursor,
  reduceEngagement,
  type ReviewState,
} from "@zivvvo/learning-engine";
import type { Question } from "@zivvvo/content";
import { pack } from "./catalog";
import {
  lastMockAt,
  learnerState,
  mockSession,
  nextActivity,
  planDaySession,
  sessionFor,
  topicMastery,
  weaknesses,
} from "./engine";

const BASETIME = Date.UTC(2026, 0, 2, 6, 0, 0);
const CONTENT_TOPICS = pack.topics.filter((t) => t.kind === "content").map((t) => t.id);
const byQid = new Map(pack.questions.map((q) => [q.qid, q]));

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isFiniteNumber(n: unknown): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

function sanitySession(result: SessionResult | null, learnerId: string, attempt: (q: Question) => AttemptEvent) {
  if (!result) return 0;
  const { session } = result;
  const qids = new Set<string>();
  for (const q of session.questions) {
    expect(byQid.has(q.qid)).toBe(true);
    expect(q.status).toBe("answered");
    expect(q.options.length).toBeGreaterThanOrEqual(2);
    for (const i of q.correctIndexes) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(q.options.length);
    }
    expect(gradeQuestion(q, [...q.correctIndexes])).toBe(true);
    expect(qids.has(q.qid)).toBe(false);
    qids.add(q.qid);
    const a = attempt(q);
    expect(a.learnerId).toBe(learnerId);
    expect(a.ts).toBeGreaterThan(0);
    expect(a.durationMs).toBeGreaterThan(0);
    expect(isFiniteNumber(a.ts)).toBe(true);
  }
  expect(session.completedAt).toBeNull();
  return session.questions.length;
}

function makeAttempt(opts: {
  seq: number;
  seed: number;
  learnerId: string;
  q: Question;
  session: LearningSession;
  isCorrect: boolean;
  ts: number;
}): AttemptEvent {
  const wrongOpts = opts.q.options.map((_, i) => i).filter((i) => !opts.q.correctIndexes.includes(i));
  const selected = opts.isCorrect
    ? [...opts.q.correctIndexes]
    : wrongOpts.length > 0
      ? [wrongOpts[0]!]
      : [];
  return {
    id: `att_${opts.seed}_${opts.seq}`,
    learnerId: opts.learnerId,
    qid: opts.q.qid,
    sessionId: opts.session.id,
    mode: MODE_FOR[opts.session.type] ?? "smart",
    selected,
    isCorrect: opts.isCorrect,
    confidence: opts.isCorrect ? "sure" : "guess",
    durationMs: 500 + (opts.seq % 17) * 137,
    ts: opts.ts,
    syncedAt: null,
  };
}

const MODE_FOR: Record<string, AttemptEvent["mode"]> = {
  diagnostic: "diagnostic",
  smart: "smart",
  review: "review",
  weakness: "weakness",
  quick: "quick",
  mock: "mock",
};

interface Journey {
  learnerId: string;
  attempts: AttemptEvent[];
  reviews: Map<string, ReviewState>;
  engagement: ReturnType<typeof initialEngagementState>;
  sessionsRun: number;
  mockAttemps: number;
  wrong: number;
}

function runJourney(seed: number, days: number, opts: { mockEvery: number }): Journey {
  const rand = rng(0x9e3779b9 ^ seed);
  const learnerId = `stress_${seed}`;
  const j: Journey = {
    learnerId,
    attempts: [],
    reviews: new Map(),
    engagement: initialEngagementState(),
    sessionsRun: 0,
    mockAttemps: 0,
    wrong: 0,
  };
  const tries = new Map<string, number>();
  const exposure = new Map<string, boolean>();

  function probFor(q: Question): number {
    const base = q.difficulty === "hard" ? 0.34 : q.difficulty === "easy" ? 0.5 : 0.44;
    return Math.min(0.97, base + (tries.get(q.qid) ?? 0) * 0.14);
  }

  function attempt(q: Question, session: LearningSession, ts: number): AttemptEvent {
    exposure.set(q.qid, true);
    const p = probFor(q);
    const isCorrect = rand() < p;
    if (isCorrect) tries.set(q.qid, (tries.get(q.qid) ?? 0) + 1);
    else j.wrong++;
    const a = makeAttempt({ seq: j.attempts.length, seed, learnerId, q, session, isCorrect, ts });
    j.attempts.push(a);
    const prev = j.reviews.get(q.qid) ?? null;
    j.reviews.set(q.qid, applyAnswer(prev, learnerId, { isCorrect, confidence: "sure" }, defaultConfig));
    j.engagement = reduceEngagement(
      j.engagement,
      { type: "answer", correct: isCorrect, hard: q.difficulty === "hard", day: dayOfEpoch(ts) },
      defaultConfig,
    );
    return a;
  }

  const ctx = (day: number) => ({
    pack,
    attempts: j.attempts,
    seed: seed * 7919 + day,
    learnerId,
    now: BASETIME + day * DAY_MS,
  });

  for (let day = 0; day < days; day++) {
    const ts = BASETIME + day * DAY_MS;
    let result: SessionResult | null = null;

    if (day === 0) {
      result = buildDiagnostic(ctx(day), defaultConfig);
    } else {
      const state = learnerState(learnerId, j.attempts, [...j.reviews.values()], true, {
        examDate: BASETIME + 180 * DAY_MS,
        streakDays: j.engagement.streakDays,
        lastMockAt: lastMockAt(j.attempts),
      });
      const act = nextActivity(state);
      if (act) result = sessionFor(act, j.attempts, learnerId);
    }

    if (!result && day > 0 && day % 7 === 0) {
      result = buildQuickSession(ctx(day), defaultConfig, 5);
    }
    if (!result) {
      result = buildQuickSession(ctx(day), defaultConfig, 3);
    }

    const before = j.attempts.length;
    const answered = sanitySession(result, learnerId, (q) => attempt(q, result!.session, ts));
    if (answered > 0) {
      j.sessionsRun++;
      const sessionAttempts = j.attempts.slice(before);
      const summary = buildSessionSummary({
        session: result!.session,
        attempts: sessionAttempts,
        previous: j.attempts.slice(0, before),
        config: defaultConfig,
        topicLabelFor: (id) => pack.topics.find((t) => t.id === id)?.label,
      });
      expect(isFiniteNumber(summary.accuracy)).toBe(true);
      expect(isFiniteNumber(summary.correctCount)).toBe(true);
      expect(isFiniteNumber(summary.totalCount)).toBe(true);
      expect(summary.totalCount).toBe(answered);
      expect(Math.abs(summary.accuracy - summary.correctCount / summary.totalCount)).toBeLessThan(1e-9);
      if (summary.improvement !== null) expect(isFiniteNumber(summary.improvement)).toBe(true);
      for (const t of [...summary.strengthened, ...summary.stillReviewing]) {
        expect(isFiniteNumber(t.correct)).toBe(true);
        expect(isFiniteNumber(t.attempted)).toBe(true);
      }
      const perfect = sessionAttempts.length >= 3 && sessionAttempts.every((a) => a.isCorrect);
      j.engagement = reduceEngagement(
        j.engagement,
        { type: "session", perfect, questionCount: answered, day: dayOfEpoch(ts) },
        defaultConfig,
      );
      j.engagement = reduceEngagement(j.engagement, { type: "daily-goal", day: dayOfEpoch(ts) }, defaultConfig);
      const lvl = levelInfo(j.engagement.xp, defaultConfig);
      expect(isFiniteNumber(lvl.progress)).toBe(true);
      expect(lvl.progress).toBeGreaterThanOrEqual(0);
      expect(lvl.progress).toBeLessThanOrEqual(1);
    }

    if (day > 0 && day % 10 === 0) {
      const bad = [...new Set(j.attempts.filter((a) => !a.isCorrect).map((a) => a.qid))].slice(0, 8);
      if (bad.length > 0) {
        const rev = buildReviewSession(ctx(day), defaultConfig, bad, bad.length);
        const n = sanitySession(rev, learnerId, (q) => attempt(q, rev!.session, ts));
        if (n > 0) {
          j.sessionsRun++;
          // Family dedup: each bad qid's family should be represented (not necessarily the exact qid)
          const sessionFamilies = new Set(rev!.session.questions.map((q) => getFamilyId(q.qid)));
          for (const qid of bad) expect(sessionFamilies.has(getFamilyId(qid))).toBe(true);
        }
      }
    }

    if (day > 0 && day % 15 === 0) {
      const weak = weaknesses(j.attempts)[0];
      if (weak) {
        const rec = buildWeaknessSession(ctx(day), defaultConfig, weak.topic.id);
        const n = sanitySession(rec, learnerId, (q) => attempt(q, rec!.session, ts));
        if (n > 0) {
          j.sessionsRun++;
          for (const q of rec!.session.questions) expect(q.topicId).toBe(weak.topic.id);
        }
      }
    }

    if (day > 0 && day % opts.mockEvery === 0) {
      const mock = buildMockSession(ctx(day), defaultConfig, ZVID_MOCK_DEFAULT);
      const n = sanitySession(mock, learnerId, (q) => attempt(q, mock!.session, ts));
      if (n > 0) {
        j.sessionsRun++;
        j.mockAttemps++;
        const score = mockScore(j.attempts.filter((a) => a.mode === "mock"), ZVID_MOCK_DEFAULT);
        expect(isFiniteNumber(score.score)).toBe(true);
        expect(score.total).toBeGreaterThan(0);
        expect(score.correct).toBeGreaterThanOrEqual(0);
        expect(score.correct).toBeLessThanOrEqual(score.total);
      }
    }
  }

  const ids = new Set(j.attempts.map((a) => a.id));
  expect(ids.size).toBe(j.attempts.length);
  expect(j.sessionsRun).toBeGreaterThan(days * 0.9);
  expect(j.engagement.xp).toBeGreaterThan(0);
  expect(j.engagement.streakDays).toBeGreaterThanOrEqual(1);
  expect(j.engagement.streakDays).toBeLessThanOrEqual(days + 1);
  expect(j.engagement.bestStreakDays).toBeGreaterThanOrEqual(j.engagement.streakDays);

  const tm = topicMastery(j.attempts);
  expect(tm.length).toBeGreaterThan(0);
  for (const { stat } of tm) {
    expect(isFiniteNumber(stat.mastery)).toBe(true);
    expect(stat.mastery).toBeGreaterThanOrEqual(0);
    expect(stat.mastery).toBeLessThanOrEqual(1);
  }

  const weak = weaknesses(j.attempts);
  for (const w of weak) {
    expect(typeof w.signal.kind).toBe("string");
    if (w.signal.kind === "none") {
      expect(w.signal.reasons.length).toBe(0);
    } else {
      expect(w.signal.reasons.length).toBeGreaterThan(0);
    }
  }

  const read = computeReadiness({
    pack,
    attempts: j.attempts,
    config: defaultConfig,
    initialConfidence: "moderate",
    now: BASETIME + days * DAY_MS,
  });
  expect(read).not.toBeNull();
  if (read) {
    expect(typeof read.band).toBe("string");
    expect(isFiniteNumber(read.score)).toBe(true);
    expect(isFiniteNumber(read.coverage)).toBe(true);
    expect(read.coverage).toBeGreaterThan(0);
    expect(isFiniteNumber(read.masteryMean)).toBe(true);
    expect(typeof read.message).toBe("string");
  }

  const mockStretch = mockSession(j.attempts, learnerId);
  expect(mockStretch).not.toBeNull();

  return j;
}

function runPlanner(j: Journey) {
  const mastery = topicMastery(j.attempts);
  const topics = mastery.map(({ stat, topic }) => ({
    id: stat.key,
    label: topic.label,
    mastery: stat.mastery,
    evidence: stat.evidence,
  }));
  const now = BASETIME + Math.floor(j.attempts.length / 24) * DAY_MS;
  const led = [14, 30, 90];
  for (const lead of led) {
    const exam = now + lead * DAY_MS;
    const plan = buildPlan({
      examDate: exam,
      dailyMinutes: 12,
      today: now,
      topics,
      config: defaultConfig,
    });
    expect(plan.days.length).toBeGreaterThan(0);
    expect(plan.days[0]!.date).toBeGreaterThanOrEqual(now - DAY_MS);
    expect(isFiniteNumber(plan.dailyVolume)).toBe(true);
    let total = 0;
    for (const d of plan.days) {
      expect(["smart", "review", "recovery", "mock"].includes(d.sessionType)).toBe(true);
      expect(d.minutes).toBeGreaterThan(0);
      expect(typeof d.title).toBe("string");
      total += d.minutes;
    }
    expect(total).toBeGreaterThan(0);
    for (const probe of [now, exam - DAY_MS, exam + 3 * DAY_MS]) {
      const cursor = planCursor(plan, probe);
      expect(isFiniteNumber(cursor.daysRemaining)).toBe(true);
      expect(cursor.daysRemaining).toBeGreaterThanOrEqual(0);
      expect(cursor.index).toBeGreaterThanOrEqual(-1);
      if (cursor.day) {
        expect(cursor.day.minutes).toBeGreaterThan(0);
      }
    }
  }
}

function runRecommenderBlast() {
  const rand = rng(0xbeef);
  for (let i = 0; i < 400; i++) {
    const attempts: AttemptEvent[] = [];
    const reviews = new Map<string, ReviewState>();
    const examDate = rand() < 0.3 ? BASETIME + (30 + Math.floor(rand() * 90)) * DAY_MS : undefined;
    for (let a = 0; a < 3 + Math.floor(rand() * 60); a++) {
      const q = pack.questions[Math.floor(rand() * pack.questions.length)]!;
      if (q.status !== "answered" || q.correctIndexes.length === 0) continue;
      const isCorrect = rand() < 0.55;
      const attemptsBefore = [...attempts];
      const qFor = makeAttempt({
        seq: a,
        seed: i,
        learnerId: "blast",
        q,
        session: { id: `s_${i}_${a}`, learnerId: "blast", type: "smart" as const, title: "s", purpose: "p", estimatedMinutes: 5, createdAt: examDate ?? BASETIME, questions: [q], completedAt: null },
        isCorrect,
        ts: (examDate ?? BASETIME + 10 * DAY_MS) - a * DAY_MS,
      });
      attempts.push(qFor);
      reviews.set(q.qid, applyAnswer(reviews.get(q.qid) ?? null, "blast", { isCorrect, confidence: "sure" }, defaultConfig));
      void attemptsBefore;
    }
    const state = learnerState("blast", attempts, [...reviews.values()], i % 5 !== 0, { examDate, streakDays: i % 9, lastMockAt: lastMockAt(attempts) });
    const act = nextActivity(state);
    expect(act).not.toBeNull();
    if (!act) continue;
    expect(typeof act.title).toBe("string");
    expect(["diagnostic", "review", "recovery", "smart", "mock"].includes(act.sessionType)).toBe(true);
    const result = sessionFor(act, attempts, "blast");
    sanitySession(result, "blast", (q) => makeAttempt({ seq: 9999 + i, seed: i, learnerId: "blast", q, session: { id: `s_${i}_x`, learnerId: "blast", type: result!.session.type, title: "s", purpose: "p", estimatedMinutes: 1, createdAt: act.estimatedMinutes ?? BASETIME, questions: [q], completedAt: null }, isCorrect: true, ts: BASETIME }));
  }
}

describe("stress: full-year learner journeys over the production bank", () => {
  it("grinder, casual, and sprint learners keep every engine invariant", () => {
    const t0 = performance.now();
    const grinder = runJourney(1, 365, { mockEvery: 30 });
    const casual = runJourney(2, 365, { mockEvery: 60 });
    runJourney(3, 120, { mockEvery: 15 });
    runPlanner(grinder);
    runPlanner(casual);
    runRecommenderBlast();
    const el = performance.now() - t0;
    expect(el).toBeLessThan(60_000);
  });
});

describe("stress: engines over the entire production bank", () => {
  it("every question is answerable and graded consistently", () => {
    const ids = new Set<string>();
    for (const q of pack.questions) {
      expect(ids.has(q.qid)).toBe(false);
      ids.add(q.qid);
      expect(typeof q.stem).toBe("string");
      expect(q.stem.length).toBeGreaterThan(0);
      expect(CONTENT_TOPICS.includes(q.topicId) || q.status !== "answered").toBe(true);
      if (q.status === "answered") {
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.correctIndexes.length).toBeGreaterThan(0);
        for (const i of q.correctIndexes) {
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(q.options.length);
        }
        expect(gradeQuestion(q, [...q.correctIndexes])).toBe(true);
      } else {
        expect(q.correctIndexes).toEqual([]);
        expect(q.options.some((o) => o.isCorrect)).toBe(false);
      }
    }
    const single = pack.questions.filter((q) => q.correctIndexes.length === 1);
    expect(single.length).toBeGreaterThanOrEqual(pack.questions.filter((q) => q.correctIndexes.length > 0).length * 0.9);
  });

  it("every content topic builds sane smart + weakness sessions", () => {
    for (const topicId of CONTENT_TOPICS) {
      const ctx = (seed: number) => ({ pack, attempts: [], seed, learnerId: "inv", now: BASETIME });
      for (let i = 0; i < 3; i++) {
        const smart = buildSmartSession(ctx(seedFor(topicId, i)), defaultConfig, topicId);
        expect(smart.session.questions.length).toBeGreaterThan(0);
        const seen = new Set<string>();
        let targetSeen = false;
        for (const q of smart.session.questions) {
          expect(CONTENT_TOPICS.includes(q.topicId)).toBe(true);
          expect(seen.has(q.qid)).toBe(false);
          seen.add(q.qid);
          targetSeen = targetSeen || q.topicId === topicId;
          expect(gradeQuestion(q, [...q.correctIndexes])).toBe(true);
        }
        expect(targetSeen).toBe(true);
      }
      const weak = buildWeaknessSession(ctx(7), defaultConfig, topicId);
      expect(weak.session.questions.length).toBeGreaterThan(0);
      for (const q of weak.session.questions) {
        expect(q.topicId).toBe(topicId);
      }
    }
  });

  it("variant composition never breaks the correct answer", () => {
    const ctx = { pack, attempts: [], learnerId: "var", now: BASETIME };
    for (let i = 0; i < 40; i++) {
      const result = buildSmartSession({ ...ctx, seed: 1000 + i }, defaultConfig);
      for (const q of result.session.questions) {
        expect(gradeQuestion(q, [...q.correctIndexes])).toBe(true);
      }
    }
  });

  it("diagnostic is short, stratified, and fully answerable", () => {
    const result = buildDiagnostic({ pack, attempts: [], seed: 42, learnerId: "diag", now: BASETIME }, defaultConfig);
    expect(result.session.questions.length).toBeLessThanOrEqual(defaultConfig.diagnosticSize);
    expect(result.session.questions.length).toBeGreaterThan(0);
    const topics = new Set(result.session.questions.map((q) => q.topicId));
    expect(topics.size).toBeGreaterThanOrEqual(2);
    for (const q of result.session.questions) {
      expect(gradeQuestion(q, [...q.correctIndexes])).toBe(true);
    }
  });

  it("mock construction over the full bank stays bounded and unique", () => {
    for (let i = 0; i < 25; i++) {
      const result = buildMockSession({ pack, attempts: [], seed: i, learnerId: "m", now: BASETIME }, defaultConfig, ZVID_MOCK_DEFAULT);
      const ids = result.session.questions.map((q) => q.qid);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(ZVID_MOCK_DEFAULT.questionCount);
      for (const q of result.session.questions) {
        expect(gradeQuestion(q, [...q.correctIndexes])).toBe(true);
      }
    }
  });

  it("weakest-topic detection stays NaN-free under noise", () => {
    const rand = rng(0xa11c);
    const attempts: AttemptEvent[] = [];
    for (const topicId of CONTENT_TOPICS) {
      const bank = pack.questions.filter((q) => q.topicId === topicId && q.status === "answered");
      for (const q of bank) {
        const isCorrect = rand() < 0.7;
        attempts.push(
          makeAttempt({
            seq: attempts.length,
            seed: 42,
            learnerId: "noise",
            q,
            session: { id: "noise_s", learnerId: "noise", type: "smart" as const, title: "n", purpose: "n", estimatedMinutes: 1, createdAt: BASETIME, questions: [q], completedAt: null },
            isCorrect,
            ts: BASETIME + 5 * DAY_MS,
          }),
        );
        const stat = topicMastery(attempts).find((s) => s.stat.key === topicId);
        if (stat) {
          expect(isFiniteNumber(stat.stat.mastery)).toBe(true);
          const sig = detectWeakness(stat.stat, defaultConfig, BASETIME + 5 * DAY_MS);
          expect(typeof sig.kind).toBe("string");
          if (sig.kind !== "none") {
            for (const r of sig.reasons) expect(typeof r).toBe("string");
          }
        }
      }
    }
  });

  it("planner + cursor schedules clean each session type for every learner profile", () => {
    for (const [lead, minutes] of [
      [7, 4],
      [30, 12],
      [90, 18],
    ] as const) {
      const now = BASETIME;
      const plan = buildPlan({
        examDate: now + lead * DAY_MS,
        dailyMinutes: minutes,
        today: now,
        topics: CONTENT_TOPICS.map((id) => {
          const t = pack.topics.find((x) => x.id === id)!;
          return { id, label: t.label, mastery: 0.5, evidence: 10 };
        }),
        config: defaultConfig,
      });
      expect(plan.days.length).toBeGreaterThan(0);
      for (const day of plan.days) {
        const scheduled = planDaySession(day, [], [], "planner");
        expect(["smart", "review", "recovery", "mock"].includes(day.sessionType)).toBe(true);
        if (["smart", "recovery", "mock"].includes(day.sessionType)) {
          expect(scheduled).not.toBeNull();
        }
      }
    }
  });
});

function seedFor(s: string, i: number): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0)!, 16777619);
  return (h ^ i) >>> 0;
}