import type { AttemptLike } from "@zivvvo/learning-engine";
import type { ContentPack } from "@zivvvo/content";

/**
 * Mock examination blueprint. Values are tunable data, never UI hardcoding.
 * The ZVID default below is Experimental until verified against the real exam
 * spec (pass mark / counts / duration may change).
 */
export interface MockConfig {
  questionCount: number;
  durationMin: number;
  /** Pass mark as a fraction of total, e.g. 0.6 = pass at 60%. */
  passMark: number;
  topicMix: "balanced";
}

/**
 * Dynamic mock modes (docs/PRODUCT_VISION.md §21).
 *
 * - `standard`     — balanced examination simulation.
 * - `personalized` — simulates the exam while *slightly* emphasizing
 *   weaknesses (per-topic weights scale with low topic accuracy).
 * - `nightmare`    — difficult questions only (S2 hard tier first, topped up
 *   with the next available tier when the hard pool is small).
 */
export type MockMode = "standard" | "personalized" | "nightmare";

export interface DynamicMockConfig extends MockConfig {
  mode: MockMode;
  /** Optional explicit per-topic weights (>= 0). Overrides the mode's defaults. */
  weights?: Record<string, number>;
}

export const ZVID_MOCK_DEFAULT: MockConfig = {
  questionCount: 30,
  durationMin: 30,
  passMark: 0.9,
  topicMix: "balanced",
};

export interface MockScore {
  total: number;
  correct: number;
  score: number;
  passMark: number;
  passed: boolean;
}

/** Pass/fail verdict from the session's attempts, against the blueprint. */
export function mockScore(attempts: AttemptLike[], mock: MockConfig): MockScore {
  const total = attempts.length;
  const correct = attempts.filter((a) => a.isCorrect).length;
  const score = total ? correct / total : 0;
  return { total, correct, score, passMark: mock.passMark, passed: score >= mock.passMark };
}

export interface TopicReview {
  topicId: string;
  label: string;
  total: number;
  correct: number;
  pct: number;
}

export interface RiskArea {
  topicId: string;
  label: string;
  missed: number;
  /** Distinct concepts missed within the topic (when codified). */
  concepts: string[];
  message: string;
}

export interface MockReview {
  total: number;
  correct: number;
  score: number;
  passed: boolean;
  /** Per-topic breakdown for the vision's review bars. */
  perTopic: TopicReview[];
  /** The single biggest risk area; null when nothing was missed or no topic evidence. */
  biggestRisk: RiskArea | null;
}

/**
 * Post-mock review (docs/PRODUCT_VISION.md §22) — more than a score: a
 * per-topic breakdown and a pinpointed biggest risk ("You missed 3 questions
 * involving three-vehicle intersections.") to feed the "Fix this weakness" CTA.
 */
export function mockReview(
  attempts: AttemptLike[],
  pack: ContentPack,
  passMark = ZVID_MOCK_DEFAULT.passMark,
): MockReview {
  const total = attempts.length;
  const correct = attempts.filter((a) => a.isCorrect).length;
  const score = total ? correct / total : 0;
  const labelOf = new Map(pack.topics.map((t) => [t.id, t.label]));
  const conceptOf = new Map(pack.questions.map((q) => [q.qid, q]));

  const groups = new Map<string, { total: number; correct: number; missedConcepts: Set<string> }>();
  for (const a of attempts) {
    const q = conceptOf.get(a.qid);
    const topic = q?.topicId ?? "unknown";
    const g = groups.get(topic) ?? { total: 0, correct: 0, missedConcepts: new Set<string>() };
    g.total += 1;
    if (a.isCorrect) g.correct += 1;
    else if (q?.concept) g.missedConcepts.add(q.concept);
    groups.set(topic, g);
  }

  const perTopic: TopicReview[] = [...groups.entries()]
    .map(([topicId, g]) => ({
      topicId,
      label: labelOf.get(topicId) ?? topicId,
      total: g.total,
      correct: g.correct,
      pct: g.total ? Math.round((g.correct / g.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  let biggestRisk: RiskArea | null = null;
  for (const [topicId, g] of groups) {
    const missed = g.total - g.correct;
    if (missed === 0) continue;
    const risk: RiskArea = {
      topicId,
      label: labelOf.get(topicId) ?? topicId,
      missed,
      concepts: [...g.missedConcepts],
      message: `You missed ${missed} question${missed === 1 ? "" : "s"} in ${labelOf.get(topicId) ?? topicId}.`,
    };
    if (!biggestRisk || risk.missed > biggestRisk.missed) biggestRisk = risk;
  }

  return { total, correct, score, passed: score >= passMark, perTopic, biggestRisk };
}