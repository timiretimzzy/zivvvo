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

  const finish = () => {
    const sessionAttempts = allAttempts.filter((a) => a.sessionId === session.id);
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
            {m ? `${m.correct} of ${m.total} correct. ` : `${s?.correctCount} of ${s?.totalCount} correct. `}
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

  if (!question) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Meter value={(index + (revealed ? 1 : 0)) / total} />
        </div>
        {isMock && (
          <span className="ml-3 whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-ink-dim">
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} left
          </span>
        )}
      </div>
      <div className="text-xs text-ink-dim">
        Question {index + 1} of {total} · {session.title}
      </div>
      <Card>
        <QuestionMedia imageRef={question.imageRef} />
        {question.stem && <p className="text-lg font-semibold leading-snug">{question.stem}</p>}
      </Card>
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

      {revealed ? (
        <>
          {!isMock &&
            (question.explanation ? (
              <Card title="Why">{question.explanation}</Card>
            ) : (
              <Card title="Why">
                <p className="text-sm text-ink-dim">No explanation written for this one yet — the rule itself is the reference.</p>
              </Card>
            ))}
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
        <Button
          onClick={() => {
            if (!selected.length) return;
            if (gradeQuestion(question, selected)) {
              play("correct");
              vibrate(15);
            } else {
              play("wrong");
              vibrate([30, 40, 30]);
            }
            setRevealed(true);
          }}
          disabled={selected.length === 0}
        >
          Check answer
        </Button>
      )}
    </div>
  );
}

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
                {a.selected.map((i) => q.options[i]?.text).filter(Boolean).join(", ") || "no answer"}
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

export default function PracticePage() {
  const activeSession = useApp((s) => s.activeSession);
  const attempts = useApp((s) => s.attempts);
  const reviews = useApp((s) => s.reviews);
  const startSession = useApp((s) => s.startSession);
  const learnerId = useApp((s) => s.activeLearnerId);

  if (activeSession) return <SessionRunner session={activeSession} />;
  if (!learnerId) return null;

  const launch = (minutes: number) => {
    play("start");
    vibrate(20);
    const r = quickSession(attempts, learnerId, minutes);
    void startSession(r.session);
  };
  const launchSmart = () => {
    play("start");
    vibrate(20);
    const r = smartSession(attempts, learnerId);
    void startSession(r.session);
  };
  const launchWeakness = () => {
    const w = topWeakness(attempts);
    if (!w) return;
    play("start");
    vibrate(20);
    const r = weaknessSession(w.topic.id, attempts, learnerId);
    void startSession(r.session);
  };
  const launchReview = () => {
    play("start");
    vibrate(20);
    const r = dueReviewSession(attempts, reviews, learnerId);
    if (r) void startSession(r.session);
  };
  const launchMistakes = () => {
    play("start");
    vibrate(20);
    const r = mistakeReviewSession(attempts, learnerId);
    if (r) void startSession(r.session);
  };
  const launchMock = () => {
    play("start");
    vibrate(20);
    const r = mockSession(attempts, learnerId);
    void startSession(r.session);
  };

  const weak = topWeakness(attempts);
  const due = dueReviewCount(reviews);
  const misses = recentMisses(attempts);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Practice</h1>
      <p className="text-sm text-ink-dim">
        Choose how you want to practise. Each mode reads your progress and sizes itself to what helps next.
      </p>

      <Card title="Weakness focus">
        {weak ? (
          <>
            <p className="mb-3 text-sm text-ink-dim">
              Your weakest is <span className="font-semibold text-ink">{weak.topic.label}</span> — accuracy{" "}
              {Math.round(weak.signal.stat.accuracy * 100)}%. Read the explanations, then lock it in.
            </p>
            <Button onClick={launchWeakness}>Focus on {weak.topic.label}</Button>
          </>
        ) : (
          <p className="text-sm text-ink-dim">
            No weak topics right now — nudge it with a smart session instead.
          </p>
        )}
      </Card>

      <Card title="Review due">
        {due > 0 ? (
          <>
            <p className="mb-3 text-sm text-ink-dim">
              {due} question{due === 1 ? "" : "s"} due for review. Keep them fresh so they stay learned.
            </p>
            <Button onClick={launchReview}>Review now</Button>
          </>
        ) : (
          <p className="text-sm text-ink-dim">Nothing due — your spaced repetition is on track.</p>
        )}
      </Card>

      <Card title="Mistake review">
        {misses.length > 0 ? (
          <>
            <p className="mb-3 text-sm text-ink-dim">
              {misses.length} recent {misses.length === 1 ? "miss" : "misses"}, restated so you learn the rule, not the answer position.
            </p>
            <Button onClick={launchMistakes}>Review mistakes</Button>
          </>
        ) : (
          <p className="text-sm text-ink-dim">No recent misses — nice work.</p>
        )}
      </Card>

      <Card title="Smart practice">
        <p className="mb-3 text-sm text-ink-dim">
          A short mixed session drawn from your current learning state. The general-purpose warm-up.
        </p>
        <Button onClick={launchSmart}>Start smart session</Button>
      </Card>

      <Card title="Quick session">
        <p className="mb-3 text-sm text-ink-dim">A compact session sized to the time you have.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => launch(2)}>2 minutes</Button>
          <Button variant="ghost" onClick={() => launch(5)}>
            5 minutes
          </Button>
        </div>
      </Card>

      <Card title="Mock exam">
        <p className="mb-3 text-sm text-ink-dim">
          {ZVID_MOCK_DEFAULT.questionCount} questions · {ZVID_MOCK_DEFAULT.durationMin} minutes · pass mark at{" "}
          {Math.round(ZVID_MOCK_DEFAULT.passMark * 100)}%. The closest run-through of the real test you can do on the phone.
        </p>
        <Button variant="ghost" onClick={launchMock}>
          Start mock exam
        </Button>
      </Card>
    </div>
  );
}