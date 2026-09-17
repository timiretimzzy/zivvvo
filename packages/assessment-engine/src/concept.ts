/**
 * D4: Concept Intelligence Layer
 *
 * An additive intelligence layer that enriches the existing mastery/weakness
 * systems with concept-level granularity. Consumes existing AttemptEvent
 * evidence — does NOT duplicate mastery/SRS/recommendation logic.
 *
 * Architecture:
 *   Attempt → Question → Concept → Topic → Readiness
 *
 * This module provides:
 *   - Concept evidence aggregation (via existing computeStat)
 *   - Concept mastery states (using existing thresholds)
 *   - Concept weakness detection (extending existing classifyPattern)
 *   - Concept recovery candidate selection
 *   - Mistake clustering by concept
 *   - Post-mock concept diagnosis
 */

import type { ContentPack } from "@zivvvo/content";
import { getFamilyId, qidToConceptMap, conceptCatalog } from "@zivvvo/content";
import { computeStat, type AttemptLike, type LearningConfig, type MasteryStat } from "@zivvvo/learning-engine";
import type { AttemptEvent } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Concept mastery state — mirrors MasteryStatus but for concepts. */
export type ConceptState = "unknown" | "strong" | "developing" | "needs-attention";

/** Concept mastery record for a single concept. */
export interface ConceptMastery {
  concept: string;
  topicId: string;
  topicLabel: string;
  attempts: number;
  correct: number;
  accuracy: number;
  recentAccuracy: number;
  mastery: number;
  confidence: number;
  state: ConceptState;
  lastAttemptAt: number;
  /** Raw mastery stat from the existing engine — for consumers that need full detail. */
  stat: MasteryStat;
}

/** Concept weakness signal — extends existing WeaknessKind semantics. */
export interface ConceptWeakness {
  concept: string;
  topicId: string;
  kind: "early" | "recurring" | "deteriorating" | "long-unreviewed" | "none";
  reasons: string[];
  mastery: number;
  evidence: number;
}

/** Concept evidence for a single attempt. */
export interface ConceptEvidence {
  qid: string;
  concept: string | null;
  topicId: string;
  isCorrect: boolean;
  confidence: string;
  familyId: string;
  ts: number;
}

/** Post-mock concept diagnosis for a single concept. */
export interface ConceptDiagnosis {
  concept: string;
  topicId: string;
  total: number;
  correct: number;
  pct: number;
  missed: boolean;
}

/** Mistake cluster — mistakes grouped by concept. */
export interface MistakeCluster {
  concept: string;
  topicId: string;
  mistakes: ConceptEvidence[];
  count: number;
}

/** Concept recovery candidate — questions eligible for a recovery session. */
export interface RecoveryCandidate {
  qid: string;
  concept: string;
  topicId: string;
  familyId: string;
}

/** Concept-level readiness breakdown for a single concept. */
export interface ConceptReadiness {
  concept: string;
  topicId: string;
  mastery: number;
  evidence: number;
  state: ConceptState;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function qidToTopicId(pack: ContentPack): Map<string, string> {
  const map = new Map<string, string>();
  for (const q of pack.questions) map.set(q.qid, q.topicId);
  return map;
}

function topicLabelOf(pack: ContentPack): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of pack.topics) map.set(t.id, t.label);
  return map;
}

// ---------------------------------------------------------------------------
// Evidence aggregation
// ---------------------------------------------------------------------------

/**
 * Map AttemptEvents to ConceptEvidence by resolving qid → concept/topic.
 * Preserves existing attempt data without snapshotting concept into attempts.
 */
export function enrichEvidence(
  attempts: AttemptEvent[],
  pack: ContentPack,
): ConceptEvidence[] {
  const conceptMap = qidToConceptMap(pack);
  const topicMap = qidToTopicId(pack);

  return attempts.map((a) => ({
    qid: a.qid,
    concept: conceptMap.get(a.qid) ?? null,
    topicId: topicMap.get(a.qid) ?? "unknown",
    isCorrect: a.isCorrect,
    confidence: a.confidence,
    familyId: getFamilyId(a.qid),
    ts: a.ts,
  }));
}

/**
 * Derive concept state from MasteryStat using existing thresholds.
 * Reuses the learning-engine's classification semantics exactly.
 */
function masteryState(stat: MasteryStat): ConceptState {
  if (stat.evidence < 3) return "unknown";
  if (stat.mastery >= 0.8) return "strong";
  if (stat.mastery >= 0.6) return "developing";
  return "needs-attention";
}

/**
 * Group attempts by concept and compute mastery for each concept.
 * Uses the existing computeStat engine — no new mastery algorithm.
 */
