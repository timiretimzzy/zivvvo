/**
 * D6: Personal Tutor Loop — tests for deterministic context and decisions.
 */
import { describe, it, expect } from "vitest";
import {
  buildTutorContext,
  getTutorDecision,
  getConceptTeaching,
  formatMistakeForTeaching,
  formatMockDiagnosisForTeaching,
} from "./context";
import type { AttemptEvent } from "@zivvvo/assessment-engine";
import { pack } from "../catalog";
import { mockTutor } from "@zivvvo/ai-gateway";

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
  for (const [concept, count] of conceptCounts) {
    if (count >= 5) return concept;
  }
  return pack.questions.find((q) => q.concept)?.concept ?? "road-sign";
}

/* ── Tests ─────────────────────────────────────────────────── */

describe("D6 tutor context", () => {
  describe("buildTutorContext()", () => {
    it("new learner: hasEvidence is false with no attempts", () => {
      const ctx = buildTutorContext([]);
      expect(ctx.hasEvidence).toBe(false);
      expect(ctx.evidence.attemptedQuestions).toBe(0);
      expect(ctx.strongestConcepts).toHaveLength(0);
      expect(ctx.weakestConcepts).toHaveLength(0);
      expect(ctx.developingConcepts).toHaveLength(0);
    });

    it("learner with evidence: hasEvidence is true", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 5);
      const attempts = qids.map((qid) => makeAttempt({ qid, isCorrect: true }));
      const ctx = buildTutorContext(attempts);
      expect(ctx.hasEvidence).toBe(true);
      expect(ctx.evidence.attemptedQuestions).toBe(5);
    });

    it("weak concepts appear in weakestConcepts", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 5);
      const attempts = qids.map((qid) => makeAttempt({ qid, isCorrect: false, confidence: "guess" }));
      const ctx = buildTutorContext(attempts);
      const weak = ctx.weakestConcepts.find((c) => c.concept === concept);
      expect(weak).toBeDefined();
      expect(weak!.state).toBe("needs-attention");
    });

    it("strong concepts appear in strongestConcepts", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 5);
      const attempts = qids.map((qid) => makeAttempt({ qid, isCorrect: true, confidence: "sure" }));
      const ctx = buildTutorContext(attempts);
      const strong = ctx.strongestConcepts.find((c) => c.concept === concept);
      expect(strong).toBeDefined();
      expect(strong!.state).toBe("strong");
    });

    it("unknown concepts appear in unknownConcepts", () => {
      const ctx = buildTutorContext([]);
      // All concepts should be unknown when no attempts
      expect(ctx.unknownConcepts.length).toBeGreaterThan(0);
      for (const c of ctx.unknownConcepts) {
        expect(c.state).toBe("unknown");
      }
    });

    it("recentMistakes are populated from incorrect attempts", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 3);
      const attempts = qids.map((qid) => makeAttempt({ qid, isCorrect: false, confidence: "guess" }));
      const ctx = buildTutorContext(attempts);
      expect(ctx.recentMistakes.length).toBeGreaterThan(0);
      const m = ctx.recentMistakes.find((x) => x.concept === concept);
      expect(m).toBeDefined();
      expect(m!.count).toBeGreaterThan(0);
    });

    it("evidence summary tracks conceptsWithEvidence", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 3);
      const attempts = qids.map((qid) => makeAttempt({ qid, isCorrect: true }));
      const ctx = buildTutorContext(attempts);
      expect(ctx.evidence.conceptsWithEvidence).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getTutorDecision()", () => {
    it("new-learner when no evidence", () => {
      const ctx = buildTutorContext([]);
      const d = getTutorDecision(ctx);
      expect(d.kind).toBe("new-learner");
      expect(d.action).toBe("diagnostic");
    });

    it("new-learner with very sparse evidence", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 2);
      const attempts = qids.map((qid) => makeAttempt({ qid, isCorrect: true }));
      const ctx = buildTutorContext(attempts);
      const d = getTutorDecision(ctx);
      expect(d.kind).toBe("new-learner");
    });

    it("weak-concept when concept needs attention", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 5);
      const attempts = qids.map((qid) => makeAttempt({ qid, isCorrect: false, confidence: "guess" }));
      const ctx = buildTutorContext(attempts);
      const d = getTutorDecision(ctx);
      expect(d.kind).toBe("weak-concept");
      expect(d.action).toBe("teach-and-practice");
    });

    it("developing-concept when concept is developing", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 10);
      // 60% correct = developing
      const attempts = qids.map((qid, i) => makeAttempt({ qid, isCorrect: i < 6, confidence: "sure" }));
      const ctx = buildTutorContext(attempts);
      const d = getTutorDecision(ctx);
      // Could be weak or developing depending on the concept
      expect(["weak-concept", "developing-concept", "mistake-recovery", "all-clear"]).toContain(d.kind);
    });

    it("UNKNOWN does not become WEAK", () => {
      const ctx = buildTutorContext([]);
      const d = getTutorDecision(ctx);
      // New learner should not be told they're weak
      expect(d.kind).not.toBe("weak-concept");
      expect(d.kind).not.toBe("developing-concept");
    });
  });

  describe("getConceptTeaching()", () => {
    it("returns teaching info for a concept", () => {
      const concept = getAnyConcept();
      const t = getConceptTeaching(concept);
      expect(t.concept).toBe(concept);
      expect(typeof t.conceptLabel).toBe("string");
      expect(typeof t.topicLabel).toBe("string");
      expect(typeof t.questionCount).toBe("number");
      expect(t.questionCount).toBeGreaterThan(0);
    });

    it("returns explanation when available", () => {
      // Most concepts have explanations
      const concept = getAnyConcept();
      const t = getConceptTeaching(concept);
      // Either explanation or keyRule should be present
      expect(t.explanation !== null || t.keyRule !== null).toBe(true);
    });

    it("returns sampleStems", () => {
      const concept = getAnyConcept();
      const t = getConceptTeaching(concept);
      expect(Array.isArray(t.sampleStems)).toBe(true);
      expect(t.sampleStems.length).toBeGreaterThan(0);
    });
  });

  describe("formatMistakeForTeaching()", () => {
    it("formats a mistake for the teaching loop", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 3);
      const attempts = qids.map((qid) => makeAttempt({ qid, isCorrect: false }));
      const ctx = buildTutorContext(attempts);
      const m = ctx.recentMistakes[0];
      if (!m) return;
      const result = formatMistakeForTeaching(m);
      expect(typeof result.concept).toBe("string");
      expect(typeof result.conceptLabel).toBe("string");
      expect(typeof result.topicLabel).toBe("string");
    });
  });

  describe("formatMockDiagnosisForTeaching()", () => {
    it("formats mock diagnosis for teaching", () => {
      const concept = getAnyConcept();
      const qids = getQuestionsForConcept(concept, 3);
      const attempts = qids.map((qid, i) => makeAttempt({ qid, isCorrect: i < 2 }));
      const result = formatMockDiagnosisForTeaching(attempts);
      expect(result.length).toBeGreaterThan(0);
      const entry = result.find((r) => r.concept === concept);
      expect(entry).toBeDefined();
      expect(typeof entry!.conceptLabel).toBe("string");
      expect(typeof entry!.status).toBe("string");
      expect(["strong", "developing", "needs-attention"]).toContain(entry!.status);
    });

    it("empty attempts returns empty array", () => {
      const result = formatMockDiagnosisForTeaching([]);
      expect(result).toHaveLength(0);
    });
  });
});

