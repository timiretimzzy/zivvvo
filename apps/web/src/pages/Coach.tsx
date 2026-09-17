/**
 * D8: Coach Page — Clean gateway into the AI Tutor
 *
 * Landing page shows:
 * 1. AI Tutor entry point
 * 2. One concise learning recommendation
 * 3. Small progress signal
 *
 * Detailed interaction happens inside the dedicated AI Tutor page.
 * Deterministic engine is authoritative for mastery, weakness, readiness.
 * AI is the language layer — explain, simplify, answer questions.
 */
import { useMemo, useState } from "react";
import { useApp } from "../store";
import { Card, Button, Tag } from "../ui";
import { play, vibrate } from "../sound";
import {
  buildTutorContext,
  getTutorDecision,
} from "../tutor";
import { conceptSession } from "../engine";
import { getAiConsent, setAiConsent } from "../ai-provider";
import AiTutorPage from "./AiTutor";

export default function CoachPage() {
  const tab = useApp((s) => s.tab);
  const coachSubTab = useApp((s) => s.coachSubTab);
  const setCoachSubTab = useApp((s) => s.setCoachSubTab);
  const plan = useApp((s) => s.plan);
  const setTab = useApp((s) => s.setTab);
  const attempts = useApp((s) => s.attempts);
  const learnerId = useApp((s) => s.activeLearnerId);
  const learner = useApp((s) => s.learners.find((l) => l.id === s.activeLearnerId));
  const [aiConsent, setAiConsentState] = useState(getAiConsent);

  const isPaid = plan === "premium";

  // If navigating to Coach tab, ensure we start at landing
  if (tab === "coach" && coachSubTab !== "landing" && coachSubTab !== "tutor") {
    setCoachSubTab("landing");
  }

  // Render dedicated AI Tutor page if sub-tab is tutor
  if (coachSubTab === "tutor") {
    return <AiTutorPage />;
  }

  // ---- Coach Landing Page ----

  const learnerExamDate = learner?.examDate ?? undefined;
  const learnerConfidence = learner?.initialConfidence ?? undefined;

  const ctx = useMemo(
    () => buildTutorContext(attempts, learnerId ?? undefined, learnerExamDate, learnerConfidence as string | undefined),
    [attempts, learnerId, learnerExamDate, learnerConfidence],
  );
  const decision = useMemo(() => getTutorDecision(ctx), [ctx]);
  const startSession = useApp((s) => s.startSession);

  const handleConsent = () => { setAiConsent(true); setAiConsentState(true); };

  const handleStartLearningFocus = () => {
    if (decision.action === "mock") {
      setTab("practice");
    } else if (decision.action === "diagnostic" || decision.action === "review") {
      setTab("practice");
    } else if ("concept" in decision && decision.concept) {
      play("start");
      vibrate(20);
      const r = conceptSession(decision.concept.concept, attempts, learnerId!, 8);
      if (r) void startSession(r.session);
    } else {
      setTab("practice");
    }
  };

  if (!isPaid) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold">Coach</h1>
        <Card>
          <div className="space-y-3 text-center py-2">
            <div className="text-3xl">🎓</div>
            <h2 className="text-lg font-bold">Your personal AI tutor</h2>
            <p className="text-sm text-ink-dim leading-relaxed">
              Ask questions, understand difficult rules, and get personalised help with your learner's licence preparation.
            </p>
            <div className="bg-surface-2/60 rounded-xl p-4 space-y-2">
              <p className="text-xs text-ink-dim">Coach is a premium feature</p>
              <Button onClick={() => setTab("pricing")}>Upgrade to unlock</Button>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Your progress</p>
              <p className="text-xs text-ink-dim">
                {ctx.hasEvidence
                  ? `${ctx.evidence.conceptsWithEvidence} / ${ctx.evidence.totalConcepts} concepts covered`
                  : "Complete a practice session to get started"}
              </p>
            </div>
            <Button variant="ghost" onClick={() => setTab("practice")}>Practise</Button>
          </div>
        </Card>
      </div>
    );
  }

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

      <Card>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Your personal AI tutor</h2>
          </div>
          <p className="text-sm text-ink-dim leading-relaxed">
            Ask questions, understand difficult rules, and get personalised help with your learner's licence preparation.
          </p>
          <Button onClick={() => setCoachSubTab("tutor")}>Enter AI Tutor</Button>
        </div>
      </Card>

      <Card>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Your learning focus</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{"concept" in decision ? formatConcept(decision.concept?.concept) : "Getting started"}</p>
              <p className="text-xs text-ink-dim">{decision.message}</p>
            </div>
            {"concept" in decision && decision.concept && (
              <Tag tone={decision.concept.state === "needs-attention" ? "bad" : decision.concept.state === "developing" ? "warn" : "ok"}>
                {decision.concept.state === "needs-attention" ? "Needs attention" : decision.concept.state === "developing" ? "Developing" : "Strong"}
              </Tag>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleStartLearningFocus}>
              {decision.action === "mock" ? "Take a mock" : "Learn"}
            </Button>
            <Button variant="ghost" onClick={() => setTab("practice")}>Practise</Button>
          </div>
        </div>
      </Card>

      {ctx.hasEvidence && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Your progress</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-dim mt-1">
                <div>Questions tried: {ctx.evidence.attemptedQuestions}</div>
                <div>Concepts: {ctx.evidence.conceptsWithEvidence} / {ctx.evidence.totalConcepts}</div>
                {ctx.readiness && <div>Readiness: {Math.round(ctx.readiness.score * 100)}%</div>}
              </div>
            </div>
          </div>
        </Card>
      )}

      {!ctx.hasEvidence && (
        <Card>
          <p className="text-sm text-ink-dim">
            Complete a few practice sessions so I can personalise your learning.
          </p>
        </Card>
      )}
    </div>
  );
}

function formatConcept(concept: string | undefined): string {
  if (!concept) return "Getting started";
  return concept.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
