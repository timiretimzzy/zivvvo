import { useState } from "react";
import { useApp } from "./store";
import { Button } from "./ui";
import { play, vibrate } from "./sound";
import {
  CONFIDENCE_BANDS,
  EXAM_GOALS,
  TIMELINES,
  daysUntilExam,
  type ConfidenceBand,
  type GoalId,
  type TimelineId,
} from "./onboarding";

type Selection = {
  name: string;
  goal: GoalId | null;
  examDate: number | null;
  timeline: TimelineId | null;
  confidence: ConfidenceBand | null;
};

const STEPS = ["Welcome", "Goal", "Timeline", "Confidence"];

function StepDots({ step }: { step: number }) {
  return (
    <div className="mb-5 flex justify-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className={`h-1.5 rounded-full transition-all ${i <= step ? "w-6 bg-primary" : "w-1.5 bg-surface-2"}`} />
      ))}
    </div>
  );
}

export function OnboardingFlow() {
  const seedDemos = useApp((s) => s.seedDemos);
  const pickLearner = useApp((s) => s.pickLearner);
  const learners = useApp((s) => s.learners);
  const completeOnboarding = useApp((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState<Selection>({ name: "", goal: null, examDate: null, timeline: null, confidence: null });

  const today = new Date();
  const todayInput = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const finish = async () => {
    if (!sel.goal || !sel.examDate || !sel.timeline || !sel.confidence) return;
    const timeline = TIMELINES.find((t) => t.id === sel.timeline)!;
    await completeOnboarding({
      name: sel.name,
      goal: sel.goal,
      examDate: sel.examDate,
      dailyMinutes: timeline.minutesPerDay,
      initialConfidence: sel.confidence,
    });
  };

  return (
    <div className="app-shell p-6 justify-center">
      <h1 className="text-2xl font-bold mb-1">Zivvvo</h1>
      <p className="text-ink-dim mb-6">Adaptive road-rules practice for the ZVID provisional licence test.</p>

      <StepDots step={step} />

      {step === 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold mb-1">Let's set you up</h2>
            <p className="text-sm text-ink-dim">
              Two minutes now, and every session after is shaped around your goal, your
              date, and how confident you feel today.
            </p>
          </div>
          <label className="block text-sm font-semibold" htmlFor="onboarding-name">
            What should we call you?
          </label>
          <input
            id="onboarding-name"
            autoFocus
            value={sel.name}
            onChange={(e) => setSel((s) => ({ ...s, name: e.target.value }))}
            placeholder="Your name"
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
          />
          <Button
            onClick={() => {
              play("start");
              vibrate(20);
              setStep(1);
            }}
            disabled={!sel.name.trim()}
          >
            Continue
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-bold mb-1">What are you working toward?</h2>
            <p className="text-sm text-ink-dim">Pick your goal and when you plan to take the test.</p>
          </div>
          <div className="space-y-2">
            {EXAM_GOALS.map((g) => (
              <button
                key={g.id}
                disabled={!g.enabled}
                onClick={() => setSel((s) => ({ ...s, goal: g.id }))}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  sel.goal === g.id
                    ? "border-primary bg-primary/10"
                    : g.enabled
                      ? "border-line bg-surface"
                      : "border-line bg-surface opacity-50"
                }`}
              >
                <div className="font-semibold">
                  {g.label}
                  {!g.enabled && <span className="ml-2 text-xs font-normal text-ink-dim">Coming soon</span>}
                </div>
                <div className="text-xs text-ink-dim">{g.blurb}</div>
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-semibold mt-2" htmlFor="onboarding-date">
              Exam date
            </label>
            <input
              id="onboarding-date"
              type="date"
              min={todayInput}
              onChange={(e) =>
                setSel((s) => ({ ...s, examDate: e.target.value ? new Date(`${e.target.value}T00:00:00`).getTime() : null }))
              }
              className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
            />
            {sel.examDate && (
              <p className="mt-1 text-xs text-ink-dim">
                {daysUntilExam(sel.examDate)} day{daysUntilExam(sel.examDate) === 1 ? "" : "s"} to go.
              </p>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={() => setStep(0)} className="w-24">
              Back
            </Button>
            <Button
              disabled={!sel.goal || !sel.examDate}
              onClick={() => {
                play("select");
                setStep(2);
              }}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-bold mb-1">How do you want to pace it?</h2>
            <p className="text-sm text-ink-dim">This sets your daily session size.</p>
          </div>
          <div className="space-y-2">
            {TIMELINES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSel((s) => ({ ...s, timeline: t.id }))}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  sel.timeline === t.id ? "border-primary bg-primary/10" : "border-line bg-surface"
                }`}
              >
                <div className="font-semibold">{t.label}</div>
                <div className="text-xs text-ink-dim">{t.blurb}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={() => setStep(1)} className="w-24">
              Back
            </Button>
            <Button
              disabled={!sel.timeline}
              onClick={() => {
                play("select");
                setStep(3);
              }}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-bold mb-1">How confident do you feel right now?</h2>
            <p className="text-sm text-ink-dim">
              Honest answer — it shapes your very first recommendation.
            </p>
          </div>
          <div className="space-y-2">
            {CONFIDENCE_BANDS.map((b) => (
              <button
                key={b.id}
                onClick={() => setSel((s) => ({ ...s, confidence: b.id }))}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  sel.confidence === b.id ? "border-primary bg-primary/10" : "border-line bg-surface"
                }`}
              >
                <div className="font-semibold">{b.label}</div>
                <div className="text-xs text-ink-dim">{b.hint}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={() => setStep(2)} className="w-24">
              Back
            </Button>
            <Button
              disabled={!sel.confidence}
              onClick={() => {
                play("start");
                vibrate(30);
                void finish();
              }}
            >
              Start learning
            </Button>
          </div>
        </div>
      )}

      {import.meta.env.DEV && (
        <details className="mt-8 text-xs text-ink-dim">
          <summary className="cursor-pointer">Developer: demo learners</summary>
          <div className="mt-2 space-y-2">
            <button
              onClick={seedDemos}
              className="w-full rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold"
            >
              Seed demo learners
            </button>
            {learners.map((l) => (
              <button
                key={l.id}
                onClick={() => pickLearner(l.id)}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2 text-left text-sm"
              >
                {l.name}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}