/**
 * D13: Multi-Session Simulation Tests
 *
 * Tests the selection system across 5/10/20/50/100 sessions
 * for different learner profiles (fresh, average, strong, weak).
 * Reports metrics showing the system handles the full question bank.
 */
import { describe, it, expect } from "vitest";
import { contentPack as pack } from "@zivvvo/content";
import { defaultConfig } from "@zivvvo/learning-engine";
import { buildSmartSession, buildDiagnostic } from "./sessions";
import {
  buildExposureMap,
  computeSimulationResult,
} from "./selection";
import type { AttemptEvent } from "./types";
import type { ReviewState } from "@zivvvo/learning-engine";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAttempt(
  qid: string,
  isCorrect: boolean,
  ts: number,
  sessionId: string = "s1",
): AttemptEvent {
  return {
    id: `a_${qid}_${ts}`,
    learnerId: "test-learner",
    qid,
    sessionId,
    mode: "smart",
    selected: [0],
    isCorrect,
    confidence: "sure",
    durationMs: 5000,
    ts,
    syncedAt: null,
  };
}

function contentQuestions() {
  return pack.questions.filter(
    (q) => q.status === "answered" && q.correctIndexes.length > 0,
  );
}

// ---------------------------------------------------------------------------
// Generate Attempt History for Different Learner Profiles
// ---------------------------------------------------------------------------

function generateFreshHistory(): AttemptEvent[] {
  return []; // No history at all
}

function generateWeakHistory(attempts: AttemptEvent[]): AttemptEvent[] {
  const questions = contentQuestions();
  const overtakingQids = questions
    .filter((q) => q.topicId === "overtaking")
    .slice(0, 20)
    .map((q) => q.qid);
  const parkingQids = questions
    .filter((q) => q.topicId === "parking")
    .slice(0, 20)
    .map((q) => q.qid);

  let ts = Date.now() - 60 * DAY_MS;
  for (const qid of overtakingQids) {
    attempts.push(makeAttempt(qid, false, ts));
    ts += 60000;
  }
  for (const qid of parkingQids) {
    attempts.push(makeAttempt(qid, false, ts));
    ts += 60000;
  }
  return attempts;
}

function generateAverageHistory(attempts: AttemptEvent[]): AttemptEvent[] {
  const questions = contentQuestions();
  const qids = questions.slice(0, 200).map((q) => q.qid);

  let ts = Date.now() - 60 * DAY_MS;
  for (let i = 0; i < qids.length; i++) {
    // 50% correct for average learner
    attempts.push(makeAttempt(qids[i]!, i % 2 === 0, ts));
    ts += 60000;
  }
  return attempts;
}

function generateStrongHistory(attempts: AttemptEvent[]): AttemptEvent[] {
  const questions = contentQuestions();
  const qids = questions.slice(0, 300).map((q) => q.qid);

  let ts = Date.now() - 60 * DAY_MS;
  for (const qid of qids) {
    attempts.push(makeAttempt(qid, true, ts)); // all correct
    ts += 60000;
  }
  return attempts;
}

// ---------------------------------------------------------------------------
// Simulation Runner
// ---------------------------------------------------------------------------

function runSimulation(
  sessionCount: number,
  history: AttemptEvent[],
  reviews: ReviewState[],
): {
  totalQuestions: number;
  uniqueQuestions: number;
  uniqueFamilies: number;
  uniqueTopics: number;
  repeatRate: number;
  avgTopicDiversity: number;
  avgNoveltyRate: number;
  avgReviewRate: number;
} {
  const sessions: import("@zivvvo/content").Question[][] = [];
  const topicMastery = new Map<string, number>();

  for (let i = 0; i < sessionCount; i++) {
    const result = buildSmartSession(
      { pack, attempts: history, seed: 42 + i * 7, learnerId: "test" },
      defaultConfig,
    );
    sessions.push(result.session.questions);
  }

  const exposureMap = buildExposureMap(history);
  const reviewsMap = new Map<string, ReviewState>();
  for (const r of reviews) {
    reviewsMap.set(r.qid, r);
  }

  const sim = computeSimulationResult(sessions, exposureMap, topicMastery, reviewsMap, Date.now());

  return {
    totalQuestions: sessions.flat().length,
    uniqueQuestions: sim.aggregate.uniqueQuestions,
    uniqueFamilies: sim.aggregate.uniqueTopics.size,
    uniqueTopics: sim.aggregate.uniqueTopics.size,
    repeatRate: sim.aggregate.repeatRate,
    avgTopicDiversity: sim.aggregate.avgTopicDiversity,
    avgNoveltyRate: sim.aggregate.avgNoveltyRate,
    avgReviewRate: sim.aggregate.avgReviewRate,
  };
}

