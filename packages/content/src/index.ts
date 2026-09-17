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

// ---------------------------------------------------------------------------
// D8: Content Retrieval — find relevant authoritative material for AI context
// ---------------------------------------------------------------------------

const TOPIC_KEYWORDS: Record<string, string[]> = {
  "road-signs": ["sign", "signs", "regulatory", "warning", "information", "guide", "road sign", "prohibition", "mandatory"],
  "road-markings": ["marking", "markings", "line", "lines", "lane", "road marking", "painted", "double", "solid", "dashed"],
  "junction-rules": ["junction", "intersection", "roundabout", "turn", "turning", "give way", "right of way", "who goes first", "crossroad", "yield", "priority"],
  "traffic-lights": ["traffic light", "traffic lights", "signal", "signals", "stop light", "robot", "robots"],
  "speed-limits": ["speed", "speed limit", "km/h", "kilometres per hour"],
  "overtaking": ["overtake", "overtaking", "passing", "pass", "safe to overtake"],
  "parking": ["park", "parking", "stopped", "stopping", "stand", "standing"],
  "pedestrian-safety": ["pedestrian", "crossing", "zebra", "walk", "walking", "cyclist", "bicycle"],
  "vehicle-equipment": ["equipment", "tyre", "tyres", "tire", "brake", "lights", "vehicle condition", "spare", "fire extinguisher"],
  "vehicle-classes": ["class", "classes", "vehicle class", "licence class", "category", "psv", "driving licence", "licence", "license", "learner", "learner's", "requirement", "application", "test"],
  "towing-loads": ["tow", "towing", "load", "loads", "trailer", "cargo"],
  "accident-procedures": ["accident", "crash", "collision", "breakdown", "emergency", "incident", "first aid"],
  "alcohol-drugs": ["alcohol", "drug", "drugs", "drunk", "drink driving", "dui", "intoxication", "blood alcohol"],
  "night-driving": ["night", "headlight", "headlights", "visibility", "dark", "dipped", "fog", "rain"],
  "general-rules": ["rule", "rules", "regulation", "law", "road rule", "general rule", "roadcraft", "seatbelt", "horn", "insurance", "defensive", "hazard", "hazards", "safe distance", "following distance", "cell", "cells", "road cell"],
};

/**
 * Find the most relevant topic for a user question using keyword matching.
 * Returns topicId or null if no strong match.
 */
export function findRelevantTopic(pack: ContentPack, question: string): string | null {
  const q = question.toLowerCase();
  const validTopicIds = new Set(pack.topics.map((t) => t.id));
  let bestTopic: string | null = null;
  let bestScore = 0;
  for (const [topicId, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (!validTopicIds.has(topicId)) continue;
    let score = 0;
    for (const kw of keywords) {
      if (q.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topicId;
    }
  }
  return bestScore > 0 ? bestTopic : null;
}

/**
 * Find concepts matching a search term (case-insensitive substring match on concept name).
 */
export function findConceptsByTerm(pack: ContentPack, term: string): string[] {
  const t = term.toLowerCase();
  const concepts = new Set<string>();
  for (const q of pack.questions) {
    if (q.concept && q.concept.includes(t)) {
      concepts.add(q.concept);
    }
  }
  return [...concepts];
}

/**
 * Get a brief content summary for a topic (list of concept names + question count).
 * Useful for giving the AI a map of what Zivvvo covers in a topic area.
 */
export function topicContentSummary(pack: ContentPack, topicId: string): { concepts: string[]; questionCount: number } {
  const qs = pack.questions.filter((q) => q.topicId === topicId);
  const concepts = [...new Set(qs.map((q) => q.concept).filter((c): c is string => !!c))];
  return { concepts, questionCount: qs.length };
}

/**
 * Get all topic labels as a flat list for the AI to know what Zivvvo covers.
 */
export function allTopicLabels(pack: ContentPack): string[] {
  return pack.topics.filter((t) => t.kind === "content").map((t) => t.label);
}