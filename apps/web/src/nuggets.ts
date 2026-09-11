import type { ContentPack } from "@zivvvo/content";

export interface Nugget {
  qid: string;
  topicId: string;
  topicLabel: string;
  stem: string;
  explanation: string;
}

export interface TopicNuggets {
  topicId: string;
  topicLabel: string;
  nuggets: Nugget[];
  readCount: number;
}

const READ_KEY = "zivvvo_read_nuggets";

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

export function nuggetsByTopic(pack: ContentPack): TopicNuggets[] {
  const readSet = getReadNuggets();
  const byTopic = new Map<string, Nugget[]>();
  for (const q of pack.questions) {
    if (!q.explanation || q.explanation.length === 0) continue;
    const topic = pack.topics.find((t) => t.id === q.topicId);
    const label = topic?.label ?? q.topicId;
    if (!byTopic.has(q.topicId)) byTopic.set(q.topicId, []);
    byTopic.get(q.topicId)!.push({
      qid: q.qid,
      topicId: q.topicId,
      topicLabel: label,
      stem: q.stem,
      explanation: q.explanation,
    });
  }
  return [...byTopic.entries()]
    .map(([topicId, nuggets]) => ({
      topicId,
      topicLabel: nuggets[0]?.topicLabel ?? topicId,
      nuggets,
      readCount: nuggets.filter((n) => readSet.has(n.qid)).length,
    }))
    .sort((a, b) => b.nuggets.length - a.nuggets.length);
}

export function totalReadCount(topics: TopicNuggets[]): number {
  return topics.reduce((sum, t) => sum + t.readCount, 0);
}

export function totalNuggetCount(topics: TopicNuggets[]): number {
  return topics.reduce((sum, t) => sum + t.nuggets.length, 0);
}
