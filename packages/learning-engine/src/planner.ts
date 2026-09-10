import type { LearningConfig } from "./config";

/**
 * STUDY PLANNER (docs/PRODUCT_VISION.md Â§51).
 *
 * The learner gives a goal date ("My test is in 14 days."); the planner lays
 * out a day-by-day study plan, then ADAPTS to what the learner already knows â€”
 * strong topics are skipped from the introduction pass and the freed slots
 * become recovery / mixed practice, ending in a Mock + Final Mock.
 *
 * Pure and deterministic: same inputs, same plan. Completion tracking (which
 * days were finished) stays app-side.
 *
 * Key:
 *   Day  1    warmup       â€” first mixed touch (only when the plan has room)
 *   Day  2..  topic        â€” one content topic per day (weak/untried first)
 *   ...        recovery    â€” weakest topics, in mastery order
 *   ...        review      â€” due-card review days
 *   ...        mixed       â€” mixed smart practice
 *   Last-1     mock        â€” a blueprinted mock exam
 *   Last       final-mock  â€” the dress rehearsal
 */

export type PlanDayKind = "warmup" | "topic" | "recovery" | "review" | "mixed" | "mock" | "final-mock";

export interface PlanDay {
  /** Start-of-day (local midnight) epoch ms. */
  date: number;
  kind: PlanDayKind;
  title: string;
  purpose: string;
  /** Engine session type the UI should build for this day. */
  sessionType: "smart" | "review" | "recovery" | "mock";
  topicId?: string;
  /** Cadence-backed suggested minutes for the day. */
  minutes: number;
}

export interface StudyPlan {
  startDate: number;
  examDate: number;
  /** Suggested daily question volume from the cadence. */
  dailyVolume: number;
  days: PlanDay[];
}

export interface PlanTopic {
  id: string;
  label: string;
  mastery: number;
  evidence: number;
}

export interface PlanInput {
  examDate: number;
  dailyMinutes: number;
  today: number;
  topics: PlanTopic[];
  /** Strong thresholds come from the live learning config. */
  config: Pick<
    LearningConfig,
    "strongThreshold" | "developingThreshold" | "minEvidence" | "sessionSizeQuickPerMinute"
  >;
}

export const PLAN_DAY_MS = 86_400_000;

const PURPOSE: Record<PlanDayKind, string> = {
  warmup: "A light first touch so today's habit is easy to keep.",
  topic: "Introduction and practice for one topic.",
  recovery: "Focused work on your weakest topic.",
  review: "Keep what is due fresh â€” spaced repetition.",
  mixed: "A mixed session across everything you know.",
  mock: "A full practice mock exam under exam conditions.",
  "final-mock": "The dress rehearsal, right before the real thing.",
};

export function planLabel(kind: PlanDayKind, topicLabel?: string): string {
  switch (kind) {
    case "warmup":
      return "Warm Up";
    case "topic":
      return topicLabel ?? "Topic";
    case "recovery":
      return "Weakness Recovery";
    case "review":
      return "Review What's Due";
    case "mixed":
      return "Mixed Practice";
    case "mock":
      return "Mock Exam";
    case "final-mock":
      return "Final Mock";
  }
}

export function buildPlan(input: PlanInput): StudyPlan {
  const { examDate, dailyMinutes, today, topics, config } = input;
  const daysAvailable = Math.max(2, Math.ceil((examDate - today) / PLAN_DAY_MS));
  const dailyVolume = Math.max(3, Math.round(dailyMinutes * config.sessionSizeQuickPerMinute));

  const ordered = [...topics];
  const strong = new Set(
    topics.filter((t) => t.evidence >= config.minEvidence && t.mastery >= config.strongThreshold).map((t) => t.id),
  );
  const toTeach = ordered.filter((t) => !strong.has(t.id));
  const weak = topics
    .filter((t) => t.evidence >= config.minEvidence && t.mastery < config.developingThreshold)
    .sort((a, b) => a.mastery - b.mastery);

  const bodySlots = daysAvailable - 2;
  const schedule: { kind: PlanDayKind; topicId?: string }[] = [];

  if (bodySlots >= 1) schedule.push({ kind: "warmup" });

  let slot = schedule.length;
  for (const t of toTeach) {
    if (slot >= bodySlots) break;
    schedule.push({ kind: "topic", topicId: t.id });
    slot += 1;
  }

  const weakIds = [...weak];
  while (slot < bodySlots) {
    const w = weakIds.shift();
    if (w) {
      schedule.push({ kind: "recovery", topicId: w.id });
    } else if (!schedule.some((s) => s.kind === "review")) {
      schedule.push({ kind: "review" });
    } else {
      schedule.push({ kind: "mixed" });
    }
    slot += 1;
  }

  schedule.push({ kind: "mock" });
  schedule.push({ kind: "final-mock" });

  const labelOf = new Map(topics.map((t) => [t.id, t.label]));
  const days: PlanDay[] = schedule.slice(0, daysAvailable).map((entry, i) => {
    const label = entry.topicId ? labelOf.get(entry.topicId) ?? entry.topicId : undefined;
    return {
      date: today + i * PLAN_DAY_MS,
      kind: entry.kind,
      title: planLabel(entry.kind, label),
      purpose: PURPOSE[entry.kind],
      sessionType:
        entry.kind === "mock" || entry.kind === "final-mock"
          ? "mock"
          : entry.kind === "recovery"
            ? "recovery"
            : entry.kind === "review"
              ? "review"
              : "smart",
      topicId: entry.topicId,
      minutes: dailyMinutes,
    };
  });

  return { startDate: today, examDate, dailyVolume, days };
}

export interface PlanCursor {
  /** 0-based index of today's plan day. */
  index: number;
  day: PlanDay;
  daysRemaining: number;
  finished: boolean;
}

/** Where the learner is in the plan, given the current time. */
export function planCursor(plan: StudyPlan, now: number): PlanCursor {
  const index = Math.max(0, Math.min(plan.days.length - 1, Math.floor((now - plan.startDate) / PLAN_DAY_MS)));
  return {
    index,
    day: plan.days[index]!,
    daysRemaining: plan.days.length - 1 - index,
    finished: index >= plan.days.length - 1,
  };
}
