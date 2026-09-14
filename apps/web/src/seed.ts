import type { AttemptEvent } from "@zivvvo/assessment-engine";
import type { EngagementState } from "@zivvvo/learning-engine";
import type { StoredLearner } from "./db";

/**
 * Demo learners for local evaluation (docs/ROADMAP.md). Learner A is strong on
 * Road Signs and weak on Junction Rules; Learner B is the mirror image. Both
 * have enough deliberate mis-answers to exercise the weakness/recovery paths.
 */
export const DEMO_LEARNERS: { id: string; name: string; tag: string; strongTopic: string; weakTopic: string }[] = [
  { id: "demo-a", name: "Learner A", tag: "Roads strong", strongTopic: "road-signs", weakTopic: "junction-rules" },
  { id: "demo-b", name: "Learner B", tag: "Junctions strong", strongTopic: "junction-rules", weakTopic: "road-signs" },
];

const ts = (daysAgo: number, hour: number): number =>
  Date.now() - daysAgo * 86_400_000 - (6 - hour) * 3_600_000;

export function sealedAttemptsFor(learner: (typeof DEMO_LEARNERS)[number], qids: { topic: string; qid: string }[]): AttemptEvent[] {
  const attempts: AttemptEvent[] = [];
  const strongSet = new Set(qids.filter((q) => q.topic === learner.strongTopic).map((q) => q.qid));
  const weakSet = new Set(qids.filter((q) => q.topic === learner.weakTopic).map((q) => q.qid));

  let n = 0;
  // 20-day history on the strong topic: mostly correct, one early slip
  for (const qid of [...strongSet].slice(0, 25)) {
    for (let round = 0; round < 3; round++) {
      attempts.push({
        id: `${learner.id}-${qid}-${round}`,
        learnerId: learner.id,
        qid,
        sessionId: null,
        mode: "smart",
        selected: [0],
        isCorrect: !(round === 0 && n % 5 === 0),
        confidence: "sure",
        durationMs: 1800,
        ts: ts(30 - n, n % 6),
        syncedAt: Date.now(),
      });
      n++;
    }
  }
  // weak topic: mostly wrong with a hard recent patch
  for (const qid of [...weakSet].slice(0, 25)) {
    for (let round = 0; round < 3; round++) {
      attempts.push({
        id: `${learner.id}-${qid}-${round}`,
        learnerId: learner.id,
        qid,
        sessionId: null,
        mode: "smart",
        selected: [0],
        isCorrect: round === 2,
        confidence: round === 2 ? "unsure" : "guess",
        durationMs: 2200,
        ts: ts(20 - n, n % 6),
        syncedAt: Date.now(),
      });
      n++;
    }
  }
  return attempts;
}

export function demoLearnerRecord(learner: (typeof DEMO_LEARNERS)[number]): StoredLearner {
  return {
    id: learner.id,
    name: learner.name,
    diagnosticCompleted: true,
    createdAt: Date.now() - 30 * 86_400_000,
    plan: "free",
  };
}

const dayIndex = (ts: number): number => Math.floor(ts / 86_400_000);

/** A believable engagement snapshot so the Home v2 dashboard comes alive for demos. */
export function demoEngagement(): EngagementState {
  return {
    xp: 320,
    streakDays: 6,
    bestStreakDays: 12,
    freezeAvailable: 1,
    dailyGoalMin: 15,
    lastActiveDay: dayIndex(Date.now()),
    distinctActiveDays: 28,
    perfectSessions: 4,
    freezesEarned: 1,
    freezesUsed: 0,
    dailyGoalCompletedDays: 14,
  };
}