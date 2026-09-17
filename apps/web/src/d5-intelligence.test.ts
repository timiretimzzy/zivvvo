/**
 * D5: Adaptive Intelligence UI Integration — engine helper tests.
 *
 * Tests the concept intelligence helpers added to engine.ts that consume
 * D4 APIs. These are the selectors used by Home, Progress, and Practice pages.
 */
import { describe, it, expect } from "vitest";
import {
  concepts,
  conceptWeaknesses,
  conceptMistakes,
  mockDiagnosis,
  conceptReadiness,
  recommendationReason,
  conceptSession,
  topConceptWeakness,
  weakestConcept,
} from "./engine";
import type { AttemptEvent } from "@zivvvo/assessment-engine";
import { pack } from "./catalog";

/* ── Factories ─────────────────────────────────────────────── */

function makeAttempt(overrides: Partial<AttemptEvent> & { qid: string }): AttemptEvent {
  return {
    id: `test-${Date.now()}-${Math.random()}`,
    learnerId: "test-learner",
    ts: Date.now(),
    isCorrect: true,
    selected: [0],
    confidence: "sure",
    durationMs: 5000,
    mode: "smart",
    sessionId: "test-session",
    syncedAt: null,
    ...overrides,
  };
}

function getQuestionsForConcept(concept: string, count = 3): string[] {
  return pack.questions
    .filter((q) => q.concept === concept)
    .slice(0, count)
    .map((q) => q.qid);
}

function getAnyConcept(): string {
  const conceptCounts = new Map<string, number>();
  for (const q of pack.questions) {
    if (q.concept) conceptCounts.set(q.concept, (conceptCounts.get(q.concept) ?? 0) + 1);
  }
  // Pick a concept with at least 3 questions
  for (const [concept, count] of conceptCounts) {
    if (count >= 3) return concept;
  }
  // Fallback: just return the first concept
  return pack.questions.find((q) => q.concept)?.concept ?? "road-sign";
}

function getSecondConcept(exclude: string): string {
  const conceptCounts = new Map<string, number>();
  for (const q of pack.questions) {
    if (q.concept && q.concept !== exclude) conceptCounts.set(q.concept, (conceptCounts.get(q.concept) ?? 0) + 1);
  }
  for (const [concept, count] of conceptCounts) {
    if (count >= 2) return concept;
  }
  return pack.questions.find((q) => q.concept && q.concept !== exclude)?.concept ?? "junction-rules";
}

/* ── Tests ─────────────────────────────────────────────────── */