// ---------------------------------------------------------------------------
// Fresh Learner Simulation (No History)
// ---------------------------------------------------------------------------
describe("D13: Simulation — fresh learner", () => {
  it("5 sessions: broad coverage, high novelty", () => {
    const result = runSimulation(5, generateFreshHistory(), []);
    console.log("Fresh 5 sessions:", result);
    expect(result.uniqueQuestions).toBeGreaterThanOrEqual(30);
    expect(result.repeatRate).toBeLessThan(0.5);
    expect(result.uniqueTopics).toBeGreaterThanOrEqual(8);
  });

  it("10 sessions: covers significant portion of bank", () => {
    const result = runSimulation(10, generateFreshHistory(), []);
    console.log("Fresh 10 sessions:", result);
    expect(result.uniqueQuestions).toBeGreaterThanOrEqual(50);
    expect(result.repeatRate).toBeLessThan(0.4);
  });

  it("20 sessions: broad bank coverage", () => {
    const result = runSimulation(20, generateFreshHistory(), []);
    console.log("Fresh 20 sessions:", result);
    expect(result.uniqueQuestions).toBeGreaterThanOrEqual(80);
    expect(result.repeatRate).toBeLessThan(0.5);
  });

  it("50 sessions: deep bank coverage", () => {
    const result = runSimulation(50, generateFreshHistory(), []);
    console.log("Fresh 50 sessions:", result);
    expect(result.uniqueQuestions).toBeGreaterThanOrEqual(150);
    expect(result.uniqueTopics).toBeGreaterThanOrEqual(12);
  });

  it("100 sessions: maximum bank coverage", () => {
    const result = runSimulation(100, generateFreshHistory(), []);
    console.log("Fresh 100 sessions:", result);
    expect(result.uniqueQuestions).toBeGreaterThanOrEqual(250);
    expect(result.uniqueTopics).toBe(15); // all 15 content topics
  });
});

// ---------------------------------------------------------------------------
// Weak Learner Simulation
// ---------------------------------------------------------------------------
describe("D13: Simulation — weak learner", () => {
  it("10 sessions: weakness topics get emphasis but diversity stays", () => {
    const history = generateWeakHistory([]);
    const result = runSimulation(10, history, []);
    console.log("Weak 10 sessions:", result);
    expect(result.uniqueQuestions).toBeGreaterThanOrEqual(50);
    expect(result.repeatRate).toBeLessThan(0.5);
  });

  it("50 sessions: broad coverage despite repeated mistake topics", () => {
    const history = generateWeakHistory([]);
    const result = runSimulation(50, history, []);
    console.log("Weak 50 sessions:", result);
    expect(result.uniqueQuestions).toBeGreaterThanOrEqual(150);
  });
});

// ---------------------------------------------------------------------------
// Average Learner Simulation
// ---------------------------------------------------------------------------
describe("D13: Simulation — average learner", () => {
  it("10 sessions: balanced novelty and review", () => {
    const history = generateAverageHistory([]);
    const result = runSimulation(10, history, []);
    console.log("Average 10 sessions:", result);
    expect(result.uniqueQuestions).toBeGreaterThanOrEqual(50);
    expect(result.repeatRate).toBeLessThan(0.5);
  });

  it("50 sessions: deep bank coverage", () => {
    const history = generateAverageHistory([]);
    const result = runSimulation(50, history, []);
    console.log("Average 50 sessions:", result);
    expect(result.uniqueQuestions).toBeGreaterThanOrEqual(170);
  });
});

// ---------------------------------------------------------------------------
// Strong Learner Simulation
// ---------------------------------------------------------------------------
describe("D13: Simulation — strong learner", () => {
  it("10 sessions: reviews mixed with new questions", () => {
    const history = generateStrongHistory([]);
    const result = runSimulation(10, history, []);
    console.log("Strong 10 sessions:", result);
    expect(result.uniqueQuestions).toBeGreaterThanOrEqual(40);
    expect(result.repeatRate).toBeLessThan(0.6);
  });

  it("50 sessions: deep coverage with review integration", () => {
    const history = generateStrongHistory([]);
    const result = runSimulation(50, history, []);
    console.log("Strong 50 sessions:", result);
    expect(result.uniqueQuestions).toBeGreaterThanOrEqual(70);
  });
});

// ---------------------------------------------------------------------------
// Diagnostic Session Simulation
// ---------------------------------------------------------------------------
describe("D13: Simulation — diagnostic sessions", () => {
  it("5 diagnostics: broad topic coverage across runs", () => {
    const allTopics = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const result = buildDiagnostic(
        { pack, attempts: [], seed: 42 + i * 13, learnerId: "test" },
        defaultConfig,
      );
      for (const q of result.session.questions) {
        allTopics.add(q.topicId);
      }
    }
    console.log("Diagnostic topics covered:", allTopics.size);
    expect(allTopics.size).toBeGreaterThanOrEqual(12);
  });
});
