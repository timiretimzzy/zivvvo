/**
 * D7: Coach Page — Personal Tutor Loop + Live AI Integration
 *
 * Uses the deterministic tutor context to show:
 * 1. AI consent banner (if not yet opted in)
 * 2. Primary tutoring decision (what to do next)
 * 3. AI-enhanced concept teaching cards
 * 4. Mistake recovery with explanation → concept → practice
 * 5. Conversational "Ask me anything" input
 * 6. Evidence summary
 *
 * Deterministic engine is authoritative for mastery, weakness, readiness.
 * AI is the language layer — explain, simplify, answer questions.
 */
import { useMemo, useState, useCallback } from "react";
import { useApp } from "../store";
import { weaknesses, conceptSession } from "../engine";
import { Card, Button, Tag } from "../ui";
import { play, vibrate } from "../sound";
import {
  buildTutorContext,
  getTutorDecision,
  getConceptTeaching,
  formatMistakeForTeaching,
  ConceptTeachCard,
  type TutorDecision,
  type MistakeSummary,
  type ConceptSummary,
} from "../tutor";
import {
  getAiConsent,
  setAiConsent,
  aiExplainConcept,
  aiAnswerQuestion,
} from "../ai-provider";

const KIND_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
  recurring: { label: "Recurring", tone: "bad" },
  deteriorating: { label: "Deteriorating", tone: "bad" },
  "long-unreviewed": { label: "Cold", tone: "warn" },
  early: { label: "Early", tone: "warn" },
};

function DecisionCard({ decision }: { decision: TutorDecision }) {
  const setTab = useApp((s) => s.setTab);

  const actionLabel = (() => {
    switch (decision.action) {
      case "diagnostic": return "Start diagnostic";
      case "teach-and-practice": return "Learn & practise";
      case "strengthen": return "Strengthen";
      case "explain-and-practice": return "Review & practise";
      case "maintain": return "Keep practising";
      case "review": return "Review now";
      case "mock": return "Take a mock";
      default: return "Continue";
    }
  })();

  const handleAction = () => {
    switch (decision.action) {
      case "diagnostic":
      case "review":
      case "mock":
        setTab("practice");
        break;
      case "teach-and-practice":
      case "strengthen":
      case "explain-and-practice":
      case "maintain":
        setTab("practice");
        break;
    }
  };

  return (
    <Card title="Your next step">
      <p className="text-sm text-ink leading-snug">{decision.message}</p>
      <div className="mt-3">
        <Button onClick={handleAction}>{actionLabel}</Button>
      </div>
    </Card>
  );
}

