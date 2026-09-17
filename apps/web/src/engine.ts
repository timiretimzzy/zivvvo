import type { AttemptEvent, SessionResult, MockConfig } from "@zivvvo/assessment-engine";
import {
  buildDiagnostic,
  buildMistakeReviewSession,
  buildMockSession,
  buildQuickSession,
  buildReviewSession,
  buildSmartSession,
  buildWeaknessSession,
  ZVID_MOCK_DEFAULT,
  conceptMastery,
  detectConceptWeakness,
  conceptRecoveryCandidates,
  mistakeClusters,
  mockConceptDiagnosis,
  conceptReadinessBreakdown,
  type ConceptMastery,
  type ConceptWeakness,
  type MistakeCluster,
  type ConceptDiagnosis,
  type ConceptReadiness,
} from "@zivvvo/assessment-engine";
import {
  DEFAULT_PRIORITIES_V2,
  defaultConfig,
  detectWeakness,
  classifyPattern,
  isDue,
  masteryBy,
  getNextBestActivity,
  type LearnerState,
  type NextBestActivity,
  type PlanDay,
  type ReviewState,
} from "@zivvvo/learning-engine";
import { catalog, pack } from "./catalog";

export type { NextBestActivity };

export function learnerState(
  learnerId: string,
  attempts: AttemptEvent[],
  reviews: ReviewState[],
  diagnosticCompleted: boolean,
  extras: Partial<Pick<LearnerState, "examDate" | "lastMockAt" | "streakDays">> = {},
): LearnerState {
  return { learnerId, diagnosticCompleted, attempts, reviews, ...extras };
}

export function nextActivity(state: LearnerState): NextBestActivity {
  return getNextBestActivity({ catalog, learner: state, config: defaultConfig, priorities: DEFAULT_PRIORITIES_V2 });
}

export function sessionFor(activity: NextBestActivity, attempts: AttemptEvent[], learnerId: string): SessionResult | null {
  const ctx = {
    pack,
    attempts,
    seed: Date.now() % 2147483647,
    learnerId,
  };
  switch (activity.sessionType) {
    case "diagnostic":
      return buildDiagnostic(ctx, defaultConfig);
    case "review":
      return buildReviewSession(ctx, defaultConfig, activity.qids ?? [], (activity.dueCount ?? activity.qids?.length ?? 0));
    case "recovery":
      if (!activity.targetTopicId) return null;
      return buildWeaknessSession(ctx, defaultConfig, activity.targetTopicId);
    case "smart":
      return activity.targetTopicId
        ? buildSmartSession(ctx, defaultConfig, activity.targetTopicId)
        : buildSmartSession(ctx, defaultConfig);
    case "mock":
      return buildMockSession(ctx, defaultConfig, ZVID_MOCK_DEFAULT);
  }
}

export function topicMastery(attempts: AttemptEvent[]) {
  return masteryBy(attempts, (a) => catalog.questionTopic(a.qid) ?? "general", defaultConfig)
    .map((stat) => ({
      stat,
      topic: pack.topics.find((t) => t.id === stat.key) ?? { id: stat.key, label: stat.key, kind: "content" as const, count: 0 },
    }))
    .filter((x) => x.topic.kind === "content");
}

export function weaknesses(attempts: AttemptEvent[]): { signal: ReturnType<typeof detectWeakness>; topic: { id: string; label: string } }[] {
  const out: { signal: ReturnType<typeof detectWeakness>; topic: { id: string; label: string } }[] = [];
  for (const t of pack.topics.filter((x) => x.kind === "content")) {
    const topicAttempts = attempts.filter((a) => catalog.questionTopic(a.qid) === t.id);
    const stat = masteryBy(topicAttempts, () => t.id, defaultConfig)[0];
    if (!stat) continue;
    const signal = detectWeakness(stat, defaultConfig, Date.now());
    if (signal.kind === "none") continue;
    // Upgrade "early" to recurring/deteriorating when pattern analysis agrees
    if (signal.kind === "early" && topicAttempts.length > 0) {
      const pattern = classifyPattern(topicAttempts.map((a) => ({ isCorrect: a.isCorrect, ts: a.ts })), defaultConfig);
      if (pattern.kind !== "none") {
        out.push({ signal: { ...signal, kind: pattern.kind, reasons: pattern.reasons }, topic: { id: t.id, label: t.label } });
        continue;
      }
    }
    out.push({ signal, topic: { id: t.id, label: t.label } });
  }
  return out;
}

export function quickSession(attempts: AttemptEvent[], learnerId: string, minutes: number): SessionResult {
  return buildQuickSession({ pack, attempts, seed: Date.now() % 2147483647, learnerId }, defaultConfig, minutes);
}

