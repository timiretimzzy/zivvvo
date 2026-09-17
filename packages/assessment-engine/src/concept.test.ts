import { describe, it, expect } from "vitest";
import { defaultConfig } from "@zivvvo/learning-engine";
import { contentPack, allConcepts, conceptCatalog, conceptsForTopic } from "@zivvvo/content";
import type { AttemptEvent } from "./types";
import {
  enrichEvidence,
  conceptMastery,
  detectConceptWeakness,
  conceptRecoveryCandidates,
  mistakeClusters,
  mockConceptDiagnosis,
  conceptReadinessBreakdown,
} from "./concept";

const cfg = defaultConfig;
const NOW = 1_700_000_000_000;

function attempt(
  qid: string,
  ts: number,
  isCorrect: boolean,
  confidence: "sure" | "unsure" | "guess" = "sure",
  mode: string = "smart",
): AttemptEvent {
  return {
    id: `a-${qid}-${ts}`,
    learnerId: "test-learner",
    qid,
    sessionId: null,
    mode: mode as any,
    selected: [0],
    isCorrect,
    confidence,
    durationMs: 5000,
    ts,
    syncedAt: null,
  };
}

function pick(arr: readonly unknown[], count: number) {
  return arr.slice(0, count) as any[];
}

// ---------------------------------------------------------------------------
// Test 1: concept aggregation
// ---------------------------------------------------------------------------
describe("Test 1: concept aggregation", () => {
  it("aggregates attempts from multiple questions into correct concept evidence", () => {
    const rwQuestions = pick(contentPack.questions.filter((q) => q.concept === "right-of-way"), 3);
    expect(rwQuestions.length).toBe(3);

    const attempts = [
      attempt(rwQuestions[0].qid, NOW - 3000, true),
      attempt(rwQuestions[1].qid, NOW - 2000, true),
      attempt(rwQuestions[2].qid, NOW - 1000, false),
    ];

    const masteries = conceptMastery(attempts, contentPack, cfg);
    const rw = masteries.find((m) => m.concept === "right-of-way");
    expect(rw).toBeDefined();
    expect(rw!.attempts).toBe(3);
    expect(rw!.correct).toBe(2);
    expect(rw!.accuracy).toBeCloseTo(2 / 3, 2);
  });
});

// ---------------------------------------------------------------------------
// Test 2: multiple concepts — no cross-contamination
// ---------------------------------------------------------------------------
describe("Test 2: multiple concepts", () => {
  it("separate concepts do not contaminate each other's evidence", () => {
    const rwQuestions = pick(contentPack.questions.filter((q) => q.concept === "right-of-way"), 2);
    const srQuestions = pick(contentPack.questions.filter((q) => q.concept === "sign-recognition"), 2);

    const attempts = [
      attempt(rwQuestions[0].qid, NOW - 4000, true),
      attempt(rwQuestions[1].qid, NOW - 3000, false),
      attempt(srQuestions[0].qid, NOW - 2000, true),
      attempt(srQuestions[1].qid, NOW - 1000, true),
    ];

    const masteries = conceptMastery(attempts, contentPack, cfg);
    const rw = masteries.find((m) => m.concept === "right-of-way");
    const sr = masteries.find((m) => m.concept === "sign-recognition");

    expect(rw).toBeDefined();
    expect(sr).toBeDefined();
    expect(rw!.attempts).toBe(2);
    expect(rw!.correct).toBe(1);
    expect(sr!.attempts).toBe(2);
    expect(sr!.correct).toBe(2);
    expect(rw!.correct).not.toBe(sr!.correct);
  });
});