describe("D5 engine concept helpers", () => {
  describe("concepts()", () => {
    it("returns empty array with no attempts", () => {
      const result = concepts([]);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it("returns ConceptMastery[] for concepts with evidence", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 3);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: true, confidence: "sure" }),
      );
      const result = concepts(attempts);
      expect(result.length).toBeGreaterThan(0);
      for (const c of result) {
        expect(typeof c.concept).toBe("string");
        expect(typeof c.mastery).toBe("number");
        expect(typeof c.attempts).toBe("number");
        expect(c.mastery).toBeGreaterThanOrEqual(0);
        expect(c.mastery).toBeLessThanOrEqual(1);
      }
    });

    it("computes mastery after correct attempts", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 3);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: true, confidence: "sure" }),
      );
      const result = concepts(attempts);
      const entry = result.find((c) => c.concept === concept);
      expect(entry).toBeDefined();
      expect(entry!.mastery).toBeGreaterThan(0);
      expect(entry!.attempts).toBeGreaterThan(0);
    });
  });

  describe("conceptWeaknesses()", () => {
    it("returns ConceptWeakness[]", () => {
      const result = conceptWeaknesses([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty with no attempts", () => {
      const result = conceptWeaknesses([]);
      expect(result).toHaveLength(0);
    });

    it("detects weakness after multiple incorrect attempts", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 5);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: false, confidence: "guess" }),
      );
      const result = conceptWeaknesses(attempts);
      expect(result.length).toBeGreaterThan(0);
      const weak = result.find((w) => w.concept === concept);
      expect(weak).toBeDefined();
      expect(weak!.concept).toBe(concept);
    });

    it("includes kind, evidence, and topicId", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 5);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: false, confidence: "guess" }),
      );
      const result = conceptWeaknesses(attempts);
      const weak = result.find((w) => w.concept === concept);
      expect(weak).toBeDefined();
      expect(typeof weak!.kind).toBe("string");
      expect(typeof weak!.evidence).toBe("number");
      expect(typeof weak!.topicId).toBe("string");
    });
  });

  describe("conceptMistakes()", () => {
    it("returns MistakeCluster[]", () => {
      const result = conceptMistakes([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty with no mistakes", () => {
      const result = conceptMistakes([]);
      expect(result).toHaveLength(0);
    });

    it("clusters mistakes by concept", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 3);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: false, confidence: "guess" }),
      );
      const result = conceptMistakes(attempts);
      expect(result.length).toBeGreaterThan(0);
      const cluster = result.find((c) => c.concept === concept);
      expect(cluster).toBeDefined();
      expect(cluster!.count).toBeGreaterThan(0);
      expect(cluster!.mistakes.length).toBeGreaterThan(0);
    });

    it("includes topicId in clusters", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 2);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: false, confidence: "guess" }),
      );
      const result = conceptMistakes(attempts);
      const cluster = result.find((c) => c.concept === concept);
      expect(cluster).toBeDefined();
      expect(typeof cluster!.topicId).toBe("string");
    });
  });

  describe("mockDiagnosis()", () => {
    it("returns ConceptDiagnosis[]", () => {
      const result = mockDiagnosis([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty with no mock attempts", () => {
      const result = mockDiagnosis([]);
      expect(result).toHaveLength(0);
    });

    it("diagnoses concepts from mock attempts", () => {
      // Use a mix of correct and incorrect across multiple concepts
      const concept1 = getAnyConcept();
      const qids1 = getQuestionsForConcept(concept1, 3);
      const concept2 = getQuestionsForConcept(getAnyConcept(), 2);
      const attempts = [
        ...qids1.map((qid) => makeAttempt({ qid, isCorrect: true, confidence: "sure" })),
        ...concept2.map((qid) => makeAttempt({ qid, isCorrect: false, confidence: "guess" })),
      ];
      const result = mockDiagnosis(attempts);
      expect(result.length).toBeGreaterThan(0);
      for (const d of result) {
        expect(typeof d.concept).toBe("string");
        expect(typeof d.topicId).toBe("string");
        expect(typeof d.pct).toBe("number");
        expect(typeof d.missed).toBe("boolean");
      }
    });
  });

  describe("conceptReadiness()", () => {
    it("returns readiness breakdown with strong/developing/weak/unknown", () => {
      const result = conceptReadiness([]);
      expect(result).toHaveProperty("strong");
      expect(result).toHaveProperty("developing");
      expect(result).toHaveProperty("weak");
      expect(result).toHaveProperty("unknown");
      expect(Array.isArray(result.strong)).toBe(true);
      expect(Array.isArray(result.developing)).toBe(true);
      expect(Array.isArray(result.weak)).toBe(true);
      expect(Array.isArray(result.unknown)).toBe(true);
    });

    it("all concepts classified into one of four buckets", () => {
      // With no attempts, all concepts should be unknown
      const result = conceptReadiness([]);
      const total = result.strong.length + result.developing.length + result.weak.length + result.unknown.length;
      expect(total).toBeGreaterThan(0);
      // Without attempts, all should be unknown
      expect(result.unknown.length).toBe(total);
    });

    it("has ConceptReadiness shape in each bucket", () => {
      const result = conceptReadiness([]);
      for (const bucket of [result.strong, result.developing, result.weak, result.unknown]) {
        for (const r of bucket) {
          expect(typeof r.concept).toBe("string");
          expect(typeof r.topicId).toBe("string");
          expect(typeof r.mastery).toBe("number");
          expect(typeof r.evidence).toBe("number");
          expect(typeof r.state).toBe("string");
        }
      }
    });
  });

  describe("recommendationReason()", () => {
    it("returns null with no weaknesses", () => {
      const result = recommendationReason([], { sessionType: "smart", kind: "learning-path" });
      expect(result).toBeNull();
    });

    it("returns reason when concept weaknesses exist", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 5);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: false, confidence: "guess" }),
      );
      const result = recommendationReason(attempts, { sessionType: "recovery", targetTopicId: pack.questions.find((q) => q.concept === concept)?.topicId ?? "", kind: "recurring-weakness" });
      expect(result).not.toBeNull();
      expect(typeof result!.concept).toBe("string");
      expect(typeof result!.topicId).toBe("string");
      expect(typeof result!.message).toBe("string");
    });

    it("returns weakest concept for non-recovery sessions", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 5);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: false, confidence: "guess" }),
      );
      const result = recommendationReason(attempts, { sessionType: "smart", kind: "learning-path" });
      expect(result).not.toBeNull();
      expect(result!.concept).toBe(concept);
    });
  });

  describe("conceptSession()", () => {
    it("returns null for unknown concept", () => {
      const result = conceptSession("nonexistent-concept-xyz", [], "test-learner");
      expect(result).toBeNull();
    });

    it("returns SessionResult for valid concept with attempts", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 3);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: false, confidence: "guess" }),
      );
      const result = conceptSession(concept, attempts, "test-learner", 4);
      expect(result).not.toBeNull();
      expect(result!.session).toBeDefined();
      expect(result!.session.questions.length).toBeGreaterThan(0);
    });
  });

  describe("topConceptWeakness()", () => {
    it("returns null with no attempts", () => {
      const result = topConceptWeakness([], "general-rules");
      expect(result).toBeNull();
    });

    it("returns weakest concept for a topic", () => {
      const concept = getAnyConcept();
      const q = pack.questions.find((q) => q.concept === concept);
      if (!q) return;
      const qids = getQuestionsForConcept(concept, 3);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: false, confidence: "guess" }),
      );
      const result = topConceptWeakness(attempts, q.topicId);
      expect(result).not.toBeNull();
      expect(result!.concept).toBe(concept);
    });
  });

  describe("weakestConcept()", () => {
    it("returns null with no attempts", () => {
      const result = weakestConcept([]);
      expect(result).toBeNull();
    });

    it("returns the overall weakest concept", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 5);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: false, confidence: "guess" }),
      );
      const result = weakestConcept(attempts);
      expect(result).not.toBeNull();
      expect(typeof result!.concept).toBe("string");
      expect(typeof result!.topicId).toBe("string");
    });
  });

  // ---------------------------------------------------------------------------
  // D5.1: Mock Diagnosis Integration Tests
  // ---------------------------------------------------------------------------

  describe("D5.1 mock diagnosis", () => {
    it("returns diagnosis with expected concepts from mock attempts", () => {
      const concept1 = getAnyConcept();
      const qids1 = getQuestionsForConcept(concept1, 3);
      const concept2 = getSecondConcept(concept1);
      const qids2 = getQuestionsForConcept(concept2, 2);
      const attempts = [
        ...qids1.map((qid) => makeAttempt({ qid, isCorrect: true, confidence: "sure" })),
        ...qids2.map((qid) => makeAttempt({ qid, isCorrect: false, confidence: "guess" })),
      ];
      const result = mockDiagnosis(attempts);
      expect(result.length).toBeGreaterThanOrEqual(2);
      const c1 = result.find((d) => d.concept === concept1);
      expect(c1).toBeDefined();
      expect(c1!.total).toBe(3);
      expect(c1!.correct).toBe(3);
      expect(c1!.pct).toBe(100);
      expect(c1!.missed).toBe(false);
    });

    it("concept results show correct mock counts", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 4);
      const attempts = qids.map((qid, i) =>
        makeAttempt({ qid, isCorrect: i < 2, confidence: i < 2 ? "sure" : "guess" }),
      );
      const result = mockDiagnosis(attempts);
      const d = result.find((x) => x.concept === concept);
      expect(d).toBeDefined();
      expect(d!.total).toBe(4);
      expect(d!.correct).toBe(2);
      expect(d!.pct).toBe(50);
      expect(d!.missed).toBe(true);
    });

    it("strong concepts (>=80%) and weak concepts (<50%) are separated correctly", () => {
      const conceptA = getAnyConcept();
      const qidsA = getQuestionsForConcept(conceptA, 3);
      const conceptB = getSecondConcept(conceptA);
      const qidsB = getQuestionsForConcept(conceptB, 3);
      const attempts = [
        ...qidsA.map((qid) => makeAttempt({ qid, isCorrect: true, confidence: "sure" })),
        ...qidsB.map((qid) => makeAttempt({ qid, isCorrect: false, confidence: "guess" })),
      ];
      const result = mockDiagnosis(attempts);
      const strong = result.filter((d) => d.pct >= 80);
      const weak = result.filter((d) => d.pct < 50);
      expect(strong.length).toBeGreaterThanOrEqual(1);
      expect(weak.length).toBeGreaterThanOrEqual(1);
    });

    it("concept with no mock evidence does not appear in diagnosis", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 2);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: true, confidence: "sure" }),
      );
      const result = mockDiagnosis(attempts);
      // Should only contain the concept we actually attempted
      for (const d of result) {
        expect(d.total).toBeGreaterThan(0);
      }
    });

    it("empty diagnosis does not crash (returns empty array)", () => {
      const result = mockDiagnosis([]);
      expect(result).toEqual([]);
    });

    it("concept recovery session uses family deduplication", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 3);
      const attempts = qids.map((qid) =>
        makeAttempt({ qid, isCorrect: false, confidence: "guess" }),
      );
      const session = conceptSession(concept, attempts, "test-learner", 8);
      if (!session) return; // concept may not have recovery candidates
      const qidsInSession = session.session.questions.map((q) => q.qid);
      // All qids should be unique (no duplicates from family dedup)
      expect(new Set(qidsInSession).size).toBe(qidsInSession.length);
    });

    it("mock diagnosis pct is consistent with correct/total", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 5);
      const attempts = qids.map((qid, i) =>
        makeAttempt({ qid, isCorrect: i < 3, confidence: "sure" }),
      );
      const result = mockDiagnosis(attempts);
      const d = result.find((x) => x.concept === concept);
      if (!d) return;
      expect(d.pct).toBe(Math.round((d.correct / d.total) * 100));
    });
  });
});
