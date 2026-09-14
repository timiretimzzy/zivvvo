import { useMemo, useState } from "react";
import { computeReadiness, BAND_LABEL, BAND_TONE } from "@zivvvo/assessment-engine";
import {
  defaultConfig,
  buildPlan,
  levelInfo,
  planCursor,
  type PlanTopic,
} from "@zivvvo/learning-engine";
import { useApp } from "../store";
import { learnerState, nextActivity, sessionFor, quickSession, planDaySession, lastMockAt, topicMastery } from "../engine";
import { pack } from "../catalog";
import { firstActivityNudge } from "../onboarding";
import { Card, Button, Tag, Meter } from "../ui";
import { play, vibrate } from "../sound";

const DAY_MS = 86_400_000;

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}`;
}

function minutesToday(sessions: { completedAt: number | null; createdAt: number; estimatedMinutes?: number }[]): number {
  const now = Date.now();
  const start = now - (now % DAY_MS);
  return sessions
    .filter((r) => r.completedAt && (r.completedAt >= start))
    .reduce((sum, r) => sum + (r.estimatedMinutes ?? 0), 0);
}

export default function HomePage() {
  const learnerId = useApp((s) => s.activeLearnerId);
  const attempts = useApp((s) => s.attempts);
  const reviews = useApp((s) => s.reviews);
  const sessions = useApp((s) => s.sessions);
  const engagement = useApp((s) => s.engagement);
  const startSession = useApp((s) => s.startSession);
  const updateLearner = useApp((s) => s.updateLearner);
  const learner = useApp((s) => s.learners.find((l) => l.id === s.activeLearnerId));

  const [dateInput, setDateInput] = useState(() => {
    if (!learner?.examDate) return "";
    const d = new Date(learner.examDate);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  const nudge = firstActivityNudge(learner?.initialConfidence, attempts.length);
  const lvl = levelInfo(engagement.xp, defaultConfig);
  const doneTodayMin = minutesToday(sessions);
  const goalHit = doneTodayMin >= engagement.dailyGoalMin;

  const readiness = useMemo(
    () => computeReadiness({ pack, attempts, config: defaultConfig, initialConfidence: learner?.initialConfidence }),
    [attempts, learner?.initialConfidence],
  );

  const activity = useMemo(() => {
    if (!learner || !learnerId) return null;
    return nextActivity(
      learnerState(learnerId, attempts, reviews, learner.diagnosticCompleted, {
        examDate: learner.examDate,
        lastMockAt: lastMockAt(attempts),
        streakDays: engagement.streakDays,
      }),
    );
  }, [learnerId, attempts, reviews, learner, engagement.streakDays]);

  const plan = useMemo(() => {
    if (!learner?.examDate || !learner.dailyMinutes) return null;
    const rows = topicMastery(attempts);
    const known = new Set(rows.map((r) => r.stat.key));
    const topics: PlanTopic[] = [
      ...rows
        .filter((r) => r.topic.kind === "content")
        .map((r) => ({ id: r.stat.key, label: r.topic.label, mastery: r.stat.mastery, evidence: r.stat.evidence })),
      ...pack.topics
        .filter((t) => t.kind === "content" && !known.has(t.id))
        .map((t) => ({ id: t.id, label: t.label, mastery: 0, evidence: 0 })),
    ];
    return buildPlan({
      examDate: learner.examDate,
      dailyMinutes: learner.dailyMinutes,
      today: Math.floor(Date.now() / DAY_MS) * DAY_MS,
      topics,
      config: defaultConfig,
    });
  }, [attempts, learner?.examDate, learner?.dailyMinutes]);

  const cursor = plan ? planCursor(plan, Date.now()) : null;

  const startActivity = () => {
    if (!activity || !learnerId) return;
    play("start");
    vibrate(20);
    const r = sessionFor(activity, attempts, learnerId);
    if (r) void startSession(r.session);
  };

  const startPlanDay = () => {
    if (!cursor || !plan || !learnerId) return;
    play("start");
    vibrate(20);
    const r = planDaySession(cursor.day, attempts, reviews, learnerId);
    if (r) void startSession(r.session);
  };

  const timePick = (minutes?: number) => {
    if (!learnerId) return;
    if (minutes) {
      const r = quickSession(attempts, learnerId, minutes);
      void startSession(r.session);
      play("start");
      vibrate(20);
      return;
    }
    if (activity) {
      const r = sessionFor(activity, attempts, learnerId);
      if (r) {
        void startSession(r.session);
        play("start");
        vibrate(20);
        return;
      }
    }
    const r = quickSession(attempts, learnerId, 5);
    void startSession(r.session);
    play("start");
    vibrate(20);
  };

  const saveExamDate = () => {
    if (!learnerId) return;
    const ts = dateInput ? new Date(`${dateInput}T00:00:00`).getTime() : NaN;
    if (Number.isNaN(ts) || ts <= 0) return;
    void updateLearner(learnerId, { examDate: ts });
  };

  const badges: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
    diagnostic: { label: "Baseline", tone: "neutral" },
    "due-review": { label: "Review due", tone: "warn" },
    "recurring-weakness": { label: "Needs work", tone: "bad" },
    "learning-path": { label: "New material", tone: "ok" },
    "weak-topic": { label: "Top practice", tone: "warn" },
    "exam-approaching": { label: "Exam pressure", tone: "bad" },
    "mock-cadence": { label: "Mock due", tone: "warn" },
    "consistency-lapse": { label: "Welcome back", tone: "neutral" },
    general: { label: "Warm-up", tone: "ok" },
  } as const;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{greeting(learner?.name ?? "there")}</h1>
        <p className="text-sm text-ink-dim">{lvl.label} · Level {lvl.level}</p>
      </div>

      {readiness && (
        <Card title="Readiness">
          <div className="flex items-center justify-between">
            <div className="text-3xl font-bold">{Math.round(readiness.score * 100)}%</div>
            <Tag tone={BAND_TONE[readiness.band]}>{BAND_LABEL[readiness.band]}</Tag>
          </div>
          <div className="mt-3">
            <Meter value={readiness.score} />
          </div>
          <p className="mt-2 text-xs text-ink-dim">{readiness.note}</p>
        </Card>
      )}

      {activity && (
        <Card title="What's next">
          <div className="flex items-center gap-2">
            <Tag tone={badges[activity.kind]?.tone ?? "neutral"}>{badges[activity.kind]?.label ?? activity.kind}</Tag>
            {activity.estimatedMinutes ? (
              <span className="text-xs text-ink-dim">~{activity.estimatedMinutes} min</span>
            ) : null}
          </div>
          <h2 className="mt-2 text-lg font-bold leading-snug">{activity.title}</h2>
          <p className="mt-1 text-sm text-ink-dim">{activity.reason.label}</p>
          {nudge && <p className="mt-3 text-sm text-ink-dim">{nudge}</p>}
          <div className="mt-4">
            <Button onClick={startActivity}>Start now</Button>
          </div>
        </Card>
      )}

      {cursor && plan ? (
        <Card title={`Today's plan · day ${cursor.index + 1} of ${plan.days.length}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold">{cursor.day.title}</h2>
              <p className="mt-0.5 text-sm text-ink-dim">{cursor.day.purpose}</p>
            </div>
            <Tag tone="neutral">~{cursor.day.minutes} min</Tag>
          </div>
          {cursor.daysRemaining > 0 ? (
            <p className="mt-2 text-xs text-ink-dim">{cursor.daysRemaining} day{cursor.daysRemaining === 1 ? "" : "s"} to your final mock.</p>
          ) : null}
          <div className="mt-4">
            <Button onClick={startPlanDay}>Do today&apos;s task</Button>
          </div>
        </Card>
      ) : (
        <Card title="Your plan">
          <p className="text-sm text-ink-dim">Set your exam date and the planner builds day-by-day path to it.</p>
          <div className="mt-3 flex gap-2">
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm"
            />
            <Button variant="ghost" onClick={saveExamDate} className="!w-auto !px-4">
              Set date
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Card className="!p-3">
          <div className="text-xs text-ink-dim">Level</div>
          <div className="mt-1 text-lg font-bold">
            {lvl.level} <span className="text-xs font-medium text-ink-dim">{lvl.label}</span>
          </div>
          <div className="mt-2">
            <Meter value={lvl.progress} />
          </div>
          <div className="mt-1 text-[10px] text-ink-dim">{engagement.xp} XP</div>
        </Card>
        <Card className="!p-3">
          <div className="text-xs text-ink-dim">Streak</div>
          <div className="mt-1 text-lg font-bold">
            {engagement.streakDays} <span className="text-xs font-medium text-ink-dim">day{engagement.streakDays === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-1 text-[10px] text-ink-dim">
            best {engagement.bestStreakDays}
            {engagement.freezeAvailable > 0 ? ` · ${engagement.freezeAvailable} streak freeze${engagement.freezeAvailable === 1 ? "" : "s"} (auto-used if you miss a day)` : ""}
          </div>
        </Card>
        <Card className="!p-3">
          <div className="text-xs text-ink-dim">Today's goal</div>
          <div className="mt-1 text-lg font-bold">
            {doneTodayMin}
            <span className="text-xs font-medium text-ink-dim"> / {engagement.dailyGoalMin} min</span>
          </div>
          <div className="mt-1 text-[10px] text-ink-dim">{goalHit ? "goal reached" : "practice to hit it"}</div>
        </Card>
      </div>

      <Card title="How much time do you have?">
        <div className="grid grid-cols-5 gap-2">
          {[2, 5, 10, 20].map((m) => (
            <Button key={m} variant="ghost" className="!p-2" onClick={() => timePick(m)}>
              {m}m
            </Button>
          ))}
          <Button variant="ghost" className="!p-2" onClick={() => timePick()}>
            Surprise
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-dim">Surprise picks the next best session for you.</p>
      </Card>

      {sessions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-4 text-center text-xs text-ink-dim">
          Finish a session and this dashboard starts tracking XP, streaks and your plan.
        </div>
      )}
    </div>
  );
}