export function smartTopicSession(topicId: string, attempts: AttemptEvent[], learnerId: string): SessionResult {
  return buildSmartSession(
    { pack, attempts, seed: Date.now() % 2147483647, learnerId },
    defaultConfig,
    topicId,
  );
}

export { ZVID_MOCK_DEFAULT, type MockConfig };

export function mockSession(attempts: AttemptEvent[], learnerId: string, mock: MockConfig = ZVID_MOCK_DEFAULT): SessionResult {
  return buildMockSession(
    { pack, attempts, seed: Date.now() % 2147483647, learnerId },
    defaultConfig,
    mock,
  );
}

/** The weakest content topic currently flagged by the learning engine (or null). */
export function topWeakness(attempts: AttemptEvent[]): ReturnType<typeof weaknesses>[number] | null {
  const flagged = weaknesses(attempts);
  return flagged.sort((a, b) => a.signal.stat.mastery - b.signal.stat.mastery)[0] ?? null;
}

/** Number of spaced-repetition cards whose next review is due right now. */
export function dueReviewCount(reviews: ReviewState[], now = Date.now()): number {
  return reviews.filter((r) => isDue(r, now)).length;
}

/** qids whose most recent attempt was incorrect, most recent first. Variant
 *   attempts already record against their base qid, so the list is deduped at
 *   the concept level. */
export function recentMisses(attempts: AttemptEvent[]): string[] {
  const latest = new Map<string, AttemptEvent>();
  for (const a of attempts) {
    const cur = latest.get(a.qid);
    if (!cur || a.ts >= cur.ts) latest.set(a.qid, a);
  }
  return [...latest.values()]
    .filter((a) => !a.isCorrect)
    .sort((a, b) => b.ts - a.ts)
    .map((a) => a.qid);
}

/** General adaptive practice across topics (no topic targeting). */
export function smartSession(attempts: AttemptEvent[], learnerId: string): SessionResult {
  return buildSmartSession(
    { pack, attempts, seed: Date.now() % 2147483647, learnerId },
    defaultConfig,
  );
}

/** Focused recovery practice on one weak topic. */
export function weaknessSession(topicId: string, attempts: AttemptEvent[], learnerId: string): SessionResult {
  return buildWeaknessSession(
    { pack, attempts, seed: Date.now() % 2147483647, learnerId },
    defaultConfig,
    topicId,
  );
}

/** Review session over due spaced-repetition cards, or null when none are due. */
export function dueReviewSession(
  attempts: AttemptEvent[],
  reviews: ReviewState[],
  learnerId: string,
  size?: number,
): SessionResult | null {
  const due = reviews.filter((r) => isDue(r, Date.now())).map((r) => r.qid);
  if (due.length === 0) return null;
  return buildReviewSession(
    { pack, attempts, seed: Date.now() % 2147483647, learnerId },
    defaultConfig,
    due,
    size ?? due.length,
  );
}

/** Mistake review (variants, never the same question) over recent misses, or null when clean. */
export function mistakeReviewSession(
  attempts: AttemptEvent[],
  learnerId: string,
  size?: number,
): SessionResult | null {
  const misses = recentMisses(attempts);
  if (misses.length === 0) return null;
  return buildMistakeReviewSession(
    { pack, attempts, seed: Date.now() % 2147483647, learnerId },
    defaultConfig,
    misses,
    size,
  );
}

/**
 * Builds the session the study planner has scheduled for today (planner.ts).
 * Review days reuse the actual due cards; other days build their own kind so
 * the dashboard can offer "Start today's task" with one tap.
 */
export function planDaySession(day: PlanDay, attempts: AttemptEvent[], reviews: ReviewState[], learnerId: string): SessionResult | null {
  const ctx = { pack, attempts, seed: Date.now() % 2147483647, learnerId };
  switch (day.sessionType) {
    case "mock":
      return buildMockSession(ctx, defaultConfig, ZVID_MOCK_DEFAULT);
    case "recovery":
      return day.topicId ? buildWeaknessSession(ctx, defaultConfig, day.topicId) : buildSmartSession(ctx, defaultConfig);
    case "review": {
      const due = reviews.filter((r) => isDue(r, Date.now())).map((r) => r.qid);
      if (due.length === 0) return buildSmartSession(ctx, defaultConfig, day.topicId);
      return buildReviewSession(ctx, defaultConfig, due, due.length);
    }
    case "smart":
      return buildSmartSession(ctx, defaultConfig, day.topicId);
  }
}

