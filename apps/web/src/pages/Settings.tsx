import { useEffect, useState } from "react";
import { defaultConfig, levelInfo } from "@zivvvo/learning-engine";
import { useApp } from "../store";
import { Card, Button } from "../ui";
import { EXAM_GOALS, type GoalId } from "../onboarding";
import { isSoundMuted, play, setSoundMuted } from "../sound";
import { getCurrentUser } from "../auth";
import { getAiConsent, setAiConsent } from "../ai-provider";

const GOAL_OPTIONS = EXAM_GOALS.filter((g) => g.enabled).map((g) => ({
  id: g.id as GoalId,
  label: g.label,
}));

const MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45];

function formatDateInput(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateInput(val: string): number | undefined {
  if (!val) return undefined;
  const t = Date.parse(val);
  return isNaN(t) ? undefined : t;
}

export default function SettingsPage({ onBack }: { onBack?: () => void }) {
  const learner = useApp((s) => s.learners.find((l) => l.id === s.activeLearnerId));
  const updateLearner = useApp((s) => s.updateLearner);
  const resetDemo = useApp((s) => s.resetDemo);
  const plan = useApp((s) => s.plan);
  const planExpiresAt = useApp((s) => s.planExpiresAt);
  const engagement = useApp((s) => s.engagement);
  const setTab = useApp((s) => s.setTab);

  const [name, setName] = useState(learner?.name ?? "");
  const [examDate, setExamDate] = useState(formatDateInput(learner?.examDate));
  const [dailyMinutes, setDailyMinutes] = useState(learner?.dailyMinutes ?? 20);
  const [goal, setGoal] = useState<GoalId>(learner?.goal ?? "zvid-provisional");
  const [muted, setMuted] = useState(isSoundMuted());
  const [showReset, setShowReset] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [aiConsent, setAiConsentState] = useState(getAiConsent);

  useEffect(() => {
    getCurrentUser().then((u) => setEmail(u?.email ?? null)).catch(() => {});
  }, []);

  if (!learner) return null;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const minutesChanged = dailyMinutes !== learner.dailyMinutes;
      await updateLearner(learner.id, {
        name: name.trim() || "Learner",
        examDate: parseDateInput(examDate),
        dailyMinutes,
        goal,
      });
      if (minutesChanged) {
        useApp.getState().advanceEngagement({ type: "set-goal", minutes: dailyMinutes });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // Error handled silently — user can retry
    } finally {
      setSaving(false);
    }
  };

  const toggleSound = () => {
    const next = !muted;
    setSoundMuted(next);
    setMuted(next);
    if (!next) play("select");
  };

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    await resetDemo();
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="rounded-lg bg-surface-2 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Back"
          >
            ←
          </button>
        )}
        <h1 className="text-lg font-bold">Settings</h1>
      </div>

      <Card title="Display Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Your name"
        />
        {email && (
          <p className="mt-2 text-xs text-ink-dim">{email}</p>
        )}
      </Card>

      <Card title="Exam Date">
        <input
          type="date"
          value={examDate}
          min={new Date().toISOString().split("T")[0]}
          onChange={(e) => setExamDate(e.target.value)}
          className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </Card>

      <Card title="Daily Study Goal">
        <div className="flex flex-wrap gap-2">
          {MINUTE_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => setDailyMinutes(m)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                dailyMinutes === m
                  ? "bg-primary text-slate-950"
                  : "bg-surface-2 text-ink-dim hover:brightness-110"
              }`}
            >
              {m} min
            </button>
          ))}
        </div>
      </Card>

      <Card title="Goal">
        <div className="flex flex-wrap gap-2">
          {GOAL_OPTIONS.map((g) => (
            <button
              key={g.id}
              onClick={() => setGoal(g.id)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                goal === g.id
                  ? "bg-primary text-slate-950"
                  : "bg-surface-2 text-ink-dim hover:brightness-110"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Sound Effects">
        <button
          onClick={toggleSound}
          className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            muted ? "bg-surface-2 text-ink-dim" : "bg-primary text-slate-950"
          }`}
        >
          {muted ? "🔇 Sound Off" : "🔊 Sound On"}
        </button>
      </Card>

      <Card title="Reset Progress">
        {showReset ? (
          <div className="space-y-3">
            <p className="text-sm text-bad">This will erase all your progress. This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={handleReset} disabled={resetting}>
                {resetting ? "Resetting…" : "Confirm Reset"}
              </Button>
              <Button variant="ghost" onClick={() => setShowReset(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setShowReset(true)}>
            Reset All Progress
          </Button>
        )}
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saved ? "✓ Saved" : saving ? "Saving…" : "Save Changes"}
      </Button>

      <Card title="Subscription">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {plan === "premium" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2.5 py-0.5 text-xs font-semibold text-ok">
                ★ Premium
              </span>
            ) : (
              <span className="text-sm text-ink-dim">Free tier</span>
            )}
          </div>
          {plan === "premium" && planExpiresAt && (
            <p className="text-xs text-ink-dim">
              Active until {new Date(planExpiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          )}
          {plan === "free" && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-dim">
                Level {levelInfo(engagement.xp, defaultConfig).level} — {3 - levelInfo(engagement.xp, defaultConfig).level} level{3 - levelInfo(engagement.xp, defaultConfig).level === 1 ? "" : "s"} to premium
              </p>
              <button onClick={() => { onBack?.(); setTab("pricing"); }} className="text-xs font-medium text-primary">
                Upgrade →
              </button>
            </div>
          )}
        </div>
      </Card>

      <Card title="AI Coach">
        <p className="text-xs text-ink-dim mb-3">
          When enabled, your tutor can use AI to generate personalised explanations. Your learning data stays on your device — only concept context is sent to our server.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm">AI-enhanced explanations</span>
          <button
            onClick={() => {
              const next = !aiConsent;
              setAiConsentState(next);
              setAiConsent(next);
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              aiConsent ? "bg-primary" : "bg-ink-dim/30"
            }`}
            role="switch"
            aria-checked={aiConsent}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                aiConsent ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <p className="text-xs text-ink-dim mt-2">
          You can turn this off at any time. When disabled, you still get the full deterministic explanations.
        </p>
      </Card>

      <Card title="About">
        <div className="space-y-1 text-sm text-ink-dim">
          <p><span className="font-medium text-ink">Zivvvo</span> — Zimbabwe Driving Licence Exam Prep</p>
          <p>Version 1.0.0</p>
          <p className="mt-2">© {new Date().getFullYear()} Zivvvo. All rights reserved.</p>
        </div>
      </Card>
    </div>
  );
}
