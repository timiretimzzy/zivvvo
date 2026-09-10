/**
 * Onboarding configuration and pure helpers for the first-time journey
 * (docs/UX_PRINCIPLES.md "First-time journey"): Welcome → goal (exam + date) →
 * timeline → confidence → Home, completed in under 2 minutes.
 */

export const EXAM_GOALS = [
  {
    id: "zvid-provisional",
    label: "ZVID Provisional Licence",
    blurb: "Road-rules practice built around the current provisional road-rule test.",
    enabled: true,
  },
  {
    id: "zvid-full",
    label: "Full Licence",
    blurb: "The full road-rule test.",
    enabled: false,
  },
] as const;

export type GoalId = (typeof EXAM_GOALS)[number]["id"];

export const TIMELINES = [
  { id: "relaxed", label: "Relaxed", minutesPerDay: 10, blurb: "~10 min a day. A steady, low-pressure ramp." },
  { id: "focused", label: "Focused", minutesPerDay: 20, blurb: "~20 min a day. The sweet spot before a provisional test." },
  { id: "intense", label: "Intense", minutesPerDay: 30, blurb: "~30 min a day. Good when the exam date is close." },
] as const;

export type TimelineId = (typeof TIMELINES)[number]["id"];

export const CONFIDENCE_BANDS = [
  { id: "none", label: "Just starting", hint: "Not much road-rule background yet." },
  { id: "some", label: "A little", hint: "I know a few basics but lots of gaps." },
  { id: "fairly", label: "Fairly confident", hint: "I've studied a bit; still shaky in places." },
  { id: "confident", label: "Confident", hint: "I feel good about most topics." },
] as const;

export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number]["id"];

export function daysUntilExam(examDate: number, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((examDate - now) / 86_400_000));
}

export function goalLabel(goal: string | undefined): string {
  return EXAM_GOALS.find((g) => g.id === goal)?.label ?? goal ?? "Not set";
}

export function confidenceBandLabel(band: ConfidenceBand | null | undefined): string {
  return CONFIDENCE_BANDS.find((b) => b.id === band)?.label ?? "Not set";
}

/**
 * The personalised first-step nudge: the confidence assessment feeds the engine
 * so the very first "next best activity" is framed for where the user starts.
 * Only applies before any evidence exists (constraint in UX_PRINCIPLES.md).
 */
export function firstActivityNudge(band: ConfidenceBand | null | undefined, attemptCount: number): string | null {
  if (attemptCount > 0 || !band) return null;
  if (band === "fairly" || band === "confident") {
    return "You're arriving confident — a quick baseline confirms exactly where you stand.";
  }
  return "We'll find your starting point first, so every later session is useful.";
}