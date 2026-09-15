import { useMemo, useState } from "react";
import { useApp } from "../store";
import { learnerState, smartTopicSession } from "../engine";
import { learnPath } from "../learnPath";
import { Card, Button, Meter, Tag } from "../ui";
import { play, vibrate } from "../sound";

export default function LearnPage() {
  const attempts = useApp((s) => s.attempts);
  const reviews = useApp((s) => s.reviews);
  const activeLearnerId = useApp((s) => s.activeLearnerId);
  const learner = useApp((s) => s.learners.find((l) => l.id === activeLearnerId));
  const startSession = useApp((s) => s.startSession);
  const canStartSession = useApp((s) => s.canStartSession);
  const setTab = useApp((s) => s.setTab);
  const [paywall, setPaywall] = useState(false);

  const state = useMemo(
    () =>
      learnerState(
        activeLearnerId ?? "",
        attempts,
        reviews,
        learner?.diagnosticCompleted ?? false,
        { examDate: learner?.examDate },
      ),
    [attempts, reviews, activeLearnerId, learner?.diagnosticCompleted, learner?.examDate],
  );

  const path = useMemo(() => learnPath(state), [state]);

  const practice = (topicId: string) => {
    if (!canStartSession("smart")) { setPaywall(true); return; }
    play("start");
    vibrate(20);
    const r = smartTopicSession(topicId, attempts, activeLearnerId ?? "");
    void startSession(r.session);
  };

  if (!path.entries.length) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold">Learn</h1>
        <Card>
          <p className="text-sm text-ink-dim">No content topics available yet. Run the baseline to unlock your path.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Learn</h1>
      <p className="text-sm text-ink-dim italic">{path.why}</p>

      {path.entries.map((entry, idx) => {
        const leader = idx === 0 && path.focusTopicId;
        return (
          <Card key={entry.topicId} className={leader ? "border-rose-400/60" : ""}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold">{entry.topicLabel}</span>
              <Tag tone={entry.status.tone}>{entry.status.label}</Tag>
            </div>
            <Meter value={entry.mastery} />
            <div className="mt-2 flex justify-between text-xs text-ink-dim">
              <span>{Math.round(entry.mastery * 100)}% mastery</span>
              <span>
                {entry.evidence} attempt{entry.evidence === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-2 text-xs text-ink-dim italic">{entry.reason}</p>
            <div className="mt-3">
              <Button variant={leader ? "primary" : "ghost"} onClick={() => practice(entry.topicId)}>
                {entry.action.label}
              </Button>
            </div>
          </Card>
        );
      })}

      {paywall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setPaywall(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Level 3 reached!</h2>
            <p className="mt-2 text-sm text-ink-dim">
              You've hit Examiner-Proof level. Upgrade to keep unlimited practice and unlock mock exams.
            </p>
            <div className="mt-5 flex gap-3">
              <Button variant="ghost" onClick={() => setPaywall(false)}>Dismiss</Button>
              <Button onClick={() => { setPaywall(false); setTab("pricing"); }}>See Plans</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
