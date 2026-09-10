import { describe, it, expect } from "vitest";
import type { AttemptEvent } from "@zivvvo/assessment-engine";
import type { Topic } from "@zivvvo/content";
import { contentPack } from "@zivvvo/content";
import { learnPath, type LearnerState } from "./learnPath";

const contentTopics: Topic[] = contentPack.topics.filter((t): t is Topic => t.kind === "content");
const topic0: Topic = contentTopics[0]!;
const topic1: Topic = contentTopics[1]!;
const qids = (topicId: string): string[] =>
  contentPack.questions.filter((q) => q.topicId === topicId && q.status === "answered").map((q) => q.qid);

const att = (topicId: string, idx: number, correct: boolean, ts: number): AttemptEvent => ({
  id: `a-${topicId}-${idx}-${correct}-${ts}`,
  learnerId: "learner-1",
  qid: qids(topicId)[idx % qids(topicId).length]!,
  sessionId: null,
  mode: "smart",
  selected: [0],
  isCorrect: correct,
  confidence: correct ? "sure" : "guess",
  durationMs: 1500,
  ts,
  syncedAt: Date.now(),
});

const emptyState = (): LearnerState => ({
  learnerId: "learner-1",
  diagnosticCompleted: false,
  attempts: [],
  reviews: [],
});

describe("learnPath", () => {
  it("returns all content topics in pack order when there is no evidence", () => {
    const path = learnPath(emptyState(), Date.now());
    expect(path.entries.map((e) => e.topicId)).toEqual(contentTopics.map((t) => t.id));
    expect(path.entries.every((e) => e.status.label === "fresh")).toBe(true);
    expect(path.focusTopicId).toBeNull();
  });

  it("ranks a struggling topic first as focus", () => {
    const now = Date.now();
    const attempts = qids(topic0.id).slice(0, 6).map((_qid, i) => att(topic0.id, i, false, now - 3 * 86_400_000));
    const state1 = { ...emptyState(), diagnosticCompleted: true, lastMockAt: now - 2 * 86_400_000, attempts };
    const path = learnPath(state1, now);
    expect(path.entries[0]!.topicId).toBe(topic0.id);
    expect(path.entries[0]!.status.label).toBe("focus");
    expect(path.entries[0]!.status.tone).toBe("bad");
    expect(path.focusTopicId).toBe(topic0.id);
  });

  it("places a strong topic below weak and fresh", () => {
    const now = Date.now();
    const weakAtts = qids(topic0.id).slice(0, 6).map((_qid, i) => att(topic0.id, i, false, now - 3 * 86_400_000));
    const strongAtts = qids(topic1.id).slice(0, 6).map((_qid, i) => att(topic1.id, i, true, now - 3 * 86_400_000));
    const path = learnPath({ ...emptyState(), attempts: [...weakAtts, ...strongAtts] }, now);
    const ids = path.entries.map((e) => e.topicId);
    expect(ids.indexOf(topic0.id)).toBeLessThan(ids.indexOf(topic1.id));
  });

  it("two weak topics sort by mastery ascending (worst first)", () => {
    const now = Date.now();
    const atts0 = qids(topic0.id).slice(0, 8).map((_qid, i) => att(topic0.id, i, false, now - 5 * 86_400_000 + i * 86_400_000));
    const atts1 = qids(topic1.id).slice(0, 8).map((_qid, i) => att(topic1.id, i, i < 4 ? false : true, now - 5 * 86_400_000 + i * 86_400_000));
    const path = learnPath({ ...emptyState(), diagnosticCompleted: true, lastMockAt: now - 2 * 86_400_000, attempts: [...atts0, ...atts1] }, now);
    expect(path.entries[0]!.topicId).toBe(topic0.id);
    expect(path.entries[1]!.topicId).toBe(topic1.id);
  });

  it("reasons reflect the learner's actual state", () => {
    const now = Date.now();
    const attempts = qids(topic0.id).slice(0, 6).map((_qid, i) => att(topic0.id, i, false, now - 3 * 86_400_000));
    const path = learnPath({ ...emptyState(), attempts }, now);
    const entry = path.entries.find((e) => e.topicId === topic0.id)!;
    expect(entry.reason).toMatch(/sitting at \d+%/);
    expect(path.why).toContain("your own attempt history");
  });

  it("long-unreviewed topic gets a stale-flavour reason", () => {
    const now = Date.now();
    const attempts = qids(topic0.id).slice(0, 6).map((_qid, i) => att(topic0.id, i, false, now - 40 * 86_400_000 + i * 86_400_000));
    const path = learnPath({ ...emptyState(), diagnosticCompleted: true, lastMockAt: now - 2 * 86_400_000, attempts }, now);
    const entry = path.entries.find((e) => e.topicId === topic0.id)!;
    expect(entry.status.label).toBe("focus");
    expect(entry.reason).toMatch(/14\+ days/);
  });

  it("leader aligns with the engine's recommendation for the same state", () => {
    const now = Date.now();
    const allQids0 = qids(topic0.id);
    const allQids1 = qids(topic1.id);
    const attempts = [
      ...allQids1.map((_qid, i) => att(topic1.id, i, true, now - 3 * 86_400_000)),
      ...allQids0.slice(0, 6).map((_qid, i) => att(topic0.id, i, false, now - 3 * 86_400_000)),
    ];
    const state: LearnerState = { ...emptyState(), diagnosticCompleted: true, attempts, reviews: [], lastMockAt: now - 2 * 86_400_000 };
    const path = learnPath(state, now);
    expect(path.focusTopicId).toBe(topic0.id);
    expect(path.entries[0]!.topicId).toBe(topic0.id);
  });
});
