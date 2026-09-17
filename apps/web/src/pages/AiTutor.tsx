/**
 * D8: Dedicated AI Tutor Page — full conversational interface
 *
 * Separate from Coach landing page. Contains:
 * - Chat history (persistent within session)
 * - Starter prompts
 * - Learner context for personalization
 * - Conversation continuity for follow-ups
 */
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useApp } from "../store";
import { Card, Button } from "../ui";
import { buildTutorContext } from "../tutor";
import {
  getAiConsent,
  setAiConsent,
  aiAnswerQuestion,
} from "../ai-provider";
import type { ConversationMessage } from "@zivvvo/ai-gateway";

const STARTER_PROMPTS = [
  "What should I study?",
  "Why did I get this wrong?",
  "Explain this rule.",
  "Give me an example.",
  "Explain it more simply.",
];

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
  const scrollRef = useRef<HTMLDivElement>(null);

  const ctx = useMemo(
    () => buildTutorContext(attempts, learnerId ?? undefined, learnerExamDate, learnerConfidence as string | undefined),
    [attempts, learnerId, learnerExamDate, learnerConfidence],
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, loading]);

  const handleConsent = () => { setAiConsent(true); setAiConsentState(true); };

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
      const result = await aiAnswerQuestion(
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
          },
        },
        chatHistory,
      );
      setChatHistory((prev) => [...prev, {
        role: "ai",
        text: result.available && result.text.length > 0 ? result.text : "I can't help with that right now. Try rephrasing your question.",
      }]);
    } catch {
      setError("Failed to get response. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [question, loading, ctx, chatHistory]);

  const handleStarter = useCallback((prompt: string) => {
    setQuestion(prompt);
  }, []);

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
      </div>

      <p className="text-xs text-ink-dim mb-2">
        Ask me about your learner's licence. AI responses are based on Zivvvo's study material.
      </p>

      {chatHistory.length === 0 && (
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
        {chatHistory.length === 0 && (
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

      <form onSubmit={handleSubmit} className="flex gap-2 shrink-0">
        <input
          type="text"
          value={question}
          onChange={(e) => { setQuestion(e.target.value); setError(null); }}
          placeholder="Ask about any driving rule..."
          className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2 text-sm text-ink placeholder-ink-dim focus:outline-none focus:ring-2 focus:ring-primary"
          maxLength={500}
          disabled={loading}
        />
        <Button type="submit" disabled={loading || question.trim().length === 0} className="!px-4">
          {loading ? "..." : "Send"}
        </Button>
      </form>
      {error && <p className="text-xs text-bad mt-2">{error}</p>}
      <p className="text-xs text-ink-dim mt-2">Responses are AI-generated. Always verify against official study material.</p>
    </div>
  );
}
