import rawNuggets from "./data/nuggets.json";
import { pack } from "./catalog";

export interface Nugget {
  id: string;
  topicId: string;
  topicLabel: string;
  title: string;
  text: string;
  imageRef: string | null;
}

export interface TopicNuggets {
  topicId: string;
  topicLabel: string;
  nuggets: Nugget[];
  readCount: number;
}

const READ_KEY = "zivvvo_read_nuggets";

const topicLabelMap = new Map(pack.topics.map((t) => [t.id, t.label]));

const allNuggets: Nugget[] = (rawNuggets as Array<Omit<Nugget, "topicLabel">>).map((n) => ({
  ...n,
  topicLabel: topicLabelMap.get(n.topicId) ?? n.topicId,
}));

export function getReadNuggets(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function markNuggetRead(qid: string): Set<string> {
  const s = getReadNuggets();
  s.add(qid);
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...s]));
  } catch { /* storage unavailable */ }
  return s;
}

export function toggleNuggetRead(qid: string): Set<string> {
  const s = getReadNuggets();
  if (s.has(qid)) s.delete(qid);
  else s.add(qid);
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...s]));
  } catch { /* storage unavailable */ }
  return s;
}

export function nuggetsByTopic(): TopicNuggets[] {
  const readSet = getReadNuggets();
  const byTopic = new Map<string, Nugget[]>();
  for (const n of allNuggets) {
    if (!byTopic.has(n.topicId)) byTopic.set(n.topicId, []);
    byTopic.get(n.topicId)!.push(n);
  }
  return [...byTopic.entries()]
    .map(([topicId, nuggets]) => ({
      topicId,
      topicLabel: nuggets[0]?.topicLabel ?? topicId,
      nuggets,
      readCount: nuggets.filter((n) => readSet.has(n.id)).length,
    }))
    .sort((a, b) => b.nuggets.length - a.nuggets.length);
}

export function totalReadCount(topics: TopicNuggets[]): number {
  return topics.reduce((sum, t) => sum + t.readCount, 0);
}

export function totalNuggetCount(topics: TopicNuggets[]): number {
  return topics.reduce((sum, t) => sum + t.nuggets.length, 0);
}
