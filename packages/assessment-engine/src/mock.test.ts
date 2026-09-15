import { describe, it, expect } from "vitest";
import { defaultConfig } from "@zivvvo/learning-engine";
import { contentPack } from "@zivvvo/content";
import { buildMockSession, buildDynamicMock, topicWeights, type SessionGenContext } from "./sessions";
import { mockScore, mockReview, ZVID_MOCK_DEFAULT } from "./mock";
import { simplePack, q } from "./test/fixtures";
import type { AttemptEvent } from "./types";

const cfg = defaultConfig;
const NOW = 1_500_000_000_000;

function ctx(over: Partial<SessionGenContext> = {}): SessionGenContext {
  return { pack: simplePack(), attempts: [], seed: 42, now: NOW, learnerId: "l1", ...over };
}

function attempt(qid: string, isCorrect: boolean): AttemptEvent {
  return { id: `a-${qid}`, learnerId: "l1", qid, sessionId: "mock_1", mode: "mock", selected: [0], isCorrect, confidence: "sure", durationMs: 1500, ts: NOW, syncedAt: null };
}

describe("buildMockSession", () => {
  it("produces a blueprinted mock session, deterministic for a seed", () => {
    const a = buildMockSession(ctx(), cfg, { ...ZVID_MOCK_DEFAULT, questionCount: 10 });
    const b = buildMockSession(ctx(), cfg, { ...ZVID_MOCK_DEFAULT, questionCount: 10 });
    expect(a.session.type).toBe("mock");
    expect(a.mode).toBe("mock");
    expect(a.session.questions.map((q) => q.qid)).toEqual(b.session.questions.map((q) => q.qid));
    expect(a.session.questions.length).toBe(10);
    expect(a.session.estimatedMinutes).toBe(ZVID_MOCK_DEFAULT.durationMin);
    expect(a.session.learnerId).toBe("l1");
  });

  it("samples only answered, keyed, content-topic questions", () => {
    const pack = simplePack();
    const r = buildMockSession(ctx({ pack }), cfg, { ...ZVID_MOCK_DEFAULT, questionCount: 10 });
    for (const q of r.session.questions) {
      expect(pack.questions.find((x) => x.qid === q.qid)?.status).toBe("answered");
      expect(q.correctIndexes.length).toBeGreaterThan(0);
      expect(q.topicId).not.toBe("confusing-pair");
    }
  });

  it("covers both content topics in the small fixture pack", () => {
    const r = buildMockSession(ctx(), cfg, { ...ZVID_MOCK_DEFAULT, questionCount: 10 });
    const topics = new Set(r.session.questions.map((q) => q.topicId));
    expect(topics.has("road-signs")).toBe(true);
    expect(topics.has("junction-rules")).toBe(true);
  });

  it("spans the real syllabus with the full default blueprint", () => {
    const r = buildMockSession({ pack: contentPack, attempts: [], seed: 7, now: NOW, learnerId: "l1" }, cfg, ZVID_MOCK_DEFAULT);
    expect(r.session.questions.length).toBe(30);
    const topics = new Set(r.session.questions.map((q) => q.topicId));
    expect(topics.size).toBeGreaterThanOrEqual(5);
    for (const t of topics) {
      expect(contentPack.topics.find((x) => x.id === t)?.kind).toBe("content");
    }
  });

  it("asks for full exam duration, not a per-minute estimate", () => {
    const r = buildMockSession(ctx(), cfg, { questionCount: 6, durationMin: 25, passMark: 0.6, topicMix: "balanced" });
    expect(r.session.estimatedMinutes).toBe(25);
  });
});