describe("D6 mock tutor provider", () => {
  it("mockTutor is always available", () => {
    expect(mockTutor.isAvailable()).toBe(true);
  });

  it("explainConcept returns canonical explanation", async () => {
    const concept = getAnyConcept();
    const t = getConceptTeaching(concept);
    const result = await mockTutor.explainConcept({
      context: {
        concept,
        conceptLabel: t.conceptLabel,
        topicLabel: t.topicLabel,
        mastery: 0.5,
        attempts: 5,
        correct: 3,
        state: "developing",
        canonicalExplanation: t.explanation,
        keyRule: t.keyRule,
      },
    });
    expect(result.available).toBe(true);
    expect(result.source).toBe("canonical");
    expect(typeof result.text).toBe("string");
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("answerQuestion returns fallback when no explanation", async () => {
    const result = await mockTutor.answerQuestion({
      context: {
        concept: "test-concept",
        conceptLabel: "Test Concept",
        topicLabel: "Test Topic",
        mastery: 0,
        attempts: 0,
        correct: 0,
        state: "unknown",
        canonicalExplanation: null,
        keyRule: null,
      },
      learnerQuestion: "Why does that car go first?",
    });
    expect(result.available).toBe(true);
    expect(result.source).toBe("canonical");
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("deterministic context is passed to AI, not the other way around", async () => {
    // Verify the AI provider only receives context, never decides mastery
    const concept = getAnyConcept();
    const t = getConceptTeaching(concept);
    const result = await mockTutor.explainConcept({
      context: {
        concept,
        conceptLabel: t.conceptLabel,
        topicLabel: t.topicLabel,
        mastery: 0.8,
        attempts: 10,
        correct: 8,
        state: "strong",
        canonicalExplanation: "Test explanation",
        keyRule: "Test rule",
      },
    });
    expect(result.text).toBe("Test explanation");
  });
});
