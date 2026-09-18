/**
 * D8/D9: Dedicated AI Tutor Page — full conversational interface
 *
 * D9: STRICT LIVE AI ONLY.
 * - Uses aiAnswerQuestionStrict() — never falls back to MockTutorProvider
 * - Shows explicit failure states for every error type
 * - Displays "Live" indicator when connected to real AI
 * - Preserves conversation history across failures
 */
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useApp } from "../store";
import { Card, Button } from "../ui";
import { buildTutorContext } from "../tutor";
import {
  getAiConsent,
  setAiConsent,
  aiAnswerQuestionStrict,
  getLiveAIStatus,
} from "../ai-provider";
import type { ConversationMessage, AIAvailability } from "@zivvvo/ai-gateway";

const STARTER_PROMPTS = [
  "What should I study?",
  "Why did I get this wrong?",
  "Explain this rule.",
  "Give me an example.",
  "Explain it more simply.",
];

function availabilityMessage(reason: AIAvailability): string {
  switch (reason) {
    case "offline":
      return "You're offline, so the live AI Tutor can't respond. Reconnect to the internet and try again.";
    case "not-configured":
      return "The AI Tutor is not configured right now.";
    case "unauthorized":
      return "Please sign in again to use the AI Tutor.";
    case "forbidden":
      return "Your plan doesn't include the AI Tutor. Please upgrade to continue.";
    case "rate-limited":
      return "You've reached the AI Tutor limit for now. Please try again later.";
    case "server-error":
      return "The AI Tutor is temporarily unavailable. Please try again.";
    case "timeout":
      return "The AI Tutor took too long to respond.";
    case "invalid-response":
      return "The AI Tutor returned an invalid response. Please try again.";
    default:
      return "The AI Tutor is unavailable. Please try again.";
  }
}

export default function AiTutorPage() {
  const setCoachSubTab = useApp((s) => s.setCoachSubTab);
  const attempts = useApp((s) => s.attempts);
  const learnerId = useApp((s) => s.activeLearnerId);
  const learner = useApp((s) => s.learners.find((l) => l.id === s.activeLearnerId));
  const learnerExamDate = learner?.examDate ?? undefined;
  const learnerConfidence = learner?.initialConfidence ?? undefined;

  const [aiConsent, setAiConsentState] = useState(getAiConsent);
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AIAvailability>("available");
  const scrollRef = useRef<HTMLDivElement>(null);

  const ctx = useMemo(
    () => buildTutorContext(attempts, learnerId ?? undefined, learnerExamDate, learnerConfidence as string | undefined),
    [attempts, learnerId, learnerExamDate, learnerConfidence],
  );

  // Check live AI status on mount and when consent changes
  useEffect(() => {
    const { reason } = getLiveAIStatus();
    setAiStatus(reason);
  }, [aiConsent]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, loading]);

  const handleConsent = () => {
    setAiConsent(true);
    setAiConsentState(true);
    const { reason } = getLiveAIStatus();
    setAiStatus(reason);
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
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

      // D10: Detect topic hint from recent conversation history
      const recentUserMessages = chatHistory.slice(-4).filter((m) => m.role === "user").map((m) => m.text).join(" ");
      const topicHint = recentUserMessages.length > 5 ? recentUserMessages : undefined;

      const result = await aiAnswerQuestionStrict(
        {
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
            // D10: Include recent mistakes for context
            recentMistake: ctx.recentMistakes[0] ? {
              stem: ctx.recentMistakes[0].recentStem,
              correctAnswer: "",
              learnerAnswer: "",
            } : undefined,
          },
          topicHint,
        },
        chatHistory,
      );

      // D9: Strict — only accept responses from live AI
      if (result.available && result.text.length > 0 && result.source === "generated") {
        setChatHistory((prev) => [...prev, { role: "ai", text: result.text }]);
        setAiStatus("available");
      } else {
        // Live AI failed or returned non-AI source — show explicit failure
        const reason = result.reason ?? "server-error";
        setAiStatus(reason);
        setError(availabilityMessage(reason));
      }
    } catch {
      setError("Failed to get response. Please try again.");
      setAiStatus("server-error");
    } finally {
      setLoading(false);
    }
  }, [question, loading, ctx, chatHistory]);

  const handleStarter = useCallback((prompt: string) => {
    setQuestion(prompt);
  }, []);

  const isLive = aiStatus === "available";

  if (!aiConsent) {
    return (
      <div className="space-y-3">
        <button onClick={() => setCoachSubTab("landing")} className="text-sm text-primary font-medium">
          &larr; Back
        </button>
        <h1 className="text-xl font-bold">AI Tutor</h1>
        <Card>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Enable AI Tutor?</p>
            <p className="text-xs text-ink-dim leading-relaxed">
              Your tutor can use AI to generate personalised explanations. Your learning data stays on your device.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleConsent} className="!text-xs !py-1.5">Enable AI</Button>
              <span className="self-center text-xs text-ink-dim">or keep using deterministic explanations</span>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => setCoachSubTab("landing")} className="text-sm text-primary font-medium">
          &larr; Back
        </button>
        <h1 className="text-lg font-bold">AI Tutor</h1>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isLive ? "bg-ok/15 text-ok" : "bg-surface-2 text-ink-dim"}`}>
          {isLive ? "\u25cf Live AI" : "\u25cb Offline"}
        </span>
      </div>

      <p className="text-xs text-ink-dim mb-2">
        Ask me about your learner's licence. AI responses are based on Zivvvo's study material.
      </p>

      {!isLive && aiConsent && (
        <Card>
          <div className="space-y-2">
            <p className="text-sm font-semibold">AI Tutor unavailable</p>
            <p className="text-xs text-ink-dim leading-relaxed">
              {availabilityMessage(aiStatus)}
            </p>
            <Button variant="ghost" onClick={() => {
              const { reason } = getLiveAIStatus();
              setAiStatus(reason);
              setError(null);
            }}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {chatHistory.length === 0 && isLive && (
        <div className="mb-3 space-y-2">
          <p className="text-xs text-ink-dim font-medium">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => handleStarter(p)}
                className="rounded-full bg-surface-2/60 px-3 py-1.5 text-xs text-ink hover:bg-surface-2 transition"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-0">
        {chatHistory.length === 0 && isLive && (
          <div className="rounded-xl bg-primary/5 p-3">
            <p className="text-sm text-ink leading-relaxed">
              Hi! I'm your AI tutor for the Zimbabwe Class 2 learner's licence. How can I help you today?
            </p>
          </div>
        )}
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

      <form onSubmit={handleSubmit} className="flex items-end gap-2 shrink-0">
        <textarea
          value={question}
          onChange={(e) => { setQuestion(e.target.value); setError(null); }}
          placeholder={isLive ? "Ask about any driving rule..." : "AI Tutor is offline..."}
          rows={1}
          maxLength={500}
          disabled={loading || !isLive}
          className="flex-1 resize-none rounded-xl bg-surface-2/60 px-3 py-2.5 text-sm text-ink placeholder-ink-dim focus:outline-none focus:ring-2 focus:ring-primary max-h-32 overflow-y-auto"
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 128) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          type="submit"
          disabled={loading || question.trim().length === 0 || !isLive}
          className="shrink-0 rounded-full bg-primary p-2 text-slate-950 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {loading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          )}
        </button>
      </form>
      {error && <p className="text-xs text-bad mt-2">{error}</p>}
      <p className="text-xs text-ink-dim mt-2">Responses are AI-generated. Always verify against official study material.</p>
    </div>
  );
}