export function conceptMastery(
  attempts: AttemptEvent[],
  pack: ContentPack,
  config: LearningConfig,
): ConceptMastery[] {
  const conceptMap = qidToConceptMap(pack);
  const topicMap = qidToTopicId(pack);
  const labels = topicLabelOf(pack);
  const catalog = conceptCatalog(pack);

  // Build concept→topicLabel lookup
  const conceptTopicLabel = new Map<string, string>();
  for (const c of catalog) conceptTopicLabel.set(`${c.concept}::${c.topicId}`, c.topicLabel);

  // Filter to attempts that map to a concept
  const conceptAttempts = attempts.filter((a) => conceptMap.get(a.qid) != null);

  // Group by concept
  const byConcept = new Map<string, AttemptLike[]>();
  for (const a of conceptAttempts) {
    const concept = conceptMap.get(a.qid)!;
    if (!byConcept.has(concept)) byConcept.set(concept, []);
    byConcept.get(concept)!.push({
      qid: a.qid,
      isCorrect: a.isCorrect,
      mode: a.mode,
      confidence: a.confidence,
      ts: a.ts,
    });
  }

  const results: ConceptMastery[] = [];
  for (const [concept, conceptAtts] of byConcept) {
    const topicId = topicMap.get(conceptAtts[0]?.qid ?? "") ?? "unknown";
    const topicLabel = labels.get(topicId) ?? topicId;
    const stat = computeStat(conceptAtts, concept, config);

    results.push({
      concept,
      topicId,
      topicLabel,
      attempts: stat.evidence,
      correct: stat.correct,
      accuracy: stat.accuracy,
      recentAccuracy: stat.recentAccuracy,
      mastery: stat.mastery,
      confidence: stat.confidence,
      state: masteryState(stat),
      lastAttemptAt: stat.lastAttemptTs,
      stat,
    });
  }

  return results.sort((a, b) => a.mastery - b.mastery);
}

// ---------------------------------------------------------------------------
// Weakness detection
// ---------------------------------------------------------------------------

/**
 * Detect concept-level weaknesses using existing classifyPattern logic.
 * Returns only concepts that have evidence AND show weakness signals.
 *
 * Unknown concepts (0 attempts) are NOT weaknesses — the learner hasn't
 * encountered them yet.
 */
export function detectConceptWeakness(
  attempts: AttemptEvent[],
  pack: ContentPack,
  config: LearningConfig,
  now: number = Date.now(),
): ConceptWeakness[] {
  const conceptMap = qidToConceptMap(pack);
  const masteries = conceptMastery(attempts, pack, config);
  const weaknesses: ConceptWeakness[] = [];

  for (const m of masteries) {
    // Unknown concepts are NOT weaknesses
    if (m.state === "unknown") continue;

    // Get attempts for this concept
    const conceptAtts = attempts.filter((a) => conceptMap.get(a.qid) === m.concept);
    const sorted = [...conceptAtts].sort((a, b) => a.ts - b.ts);

    let kind: ConceptWeakness["kind"] = "none";
    const reasons: string[] = [];

    // Evidence gating: need minimum attempts
    if (m.attempts < config.minEvidence) {
      kind = "early";
      reasons.push(`Only ${m.attempts} attempt${m.attempts === 1 ? "" : "s"} — more evidence needed.`);
    }
    // Strong concepts are not weak
    else if (m.mastery >= config.developingThreshold) {
      kind = "none";
    }
    // Below threshold — check patterns
    else {
      kind = "early"; // default for below-threshold

      // Long-unreviewed check
      if (m.lastAttemptAt > 0) {
        const daysSince = (now - m.lastAttemptAt) / 86_400_000;
        if (daysSince > config.weakGapDays) {
          kind = "long-unreviewed";
          reasons.push(`Not practiced for ${Math.round(daysSince)} days.`);
        }
      }

      // Recurring pattern: multiple recent misses
      const recentWindow = sorted.slice(-config.recurringMissWindow);
      const recentMisses = recentWindow.filter((a) => !a.isCorrect).length;
      if (recentMisses >= config.recurringMissCount) {
        kind = "recurring";
        reasons.push(`${recentMisses} of last ${recentWindow.length} attempts incorrect.`);
      }

      // Deterioration: recent accuracy dropped significantly
      if (sorted.length >= config.minEvidence * 2) {
        const allCorrect = sorted.filter((a) => a.isCorrect).length;
        const allAcc = allCorrect / sorted.length;
        const recentSlice = sorted.slice(-config.recentWindow);
        const recentCorrect = recentSlice.filter((a) => a.isCorrect).length;
        const recentAcc = recentSlice.length > 0 ? recentCorrect / recentSlice.length : 0;
        if (allAcc - recentAcc >= config.deteriorationMargin) {
          kind = "deteriorating";
          reasons.push("Recent performance dropped below your usual level.");
        }
      }

      if (reasons.length === 0) {
        reasons.push(`Accuracy ${Math.round(m.accuracy * 100)}% is below the developing threshold.`);
      }
    }

    if (kind !== "none") {
      weaknesses.push({
        concept: m.concept,
        topicId: m.topicId,
        kind,
        reasons,
        mastery: m.mastery,
        evidence: m.attempts,
      });
    }
  }

  return weaknesses.sort((a, b) => a.mastery - b.mastery);
}

// ---------------------------------------------------------------------------
// Concept recovery
// ---------------------------------------------------------------------------

