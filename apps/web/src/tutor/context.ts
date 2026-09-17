/**
 * D6: Personal Tutor Loop — Deterministic Context & Decision Layer
 *
 * Assembles existing D4/D5 intelligence into a coherent learner snapshot
 * and produces deterministic tutoring decisions. No new algorithms —
 * consumes existing conceptMastery, conceptWeaknesses, mistakeClusters,
 * mockDiagnosis, conceptRecoveryCandidates, and recommendationReason.
 *
 * UNKNOWN ≠ WEAK  — always preserved.
 */
import type { AttemptEvent } from "@zivvvo/assessment-engine";
import {
  computeReadiness,
} from "@zivvvo/assessment-engine";
import { defaultConfig } from "@zivvvo/learning-engine";
import {
  concepts,
  conceptMistakes,
  conceptReadiness,
  mockDiagnosis,
  recommendationReason,
} from "../engine";
import {
  pack,
} from "../catalog";
import {
  questionsByConcept,
  type Question,
} from "@zivvvo/content";
import type { NextBestActivity } from "../engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConceptSummary {
  concept: string;
  topicId: string;
  topicLabel: string;
  mastery: number;
  attempts: number;
  correct: number;
  state: "strong" | "developing" | "needs-attention" | "unknown";
  /** Author-written explanation from a representative question. */
  explanation: string | null;
  /** Key question stems for teaching context. */
  sampleStems: string[];
}

export interface MistakeSummary {
  concept: string;
  topicId: string;
  topicLabel: string;
  count: number;
  recentQid: string;
  recentStem: string;
  recentExplanation: string | null;
}

export interface ReadinessSummary {
  score: number;
  band: string;
  coverage: number;
  masteryMean: number;
}

export interface RecommendationSummary {
  sessionType: string;
  title: string;
  reason: string;
  conceptReason: string | null;
  targetTopicId?: string;
}

export interface EvidenceSummary {
  attemptedQuestions: number;
  conceptsWithEvidence: number;
  totalConcepts: number;
  totalQuestions: number;
}

export interface TutorContext {
  learnerId?: string;
  strongestConcepts: ConceptSummary[];
  weakestConcepts: ConceptSummary[];
  developingConcepts: ConceptSummary[];
  unknownConcepts: ConceptSummary[];
  recentMistakes: MistakeSummary[];
  readiness: ReadinessSummary | null;
  currentRecommendation: RecommendationSummary | null;
  evidence: EvidenceSummary;
  /** Whether the learner has enough evidence for meaningful tutoring. */
  hasEvidence: boolean;
}

export type TutorDecision =
  | { kind: "new-learner"; message: string; action: "diagnostic" | "explore" }
  | { kind: "weak-concept"; concept: ConceptSummary; message: string; action: "teach-and-practice" }
  | { kind: "developing-concept"; concept: ConceptSummary; message: string; action: "strengthen" }
  | { kind: "strong-concept"; concept: ConceptSummary; message: string; action: "maintain" }
  | { kind: "mistake-recovery"; mistake: MistakeSummary; message: string; action: "explain-and-practice" }
  | { kind: "review-due"; message: string; action: "review" }
  | { kind: "mock-ready"; message: string; action: "mock" }
  | { kind: "all-clear"; message: string; action: "maintain" };

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