function MistakeCard({ mistake, aiConsent }: { mistake: MistakeSummary; aiConsent: boolean }) {
  const [showTeaching, setShowTeaching] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const startSession = useApp((s) => s.startSession);
  const canStartSession = useApp((s) => s.canStartSession);
  const allAttempts = useApp((s) => s.attempts);
  const learnerId = useApp((s) => s.activeLearnerId);
  const setTab = useApp((s) => s.setTab);
  const [paywall, setPaywall] = useState(false);

  const teaching = formatMistakeForTeaching(mistake);
  const label = teaching.conceptLabel;

  const handlePractice = () => {
    if (!canStartSession("concept-recovery")) { setPaywall(true); return; }
    play("start");
    vibrate(20);
    const r = conceptSession(mistake.concept, allAttempts, learnerId!, 8);
    if (r) void startSession(r.session);
  };

  const handleShowTeaching = useCallback(async () => {
    setShowTeaching(true);
    if (aiConsent && aiText === null && !aiLoading) {
      setAiLoading(true);
      try {
        const result = await aiExplainConcept({
          context: {
            concept: mistake.concept,
            conceptLabel: label,
            topicLabel: mistake.topicLabel,
            state: "needs-attention",
            mastery: 0,
            attempts: mistake.count,
            correct: 0,
            canonicalExplanation: teaching.explanation,
            keyRule: teaching.keyRule,
            recentMistake: {
              stem: mistake.recentStem,
              learnerAnswer: "",
              correctAnswer: teaching.explanation ?? "",
            },
          },
        });
        if (result.available && result.text.length > 0) {
          setAiText(result.text);
        }
      } catch { /* fallback to canonical */ } finally {
        setAiLoading(false);
      }
    }
  }, [aiConsent, aiText, aiLoading, mistake, teaching, label]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-sm">{label}</span>
        <Tag tone="bad">{mistake.count} miss{mistake.count === 1 ? "" : "es"}</Tag>
      </div>
      <p className="text-xs text-ink-dim mb-2">{mistake.topicLabel}</p>
      {mistake.recentStem && (
        <p className="text-xs text-ink mb-2 line-clamp-2">{mistake.recentStem}</p>
      )}
      {!showTeaching ? (
        <button onClick={handleShowTeaching} className="text-xs font-medium text-primary hover:underline">
          Show explanation
        </button>
      ) : (
        <div className="space-y-2 mb-3">
          {teaching.keyRule && (
            <div className="rounded-xl bg-surface-2/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim mb-1">Key rule</p>
              <p className="text-sm text-ink leading-snug">{teaching.keyRule}</p>
            </div>
          )}
          {teaching.explanation && (
            <p className="text-xs text-ink-dim leading-relaxed">{teaching.explanation}</p>
          )}
          {aiText && (
            <div className="rounded-xl bg-primary/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">AI explanation</p>
              <p className="text-sm text-ink leading-relaxed">{aiText}</p>
            </div>
          )}
          {aiLoading && (
            <div className="rounded-xl bg-primary/5 p-3">
              <div className="h-3 bg-ink-dim/10 rounded animate-pulse w-3/4 mb-2" />
              <div className="h-3 bg-ink-dim/10 rounded animate-pulse w-1/2" />
            </div>
          )}
        </div>
      )}
      <Button variant="ghost" className="mt-2" onClick={handlePractice}>Practise {label}</Button>
      {paywall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setPaywall(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Upgrade to continue</h2>
            <p className="mt-2 text-sm text-ink-dim">Concept recovery is available for premium learners.</p>
            <div className="mt-5 flex gap-3">
              <Button variant="ghost" onClick={() => setPaywall(false)}>Dismiss</Button>
              <Button onClick={() => { setPaywall(false); setTab("pricing"); }}>See Plans</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function AiConceptTeachCard({ concept, aiConsent }: { concept: ConceptSummary; aiConsent: boolean }) {
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSource, setAiSource] = useState<"canonical" | "generated" | null>(null);
  const [showAi, setShowAi] = useState(false);
  const teaching = getConceptTeaching(concept.concept);

  const handleLoadAi = useCallback(async () => {
    if (showAi && aiText !== null) { setShowAi(false); return; }
    setShowAi(true);
    if (aiText !== null) return;
    setAiLoading(true);
    try {
      const result = await aiExplainConcept({
        context: {
          concept: concept.concept,
          conceptLabel: concept.concept.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
          topicLabel: concept.topicLabel,
          state: concept.state,
          mastery: concept.mastery,
          attempts: concept.attempts,
          correct: concept.correct,
          canonicalExplanation: teaching.explanation,
          keyRule: teaching.keyRule,
        },
      });
      if (result.available && result.text.length > 0) {
        setAiText(result.text);
        setAiSource(result.source);
      }
    } catch { /* silent fallback */ } finally { setAiLoading(false); }
  }, [concept, teaching, showAi, aiText]);

  if (!aiConsent) {
    return <ConceptTeachCard concept={concept} explanation={teaching.explanation} keyRule={teaching.keyRule} />;
  }

  return (
    <ConceptTeachCard concept={concept} explanation={teaching.explanation} keyRule={teaching.keyRule}>
      <div className="mt-2 pt-2 border-t border-line">
        <button onClick={handleLoadAi} className="text-xs font-medium text-primary hover:underline" disabled={aiLoading}>
          {aiLoading ? "Generating\u2026" : showAi ? "Hide AI explanation" : "Get AI explanation"}
        </button>
        {showAi && aiText && (
          <div className="mt-2 rounded-xl bg-primary/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">AI explanation</p>
            <p className="text-sm text-ink leading-relaxed">{aiText}</p>
            {aiSource === "generated" && (
              <p className="text-xs text-ink-dim mt-1 italic">Generated by AI \u2014 verify against official material</p>
            )}
          </div>
        )}
        {showAi && aiLoading && (
          <div className="mt-2 rounded-xl bg-primary/5 p-3">
            <div className="h-3 bg-ink-dim/10 rounded animate-pulse w-3/4 mb-2" />
            <div className="h-3 bg-ink-dim/10 rounded animate-pulse w-1/2" />
          </div>
        )}
      </div>
    </ConceptTeachCard>
  );
}

function AskAiInput({ aiConsent }: { aiConsent: boolean }) {
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "ai"; text: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempts = useApp((s) => s.attempts);
  const learnerId = useApp((s) => s.activeLearnerId);
  const ctx = useMemo(() => buildTutorContext(attempts, learnerId ?? undefined), [attempts, learnerId]);

  if (!aiConsent) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (q.length === 0 || loading) return;
    if (q.length > 500) { setError("Question must be under 500 characters."); return; }
    setLoading(true);
    setError(null);
    setQuestion("");
    setChatHistory((prev) => [...prev, { role: "user", text: q }]);
    try {
      const rc = ctx.weakestConcepts[0] ?? ctx.developingConcepts[0] ?? null;
      const result = await aiAnswerQuestion({
        learnerQuestion: q,
        context: {
          concept: rc?.concept ?? "",
          conceptLabel: rc?.concept?.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") ?? "",
          topicLabel: rc?.topicLabel ?? "",
          state: rc?.state ?? "unknown",
          mastery: rc?.mastery ?? 0,
          attempts: rc?.attempts ?? 0,
          correct: rc?.correct ?? 0,
          canonicalExplanation: rc?.explanation ?? null,
          keyRule: null,
        },
      });
      setChatHistory((prev) => [...prev, {
        role: "ai",
        text: result.available && result.text.length > 0 ? result.text : "I can't help with that right now. Try rephrasing.",
      }]);
    } catch {
      setError("Failed to get response. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Ask me anything">
      {chatHistory.length > 0 && (
        <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
          {chatHistory.map((msg, i) => (
            <div key={i} className={`rounded-xl p-2.5 text-sm ${msg.role === "user" ? "bg-surface-2/60 ml-4" : "bg-primary/5 mr-4"}`}>
              <p className={`text-xs font-semibold mb-0.5 ${msg.role === "user" ? "text-ink-dim" : "text-primary"}`}>
                {msg.role === "user" ? "You" : "AI Tutor"}
              </p>
              <p className="text-ink leading-relaxed">{msg.text}</p>
            </div>
          ))}
          {loading && (
            <div className="rounded-xl bg-primary/5 p-2.5 mr-4">
              <div className="h-3 bg-ink-dim/10 rounded animate-pulse w-3/4 mb-2" />
              <div className="h-3 bg-ink-dim/10 rounded animate-pulse w-1/2" />
            </div>
          )}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input type="text" value={question} onChange={(e) => { setQuestion(e.target.value); setError(null); }}
          placeholder="Ask about any driving rule\u2026"
          className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2 text-sm text-ink placeholder-ink-dim focus:outline-none focus:ring-2 focus:ring-primary"
          maxLength={500} disabled={loading}
        />
        <Button type="submit" disabled={loading || question.trim().length === 0} className="!px-4">
          {loading ? "\u2026" : "Ask"}
        </Button>
      </form>
      {error && <p className="text-xs text-bad mt-2">{error}</p>}
      <p className="text-xs text-ink-dim mt-2">Responses are AI-generated. Always verify against official study material.</p>
    </Card>
  );
}

export default function CoachPage() {
  const attempts = useApp((s) => s.attempts);
  const learnerId = useApp((s) => s.activeLearnerId);
  const learner = useApp((s) => s.learners.find((l) => l.id === s.activeLearnerId));
  const [aiConsent, setAiConsentState] = useState(getAiConsent);
  const learnerExamDate = learner?.examDate ?? undefined;
  const learnerConfidence = learner?.initialConfidence ?? undefined;

  const ctx = useMemo(
    () => buildTutorContext(attempts, learnerId ?? undefined, learnerExamDate, learnerConfidence as string | undefined),
    [attempts, learnerId, learnerExamDate, learnerConfidence],
  );
  const decision = useMemo(() => getTutorDecision(ctx), [ctx]);
  const weak = useMemo(() => weaknesses(attempts), [attempts]);
  const weakTeachings = useMemo(
    () => ctx.weakestConcepts.slice(0, 3).map((c) => ({ summary: c, teaching: getConceptTeaching(c.concept) })),
    [ctx.weakestConcepts],
  );
  const devTeachings = useMemo(
    () => ctx.developingConcepts.slice(0, 2).map((c) => ({ summary: c, teaching: getConceptTeaching(c.concept) })),
    [ctx.developingConcepts],
  );

  const handleConsent = () => { setAiConsent(true); setAiConsentState(true); };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Coach</h1>
      {!aiConsent && (
        <Card>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Enable AI Coach?</p>
            <p className="text-xs text-ink-dim leading-relaxed">
              Your tutor can use AI to generate personalised explanations. Your learning data stays on your device.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleConsent} className="!text-xs !py-1.5">Enable AI</Button>
              <span className="self-center text-xs text-ink-dim">or keep using deterministic explanations</span>
            </div>
          </div>
        </Card>
      )}
      <DecisionCard decision={decision} />
      {weakTeachings.length > 0 && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Needs attention</h2>
          {weakTeachings.map(({ summary }) => (
            <AiConceptTeachCard key={summary.concept} concept={summary} aiConsent={aiConsent} />
          ))}
        </>
      )}
      {devTeachings.length > 0 && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Developing</h2>
          {devTeachings.map(({ summary }) => (
            <AiConceptTeachCard key={summary.concept} concept={summary} aiConsent={aiConsent} />
          ))}
        </>
      )}
      {ctx.recentMistakes.length > 0 && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Recent mistakes</h2>
          {ctx.recentMistakes.map((m) => (
            <MistakeCard key={m.recentQid} mistake={m} aiConsent={aiConsent} />
          ))}
        </>
      )}
      {weak.length > 0 && weakTeachings.length === 0 && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Topic signals</h2>
          {weak.map(({ signal, topic }) => (
            <Card key={topic.id}>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">{topic.label}</span>
                <Tag tone={KIND_LABEL[signal.kind]?.tone ?? "neutral"}>{KIND_LABEL[signal.kind]?.label ?? signal.kind}</Tag>
              </div>
              <div className="space-y-1 text-xs text-ink-dim">
                {signal.reasons.map((r, i) => (<p key={`${signal.kind}-${i}`}>{r}</p>))}
              </div>
            </Card>
          ))}
        </>
      )}
      <AskAiInput aiConsent={aiConsent} />
      {weak.length === 0 && ctx.recentMistakes.length === 0 && weakTeachings.length === 0 && (
        <Card>
          <p className="text-sm text-ink-dim">
            {ctx.hasEvidence ? "You're looking strong. Keep practising to maintain your edge." : "Complete a few practice sessions so I can personalise your learning."}
          </p>
        </Card>
      )}
      {ctx.hasEvidence && (
        <Card title="Your progress">
          <div className="grid grid-cols-2 gap-2 text-xs text-ink-dim">
            <div>Questions tried: {ctx.evidence.attemptedQuestions}</div>
            <div>Concepts covered: {ctx.evidence.conceptsWithEvidence} / {ctx.evidence.totalConcepts}</div>
            {ctx.readiness && (<>
              <div>Readiness: {Math.round(ctx.readiness.score * 100)}%</div>
              <div>Coverage: {Math.round(ctx.readiness.coverage * 100)}%</div>
            </>)}
          </div>
        </Card>
      )}
    </div>
  );
}