/** Derived signal for the recommender: when the learner last ran a mock. */
export function lastMockAt(attempts: AttemptEvent[]): number | undefined {
  const mocks = attempts.filter((a) => a.mode === "mock");
  return mocks.length ? Math.max(...mocks.map((a) => a.ts)) : undefined;
}

// ---------------------------------------------------------------------------
// D5: Concept Intelligence helpers — consume D4 APIs, no new algorithms
// ---------------------------------------------------------------------------

/** Per-concept mastery for the active learner. */
export function concepts(attempts: AttemptEvent[]): ConceptMastery[] {
  return conceptMastery(attempts, pack, defaultConfig);
}

/** Concept-level weaknesses (evidence-based only). */
export function conceptWeaknesses(attempts: AttemptEvent[]): ConceptWeakness[] {
  return detectConceptWeakness(attempts, pack, defaultConfig);
}

/** Mistakes clustered by concept. */
export function conceptMistakes(attempts: AttemptEvent[]): MistakeCluster[] {
  return mistakeClusters(attempts, pack);
}

/** Post-mock concept diagnosis. */
export function mockDiagnosis(mockAttempts: AttemptEvent[]): ConceptDiagnosis[] {
  return mockConceptDiagnosis(mockAttempts, pack);
}

/** Concept readiness breakdown into strong/developing/weak/unknown. */
export function conceptReadiness(attempts: AttemptEvent[]): {
  strong: ConceptReadiness[];
  developing: ConceptReadiness[];
  weak: ConceptReadiness[];
  unknown: ConceptReadiness[];
} {
  return conceptReadinessBreakdown(attempts, pack, defaultConfig);
}

/**
 * Generate a concept-aware reason for the current recommendation.
 * Returns the most specific concept weakness that explains why this activity
 * was recommended, or null if no concept-level explanation exists.
 */
export function recommendationReason(
  attempts: AttemptEvent[],
  activity: { sessionType: string; targetTopicId?: string; kind: string },
): { concept: string; topicId: string; message: string } | null {
  const weaknesses = conceptWeaknesses(attempts);
  if (weaknesses.length === 0) return null;

  // For recovery/weakness sessions, find the weakest concept in the target topic
  if (activity.sessionType === "recovery" && activity.targetTopicId) {
    const topicWeak = weaknesses.filter((w) => w.topicId === activity.targetTopicId);
    if (topicWeak.length > 0) {
      const worst = topicWeak[0]!;
      return {
        concept: worst.concept,
        topicId: worst.topicId,
        message: formatWeaknessReason(worst),
      };
    }
  }

  // For any session type, find the overall weakest concept
  if (weaknesses.length > 0) {
    const worst = weaknesses[0]!;
    return {
      concept: worst.concept,
      topicId: worst.topicId,
      message: formatWeaknessReason(worst),
    };
  }

  return null;
}

/** Build a targeted concept practice session (family-deduped). */
export function conceptSession(
  concept: string,
  attempts: AttemptEvent[],
  learnerId: string,
  size = 8,
): SessionResult | null {
  const candidates = conceptRecoveryCandidates(concept, pack);
  if (candidates.length === 0) return null;
  const qids = candidates.slice(0, size).map((c) => c.qid);
  // Use buildReviewSession with concept qids — it respects family dedup
  return buildReviewSession(
    { pack, attempts, seed: Date.now() % 2147483647, learnerId },
    defaultConfig,
    qids,
    Math.min(size, qids.length),
  );
}

/** Get the weakest concept for a specific topic. */
export function topConceptWeakness(
  attempts: AttemptEvent[],
  topicId: string,
): ConceptWeakness | null {
  const weaknesses = conceptWeaknesses(attempts);
  const topicWeak = weaknesses.filter((w) => w.topicId === topicId);
  return topicWeak[0] ?? null;
}

/** Get the overall weakest concept across all topics. */
export function weakestConcept(attempts: AttemptEvent[]): ConceptWeakness | null {
  return conceptWeaknesses(attempts)[0] ?? null;
}

function formatWeaknessReason(w: ConceptWeakness): string {
  switch (w.kind) {
    case "recurring":
      return `You've missed several ${formatConcept(w.concept)} questions recently.`;
    case "deteriorating":
      return `Your ${formatConcept(w.concept)} performance has dropped.`;
    case "long-unreviewed":
      return `It's been a while since you practised ${formatConcept(w.concept)}.`;
    case "early":
      return w.evidence === 0
        ? `You haven't tried ${formatConcept(w.concept)} yet.`
        : `More practice needed on ${formatConcept(w.concept)}.`;
    default:
      return `Focus on ${formatConcept(w.concept)}.`;
  }
}

function formatConcept(concept: string): string {
  return concept
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}