function formatConcept(concept: string): string {
  return concept
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getExplanationForConcept(concept: string): string | null {
  const qs = questionsByConcept(pack, concept);
  for (const q of qs) {
    if (q.explanation && q.explanation.trim().length > 0) return q.explanation;
  }
  return null;
}

function getSampleStems(concept: string, count = 2): string[] {
  const qs = questionsByConcept(pack, concept);
  return qs
    .filter((q) => q.stem && q.stem.trim().length > 0)
    .slice(0, count)
    .map((q) => q.stem);
}

function buildConceptSummary(
  c: { concept: string; topicId: string; mastery: number; attempts: number; correct: number; state: string },
): ConceptSummary {
  const topic = pack.topics.find((t) => t.id === c.topicId);
  return {
    concept: c.concept,
    topicId: c.topicId,
    topicLabel: topic?.label ?? c.topicId,
    mastery: c.mastery,
    attempts: c.attempts,
    correct: c.correct,
    state: c.state as ConceptSummary["state"],
    explanation: getExplanationForConcept(c.concept),
    sampleStems: getSampleStems(c.concept),
  };
}

/**
 * Build a complete tutor context from the learner's attempt history.
 * All data is derived from existing D4/D5 APIs — no new intelligence.
 */
export function buildTutorContext(
  attempts: AttemptEvent[],
  learnerId?: string,
  _examDate?: number,
  initialConfidence?: string | null,
): TutorContext {
  const masteryList = concepts(attempts);
  const readinessData = conceptReadiness(attempts);
  const mistakeList = conceptMistakes(attempts);

  // Build concept summaries
  const strong = readinessData.strong.map((r) => {
    const m = masteryList.find((x) => x.concept === r.concept);
    return buildConceptSummary({
      concept: r.concept,
      topicId: r.topicId,
      mastery: r.mastery,
      attempts: m?.attempts ?? r.evidence,
      correct: m?.correct ?? 0,
      state: "strong",
    });
  });

  const developing = readinessData.developing.map((r) => {
    const m = masteryList.find((x) => x.concept === r.concept);
    return buildConceptSummary({
      concept: r.concept,
      topicId: r.topicId,
      mastery: r.mastery,
      attempts: m?.attempts ?? r.evidence,
      correct: m?.correct ?? 0,
      state: "developing",
    });
  });

  const weak = readinessData.weak.map((r) => {
    const m = masteryList.find((x) => x.concept === r.concept);
    return buildConceptSummary({
      concept: r.concept,
      topicId: r.topicId,
      mastery: r.mastery,
      attempts: m?.attempts ?? r.evidence,
      correct: m?.correct ?? 0,
      state: "needs-attention",
    });
  });

  const unknown = readinessData.unknown.map((r) => {
    const m = masteryList.find((x) => x.concept === r.concept);
    return buildConceptSummary({
      concept: r.concept,
      topicId: r.topicId,
      mastery: r.mastery,
      attempts: m?.attempts ?? r.evidence,
      correct: m?.correct ?? 0,
      state: "unknown",
    });
  });

  // Build mistake summaries
  const topicLabelMap = new Map(pack.topics.map((t) => [t.id, t.label]));
  const recentMistakes: MistakeSummary[] = mistakeList.slice(0, 5).map((cl) => {
    const lastMistake = cl.mistakes[cl.mistakes.length - 1];
    const q = pack.questions.find((q) => q.qid === lastMistake?.qid);
    return {
      concept: cl.concept,
      topicId: cl.topicId,
      topicLabel: topicLabelMap.get(cl.topicId) ?? cl.topicId,
      count: cl.count,
      recentQid: lastMistake?.qid ?? "",
      recentStem: q?.stem ?? "",
      recentExplanation: q?.explanation ?? null,
    };
  });

  // Readiness
  const readinessResult = computeReadiness({
    pack,
    attempts,
    config: defaultConfig,
    initialConfidence,
  });
  const readiness: ReadinessSummary | null = readinessResult
    ? {
        score: readinessResult.score,
        band: readinessResult.band,
        coverage: readinessResult.coverage,
        masteryMean: readinessResult.masteryMean,
      }
    : null;

  // Evidence summary
  const uniqueQids = new Set(attempts.map((a) => a.qid));
  const conceptsWithEvidence = new Set(masteryList.filter((m) => m.attempts > 0).map((m) => m.concept));
  const evidence: EvidenceSummary = {
    attemptedQuestions: uniqueQids.size,
    conceptsWithEvidence: conceptsWithEvidence.size,
    totalConcepts: pack.concepts.length,
    totalQuestions: pack.questions.length,
  };

  return {
    learnerId,
    strongestConcepts: strong,
    weakestConcepts: weak,
    developingConcepts: developing,
    unknownConcepts: unknown,
    recentMistakes,
    readiness,
    currentRecommendation: null, // filled by buildRecommendation
    evidence,
    hasEvidence: attempts.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Decision layer
// ---------------------------------------------------------------------------

/**
 * Produce the primary tutoring decision from a tutor context.
 * Deterministic, offline-first, no AI dependency.
 */
export function getTutorDecision(ctx: TutorContext): TutorDecision {
  // 1. New learner — no evidence
  if (!ctx.hasEvidence || ctx.evidence.attemptedQuestions < 3) {
    return {
      kind: "new-learner",
      message: "Let's build your foundation. Start with a diagnostic to see where you stand.",
      action: "diagnostic",
    };
  }

  // 2. Weak concept — needs attention (prioritised)
  if (ctx.weakestConcepts.length > 0) {
    const worst = ctx.weakestConcepts[0]!;
    const label = formatConcept(worst.concept);
    return {
      kind: "weak-concept",
      concept: worst,
      message: worst.attempts > 0
        ? `You need more practice with ${label}. You've got ${worst.correct} of ${worst.attempts} right so far.`
        : `You haven't practised ${label} yet. Let's learn the key rule.`,
      action: "teach-and-practice",
    };
  }

  // 3. Developing concept — strengthen
  if (ctx.developingConcepts.length > 0) {
    const d = ctx.developingConcepts[0]!;
    const label = formatConcept(d.concept);
    return {
      kind: "developing-concept",
      concept: d,
      message: `You're getting there with ${label}. Let's strengthen it before your next mock.`,
      action: "strengthen",
    };
  }

  // 4. Recent mistake — explain and recover
  if (ctx.recentMistakes.length > 0) {
    const m = ctx.recentMistakes[0]!;
    const label = formatConcept(m.concept);
    return {
      kind: "mistake-recovery",
      mistake: m,
      message: `You missed a ${label} question recently. Let's review the rule.`,
      action: "explain-and-practice",
    };
  }

  // 5. All strong — maintain
  if (ctx.strongestConcepts.length > 3 && ctx.developingConcepts.length === 0 && ctx.weakestConcepts.length === 0) {
    return {
      kind: "all-clear",
      message: "You're looking strong across the board. Keep it fresh with a practice session.",
      action: "maintain",
    };
  }

  // 6. Default — general practice
  return {
    kind: "all-clear",
    message: "Keep practising to build more evidence across all concepts.",
    action: "maintain",
  };
}

/**
 * Get a concept-specific teaching summary.
 * Returns the best available explanation + key rule for a concept.
 */
export function getConceptTeaching(concept: string): {
  concept: string;
  conceptLabel: string;
  topicLabel: string;
  explanation: string | null;
  keyRule: string | null;
  questionCount: number;
  sampleStems: string[];
} {
  const topic = pack.topics.find((t) =>
    pack.questions.some((q) => q.concept === concept && q.topicId === t.id),
  );
  const qs = questionsByConcept(pack, concept);
  const explanation = getExplanationForConcept(concept);
  const stems = getSampleStems(concept, 3);

  // Derive a key rule from the most common explanation pattern
  const keyRule = deriveKeyRule(concept, qs);

  return {
    concept,
    conceptLabel: formatConcept(concept),
    topicLabel: topic?.label ?? concept,
    explanation,
    keyRule,
    questionCount: qs.length,
    sampleStems: stems,
  };
}

/**
 * Format a mistake for the mistake → teach → recover loop.
 */
export function formatMistakeForTeaching(mistake: MistakeSummary): {
  concept: string;
  conceptLabel: string;
  topicLabel: string;
  stem: string;
  explanation: string | null;
  keyRule: string | null;
} {
  const keyRule = deriveKeyRule(mistake.concept, questionsByConcept(pack, mistake.concept));
  return {
    concept: mistake.concept,
    conceptLabel: formatConcept(mistake.concept),
    topicLabel: mistake.topicLabel,
    stem: mistake.recentStem,
    explanation: mistake.recentExplanation,
    keyRule,
  };
}

/**
 * Format mock diagnosis for the mock → diagnose → teach → practise loop.
 */
export function formatMockDiagnosisForTeaching(
  mockAttempts: AttemptEvent[],
): {
  concept: string;
  conceptLabel: string;
  topicLabel: string;
  correct: number;
  total: number;
  pct: number;
  status: "strong" | "developing" | "needs-attention";
  explanation: string | null;
  keyRule: string | null;
}[] {
  const diagnosis = mockDiagnosis(mockAttempts);
  return diagnosis.map((d) => {
    const topic = pack.topics.find((t) => t.id === d.topicId);
    const status = d.pct >= 80 ? "strong" : d.pct >= 50 ? "developing" : "needs-attention";
    return {
      concept: d.concept,
      conceptLabel: formatConcept(d.concept),
      topicLabel: topic?.label ?? d.topicId,
      correct: d.correct,
      total: d.total,
      pct: d.pct,
      status,
      explanation: getExplanationForConcept(d.concept),
      keyRule: deriveKeyRule(d.concept, questionsByConcept(pack, d.concept)),
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a key rule from the most common explanation pattern in a concept's questions.
 * Falls back to the first available explanation if no pattern emerges.
 */
function deriveKeyRule(_concept: string, questions: Question[]): string | null {
  const explanations = questions
    .map((q) => q.explanation?.trim())
    .filter((e): e is string => !!e && e.length > 10);

  if (explanations.length === 0) return null;

  // Find the shortest substantial explanation (most concise rule)
  const sorted = [...explanations].sort((a, b) => a.length - b.length);
  const shortest = sorted[0]!;

  // If the shortest is under 120 chars, use it as the key rule
  if (shortest.length <= 120) return shortest;

  // Otherwise, extract the first sentence
  const firstSentence = shortest.match(/^[^.!?]+[.!?]/);
  return firstSentence ? firstSentence[0] : shortest.slice(0, 120) + "...";
}

/**
 * Build a recommendation summary from the tutor context and next activity.
 */
export function buildRecommendation(
  _ctx: TutorContext,
  activity: NextBestActivity | null,
): RecommendationSummary | null {
  if (!activity) return null;
  const conceptReason = recommendationReason(
    [], // will be recomputed inside recommendationReason
    activity,
  );
  return {
    sessionType: activity.sessionType,
    title: activity.title,
    reason: activity.reason.label,
    conceptReason: conceptReason?.message ?? null,
    targetTopicId: activity.targetTopicId,
  };
}