/**
 * Select recovery candidates for a specific concept.
 * Returns questions from that concept, deduplicated by family.
 * Respects D3.5 invariant: max 1 question per family.
 */
export function conceptRecoveryCandidates(
  concept: string,
  pack: ContentPack,
  excludeFamilies?: Set<string>,
): RecoveryCandidate[] {
  const questions = pack.questions.filter(
    (q) => q.concept === concept && q.status === "answered" && q.correctIndexes.length > 0,
  );

  const candidates: RecoveryCandidate[] = [];
  const seenFamilies = new Set<string>(excludeFamilies ?? []);

  for (const q of questions) {
    const fid = getFamilyId(q.qid);
    if (seenFamilies.has(fid)) continue;
    seenFamilies.add(fid);
    candidates.push({
      qid: q.qid,
      concept: q.concept!,
      topicId: q.topicId,
      familyId: fid,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Mistake clustering
// ---------------------------------------------------------------------------

/**
 * Cluster mistakes by concept. Returns clusters sorted by count descending.
 * Multiple mistakes from different questions with the same concept aggregate together.
 */
export function mistakeClusters(
  attempts: AttemptEvent[],
  pack: ContentPack,
): MistakeCluster[] {
  const topicMap = qidToTopicId(pack);

  const evidence = enrichEvidence(attempts, pack);
  const mistakes = evidence.filter((e) => !e.isCorrect && e.concept != null);

  const byConcept = new Map<string, ConceptEvidence[]>();
  for (const m of mistakes) {
    const key = m.concept!;
    if (!byConcept.has(key)) byConcept.set(key, []);
    byConcept.get(key)!.push(m);
  }

  const clusters: MistakeCluster[] = [];
  for (const [concept, items] of byConcept) {
    clusters.push({
      concept,
      topicId: topicMap.get(items[0]?.qid ?? "") ?? "unknown",
      mistakes: items,
      count: items.length,
    });
  }

  return clusters.sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Post-mock concept diagnosis
// ---------------------------------------------------------------------------

/**
 * Diagnose concept-level performance after a mock exam.
 * Returns per-concept breakdown of the mock attempt.
 */
export function mockConceptDiagnosis(
  mockAttempts: AttemptEvent[],
  pack: ContentPack,
): ConceptDiagnosis[] {
  const conceptMap = qidToConceptMap(pack);
  const topicMap = qidToTopicId(pack);

  const byConcept = new Map<string, { total: number; correct: number }>();

  for (const a of mockAttempts) {
    const concept = conceptMap.get(a.qid);
    if (!concept) continue;
    if (!byConcept.has(concept)) byConcept.set(concept, { total: 0, correct: 0 });
    const entry = byConcept.get(concept)!;
    entry.total++;
    if (a.isCorrect) entry.correct++;
  }

  const diagnoses: ConceptDiagnosis[] = [];
  for (const [concept, { total, correct }] of byConcept) {
    const topicId = topicMap.get(
      mockAttempts.find((a) => conceptMap.get(a.qid) === concept)?.qid ?? "",
    ) ?? "unknown";
    diagnoses.push({
      concept,
      topicId,
      total,
      correct,
      pct: total > 0 ? Math.round((correct / total) * 100) : 0,
      missed: correct < total,
    });
  }

  return diagnoses.sort((a, b) => a.pct - b.pct);
}

// ---------------------------------------------------------------------------
// Readiness enrichment
// ---------------------------------------------------------------------------

/**
 * Compute concept-level readiness breakdown.
 * Returns concepts grouped into strong/developing/weak/unknown buckets.
 * Does NOT replace the topic-level readiness — enriches it.
 */
export function conceptReadinessBreakdown(
  attempts: AttemptEvent[],
  pack: ContentPack,
  config: LearningConfig,
): {
  strong: ConceptReadiness[];
  developing: ConceptReadiness[];
  weak: ConceptReadiness[];
  unknown: ConceptReadiness[];
} {
  const masteries = conceptMastery(attempts, pack, config);

  const result = {
    strong: [] as ConceptReadiness[],
    developing: [] as ConceptReadiness[],
    weak: [] as ConceptReadiness[],
    unknown: [] as ConceptReadiness[],
  };

  for (const m of masteries) {
    const entry: ConceptReadiness = {
      concept: m.concept,
      topicId: m.topicId,
      mastery: m.mastery,
      evidence: m.attempts,
      state: m.state,
    };
    switch (m.state) {
      case "strong":
        result.strong.push(entry);
        break;
      case "developing":
        result.developing.push(entry);
        break;
      case "needs-attention":
        result.weak.push(entry);
        break;
      case "unknown":
        result.unknown.push(entry);
        break;
    }
  }

  // Also add concepts with zero attempts as unknown
  const coveredConcepts = new Set(masteries.map((m) => m.concept));
  const catalog = conceptCatalog(pack);
  for (const c of catalog) {
    if (!coveredConcepts.has(c.concept)) {
      result.unknown.push({
        concept: c.concept,
        topicId: c.topicId,
        mastery: 0,
        evidence: 0,
        state: "unknown",
      });
    }
  }

  return result;
}