// ---------------------------------------------------------------------------
// Test 3: topic aggregation — concepts belong to correct topics
// ---------------------------------------------------------------------------
describe("Test 3: topic aggregation", () => {
  it("concept results are grouped into the correct topic", () => {
    const rwQ = contentPack.questions.find((q) => q.concept === "right-of-way")!;
    const attempts = [attempt(rwQ.qid, NOW, true)];
    const masteries = conceptMastery(attempts, contentPack, cfg);
    const rw = masteries.find((m) => m.concept === "right-of-way");
    expect(rw).toBeDefined();
    expect(rw!.topicId).toBe("junction-rules");

    const srQ = contentPack.questions.find((q) => q.concept === "sign-recognition")!;
    const srAttempts = [attempt(srQ.qid, NOW, true)];
    const srMasteries = conceptMastery(srAttempts, contentPack, cfg);
    const sr = srMasteries.find((m) => m.concept === "sign-recognition");
    expect(sr).toBeDefined();
    expect(sr!.topicId).toBe("road-signs");
  });
});

// ---------------------------------------------------------------------------
// Test 4: unknown concept — 0 attempts → UNKNOWN
// ---------------------------------------------------------------------------
describe("Test 4: unknown concept", () => {
  it("concept with 0 attempts has state UNKNOWN", () => {
    const masteries = conceptMastery([], contentPack, cfg);
    for (const m of masteries) {
      expect(m.state).toBe("unknown");
      expect(m.attempts).toBe(0);
    }
  });

  it("concept with fewer than minEvidence attempts has state unknown", () => {
    const q = contentPack.questions.find((q) => q.concept === "right-of-way")!;
    const attempts = [attempt(q.qid, NOW, true)];
    const masteries = conceptMastery(attempts, contentPack, cfg);
    const rw = masteries.find((m) => m.concept === "right-of-way");
    expect(rw).toBeDefined();
    expect(rw!.state).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Test 5: weak concept — sufficient poor evidence → needs-attention
// ---------------------------------------------------------------------------
describe("Test 5: weak concept", () => {
  it("concept with sufficient poor evidence is identified as needs-attention", () => {
    const qs = pick(
      contentPack.questions.filter((q) => q.concept === "right-of-way" && q.status === "answered"),
      5,
    );
    const attempts = qs.map((q: any, i: number) => attempt(q.qid, NOW + i * 1000, false));

    const masteries = conceptMastery(attempts, contentPack, cfg);
    const rw = masteries.find((m) => m.concept === "right-of-way");
    expect(rw).toBeDefined();
    expect(rw!.state).toBe("needs-attention");
    expect(rw!.mastery).toBeLessThan(0.6);
  });
});

// ---------------------------------------------------------------------------
// Test 6: fragile knowledge — correct + unsure vs correct + sure
// ---------------------------------------------------------------------------
describe("Test 6: fragile knowledge", () => {
  it("correct+unsure can be distinguished from correct+sure in mastery stats", () => {
    const qs = pick(
      contentPack.questions.filter((q) => q.concept === "right-of-way" && q.status === "answered"),
      4,
    );

    const attemptsA = [
      attempt(qs[0].qid, NOW - 3000, true, "sure"),
      attempt(qs[1].qid, NOW - 2000, true, "sure"),
    ];
    const attemptsB = [
      attempt(qs[2].qid, NOW - 1000, true, "unsure"),
      attempt(qs[3].qid, NOW, true, "unsure"),
    ];

    const masteriesA = conceptMastery(attemptsA, contentPack, cfg);
    const masteriesB = conceptMastery(attemptsB, contentPack, cfg);
    const rwA = masteriesA.find((m) => m.concept === "right-of-way");
    const rwB = masteriesB.find((m) => m.concept === "right-of-way");

    expect(rwA).toBeDefined();
    expect(rwB).toBeDefined();
    expect(rwA!.accuracy).toBe(1);
    expect(rwB!.accuracy).toBe(1);
    // Same evidence count → same confidence score
    expect(rwA!.stat.confidence).toBe(rwB!.stat.confidence);
  });
});

// ---------------------------------------------------------------------------
// Test 7: misconception signal — incorrect + confident vs incorrect + unsure
// ---------------------------------------------------------------------------
describe("Test 7: misconception signal", () => {
  it("incorrect+confident and incorrect+unsure are both recorded in attempts", () => {
    const qs = pick(
      contentPack.questions.filter((q) => q.concept === "right-of-way" && q.status === "answered"),
      4,
    );

    const attempts = [
      attempt(qs[0].qid, NOW - 3000, false, "sure"),
      attempt(qs[1].qid, NOW - 2000, false, "unsure"),
      attempt(qs[2].qid, NOW - 1000, true, "sure"),
      attempt(qs[3].qid, NOW, true, "unsure"),
    ];

    const evidence = enrichEvidence(attempts, contentPack);
    const rwEvidence = evidence.filter((e) => e.concept === "right-of-way");
    expect(rwEvidence.length).toBe(4);

    const confidentWrong = rwEvidence.filter((e) => !e.isCorrect && e.confidence === "sure");
    const unsureWrong = rwEvidence.filter((e) => !e.isCorrect && e.confidence === "unsure");
    expect(confidentWrong.length).toBe(1);
    expect(unsureWrong.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test 8: concept recovery — weak concept → recovery candidates
// ---------------------------------------------------------------------------
describe("Test 8: concept recovery", () => {
  it("recovery candidates are drawn from the specified concept", () => {
    const candidates = conceptRecoveryCandidates("right-of-way", contentPack);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.concept).toBe("right-of-way");
      expect(c.familyId).toBeDefined();
      expect(c.topicId).toBe("junction-rules");
    }
  });

  it("recovery candidates exclude families in the exclude set", () => {
    const allCandidates = conceptRecoveryCandidates("right-of-way", contentPack);
    expect(allCandidates.length).toBeGreaterThan(0);

    const excludeFamily = allCandidates[0]!.familyId;
    const filtered = conceptRecoveryCandidates(
      "right-of-way",
      contentPack,
      new Set([excludeFamily]),
    );

    expect(filtered.length).toBeLessThan(allCandidates.length);
    for (const c of filtered) {
      expect(c.familyId).not.toBe(excludeFamily);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 9: family deduplication — same family not repeated
// ---------------------------------------------------------------------------
describe("Test 9: family deduplication in concept recovery", () => {
  it("recovery session never contains two questions from the same family", () => {
    for (const concept of ["right-of-way", "sign-recognition", "roadcraft"]) {
      const candidates = conceptRecoveryCandidates(concept, contentPack);
      const families = candidates.map((c) => c.familyId);
      expect(new Set(families).size).toBe(families.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 10: cross-session reuse — family used in session 1 can appear in session 2
// ---------------------------------------------------------------------------
describe("Test 10: cross-session reuse", () => {
  it("family used in one recovery call can appear in another", () => {
    const candidates1 = conceptRecoveryCandidates("right-of-way", contentPack);
    expect(candidates1.length).toBeGreaterThan(0);

    const usedFamilies = new Set(candidates1.slice(0, 3).map((c) => c.familyId));
    const candidates2 = conceptRecoveryCandidates(
      "right-of-way",
      contentPack,
      usedFamilies,
    );

    expect(candidates2.length).toBeGreaterThan(0);
    for (const c of candidates2) {
      expect(usedFamilies.has(c.familyId)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 11: mistake clustering
// ---------------------------------------------------------------------------
describe("Test 11: mistake clustering", () => {
  it("multiple mistakes from different questions aggregate by concept", () => {
    const rwQs = pick(
      contentPack.questions.filter((q) => q.concept === "right-of-way" && q.status === "answered"),
      3,
    );
    const srQs = pick(
      contentPack.questions.filter((q) => q.concept === "sign-recognition" && q.status === "answered"),
      2,
    );

    const attempts = [
      attempt(rwQs[0].qid, NOW - 5000, false),
      attempt(rwQs[1].qid, NOW - 4000, false),
      attempt(rwQs[2].qid, NOW - 3000, false),
      attempt(srQs[0].qid, NOW - 2000, false),
      attempt(srQs[1].qid, NOW - 1000, false),
      attempt(rwQs[0].qid, NOW, true),
    ];

    const clusters = mistakeClusters(attempts, contentPack);
    expect(clusters.length).toBe(2);

    const rwCluster = clusters.find((c) => c.concept === "right-of-way");
    expect(rwCluster).toBeDefined();
    expect(rwCluster!.count).toBe(3);

    const srCluster = clusters.find((c) => c.concept === "sign-recognition");
    expect(srCluster).toBeDefined();
    expect(srCluster!.count).toBe(2);

    for (const cluster of clusters) {
      const correctMistakes = cluster.mistakes.filter((m) => m.isCorrect);
      expect(correctMistakes.length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 12: post-mock diagnosis
// ---------------------------------------------------------------------------
describe("Test 12: post-mock diagnosis", () => {
  it("mock mistakes aggregate correctly by concept", () => {
    const rwQs = pick(
      contentPack.questions.filter((q) => q.concept === "right-of-way" && q.status === "answered"),
      3,
    );
    const srQs = pick(
      contentPack.questions.filter((q) => q.concept === "sign-recognition" && q.status === "answered"),
      3,
    );

    const mockAttempts = [
      attempt(rwQs[0].qid, NOW - 6000, true, "sure", "mock"),
      attempt(rwQs[1].qid, NOW - 5000, true, "sure", "mock"),
      attempt(rwQs[2].qid, NOW - 4000, false, "sure", "mock"),
      attempt(srQs[0].qid, NOW - 3000, true, "sure", "mock"),
      attempt(srQs[1].qid, NOW - 2000, false, "sure", "mock"),
      attempt(srQs[2].qid, NOW - 1000, false, "sure", "mock"),
    ];

    const diagnoses = mockConceptDiagnosis(mockAttempts, contentPack);
    expect(diagnoses.length).toBe(2);

    const srDiag = diagnoses.find((d) => d.concept === "sign-recognition");
    expect(srDiag).toBeDefined();
    expect(srDiag!.total).toBe(3);
    expect(srDiag!.correct).toBe(1);
    expect(srDiag!.pct).toBe(33);
    expect(srDiag!.missed).toBe(true);

    const rwDiag = diagnoses.find((d) => d.concept === "right-of-way");
    expect(rwDiag).toBeDefined();
    expect(rwDiag!.total).toBe(3);
    expect(rwDiag!.correct).toBe(2);
    expect(rwDiag!.pct).toBe(67);
    expect(rwDiag!.missed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 13: offline — concept calculations work without network
// ---------------------------------------------------------------------------
describe("Test 13: offline operation", () => {
  it("all concept calculations use only local data (no network required)", () => {
    const attempts = contentPack.questions.slice(0, 10).map((q, i) =>
      attempt(q.qid, NOW + i * 1000, i % 3 !== 0),
    );

    const evidence = enrichEvidence(attempts, contentPack);
    expect(evidence.length).toBe(10);

    const masteries = conceptMastery(attempts, contentPack, cfg);
    expect(masteries.length).toBeGreaterThan(0);

    const weaknesses = detectConceptWeakness(attempts, contentPack, cfg);
    expect(Array.isArray(weaknesses)).toBe(true);

    const recovery = conceptRecoveryCandidates("right-of-way", contentPack);
    expect(recovery.length).toBeGreaterThan(0);

    const clusters = mistakeClusters(attempts, contentPack);
    expect(Array.isArray(clusters)).toBe(true);

    const diagnosis = mockConceptDiagnosis(attempts, contentPack);
    expect(Array.isArray(diagnosis)).toBe(true);

    const breakdown = conceptReadinessBreakdown(attempts, contentPack, cfg);
    expect(breakdown).toHaveProperty("strong");
    expect(breakdown).toHaveProperty("developing");
    expect(breakdown).toHaveProperty("weak");
    expect(breakdown).toHaveProperty("unknown");
  });
});

// ---------------------------------------------------------------------------
// Test 14: existing regression — content integrity preserved
// ---------------------------------------------------------------------------
describe("Test 14: existing regression", () => {
  it("content pack integrity is preserved (no mutation from concept intelligence)", () => {
    const originalQuestionCount = contentPack.questions.length;
    const originalTopicCount = contentPack.topics.length;

    const qids = contentPack.questions.slice(0, 20).map((q) => q.qid);
    const attempts = qids.map((qid, i) => attempt(qid, NOW + i * 1000, i % 2 === 0));

    enrichEvidence(attempts, contentPack);
    conceptMastery(attempts, contentPack, cfg);
    detectConceptWeakness(attempts, contentPack, cfg);
    mistakeClusters(attempts, contentPack);
    mockConceptDiagnosis(attempts, contentPack);
    conceptReadinessBreakdown(attempts, contentPack, cfg);

    expect(contentPack.questions.length).toBe(originalQuestionCount);
    expect(contentPack.topics.length).toBe(originalTopicCount);

    for (const q of contentPack.questions) {
      expect(typeof q.qid).toBe("string");
      expect(typeof q.stem).toBe("string");
      expect(Array.isArray(q.options)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Concept catalog tests
// ---------------------------------------------------------------------------
describe("Concept catalog", () => {
  it("derives 28 unique concepts from the content pack", () => {
    const concepts = allConcepts(contentPack);
    expect(concepts.length).toBe(28);
  });

  it("concept catalog has correct question and family counts", () => {
    const catalog = conceptCatalog(contentPack);
    expect(catalog.length).toBeGreaterThan(0);

    const totalQuestions = catalog.reduce((sum, c) => sum + c.questionCount, 0);
    const questionsWithConcept = contentPack.questions.filter((q) => q.concept != null).length;
    expect(totalQuestions).toBe(questionsWithConcept);

    for (const entry of catalog) {
      expect(entry.familyCount).toBeGreaterThan(0);
    }
  });

  it("conceptsForTopic returns only concepts from the specified topic", () => {
    const junctionConcepts = conceptsForTopic(contentPack, "junction-rules");
    expect(junctionConcepts.length).toBeGreaterThan(0);
    for (const c of junctionConcepts) {
      expect(c.topicId).toBe("junction-rules");
    }
  });
});

// ---------------------------------------------------------------------------
// Readiness breakdown
// ---------------------------------------------------------------------------
describe("Concept readiness breakdown", () => {
  it("categorizes concepts into strong/developing/weak/unknown", () => {
    const srQs = pick(
      contentPack.questions.filter((q) => q.concept === "sign-recognition" && q.status === "answered"),
      6,
    );
    const rwQs = pick(
      contentPack.questions.filter((q) => q.concept === "right-of-way" && q.status === "answered"),
      6,
    );

    const attempts = [
      ...srQs.map((q: any, i: number) => attempt(q.qid, NOW + i * 1000, true, "sure")),
      ...rwQs.map((q: any, i: number) => attempt(q.qid, NOW + 6000 + i * 1000, false, "sure")),
    ];

    const breakdown = conceptReadinessBreakdown(attempts, contentPack, cfg);

    const srInStrong = breakdown.strong.find((c) => c.concept === "sign-recognition");
    expect(srInStrong).toBeDefined();

    const rwInWeak = breakdown.weak.find((c) => c.concept === "right-of-way");
    expect(rwInWeak).toBeDefined();

    expect(breakdown.unknown.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Weakness detection
// ---------------------------------------------------------------------------
describe("Concept weakness detection", () => {
  it("identifies concept weaknesses with correct kind", () => {
    const qs = pick(
      contentPack.questions.filter((q) => q.concept === "right-of-way" && q.status === "answered"),
      6,
    );

    const attempts = [
      attempt(qs[0].qid, NOW - 10000, true),
      attempt(qs[1].qid, NOW - 9000, true),
      attempt(qs[2].qid, NOW - 3000, false),
      attempt(qs[3].qid, NOW - 2000, false),
      attempt(qs[4].qid, NOW - 1000, false),
      attempt(qs[5].qid, NOW, false),
    ];

    const weaknesses = detectConceptWeakness(attempts, contentPack, cfg);
    const rwWeakness = weaknesses.find((w) => w.concept === "right-of-way");

    expect(rwWeakness).toBeDefined();
    expect(["recurring", "deteriorating", "early"]).toContain(rwWeakness!.kind);
    expect(rwWeakness!.reasons.length).toBeGreaterThan(0);
  });

  it("does NOT flag unknown concepts as weaknesses", () => {
    const weaknesses = detectConceptWeakness([], contentPack, cfg);
    expect(weaknesses.length).toBe(0);
  });
});
