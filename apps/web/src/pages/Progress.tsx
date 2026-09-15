import { useEffect, useMemo } from "react";
import { BAND_LABEL, computeReadiness } from "@zivvvo/assessment-engine";
import { defaultConfig } from "@zivvvo/learning-engine";
import { useApp } from "../store";
import { useSync } from "../sync";
import { syncManager } from "../sync-supabase";
import { topicMastery } from "../engine";
import { pack } from "../catalog";
import { db } from "../db";
import { confidenceBandLabel, daysUntilExam, goalLabel } from "../onboarding";
import { Card, Meter } from "../ui";

function downloadJSON(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProgressPage() {
  const attempts = useApp((s) => s.attempts);
  const reviews = useApp((s) => s.reviews);
  const learnerId = useApp((s) => s.activeLearnerId);
  const learners = useApp((s) => s.learners);
  const sync = useSync();

  useEffect(() => {
    void syncManager.refreshPending();
  }, []);

  const onExport = async () => {
    const learner = learners.find((l) => l.id === learnerId);
    const sessions = learnerId ? await db.sessions.where("learnerId").equals(learnerId).toArray() : [];
    downloadJSON(`zivvvo-${learnerId ?? "export"}.json`, {
      exportedAt: new Date().toISOString(),
      app: "zivvvo",
      learner: learner ?? null,
      attempts,
      reviews,
      sessions,
    });
  };

  const learner = learners.find((l) => l.id === learnerId);
  const readiness = useMemo(
    () =>
      computeReadiness({
        pack,
        attempts,
        config: defaultConfig,
        initialConfidence: learner?.initialConfidence,
      }),
    [attempts, learner?.initialConfidence],
  );
  const rows = useMemo(() => topicMastery(attempts).sort((a, b) => b.stat.mastery - a.stat.mastery), [attempts]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Progress</h1>
      {readiness ? (
        <Card title="Overall readiness">
          <div className="flex items-end justify-between">
            <div className="text-4xl font-bold">{Math.round(readiness.score * 100)}</div>
            <div className="text-sm text-ink-dim">{BAND_LABEL[readiness.band] ?? readiness.band}</div>
          </div>
          <Meter value={readiness.score} />
          <p className="mt-2 text-xs text-ink-dim">{readiness.message}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink-dim">
            <div>Coverage: {Math.round(readiness.coverage * 100)}%</div>
            <div>Mastery: {Math.round(readiness.masteryMean * 100)}%</div>
          </div>
          {readiness.perceivedDelta !== null && (
            <p className="mt-1 text-xs text-ink-dim">
              You rated yourself {Math.round(readiness.perceivedConfidence! * 100)}% — measured {Math.round(readiness.score * 100)}% ({readiness.perceivedDelta > 0 ? "better" : readiness.perceivedDelta < 0 ? "lower" : "same as"} you thought).
            </p>
          )}
          <div className="mt-3 space-y-1.5">
            {readiness.components.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span className="text-ink-dim">{c.label}</span>
                <span className="w-24">{Math.round(c.value * 100)}%</span>
                <span className="w-16 text-right font-semibold">{readiness.score > 0 ? Math.round((c.contribution / readiness.score) * 100) : 0}% of score</span>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card title="Overall readiness">
          <p className="text-sm text-ink-dim">Keep answering to unlock a readiness estimate (needs a bit more evidence).</p>
        </Card>
      )}

      <Card title="Topics">
        <div className="space-y-3">
          {rows.map(({ stat, topic }) => (
            <div key={topic.id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{topic.label}</span>
                <span className="text-xs text-ink-dim">{Math.round(stat.mastery * 100)}%</span>
              </div>
              <Meter value={stat.mastery} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Your goal">
        {learner?.goal || learner?.examDate ? (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-dim">Goal</span>
              <span className="font-semibold">{goalLabel(learner!.goal)}</span>
            </div>
            {learner?.examDate && (
              <div className="flex justify-between">
                <span className="text-ink-dim">Exam date</span>
                <span className="font-semibold">
                  {new Date(learner.examDate).toLocaleDateString()}{" "}
                  <span className="font-normal text-ink-dim">
                    ({daysUntilExam(learner.examDate)}d)
                  </span>
                </span>
              </div>
            )}
            {learner?.dailyMinutes && (
              <div className="flex justify-between">
                <span className="text-ink-dim">Daily target</span>
                <span className="font-semibold">{learner.dailyMinutes} min</span>
              </div>
            )}
            {learner?.initialConfidence && (
              <div className="flex justify-between">
                <span className="text-ink-dim">Started as</span>
                <span className="font-semibold">{confidenceBandLabel(learner.initialConfidence)}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-dim">No goal set yet.</p>
        )}
      </Card>

      <Card title="Sync">
        {!sync.configured ? (
          <p className="text-sm text-ink-dim">
            Offline-only mode. Set <code className="text-primary">VITE_SUPABASE_URL</code> and{" "}
            <code className="text-primary">VITE_SUPABASE_ANON_KEY</code> to enable cloud sync.
          </p>
        ) : sync.state === "syncing" ? (
          <p className="text-sm text-ink-dim">Syncing {sync.pending} pending answer{sync.pending === 1 ? "" : "s"}…</p>
        ) : sync.state === "error" ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-warn">Sync failed: {sync.lastError}</p>
            <button onClick={() => void syncManager.sync()} className="shrink-0 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-slate-950">
              Retry
            </button>
          </div>
        ) : sync.pending > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-dim">{sync.pending} answer{sync.pending === 1 ? "" : "s"} waiting to sync.</p>
            <button onClick={() => void syncManager.sync()} className="shrink-0 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-slate-950">
              Sync now
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-dim">
            Up to date{sync.lastRun ? " · last synced " + new Date(sync.lastRun).toLocaleTimeString() : ""}.
          </p>
        )}
      </Card>

      <Card title="Record">
        <p className="text-sm text-ink-dim">{attempts.length} answers recorded on this device.</p>
        <button
          onClick={() => void onExport()}
          className="mt-3 w-full rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold"
        >
          Download my data (JSON)
        </button>
      </Card>
    </div>
  );
}