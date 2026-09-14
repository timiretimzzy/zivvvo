import { useEffect, useMemo, useRef, useState } from "react";
import { defaultConfig } from "@zivvvo/learning-engine";
import {
  buildSessionSummary,
  gradeQuestion,
  mockScore,
  ZVID_MOCK_DEFAULT,
  type AttemptEvent,
  type Confidence,
  type LearningSession,
} from "@zivvvo/assessment-engine";
import type { Question } from "@zivvvo/content";
import { useApp } from "../store";
import {
  mockSession,
  quickSession,
  smartSession,
  weaknessSession,
  dueReviewSession,
  mistakeReviewSession,
  topWeakness,
  dueReviewCount,
  recentMisses,
} from "../engine";
import { pack } from "../catalog";
import { Card, Button, Meter, Tag, QuestionMedia } from "../ui";
import { play, vibrate } from "../sound";
import Nuggets from "./Nuggets";

/* ── Session Runner ─────────────────────────────────────────────── */

function SessionRunner({ session }: { session: LearningSession }) {
  const recordAnswer = useApp((s) => s.recordAnswer);
  const completeSession = useApp((s) => s.completeSession);
  const allAttempts = useApp((s) => s.attempts);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(session.estimatedMinutes * 60);
  const startedAt = useRef(Date.now());

  const isMock = session.type === "mock";

  useEffect(() => {
    if (!isMock || done) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [isMock, done]);

  useEffect(() => {
    if (isMock && secondsLeft === 0 && !done) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, isMock, done]);

  const question: Question | undefined = session.questions[index];
  const total = session.questions.length;
  const topicLabel = question ? pack.topics.find((t) => t.id === question.topicId)?.label : null;

  const finish = () => {
    const currentAttempts = useApp.getState().attempts;
    const sessionAttempts = currentAttempts.filter((a) => a.sessionId === session.id);
    const acc = sessionAttempts.length ? sessionAttempts.filter((a) => a.isCorrect).length / sessionAttempts.length : 0;
    const passed = isMock ? mockScore(sessionAttempts, ZVID_MOCK_DEFAULT).passed : acc >= 0.75;
    if (passed) {
      play("pass");
      vibrate([40, 60, 40]);
    } else {
      play("fail");
      vibrate([60]);
    }
    setDone(true);
    void completeSession();
  };

  const [error, setError] = useState<string | null>(null);
  const checkingRef = useRef(false);

  const onConfidence = (confidence: Confidence) => {
    play("select");
    if (!question) return;
    const durationMs = Math.max(250, Date.now() - startedAt.current);
    void recordAnswer(question, selected, confidence, durationMs).then(() => {
      if (index + 1 < total) {
        setIndex(index + 1);
        setSelected([]);
        setRevealed(false);
        startedAt.current = Date.now();
      } else {
        finish();
      }
    }).catch((err) => {
      console.error("[Zivvvo] recordAnswer failed:", err);
      setError("Failed to record answer. Please try again.");
    });
  };

  const onSkip = () => {
    play("select");
    if (!question) return;
    const durationMs = Math.max(250, Date.now() - startedAt.current);
    void recordAnswer(question, [], "guess", durationMs).then(() => {
      if (index + 1 < total) {
        setIndex(index + 1);
        setSelected([]);
        setRevealed(false);
        startedAt.current = Date.now();
      } else {
        finish();
      }
    }).catch((err) => {
      console.error("[Zivvvo] recordAnswer failed:", err);
      setError("Failed to record answer. Please try again.");
    });
  };

  const summary = useMemo(() => {
    if (!done || !session) return null;
    const sessionAttempts = allAttempts.filter((a) => a.sessionId === session.id);
    const previous = allAttempts.filter((a) => a.sessionId !== session.id);
    return buildSessionSummary({
      session,
      attempts: sessionAttempts,
      previous,
      config: defaultConfig,
      topicLabelFor: (topicId) => pack.topics.find((t) => t.id === topicId)?.label,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, session, allAttempts]);

  /* ── Session complete ── */
  if (done) {
    const s = summary;
    const m = isMock && s ? mockScore(allAttempts.filter((a) => a.sessionId === session.id), ZVID_MOCK_DEFAULT) : null;
    const sessionAttempts = allAttempts.filter((a) => a.sessionId === session.id);
    if (reviewOpen) {
      return (
        <ReviewList
          session={session}
          attempts={sessionAttempts}
          onBack={() => setReviewOpen(false)}
        />
      );
    }
    return (
      <div className="space-y-4">
        <Card title={isMock ? "Mock result" : "Session complete"}>
          <div className="flex items-end justify-between">
            <div className="text-4xl font-bold">{Math.round(((m?.score ?? s?.accuracy) ?? 0) * 100)}</div>
            {m ? (
              m.passed ? (
                <Tag tone="ok">PASS · {Math.round(m.passMark * 100)}% needed</Tag>
              ) : (
                <Tag tone="bad">NOT PASSED · {Math.round(m.passMark * 100)}% needed</Tag>
              )
            ) : null}
          </div>
          <p className="mt-1 text-sm text-ink-dim">
            {m ? `${m.correct} of ${m.total} correct. ` : `${s?.correctCount ?? 0} of ${s?.totalCount ?? 0} correct. `}
            {s?.improvementReason ? s.improvementReason : ""}
          </p>
        </Card>
        {s?.stillReviewing.length ? (
          <Card title="Still reviewing">
            <ul className="text-sm text-warn">
              {s.stillReviewing.map((t) => (
                <li key={t.topicId}>● {t.label}</li>
              ))}
            </ul>
          </Card>
        ) : null}
        {s?.strengthened.length ? (
          <Card title="Strengthened">
            <ul className="text-sm text-ok">
              {s.strengthened.map((t) => (
                <li key={t.topicId}>● {t.label}</li>
              ))}
            </ul>
          </Card>
        ) : null}
        {sessionAttempts.length > 0 ? (
          <Button variant="ghost" onClick={() => setReviewOpen(true)}>
            Review answers
          </Button>
        ) : null}
        <Button onClick={() => useApp.getState().setTab("home")}>Back home</Button>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="space-y-4 text-center">
        <Card>
          <p className="text-sm text-ink-dim">This session has no questions to display. Go back and try a different session.</p>
        </Card>
        <Button onClick={() => useApp.getState().setTab("home")}>Back home</Button>
      </div>
    );
  }

  /* ── Active question ── */
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-bad/10 px-4 py-2 text-sm text-bad">{error}</div>
      )}
      {/* Progress + timer */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-ink-dim tabular-nums">
          {index + 1}/{total}
        </span>
        <div className="flex-1">
          <Meter value={(index + (revealed ? 1 : 0)) / total} />
        </div>
        {isMock && (
          <span className="whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-ink-dim">
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </span>
        )}
      </div>

      {/* Topic tag */}
      {topicLabel && (
        <div className="text-xs text-ink-dim">{topicLabel}</div>
      )}

      {/* Question */}
      <Card>
        <QuestionMedia imageRef={question.imageRef} />
        {question.stem && <p className="text-lg font-semibold leading-snug">{question.stem}</p>}
      </Card>

      {/* Options */}
      <div className="space-y-2">
        {question.options.map((opt, i) => {
          const isSel = selected.includes(i);
          const isCorrect = question.correctIndexes.includes(i);
          let cls = "bg-surface border-line border text-left";
          if (revealed) {
            cls = isCorrect ? "bg-ok/15 border-ok text-ok" : isSel ? "bg-bad/15 border-bad text-bad" : "bg-surface border-line text-ink-dim";
          } else if (isSel) {
            cls = "bg-primary/20 border-primary border text-left";
          }
          return (
            <button key={i} disabled={revealed} onClick={() => setSelected([i])} className={`w-full rounded-xl px-4 py-3 text-sm ${cls}`}>
              {opt.text}
            </button>
          );
        })}
      </div>

      {/* Post-answer: explanation + confidence */}
      {revealed ? (
        <>
          {!isMock && question.explanation && (
            <Card title="Why">{question.explanation}</Card>
          )}
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-sm text-ink-dim mb-2">How confident were you?</p>
            <div className="grid grid-cols-3 gap-2">
              {(["sure", "unsure", "guess"] as Confidence[]).map((c) => (
                <Button key={c} variant="ghost" onClick={() => onConfidence(c)} className="!p-2">
                  {c}
                </Button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <Button
            onClick={() => {
              if (!selected.length || checkingRef.current) return;
              checkingRef.current = true;
              if (gradeQuestion(question, selected)) {
                play("correct");
                vibrate(15);
              } else {
                play("wrong");
                vibrate([30, 40, 30]);
              }
              setRevealed(true);
              checkingRef.current = false;
            }}
            disabled={selected.length === 0}
          >
            Check answer
          </Button>
          {!isMock && (
            <button
              onClick={onSkip}
              className="w-full py-2 text-xs text-ink-dim hover:text-ink transition"
            >
              Skip this one
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ── Review List ─────────────────────────────────────────────── */

function ReviewList({
  session,
  attempts,
  onBack,
}: {
  session: LearningSession;
  attempts: AttemptEvent[];
  onBack: () => void;
}) {
  const items = session.questions
    .map((q) => ({ q, a: attempts.find((x) => x.qid === q.qid) }))
    .filter((x): x is { q: Question; a: AttemptEvent } => Boolean(x.a));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Review</h2>
        <button onClick={onBack} className="text-sm font-semibold text-primary">
          Back to result
        </button>
      </div>
      <p className="text-sm text-ink-dim">
        {attempts.filter((a) => a.isCorrect).length} of {attempts.length} answered correctly.
      </p>
      {items.map(({ q, a }, i) => (
        <Card key={q.qid}>
          <div className="mb-2 flex items-center justify-between text-xs text-ink-dim">
            <span>Question {i + 1}</span>
            {a.isCorrect ? <Tag tone="ok">Correct</Tag> : <Tag tone="bad">Missed</Tag>}
          </div>
          <QuestionMedia imageRef={q.imageRef} />
          <p className="mb-2 text-sm font-semibold leading-snug">{q.stem}</p>
          <div className="mb-3 space-y-1 text-xs">
            <p className="text-ink-dim">
              Your answer:{" "}
              <span className={a.isCorrect ? "text-ok" : "text-bad"}>
                {a.selected.length > 0
                  ? a.selected.map((i) => q.options[i]?.text).filter(Boolean).join(", ")
                  : "skipped"}
              </span>
            </p>
            {!a.isCorrect && (
              <p className="text-ok">
                Correct: {q.correctIndexes.map((i) => q.options[i]?.text).filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          {q.explanation && (
            <div className="rounded-xl bg-surface-2/60 p-3 text-xs text-ink-dim">{q.explanation}</div>
          )}
        </Card>
      ))}
      <Button onClick={onBack}>Back to result</Button>
    </div>
  );
}

/* ── Main Practice Page ─────────────────────────────────────── */

type PracticeMode = "quiz" | "read";

export default function PracticePage() {
  const activeSession = useApp((s) => s.activeSession);
  const attempts = useApp((s) => s.attempts);
  const reviews = useApp((s) => s.reviews);
  const startSession = useApp((s) => s.startSession);
  const learnerId = useApp((s) => s.activeLearnerId);
  const plan = useApp((s) => s.plan);
  const canStartSession = useApp((s) => s.canStartSession);
  const sessionsToday = useApp((s) => s.sessionsToday);
  const setTab = useApp((s) => s.setTab);
  const [mode, setMode] = useState<PracticeMode>("quiz");
  const [paywall, setPaywall] = useState(false);

  if (activeSession) return <SessionRunner session={activeSession} />;
  if (!learnerId) return null;

  const counts = sessionsToday();
  const totalRemaining = plan === "premium" ? Infinity : Math.max(0, 2 - counts.diagnostic - counts.other);

  const guard = (type: string, fn: () => void) => () => {
    if (!canStartSession(type)) { setPaywall(true); return; }
    fn();
  };

  const launchSmart = guard("smart", () => {
    play("start");
    vibrate(20);
    const r = smartSession(attempts, learnerId!);
    void startSession(r.session);
  });
  const launchWeakness = guard("weakness", () => {
    const w = topWeakness(attempts);
    if (!w) return;
    play("start");
    vibrate(20);
    const r = weaknessSession(w.topic.id, attempts, learnerId!);
    void startSession(r.session);
  });
  const launchReview = guard("review", () => {
    play("start");
    vibrate(20);
    const r = dueReviewSession(attempts, reviews, learnerId!);
    if (r) void startSession(r.session);
  });
  const launchMistakes = guard("mistake-review", () => {
    play("start");
    vibrate(20);
    const r = mistakeReviewSession(attempts, learnerId!);
    if (r) void startSession(r.session);
  });
  const launchMock = plan === "premium"
    ? () => { play("start"); vibrate(20); const r = mockSession(attempts, learnerId!); void startSession(r.session); }
    : () => setPaywall(true);

  const weak = topWeakness(attempts);
  const due = dueReviewCount(reviews);
  const misses = recentMisses(attempts);
  const hasDue = weak || due > 0 || misses.length > 0;

  if (mode === "read") {
    return (
      <div className="space-y-3">
        <ModeToggle mode={mode} onChange={setMode} />
        <Nuggets />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ModeToggle mode={mode} onChange={setMode} />

      {/* ── Free session limit banner ── */}
      {plan === "free" && (
        <div className="rounded-xl bg-surface-2 p-3 text-xs text-ink-dim flex items-center justify-between">
          <span>
            Free: {totalRemaining} session{totalRemaining === 1 ? "" : "s"} left today
          </span>
          {totalRemaining <= 0 ? (
            <button onClick={() => setTab("pricing")} className="ml-2 text-primary font-medium">
              Upgrade
            </button>
          ) : (
            <button onClick={() => setTab("pricing")} className="ml-2 text-primary font-medium">
              Upgrade
            </button>
          )}
        </div>
      )}

      {/* ── Recommended (only when something is actionable) ── */}
      {hasDue && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">What needs you</h2>
          {weak && (
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <Tag tone="bad">Weakness</Tag>
              </div>
              <p className="text-sm text-ink-dim">
                Your weakest topic is <span className="font-semibold text-ink">{weak.topic.label}</span> at{" "}
                {Math.round(weak.signal.stat.accuracy * 100)}% accuracy.
              </p>
              <Button onClick={launchWeakness} className="mt-3">Focus on {weak.topic.label}</Button>
            </Card>
          )}
          {due > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <Tag tone="warn">Review</Tag>
              </div>
              <p className="text-sm text-ink-dim">
                {due} question{due === 1 ? "" : "s"} due for spaced repetition review.
              </p>
              <Button onClick={launchReview} className="mt-3">Review now</Button>
            </Card>
          )}
          {misses.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <Tag tone="warn">Mistakes</Tag>
              </div>
              <p className="text-sm text-ink-dim">
                {misses.length} recent {misses.length === 1 ? "miss" : "misses"} to learn from.
              </p>
              <Button onClick={launchMistakes} className="mt-3">Review mistakes</Button>
            </Card>
          )}
        </>
      )}

      {/* ── Quick start ── */}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Quick start</h2>
      <Card>
        <p className="text-sm text-ink-dim mb-3">
          Smart session picks questions from your current learning state automatically.
        </p>
        <Button onClick={launchSmart}>Start smart session</Button>
      </Card>
      <Card>
        <p className="text-sm text-ink-dim mb-3">How much time do you have?</p>
        <div className="grid grid-cols-4 gap-2">
          {[2, 5, 10, 20].map((m) => (
            <Button key={m} variant="ghost" className="!p-2" onClick={() => {
              if (!canStartSession("quick")) { setPaywall(true); return; }
              play("start"); vibrate(20);
              const r = quickSession(attempts, learnerId!, m);
              void startSession(r.session);
            }}>
              {m}m
            </Button>
          ))}
        </div>
      </Card>

      {/* ── Challenge ── */}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Challenge</h2>
      <Card>
        <p className="text-sm text-ink-dim mb-3">
          Full mock exam: {ZVID_MOCK_DEFAULT.questionCount} questions · {ZVID_MOCK_DEFAULT.durationMin} min ·{" "}
          pass mark {Math.round(ZVID_MOCK_DEFAULT.passMark * 100)}%.
        </p>
        {plan === "premium" ? (
          <Button variant="ghost" onClick={launchMock}>Start mock exam</Button>
        ) : (
          <Button variant="ghost" onClick={() => setPaywall(true)}>
            ★ Premium only — Upgrade
          </Button>
        )}
      </Card>

      {/* ── Paywall modal ── */}
      {paywall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setPaywall(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center" onClick={(e) => e.stopPropagation()}>
            {plan === "free" && totalRemaining <= 0 ? (
              <>
                <h2 className="text-lg font-bold">Free sessions used today</h2>
                <p className="mt-2 text-sm text-ink-dim">
                  You've used your 2 free sessions today. Upgrade for unlimited practice.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold">Mock exams are Premium</h2>
                <p className="mt-2 text-sm text-ink-dim">
                  Upgrade to unlock mock exams and unlimited sessions.
                </p>
              </>
            )}
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

/* ── Mode Toggle ─────────────────────────────────────────────── */

function ModeToggle({ mode, onChange }: { mode: PracticeMode; onChange: (m: PracticeMode) => void }) {
  return (
    <div className="flex rounded-xl bg-surface-2 p-1">
      {([
        { id: "quiz" as const, label: "Quiz" },
        { id: "read" as const, label: "Read" },
      ]).map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
            mode === t.id ? "bg-primary text-slate-950" : "text-ink-dim hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
