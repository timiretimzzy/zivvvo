import contentV1 from "./data/content-v1.json";
import familyMapData from "./data/content-family-map.json";
import type { ContentPack, Question, Topic } from "./types";

export type * from "./types";
export { contentV1 };

export const contentPack = contentV1 as unknown as ContentPack;

/** Deterministic question family mapping (D3.5). */
export const familyMap = familyMapData as {
  version: string;
  totalQuestions: number;
  totalFamilies: number;
  map: Record<string, string>; // qid → familyId
};

/** Get the family ID for a question. Questions in the same family share a familyId. */
export function getFamilyId(qid: string): string {
  return familyMap.map[qid] ?? qid;
}

export function getTopic(pack: ContentPack, topicId: string): Topic | undefined {
  return pack.topics.find((t) => t.id === topicId);
}

export function questionsByTopic(pack: ContentPack, topicId: string): Question[] {
  return pack.questions.filter((q) => q.topicId === topicId);
}

export function questionsByConcept(pack: ContentPack, concept: string): Question[] {
  return pack.questions.filter((q) => q.concept === concept);
}

/** Questions safe to present in a session (verified correct answer exists). */
export function answerable(pack: ContentPack): Question[] {
  return pack.questions.filter((q) => q.status === "answered" && q.correctIndexes.length > 0);
}

// ---------------------------------------------------------------------------
// D4: Concept Intelligence — catalog helpers
// ---------------------------------------------------------------------------

/** Concept metadata derived from the content pack. */
export interface ConceptInfo {
  concept: string;
  topicId: string;
  topicLabel: string;
  questionCount: number;
  familyCount: number;
}

/**
 * Canonical concept catalog. Returns one entry per (concept, topic) pair.
 * Derived entirely from the migrated content — no manual mapping.
 */
export function conceptCatalog(pack: ContentPack): ConceptInfo[] {
  const byKey = new Map<string, ConceptInfo>();
  for (const q of pack.questions) {
    const concept = q.concept;
    if (!concept) continue;
    const key = `${concept}::${q.topicId}`;
    if (!byKey.has(key)) {
      const topic = pack.topics.find((t) => t.id === q.topicId);
      byKey.set(key, {
        concept,
        topicId: q.topicId,
        topicLabel: topic?.label ?? q.topicId,
        questionCount: 0,
        familyCount: 0,
      });
    }
    byKey.get(key)!.questionCount++;
  }
  // Count unique families per (concept, topic) pair
  const familyKeys = new Map<string, Set<string>>();
  for (const q of pack.questions) {
    const concept = q.concept;
    if (!concept) continue;
    const key = `${concept}::${q.topicId}`;
    if (!familyKeys.has(key)) familyKeys.set(key, new Set());
    familyKeys.get(key)!.add(getFamilyId(q.qid));
  }
  for (const [key, families] of familyKeys) {
    const info = byKey.get(key);
    if (info) info.familyCount = families.size;
  }
  return [...byKey.values()].sort((a, b) => b.questionCount - a.questionCount);
}

/** Get concepts that belong to a specific topic. */
export function conceptsForTopic(pack: ContentPack, topicId: string): ConceptInfo[] {
  return conceptCatalog(pack).filter((c) => c.topicId === topicId);
}

/** Get all unique concepts in the pack. */
export function allConcepts(pack: ContentPack): string[] {
  return [...new Set(pack.questions.map((q) => q.concept).filter((c): c is string => !!c))].sort();
}

/** Build a qid → concept lookup map for fast attempt-to-concept resolution. */
export function qidToConceptMap(pack: ContentPack): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const q of pack.questions) {
    map.set(q.qid, q.concept);
  }
  return map;
}

/** Build a qid → topicId lookup map for fast attempt-to-topic resolution. */
export function qidToTopicMap(pack: ContentPack): Map<string, string> {
  const map = new Map<string, string>();
  for (const q of pack.questions) {
    map.set(q.qid, q.topicId);
  }
  return map;
}