import {
  DEFAULT_PRIORITIES_V2,
  defaultConfig,
  detectWeakness,
  masteryBy,
  getNextBestActivity,
  type LearnerState as EngineLearnerState,
} from "@zivvvo/learning-engine";

/** Re-export for consumers that derive the path from the store. */
export type LearnerState = EngineLearnerState;
import { catalog, pack } from "./catalog";

/**
 * Personalized adaptive "Learn" path.
 *
 * The Learn tab and Home's "next activity" MUST agree by construction. This
 * module turns the learner's actual state (mastery + weakness + the same
 * priority ladder `getNextBestActivity` uses) into a single ordered list of
 * content topics, each labelled with *why* it's next. No ordering, ranking or
 * recommendation logic lives in the React layer.
 */

export interface PathAction {
  /** Human instruction for this action ("Focus this"). */
  label: string;
  /** The session kind this topic's action starts (topic session). */
  sessionType: "topicsession";
}

export interface PathEntry {
  topicId: string;
  topicLabel: string;
  /** Mastery 0..1 (smoothed, evidence-aware). */
  mastery: number;
  /** Number of answerable attempts recorded for this topic. */
  evidence: number;
  /** Readable per-entry status. */
  status: { label: string; tone: "ok" | "warn" | "bad" | "neutral" };
  /** Grounded reason this topic ranks where it does. */
  reason: string;
  /** The action to offer for this topic right now. */
  action: PathAction;
}

export interface LearnPath {
  /** Single ordered focus list. */
  entries: PathEntry[];
  /** One-line explanation of the ordering principle. */
  why: string;
  /** The topic to focus first (the leader). */
  focusTopicId: string | null;
}

/**
 * Build the adaptive path. `now` is injectable for deterministic tests.
 * The single content topic the recommender called out (weakest / next-topic)
 * leads the list; the rest follow current strength. Empty state is explicit.
 */
export function learnPath(state: LearnerState, now = Date.now()): LearnPath {
  const topics = catalog.contentTopics();
  const contentIds = new Set(topics.map((t) => t.id));

  const mastery = new Map(
    masteryBy(state.attempts, (a) => catalog.questionTopic(a.qid) ?? "general", defaultConfig)
      .filter((s) => contentIds.has(s.key))
      .map((s) => [s.key, s] as const),
  );

  const activity = getNextBestActivity({
    catalog,
    learner: state,
    config: defaultConfig,
    priorities: DEFAULT_PRIORITIES_V2,
    now,
  });

  if (topics.length === 0) {
    return { entries: [], why: "", focusTopicId: null };
  }

  const reasonFor = (topicId: string, nowMs: number): string => {
    const stat = mastery.get(topicId);
    if (!stat || stat.evidence < defaultConfig.minEvidence) return "Not enough attempts to give a confident label yet.";
    if (stat.status === "strong") return `Hold it: strong and stable at ${Math.round(stat.mastery * 100)}%.`;
    if (stat.status === "developing") return `Keep building: at ${Math.round(stat.mastery * 100)}% and improving.`;
    const signal = detectWeakness(stat, defaultConfig, nowMs);
    if (signal.kind === "long-unreviewed") return "This topic has not been reviewed for 14+ days — it has gone cold.";
    if (activity && activity.targetTopicId === topicId) return activity.reason?.label ?? "High priority right now.";
    return `Needs attention: sitting at ${Math.round(stat.mastery * 100)}%.`;
  };

  const toneFor = (s: { label: string; tone: "ok" | "warn" | "bad" | "neutral" }, id: string) =>
    activity && activity.targetTopicId === id ? { label: "focus", tone: "bad" as const } : s;

  const entries: PathEntry[] = topics.map((t) => {
    const stat = mastery.get(t.id);
    const status =
      stat && stat.evidence >= defaultConfig.minEvidence
        ? statusOf(stat.status)
        : { label: "fresh", tone: "neutral" as const };
    return {
      topicId: t.id,
      topicLabel: t.label,
      mastery: stat?.mastery ?? 0,
      evidence: stat?.evidence ?? 0,
      status: toneFor({ label: status.label, tone: status.tone }, t.id),
      reason: reasonFor(t.id, now),
      action: { label: "Focus this", sessionType: "topicsession" as const },
    };
  });

  entries.sort((a, b) => {
    if (activity && activity.targetTopicId === a.topicId) return -1;
    if (activity && activity.targetTopicId === b.topicId) return 1;
    const rank = (e: PathEntry) => (e.status.label === "focus" ? 0 : e.status.label === "fresh" ? 1 : e.mastery);
    return (
      rank(a) - rank(b) ||
      (a.status.label === "fresh" && b.status.label === "fresh"
        ? topics.findIndex((t) => t.id === a.topicId) - topics.findIndex((t) => t.id === b.topicId)
        : a.topicLabel.localeCompare(b.topicLabel))
    );
  });

  return {
    entries,
    why:
      "Ordered by found need first, then weakest first, then your strength — using your own attempt history.",
    focusTopicId: activity?.targetTopicId ?? null,
  };
}

function statusOf(engineStatus: string): { label: string; tone: "ok" | "warn" | "bad" | "neutral" } {
  switch (engineStatus) {
    case "strong":
      return { label: "strong", tone: "ok" };
    case "developing":
      return { label: "maintained", tone: "warn" };
    case "needs-attention":
      return { label: "focus", tone: "bad" };
    default:
      return { label: "fresh", tone: "neutral" };
  }
}

export { pack };