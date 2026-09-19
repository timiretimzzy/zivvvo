/**
 * D13: Learning-Aware Question Selection Engine
 *
 * Replaces the flat shuffled selection with a deterministic, multi-factor
 * scoring and sequential constrained composition system.
 *
 * Architecture:
 *   learner state → candidate generation → candidate scoring →
 *   diversity constraints → sequence composition → session
 *
 * Core invariants preserved:
 *   - Family dedup: max 1 question per family per session
 *   - Deterministic: same seed + same state = same session
 *   - No source-order bias
 *   - Existing mastery/weakness/SRS engines untouched
 */

import type { ContentPack, Question } from "@zivvvo/content";
import { getFamilyId } from "@zivvvo/content";
import { mulberry32 } from "./random";
import { questionDifficulty, type DifficultyTier } from "./difficulty";
import type { AttemptEvent } from "./types";
import { computeStat, isDue, type ReviewState } from "@zivvvo/learning-engine";

// ---------------------------------------------------------------------------
// Selection Configuration
// ---------------------------------------------------------------------------

export interface SelectionConfig {
  /** Weight for weakness signal (0-1). */
  weaknessWeight: number;
  /** Weight for spaced-repetition review priority (0-1). */
  reviewWeight: number;
  /** Weight for novelty (unseen/fresh questions) (0-1). */
  noveltyWeight: number;
  /** Weight for topic coverage balance (0-1). */
  coverageWeight: number;
  /** Weight for difficulty fit (0-1). */
  difficultyWeight: number;
  /** Weight for information value (0-1). */
  infoValueWeight: number;
  /** Penalty for questions seen in previous session (0-1). */
  previousSessionPenalty: number;
  /** Penalty multiplier per topic already in session (0-1). */
  sessionTopicPenalty: number;
  /** Penalty multiplier per concept already in session (0-1). */
  sessionConceptPenalty: number;
  /** Exponential decay rate for recency penalty. */
  recencyDecayRate: number;
  /** Maximum bonus for never-seen questions. */
  noveltyMaxBonus: number;
  /** Bonus for questions with explanations. */
  explanationBonus: number;
}

export const DEFAULT_SELECTION_CONFIG: SelectionConfig = {
  weaknessWeight: 0.25,
  reviewWeight: 0.20,
  noveltyWeight: 0.20,
  coverageWeight: 0.15,
  difficultyWeight: 0.10,
  infoValueWeight: 0.10,
  previousSessionPenalty: 0.35,
  sessionTopicPenalty: 0.12,
  sessionConceptPenalty: 0.15,
  recencyDecayRate: 0.7,
  noveltyMaxBonus: 0.30,
  explanationBonus: 0.05,
};

// ---------------------------------------------------------------------------
// Question Exposure Record
// ---------------------------------------------------------------------------

/** Derived exposure information for a single question. */
export interface QuestionExposure {
  qid: string;
  /** Total attempts across all time. */
  totalAttempts: number;
  /** Most recent attempt timestamp (0 = never seen). */
  lastSeenAt: number;
  /** Most recent correctness. */
  lastCorrect: boolean | null;
  /** Most recent confidence. */
  lastConfidence: string | null;
  /** Number of sessions in which this question appeared. */
  sessionCount: number;
}

/**
 * Build a per-question exposure map from attempt history.
 * Derives everything from AttemptEvent[] — no extra data needed.
 */
