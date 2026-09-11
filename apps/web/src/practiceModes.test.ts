import { describe, it, expect } from "vitest";
import type { AttemptEvent } from "@zivvvo/assessment-engine";
import type { ReviewState } from "@zivvvo/learning-engine";
import { contentPack, type Topic } from "@zivvvo/content";
import {
  topWeakness,
  dueReviewCount,
  recentMisses,
  smartSession,
  weaknessSession,
  dueReviewSession,
  mistakeReviewSession,
} from "./engine";

const contentTopics: Topic[] = contentPack.topics.filter((t): t is Topic => t.kind === "content");
const topic0: Topic = contentTopics[0]!;
const topic1: Topic = contentTopics[1]!;
const qids = (topicId: string): string[] =>
  contentPack.questions
    .filter((q) => q.topicId === topicId && q.status === "answered")
    .map((q) => q.qid);

const att = (qid: string, correct: boolean, ts: number): AttemptEvent => ({
  id: `a-${qid}-${correct}-${ts}`,
  learnerId: "learner-1",
  qid,
  sessionId: null,
  mode: "smart",
  selected: [0],
  isCorrect: correct,
  confidence: correct ? "sure" : "guess",
  durationMs: 1500,
  ts,
  syncedAt: Date.now(),
});

const review = (qid: string, next: number): ReviewState => ({
  qid,
  learnerId: "learner-1",
  stage: 1,
  last: next - 86_400_000,
  next,
  lapseCount: 0,
});

describe("recentMisses", () => {
  const q0 = qids(topic0.id)[0]!;
  const q1 = qids(topic0.id)[1]!;

  it("returns qids whose most recent answer was wrong, most recent first", () => {
    const now = Date.now();
    const out = recentMisses([
      att(q0, true, now - 4000),
      att(q1, false, now - 3000),
      att(q0, false, now - 2000),
      att(q1, true, now - 1000),
    ]);
    expect(out).toEqual([q0]);
  });

  it("dedupes repeated misses and drops questions whose latest answer was right", () => {
    const now = Date.now();
    const out = recentMisses([
      att(q1, false, now - 8000),
      att(q0, false, now - 2000),
      att(q0, true, now - 1000),
      att(q1, false, now - 500),
    ]);
    expect(out).toEqual([q1]);
  });
});

describe("topWeakness", () => {
  it("returns the weakest flagged topic, or null with insufficient evidence", () => {
    expect(topWeakness([])).toBeNull();
    const now = Date.now();
    const oneMiss = [att(qids(topic0.id)[0]!, false, now - 86_400_000)];
    expect(topWeakness(oneMiss)).toBeNull();
  });

  it("ranks the weakest of two weak topics first", () => {
    const now = Date.now();
    const worse = qids(topic0.id).slice(0, 6).map((q, i) => att(q, i % 2 === 0, now - 5 * 86_400_000));
    const lessWorse = qids(topic1.id).slice(0, 6).map((q, i) => att(q, i % 2 === 1, now - 5 * 86_400_000));
    const out = topWeakness([...lessWorse, ...worse]);
    expect(out).not.toBeNull();
    expect(out!.topic.id).toBe(topic0.id);
  });
});

describe("dueReviewCount", () => {
  it("counts only reviews whose next time has passed", () => {
    const now = Date.now();
    const reviews = [review(qids(topic0.id)[0]!, now - 1000), review(qids(topic0.id)[1]!, now + 86_400_000)];
    expect(dueReviewCount(reviews, now)).toBe(1);
  });
});

describe("dueReviewSession", () => {
  it("returns null when nothing is due", () => {
    const now = Date.now();
    const session = dueReviewSession([], [review(qids(topic0.id)[0]!, now + 86_400_000)], "learner-1");
    expect(session).toBeNull();
  });

  it("builds a review session over only the due cards", () => {
    const now = Date.now();
    const dueQ = qids(topic0.id)[0]!;
    const futureQ = qids(topic0.id)[1]!;
    const session = dueReviewSession([], [review(dueQ, now - 1000), review(futureQ, now + 86_400_000)], "learner-1");
    expect(session).not.toBeNull();
    expect(session!.session.type).toBe("review");
    expect(session!.session.questions.map((q) => q.qid)).toContain(dueQ);
    expect(session!.session.questions.map((q) => q.qid)).not.toContain(futureQ);
  });
});

describe("mistakeReviewSession", () => {
  it("returns null when the record is clean", () => {
    const now = Date.now();
    const clean = [att(qids(topic0.id)[0]!, true, now - 86_400_000)];
    expect(mistakeReviewSession(clean, "learner-1")).toBeNull();
  });

  it("restates recent misses as variants of the same base questions", () => {
    const now = Date.now();
    const missed = qids(topic0.id).slice(0, 3).map((q, i) => att(q, false, now - i * 60_000));
    const session = mistakeReviewSession(missed, "learner-1");
    expect(session).not.toBeNull();
    expect(session!.session.type).toBe("mistake-review");
    const bases = qids(topic0.id).slice(0, 3);
    for (const q of session!.session.questions) {
      const variant = (q as { variant?: { of: string } }).variant;
      expect(variant).toBeDefined();
      expect(bases).toContain(variant!.of);
    }
  });
});

describe("smart & weakness sessions", () => {
  it("builds a general mixed smart session", () => {
    const session = smartSession([], "learner-1");
    expect(session.session.type).toBe("smart");
    expect(session.session.questions.length).toBeGreaterThan(0);
  });

  it("builds a recovery session scoped to the requested topic", () => {
    const session = weaknessSession(topic0.id, [], "learner-1");
    expect(session.session.type).toBe("recovery");
    expect(session.session.title).toContain(topic0.label.replace(/ & /g, " "));
    expect(session.session.questions.every((q) => q.topicId === topic0.id)).toBe(true);
  });
});