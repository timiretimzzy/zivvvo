import { describe, it, expect } from "vitest";
import content from "./data/content-v1.json";
import type { ContentPack } from "./types";

const pack = content as unknown as ContentPack;

/** Data contract: the generated content pack must stay internally consistent. */
describe("content pack (content-v1.json)", () => {
  it("matches the generator's published stats", () => {
    expect(pack.version).toBe(1);
    expect(pack.exam).toBe("zvid-provisional");
    expect(pack.questions.length).toBe(pack.stats.total);
    expect(pack.stats.total).toBe(1249);
    expect(pack.questions.filter((q) => q.status === "answered").length).toBe(980);
    expect(pack.questions.filter((q) => q.explanation).length).toBe(242);
    expect(pack.questions.filter((q) => q.imageRef).length).toBe(446);
  });

  it("answered is exactly keyed with >=2 options; non-answered carry zero keys", () => {
    for (const q of pack.questions) {
      const keyed = q.correctIndexes.length > 0;
      if (q.status === "answered") {
        expect(keyed).toBe(true);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
      } else {
        expect(keyed).toBe(false);
        expect(q.options.some((o) => o.isCorrect)).toBe(false);
      }
      for (const i of q.correctIndexes) {
        expect(q.options[i]?.isCorrect).toBe(true);
      }
    }
  });

  it("advertises asked-but-answered topics correctly", () => {
    const perTopic = new Map<string, number>();
    for (const t of pack.topics) perTopic.set(t.id, 0);
    for (const q of pack.questions) perTopic.set(q.topicId, (perTopic.get(q.topicId) ?? 0) + 1);
    for (const t of pack.topics) {
      expect(perTopic.get(t.id)).toBe(t.count);
    }
  });

  it("has 19 curated concepts and only valid topic ids", () => {
    expect(pack.concepts).toHaveLength(19);
    const topicIds = new Set(pack.topics.map((t) => t.id));
    for (const q of pack.questions) {
      expect(topicIds.has(q.topicId)).toBe(true);
    }
  });

  it("never ships a question with a stray correctIndex", () => {
    const bad = pack.questions.filter((q) => q.correctIndexes.some((i) => i < 0 || i >= q.options.length));
    expect(bad).toEqual([]);
  });

  it("every answered question has at least two options", () => {
    const bad = pack.questions.filter((q) => q.status === "answered" && q.options.length < 2);
    expect(bad).toEqual([]);
  });
});