describe("buildDynamicMock", () => {
  const base = { questionCount: 6, durationMin: 20, passMark: 0.6, topicMix: "balanced" as const };

  it("standard is balanced and deterministic", () => {
    const a = buildDynamicMock(ctx(), cfg, { ...base, mode: "standard" });
    const b = buildDynamicMock(ctx(), cfg, { ...base, mode: "standard" });
    expect(a.session.questions.map((x) => x.qid)).toEqual(b.session.questions.map((x) => x.qid));
    const topics = a.session.questions.map((x) => x.topicId);
    expect(topics.filter((t) => t === "road-signs").length).toBeGreaterThan(0);
    expect(topics.filter((t) => t === "junction-rules").length).toBeGreaterThan(0);
    expect(a.session.estimatedMinutes).toBe(20);
  });

  it("explicit weights steer topic allocation", () => {
    const r = buildDynamicMock(ctx(), cfg, { ...base, mode: "standard", weights: { "junction-rules": 2, "road-signs": 1 } });
    const junction = r.session.questions.filter((x) => x.topicId === "junction-rules").length;
    const road = r.session.questions.filter((x) => x.topicId === "road-signs").length;
    expect(junction).toBeGreaterThan(road);
  });

  it("personalized emphasizes the weak topic", () => {
    const allCorrectRoad = Array.from({ length: 6 }, (_, i) => ({ ...attempt(`road-${"abcdef"[i]}`, true) }));
    const allWrongJunction = Array.from({ length: 6 }, (_, i) => ({ ...attempt(`ju-${"abcdef"[i]}`, false) }));
    const weakCtx = ctx({ attempts: [...allCorrectRoad, ...allWrongJunction] });
    const weights = topicWeights("personalized", weakCtx, weakCtx.pack, cfg, ["road-signs", "junction-rules"]);
    expect(weights["junction-rules"]!).toBeGreaterThan(weights["road-signs"]!);
    const r = buildDynamicMock(weakCtx, cfg, { ...base, mode: "personalized" });
    const junction = r.session.questions.filter((x) => x.topicId === "junction-rules").length;
    const road = r.session.questions.filter((x) => x.topicId === "road-signs").length;
    expect(junction).toBeGreaterThanOrEqual(road);
  });

  it("nightmare uses hard-tier questions first, topped up from standard", () => {
    const r = buildDynamicMock(ctx(), cfg, { ...base, mode: "nightmare" });
    expect(r.session.questions.length).toBe(6);
    const tiers = r.session.questions.map((x) => x.difficulty ?? "standard");
    const hardCount = tiers.filter((t) => t === "hard").length;
    expect(hardCount).toBeGreaterThan(0);
    for (const question of r.session.questions) {
      expect(question.status).toBe("answered");
    }
  });
});

describe("mockReview", () => {
  it("builds per-topic bars and flags the biggest risk", () => {
    const pack = simplePack();
    const attempts = [
      attempt("road-a", true), attempt("road-b", false), attempt("road-c", false), attempt("road-d", false),
      attempt("ju-a", true), attempt("ju-b", true), attempt("ju-c", false), attempt("ju-d", false),
    ];
    const r = mockReview(attempts, pack, 0.6);
    expect(r.total).toBe(8);
    expect(r.correct).toBe(3);
    expect(r.passed).toBe(false);
    const road = r.perTopic.find((t) => t.topicId === "road-signs");
    expect(road?.pct).toBe(25);
    expect(r.biggestRisk?.topicId).toBe("road-signs");
    expect(r.biggestRisk?.missed).toBe(3);
    expect(r.biggestRisk?.message).toContain("3 questions");
  });

  it("collects the codified concepts behind the risk", () => {
    const pack = simplePack({
      questions: [
        q({ qid: "g1", topicId: "junction-rules", concept: "give-way", options: ["A", "B"], correct: [0] }),
        q({ qid: "g2", topicId: "junction-rules", concept: "give-way", options: ["A", "B"], correct: [0] }),
      ],
    });
    const attempts = [attempt("g1", false), attempt("g2", false)];
    const r = mockReview(attempts, pack);
    expect(r.biggestRisk?.concepts).toEqual(["give-way"]);
  });

  it("reports no risk when nothing is missed", () => {
    const pack = simplePack();
    const attempts = [attempt("road-a", true), attempt("ju-a", true)];
    const r = mockReview(attempts, pack);
    expect(r.biggestRisk).toBeNull();
  });
});

describe("mockScore", () => {
  it("passes at or above the pass mark", () => {
    const mock = { ...ZVID_MOCK_DEFAULT, questionCount: 30 };
    const attempts = [
      ...Array.from({ length: 27 }, (_, i) => attempt(`q${i}`, true)),
      ...Array.from({ length: 3 }, (_, i) => attempt(`x${i}`, false)),
    ];
    const s = mockScore(attempts, mock);
    expect(s.total).toBe(30);
    expect(s.correct).toBe(27);
    expect(s.score).toBeCloseTo(0.9);
    expect(s.passed).toBe(true);
  });

  it("fails below the pass mark", () => {
    const mock = { ...ZVID_MOCK_DEFAULT, questionCount: 30 };
    const attempts = [
      ...Array.from({ length: 17 }, (_, i) => attempt(`q${i}`, true)),
      ...Array.from({ length: 13 }, (_, i) => attempt(`x${i}`, false)),
    ];
    const s = mockScore(attempts, mock);
    expect(s.score).toBeCloseTo(17 / 30);
    expect(s.passed).toBe(false);
  });

  it("handles an empty run without NaN", () => {
    const s = mockScore([], ZVID_MOCK_DEFAULT);
    expect(s.score).toBe(0);
    expect(s.passed).toBe(false);
  });
});