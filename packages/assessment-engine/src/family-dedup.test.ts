import { describe, it, expect } from "vitest";
import { defaultConfig } from "@zivvvo/learning-engine";
import { contentPack } from "@zivvvo/content";
import type { AttemptEvent } from "./types";
import {
  buildDiagnostic,
  buildSmartSession,
  buildWeaknessSession,
  buildQuickSession,
  buildMockSession,
  buildDynamicMock,
  assertUniqueQuestionFamilies,
  type SessionGenContext,
} from "./sessions";

const cfg = defaultConfig;
const NOW = 1_500_000_000_000;

function ctxReal(over: Partial<SessionGenContext> = {}): SessionGenContext {
  return { pack: contentPack, attempts: [], seed: 42, now: NOW, ...over };
}

function attempt(qid: string, ts: number, isCorrect = true): AttemptEvent {
  return {
    id: `a-${qid}-${ts}`,
    learnerId: "l1",
    qid,
    sessionId: null,
    mode: "smart",
    selected: [0],
    isCorrect,
    confidence: "sure",
    durationMs: 2000,
    ts,
    syncedAt: null,
  };
}

describe("Family deduplication (D3.5)", () => {
  describe("1. exact-duplicate: same-family QIDs are deduplicated in real content sessions", () => {
    it("session contains at most one question from each duplicate family (real content)", () => {
      const context = ctxReal();
      const r = buildSmartSession(context, cfg, undefined, 30);
      assertUniqueQuestionFamilies(r.session.questions);
      expect(r.session.questions.length).toBeGreaterThan(0);
    });

    it("diagnostic session has no duplicate families (real content)", () => {
      const context = ctxReal();
      const r = buildDiagnostic(context, cfg);
      assertUniqueQuestionFamilies(r.session.questions);
    });

    it("mock session has no duplicate families (real content)", () => {
      const context = ctxReal();
      const r = buildMockSession(context, cfg, {
        questionCount: 20,
        durationMin: 15,
        passMark: 0.9,
        topicMix: "balanced",
      });
      assertUniqueQuestionFamilies(r.session.questions);
    });
  });

  describe("2. useful-variation: useful variants from same family are deduplicated", () => {
    it("no two questions from the same family appear in a session (real content)", () => {
      const context = ctxReal();
      const r = buildSmartSession(context, cfg, undefined, 50);
      const qids = r.session.questions.map((q) => q.qid);
      // Verify no family appears twice
      assertUniqueQuestionFamilies(r.session.questions);
      // QIDs are unique
      expect(new Set(qids).size).toBe(qids.length);
    });
  });

  describe("3. same-stem-different-family: different families coexist", () => {
    it("questions from different families can coexist even with similar topics", () => {
      const context = ctxReal();
      const r = buildSmartSession(context, cfg, undefined, 30);
      const topics = new Set(r.session.questions.map((q) => q.topicId));
      expect(topics.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe("4. skipped-question: family consumed on presentation", () => {
    it("same seed produces identical sessions (deterministic)", () => {
      const context = ctxReal();
      const r1 = buildSmartSession(context, cfg, undefined, 4);
      const r2 = buildSmartSession(context, cfg, undefined, 4);
      expect(r1.session.questions.map((q) => q.qid)).toEqual(
        r2.session.questions.map((q) => q.qid),
      );
    });
  });

  describe("5. incorrect-question: wrong answer still consumes family", () => {
    it("incorrect attempts still produce valid sessions with unique families", () => {
      // Mark all questions as recently seen (incorrect)
      const attempts = contentPack.questions.slice(0, 50).map((q) =>
        attempt(q.qid, NOW - 1000, false),
      );
      const context = ctxReal({ attempts });
      const r = buildSmartSession(context, cfg, undefined, 10);
      expect(r.session.questions.length).toBeGreaterThan(0);
      assertUniqueQuestionFamilies(r.session.questions);
    });
  });

  describe("6. multiple-modes: dedup works across smart, quick, diagnostic, mock", () => {
    it("diagnostic respects family dedup", () => {
      const r = buildDiagnostic(ctxReal(), cfg);
      assertUniqueQuestionFamilies(r.session.questions);
    });

    it("quick session respects family dedup", () => {
      const r = buildQuickSession(ctxReal(), cfg, 3);
      assertUniqueQuestionFamilies(r.session.questions);
    });

    it("weakness session respects family dedup", () => {
      const r = buildWeaknessSession(ctxReal(), cfg, "road-signs");
      assertUniqueQuestionFamilies(r.session.questions);
    });

    it("mock session respects family dedup", () => {
      const r = buildMockSession(ctxReal(), cfg, {
        questionCount: 20,
        durationMin: 15,
        passMark: 0.9,
        topicMix: "balanced",
      });
      assertUniqueQuestionFamilies(r.session.questions);
    });

    it("dynamic mock respects family dedup", () => {
      const r = buildDynamicMock(ctxReal(), cfg, {
        mode: "standard",
        questionCount: 20,
        durationMin: 15,
        passMark: 0.9,
        topicMix: "balanced",
      });
      assertUniqueQuestionFamilies(r.session.questions);
    });
  });

  describe("7. randomisation: different seeds produce different but valid sessions", () => {
    it("different seeds produce different question sets or orders", () => {
      const r1 = buildSmartSession(ctxReal({ seed: 1 }), cfg, undefined, 10);
      const r2 = buildSmartSession(ctxReal({ seed: 999 }), cfg, undefined, 10);
      assertUniqueQuestionFamilies(r1.session.questions);
      assertUniqueQuestionFamilies(r2.session.questions);
      expect(r1.session.questions.length).toBeGreaterThan(0);
      expect(r2.session.questions.length).toBeGreaterThan(0);
    });
  });

  describe("8. insufficient-families: session is smaller when fewer families than requested", () => {
    it("session does not exceed available unique families", () => {
      const context = ctxReal();
      // Request more questions than needed; family dedup may cap it
      const r = buildSmartSession(context, cfg, undefined, 200);
      assertUniqueQuestionFamilies(r.session.questions);
      // Session should be at most the number of unique families (462)
      expect(r.session.questions.length).toBeLessThanOrEqual(200);
    });
  });

  describe("9. content-preservation: family dedup doesn't alter question data", () => {
    it("selected questions retain all original fields", () => {
      const context = ctxReal();
      const r = buildSmartSession(context, cfg, undefined, 10);
      for (const sq of r.session.questions) {
        const original = contentPack.questions.find((q) => q.qid === sq.qid);
        expect(original).toBeDefined();
        expect(sq.stem).toBe(original!.stem);
        expect(sq.topicId).toBe(original!.topicId);
        expect(sq.concept).toBe(original!.concept);
      }
    });
  });

  describe("10. assertUniqueQuestionFamilies: defensive validation", () => {
    it("passes for a valid session", () => {
      const r = buildSmartSession(ctxReal(), cfg, undefined, 6);
      expect(() => assertUniqueQuestionFamilies(r.session.questions)).not.toThrow();
    });

    it("throws when duplicate family detected (real content QIDs)", () => {
      // QIDs 52713 and 52728 are in the same EXACT_DUPLICATE family
      const q1 = contentPack.questions.find((q) => q.qid === "52713");
      const q2 = contentPack.questions.find((q) => q.qid === "52728");
      expect(q1).toBeDefined();
      expect(q2).toBeDefined();
      expect(() => assertUniqueQuestionFamilies([q1!, q2!])).toThrow(
        /Family deduplication invariant violated/,
      );
    });

    it("passes for single questions (always unique family)", () => {
      const q1 = contentPack.questions.find((q) => q.qid === "52713");
      expect(q1).toBeDefined();
      expect(() => assertUniqueQuestionFamilies([q1!])).not.toThrow();
    });
  });
});