export function buildExposureMap(
  attempts: AttemptEvent[],
): Map<string, QuestionExposure> {
  const map = new Map<string, QuestionExposure>();

  // Sort attempts by timestamp for sequential processing
  const sorted = [...attempts].sort((a, b) => a.ts - b.ts);

  for (const a of sorted) {
    let exp = map.get(a.qid);
    if (!exp) {
      exp = {
        qid: a.qid,
        totalAttempts: 0,
        lastSeenAt: 0,
        lastCorrect: null,
        lastConfidence: null,
        sessionCount: 0,
      };
      map.set(a.qid, exp);
    }
    exp.totalAttempts++;
    exp.lastSeenAt = a.ts;
    exp.lastCorrect = a.isCorrect;
    exp.lastConfidence = a.confidence;
  }

  // Count distinct sessions per question
  const sessionSeen = new Map<string, Set<string>>();
  for (const a of sorted) {
    if (!a.sessionId) continue;
    if (!sessionSeen.has(a.sessionId)) sessionSeen.set(a.sessionId, new Set());
    sessionSeen.get(a.sessionId)!.add(a.qid);
  }
  for (const [, qids] of sessionSeen) {
    for (const qid of qids) {
      const exp = map.get(qid);
      if (exp) exp.sessionCount++;
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Topic and Concept Exposure
// ---------------------------------------------------------------------------

export interface TopicExposure {
  topicId: string;
  totalAttempts: number;
  lastSeenAt: number;
  recentCorrectRate: number;
}

export interface ConceptExposure {
  concept: string;
  topicId: string;
  totalAttempts: number;
  lastSeenAt: number;
  recentCorrectRate: number;
}

/**
 * Build per-topic exposure from attempts and a qid→topicId map.
 */
export function buildTopicExposure(
  attempts: AttemptEvent[],
  topicOf: Map<string, string>,
): Map<string, TopicExposure> {
  const map = new Map<string, TopicExposure>();
  const sorted = [...attempts].sort((a, b) => a.ts - b.ts);

  for (const a of sorted) {
    const tid = topicOf.get(a.qid);
    if (!tid) continue;
    let exp = map.get(tid);
    if (!exp) {
      exp = { topicId: tid, totalAttempts: 0, lastSeenAt: 0, recentCorrectRate: 0 };
      map.set(tid, exp);
    }
    exp.totalAttempts++;
    exp.lastSeenAt = a.ts;
  }

  // Compute recent correct rate (last 10 attempts per topic)
  for (const [tid, exp] of map) {
    const topicAttempts = sorted
      .filter((a) => topicOf.get(a.qid) === tid)
      .slice(-10);
    if (topicAttempts.length > 0) {
      exp.recentCorrectRate = topicAttempts.filter((a) => a.isCorrect).length / topicAttempts.length;
    }
  }

  return map;
}

/**
 * Build per-concept exposure from attempts and a qid→concept map.
 */
export function buildConceptExposure(
  attempts: AttemptEvent[],
  conceptOf: Map<string, string | null>,
  topicOf: Map<string, string>,
): Map<string, ConceptExposure> {
  const map = new Map<string, ConceptExposure>();
  const sorted = [...attempts].sort((a, b) => a.ts - b.ts);

  for (const a of sorted) {
    const concept = conceptOf.get(a.qid);
    if (!concept) continue;
    let exp = map.get(concept);
    if (!exp) {
      exp = {
        concept,
        topicId: topicOf.get(a.qid) ?? "unknown",
        totalAttempts: 0,
        lastSeenAt: 0,
        recentCorrectRate: 0,
      };
      map.set(concept, exp);
    }
    exp.totalAttempts++;
    exp.lastSeenAt = a.ts;
  }

  for (const [concept, exp] of map) {
    const conceptAttempts = sorted
      .filter((a) => conceptOf.get(a.qid) === concept)
      .slice(-10);
    if (conceptAttempts.length > 0) {
      exp.recentCorrectRate = conceptAttempts.filter((a) => a.isCorrect).length / conceptAttempts.length;
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Candidate Scorer
// ---------------------------------------------------------------------------

export interface ScoredCandidate {
  question: Question;
  score: number;
  factors: {
    weakness: number;
    review: number;
    novelty: number;
    coverage: number;
    difficulty: number;
    infoValue: number;
    recencyPenalty: number;
    sessionTopicPenalty: number;
    sessionConceptPenalty: number;
    explanationBonus: number;
  };
  reasons: string[];
}

/**
 * Score a single candidate question against the current learner and session state.
 *
 * Higher score = better candidate for the next slot.
 */
export function scoreCandidate(
  question: Question,
  state: SelectionState,
  config: SelectionConfig,
): ScoredCandidate {
  const { qid, topicId, concept } = question;
  const now = state.now;
  const reasons: string[] = [];
  const factors = {
    weakness: 0,
    review: 0,
    novelty: 0,
    coverage: 0,
    difficulty: 0,
    infoValue: 0,
    recencyPenalty: 0,
    sessionTopicPenalty: 0,
    sessionConceptPenalty: 0,
    explanationBonus: 0,
  };

  // --- Weakness Score ---
  const mastery = state.topicMastery.get(topicId);
  if (mastery) {
    // Weak topics (low mastery) get higher weakness score
    factors.weakness = Math.max(0, 1 - mastery);
    if (mastery < 0.6) reasons.push("weak-topic");
  } else {
    // No evidence = moderate weakness score (needs exposure)
    factors.weakness = 0.5;
    reasons.push("unseen-topic");
  }

  // --- Review Score (SRS) ---
  const review = state.reviews.get(qid);
  if (review && isDue(review, now)) {
    factors.review = 1.0;
    reasons.push("due-review");
  } else if (review) {
    // Not yet due — small score based on proximity
    const timeUntilDue = review.next - now;
    const interval = review.next - review.last;
    factors.review = interval > 0 ? Math.max(0, 1 - timeUntilDue / interval) * 0.3 : 0;
  }

  // --- Novelty Score ---
  const exposure = state.exposureMap.get(qid);
  if (!exposure || exposure.totalAttempts === 0) {
    factors.novelty = config.noveltyMaxBonus;
    reasons.push("never-seen");
  } else {
    // Decay based on time since last seen
    const daysSinceSeen = (now - exposure.lastSeenAt) / (24 * 60 * 60 * 1000);
    factors.novelty = Math.min(config.noveltyMaxBonus, config.noveltyMaxBonus * (1 - Math.exp(-config.recencyDecayRate * daysSinceSeen)));
    if (daysSinceSeen > 14) reasons.push("long-unseen");
    else if (daysSinceSeen > 7) reasons.push("moderately-fresh");
  }

  // --- Coverage Score ---
  // Boost questions from topics/concepts not recently covered in this session
  const topicCount = state.sessionTopicCounts.get(topicId) ?? 0;
  const topicTotal = state.sessionSize > 0 ? state.selected.length / state.sessionSize : 0;
  const topicExpected = state.topicExpected.get(topicId) ?? (1 / Math.max(1, state.contentTopicCount));
  if (topicCount === 0) {
    factors.coverage = 0.8;
    if (topicTotal < topicExpected * 0.7) reasons.push("underrepresented-topic");
  } else if (topicCount <= topicExpected) {
    factors.coverage = 0.4;
  } else {
    factors.coverage = Math.max(0, 0.3 - (topicCount - topicExpected) * 0.15);
  }

  if (concept) {
    const conceptCount = state.sessionConceptCounts.get(concept) ?? 0;
    if (conceptCount === 0) {
      factors.coverage += 0.2;
    } else if (conceptCount > 1) {
      factors.coverage -= 0.1;
    }
  }

  // --- Difficulty Score ---
  const diff = questionDifficulty(question);
  const learnerLevel = state.learnerLevel;
  const diffTarget: Record<string, DifficultyTier> = {
    novice: "easy",
    developing: "standard",
    strong: "hard",
  };
  const target = diffTarget[learnerLevel] ?? "standard";
  const diffOrder = { easy: 0, standard: 1, hard: 2 };
  const diffDist = Math.abs(diffOrder[diff] - diffOrder[target]);
  factors.difficulty = diffDist === 0 ? 1.0 : diffDist === 1 ? 0.5 : 0.2;

  // --- Information Value Score ---
  // Boost safety-critical, misconception-prone, or underrepresented concepts
  const SAFETY_CONCEPTS = new Set([
    "right-of-way", "stop-sign", "traffic-light-rules", "seatbelt",
    "speed-limit", "pedestrian-crossing", "overtaking-safety",
    "night-driving", "wet-weather", "braking-distance",
  ]);
  if (concept && SAFETY_CONCEPTS.has(concept)) {
    factors.infoValue += 0.5;
    reasons.push("safety-critical");
  }
  // Boost questions with explanations (educational value)
  if (question.explanation) {
    factors.infoValue += 0.3;
  }
  // Boost underrepresented concepts
  if (concept) {
    const conceptExposure = state.conceptExposure.get(concept);
    if (!conceptExposure || conceptExposure.totalAttempts < 3) {
      factors.infoValue += 0.2;
      reasons.push("underrepresented-concept");
    }
  }

  // --- Recency Penalty ---
  if (exposure && exposure.totalAttempts > 0) {
    const daysSinceSeen = (now - exposure.lastSeenAt) / (24 * 60 * 60 * 1000);
    // Strong penalty for very recent, decays over time
    factors.recencyPenalty = Math.exp(-config.recencyDecayRate * daysSinceSeen);
    if (daysSinceSeen < 1) {
      factors.recencyPenalty *= 1.5; // Extra penalty for same-day
      reasons.push("seen-today");
    } else if (daysSinceSeen < 3) {
      factors.recencyPenalty *= 1.2;
      reasons.push("seen-recently");
    }

    // Override: if it's due for review or a serious weakness, reduce penalty
    if (factors.review > 0.5) {
      factors.recencyPenalty *= 0.3;
    }
    if (mastery !== undefined && mastery < 0.4) {
      factors.recencyPenalty *= 0.5;
    }
  }

  // --- Session Penalties ---
  factors.sessionTopicPenalty = topicCount * config.sessionTopicPenalty;
  if (topicCount >= 3) reasons.push("topic-heavy");

  if (concept) {
    const conceptCount = state.sessionConceptCounts.get(concept) ?? 0;
    factors.sessionConceptPenalty = conceptCount * config.sessionConceptPenalty;
    if (conceptCount >= 2) reasons.push("concept-repeated");
  }

  // --- Explanation Bonus ---
  if (question.explanation) {
    factors.explanationBonus = config.explanationBonus;
  }

  // --- Aggregate Score ---
  const rawScore =
    factors.weakness * config.weaknessWeight +
    factors.review * config.reviewWeight +
    factors.novelty * config.noveltyWeight +
    factors.coverage * config.coverageWeight +
    factors.difficulty * config.difficultyWeight +
    factors.infoValue * config.infoValueWeight +
    factors.explanationBonus -
    factors.recencyPenalty * config.previousSessionPenalty -
    factors.sessionTopicPenalty -
    factors.sessionConceptPenalty;

  return { question, score: rawScore, factors, reasons };
}

// ---------------------------------------------------------------------------
// Selection State (tracked during session composition)
// ---------------------------------------------------------------------------

export interface SelectionState {
  now: number;
  selected: Question[];
  selectedFamilies: Set<string>;
  sessionTopicCounts: Map<string, number>;
  sessionConceptCounts: Map<string, number>;
  sessionDifficultyCounts: Map<DifficultyTier, number>;
  sessionSize: number;
  contentTopicCount: number;
  topicExpected: Map<string, number>;
  topicMastery: Map<string, number>;
  reviews: Map<string, ReviewState>;
  exposureMap: Map<string, QuestionExposure>;
  topicExposure: Map<string, TopicExposure>;
  conceptExposure: Map<string, ConceptExposure>;
  learnerLevel: "novice" | "developing" | "strong";
  rng: () => number;
}

/**
 * Determine learner level from overall mastery.
 */
export function classifyLearnerLevel(topicMastery: Map<string, number>): "novice" | "developing" | "strong" {
  if (topicMastery.size === 0) return "novice";
  const avg = [...topicMastery.values()].reduce((s, v) => s + v, 0) / topicMastery.size;
  if (avg >= 0.75) return "strong";
  if (avg >= 0.45) return "developing";
  return "novice";
}

/**
 * Compute expected topic allocation weights based on learner weakness.
 * Weak topics get more weight; strong topics get less.
 */
export function computeTopicWeights(
  topicMastery: Map<string, number>,
  contentTopics: string[],
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const t of contentTopics) {
    const mastery = topicMastery.get(t);
    if (mastery === undefined) {
      // No evidence — moderate weight (needs exposure)
      weights.set(t, 1.3);
    } else if (mastery < 0.4) {
      // Weak — high weight
      weights.set(t, 1.0 + (1 - mastery) * 1.0);
    } else if (mastery < 0.7) {
      // Developing — moderate weight
      weights.set(t, 1.0 + (1 - mastery) * 0.5);
    } else {
      // Strong — lower weight
      weights.set(t, 0.6 + mastery * 0.3);
    }
  }
  return weights;
}

// ---------------------------------------------------------------------------
// Session Composer
// ---------------------------------------------------------------------------

/**
 * Core sequential constrained selection algorithm.
 *
 * Selects questions one at a time, scoring all remaining candidates
 * after each selection to account for the evolving session state.
 */
export function composeSession(
  candidates: Question[],
  state: SelectionState,
  config: SelectionConfig,
  size: number,
): Question[] {
  const selected: Question[] = [];
  // Start with candidates that don't collide with already-selected families
  let remaining = candidates.filter((r) => {
    const rFid = getFamilyId(r.qid);
    return !state.selectedFamilies.has(rFid);
  });

  for (let i = 0; i < size && remaining.length > 0; i++) {
    // Score all remaining candidates
    const scored = remaining.map((q) => scoreCandidate(q, state, config));

    // Sort by score descending, use RNG for tie-breaking among top candidates
    scored.sort((a, b) => {
      const diff = b.score - a.score;
      if (Math.abs(diff) > 0.01) return diff;
      // Tie-break using seeded RNG for determinism
      return state.rng() - 0.5;
    });

    // Select the best candidate
    const best = scored[0]!;
    const q = best.question;

    // Update state
    selected.push(q);
    state.selected = selected;
    const fid = getFamilyId(q.qid);
    state.selectedFamilies.add(fid);
    state.sessionTopicCounts.set(q.topicId, (state.sessionTopicCounts.get(q.topicId) ?? 0) + 1);
    if (q.concept) {
      state.sessionConceptCounts.set(q.concept, (state.sessionConceptCounts.get(q.concept) ?? 0) + 1);
    }
    const diff = questionDifficulty(q);
    state.sessionDifficultyCounts.set(diff, (state.sessionDifficultyCounts.get(diff) ?? 0) + 1);

    // Remove from remaining: same question, same family, or any family now selected
    remaining = remaining.filter((r) => {
      const rFid = getFamilyId(r.qid);
      return rFid !== fid && r.qid !== q.qid && !state.selectedFamilies.has(rFid);
    });
  }

  return selected;
}

/**
 * Build a SelectionState from learner data.
 */
export function buildSelectionState(
  pack: ContentPack,
  attempts: AttemptEvent[],
  reviews: ReviewState[],
  seed: number,
  now: number,
  sessionSize: number,
): SelectionState {
  const rng = mulberry32(seed);

  // Build content topic list
  const contentTopics = pack.topics.filter((t) => t.kind === "content").map((t) => t.id);

  // Build topic mastery
  const topicOf = new Map(pack.questions.map((q) => [q.qid, q.topicId]));
  const topicMastery = new Map<string, number>();
  for (const t of contentTopics) {
    const topicAttempts = attempts.filter((a) => topicOf.get(a.qid) === t);
    if (topicAttempts.length > 0) {
      const stat = computeStat(topicAttempts, t, {
        prior: 0.5,
        minEvidence: 3,
        recentWindow: 10,
        recentWeightMax: 0.35,
        recentWeightPerAttempt: 0.06,
        confidenceDenominator: 4,
        strongThreshold: 0.8,
        developingThreshold: 0.6,
        recentWeakThreshold: 0.6,
        recurringMissWindow: 4,
        recurringMissCount: 2,
        deteriorationMargin: 0.15,
        weakGapDays: 14,
        reviewScheduleDays: [0.2, 1, 3, 7, 14, 30],
        mockGapDays: 5,
        timePressureDays: 14,
        consistencyGapDays: 2,
        sessionSizeSmart: 8,
        sessionSizeWeakness: 6,
        sessionSizeQuickPerMinute: 1.3,
        diagnosticSize: 15,
        recentAvoidHours: 4,
        xpCorrect: 10,
        xpHardBonus: 10,
        xpPerfectSet: 30,
        xpDailyGoal: 50,
        xpComeback: 25,
        maxFreezes: 2,
        xpPerLevelBase: 100,
      });
      topicMastery.set(t, stat.mastery);
    }
  }

  // Build review map
  const reviewMap = new Map<string, ReviewState>();
  for (const r of reviews) {
    reviewMap.set(r.qid, r);
  }

  // Build exposure maps
  const exposureMap = buildExposureMap(attempts);
  const conceptOf = new Map(pack.questions.map((q) => [q.qid, q.concept]));
  const topicExposureMap = buildTopicExposure(attempts, topicOf);
  const conceptExposureMap = buildConceptExposure(attempts, conceptOf, topicOf);

  // Compute expected topic allocation
  const topicWeights = computeTopicWeights(topicMastery, contentTopics);
  const totalWeight = [...topicWeights.values()].reduce((s, v) => s + v, 0);
  const topicExpected = new Map<string, number>();
  for (const t of contentTopics) {
    topicExpected.set(t, (topicWeights.get(t) ?? 1) / totalWeight);
  }

  return {
    now,
    selected: [],
    selectedFamilies: new Set(),
    sessionTopicCounts: new Map(),
    sessionConceptCounts: new Map(),
    sessionDifficultyCounts: new Map() as Map<DifficultyTier, number>,
    sessionSize,
    contentTopicCount: contentTopics.length,
    topicExpected,
    topicMastery,
    reviews: reviewMap,
    exposureMap,
    topicExposure: topicExposureMap,
    conceptExposure: conceptExposureMap,
    learnerLevel: classifyLearnerLevel(topicMastery),
    rng,
  };
}

// ---------------------------------------------------------------------------
// Session Diversity Metrics
// ---------------------------------------------------------------------------

export interface SessionMetrics {
  questionCount: number;
  uniqueFamilies: number;
  uniqueTopics: number;
  uniqueConcepts: number;
  topicDistribution: Map<string, number>;
  conceptDistribution: Map<string, number>;
  difficultyDistribution: Map<DifficultyTier, number>;
  /** Fraction of questions never seen before. */
  noveltyRate: number;
  /** Fraction of questions seen in last 2 sessions. */
  recentReuseRate: number;
  /** Fraction of questions that are due for review. */
  reviewRate: number;
  /** Fraction of questions from weak topics. */
  weaknessRate: number;
  /** Topic diversity (normalized entropy). */
  topicDiversity: number;
  /** Concept diversity (normalized entropy). */
  conceptDiversity: number;
}

/**
 * Compute diversity metrics for a generated session.
 */
export function computeSessionMetrics(
  questions: Question[],
  exposureMap: Map<string, QuestionExposure>,
  topicMastery: Map<string, number>,
  reviews: Map<string, ReviewState>,
  now: number,
): SessionMetrics {
  const topicDist = new Map<string, number>();
  const conceptDist = new Map<string, number>();
  const diffDist = new Map<DifficultyTier, number>();
  const familySet = new Set<string>();
  let novelCount = 0;
  let recentReuseCount = 0;
  let reviewCount = 0;
  let weaknessCount = 0;

  for (const q of questions) {
    // Topic distribution
    topicDist.set(q.topicId, (topicDist.get(q.topicId) ?? 0) + 1);

    // Concept distribution
    if (q.concept) {
      conceptDist.set(q.concept, (conceptDist.get(q.concept) ?? 0) + 1);
    }

    // Difficulty distribution
    const diff = questionDifficulty(q);
    diffDist.set(diff, (diffDist.get(diff) ?? 0) + 1);

    // Family tracking
    familySet.add(getFamilyId(q.qid));

    // Novelty
    const exp = exposureMap.get(q.qid);
    if (!exp || exp.totalAttempts === 0) {
      novelCount++;
    } else if (now - exp.lastSeenAt < 3 * 24 * 60 * 60 * 1000) {
      recentReuseCount++;
    }

    // Review
    const review = reviews.get(q.qid);
    if (review && isDue(review, now)) {
      reviewCount++;
    }

    // Weakness
    const mastery = topicMastery.get(q.topicId);
    if (mastery !== undefined && mastery < 0.6) {
      weaknessCount++;
    }
  }

  const n = questions.length || 1;

  return {
    questionCount: questions.length,
    uniqueFamilies: familySet.size,
    uniqueTopics: topicDist.size,
    uniqueConcepts: conceptDist.size,
    topicDistribution: topicDist,
    conceptDistribution: conceptDist,
    difficultyDistribution: diffDist,
    noveltyRate: novelCount / n,
    recentReuseRate: recentReuseCount / n,
    reviewRate: reviewCount / n,
    weaknessRate: weaknessCount / n,
    topicDiversity: normalizedEntropy(topicDist),
    conceptDiversity: normalizedEntropy(conceptDist),
  };
}

/** Normalized Shannon entropy (0 = all same, 1 = perfectly diverse). */
function normalizedEntropy(dist: Map<string, number>): number {
  const total = [...dist.values()].reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  let entropy = 0;
  for (const count of dist.values()) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(dist.size || 1);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

/**
 * Simulate multiple sessions and aggregate metrics.
 * Useful for testing and reporting.
 */
export interface SimulationResult {
  sessions: SessionMetrics[];
  aggregate: {
    uniqueQuestions: number;
    totalAppearances: number;
    repeatCount: number;
    repeatRate: number;
    uniqueTopics: Set<string>;
    uniqueConcepts: Set<string>;
    avgTopicDiversity: number;
    avgConceptDiversity: number;
    avgNoveltyRate: number;
    avgRecentReuseRate: number;
    avgReviewRate: number;
    avgWeaknessRate: number;
    /** Per-position frequency map: qid → count at each position across sessions. */
    positionFrequency: Map<string, number[]>;
  };
}

export function computeSimulationResult(
  allSessions: Question[][],
  exposureMap: Map<string, QuestionExposure>,
  topicMastery: Map<string, number>,
  reviews: Map<string, ReviewState>,
  now: number,
): SimulationResult {
  const allQids = new Set<string>();
  const qidSessionCount = new Map<string, number>();
  const positionFrequency = new Map<string, number[]>();
  const allTopics = new Set<string>();
  const allConcepts = new Set<string>();
  const metrics: SessionMetrics[] = [];
  let totalAppearances = 0;

  for (const session of allSessions) {
    const m = computeSessionMetrics(session, exposureMap, topicMastery, reviews, now);
    metrics.push(m);

    for (let i = 0; i < session.length; i++) {
      const q = session[i]!;
      allQids.add(q.qid);
      qidSessionCount.set(q.qid, (qidSessionCount.get(q.qid) ?? 0) + 1);
      allTopics.add(q.topicId);
      if (q.concept) allConcepts.add(q.concept);

      if (!positionFrequency.has(q.qid)) positionFrequency.set(q.qid, []);
      positionFrequency.get(q.qid)!.push(i);

      totalAppearances++;
    }
  }

  let repeatCount = 0;
  for (const count of qidSessionCount.values()) {
    if (count > 1) repeatCount += count - 1;
  }

  const avg = (values: number[]) =>
    values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;

  return {
    sessions: metrics,
    aggregate: {
      uniqueQuestions: allQids.size,
      totalAppearances,
      repeatCount,
      repeatRate: totalAppearances > 0 ? repeatCount / totalAppearances : 0,
      uniqueTopics: allTopics,
      uniqueConcepts: allConcepts,
      avgTopicDiversity: avg(metrics.map((m) => m.topicDiversity)),
      avgConceptDiversity: avg(metrics.map((m) => m.conceptDiversity)),
      avgNoveltyRate: avg(metrics.map((m) => m.noveltyRate)),
      avgRecentReuseRate: avg(metrics.map((m) => m.recentReuseRate)),
      avgReviewRate: avg(metrics.map((m) => m.reviewRate)),
      avgWeaknessRate: avg(metrics.map((m) => m.weaknessRate)),
      positionFrequency,
    },
  };
}
