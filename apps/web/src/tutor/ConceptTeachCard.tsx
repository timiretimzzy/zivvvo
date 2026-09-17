/**
 * D6: Reusable "Teach Before Practice" Component
 *
 * A single teaching surface usable from Home, Practice, Mock Results,
 * Mistake Book, and Coach. Shows concept explanation, key rule, and
 * a direct path into targeted practice.
 *
 * Concept → What you need to know → Key rule → Practice
 */
import { useState } from "react";
import { useApp } from "../store";
import { conceptSession } from "../engine";
import { Card, Button, Tag } from "../ui";
import { play, vibrate } from "../sound";
import type { ConceptSummary } from "./context";

interface ConceptTeachCardProps {
  concept: ConceptSummary;
  /** Explanation text (author-written T0). */
  explanation?: string | null;
  /** Concise key rule derived from content. */
  keyRule?: string | null;
  /** Show the practice button. Default true. */
  showPractice?: boolean;
  /** Called after practice is launched (optional). */
  onPractice?: () => void;
  /** Compact variant for inline use. */
  compact?: boolean;
  /** Optional children rendered below the card content (e.g., AI enhancement). */
  children?: React.ReactNode;
}

export default function ConceptTeachCard({
  concept,
  explanation,
  keyRule,
  showPractice = true,
  onPractice,
  compact = false,
  children,
}: ConceptTeachCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const startSession = useApp((s) => s.startSession);
  const canStartSession = useApp((s) => s.canStartSession);
  const allAttempts = useApp((s) => s.attempts);
  const learnerId = useApp((s) => s.activeLearnerId);
  const setTab = useApp((s) => s.setTab);

  const label = concept.concept
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const statusTag = (() => {
    switch (concept.state) {
      case "strong": return <Tag tone="ok">Strong</Tag>;
      case "developing": return <Tag tone="warn">Developing</Tag>;
      case "needs-attention": return <Tag tone="bad">Needs attention</Tag>;
      default: return <Tag tone="neutral">New</Tag>;
    }
  })();

  const handlePractice = () => {
    if (!canStartSession("concept-recovery")) { setPaywall(true); return; }
    play("start");
    vibrate(20);
    const r = conceptSession(concept.concept, allAttempts, learnerId!, 8);
    if (r) void startSession(r.session);
    onPractice?.();
  };

  if (compact) {
    return (
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold">{label}</span>
          {statusTag}
        </div>
        {keyRule && (
          <p className="text-xs text-ink-dim mb-2">{keyRule}</p>
        )}
        {showPractice && concept.state !== "strong" && (
          <Button variant="ghost" className="!py-1.5 !text-xs" onClick={handlePractice}>
            Practice {label}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold">{label}</h3>
        {statusTag}
      </div>

      {/* Key rule — always visible if available */}
      {keyRule && (
        <div className="rounded-xl bg-surface-2/60 p-3 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim mb-1">Key rule</p>
          <p className="text-sm text-ink leading-snug">{keyRule}</p>
        </div>
      )}

      {/* Full explanation — expandable */}
      {explanation && (
        <div className="mb-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {expanded ? "Hide explanation" : "Read the full explanation"}
          </button>
          {expanded && (
            <p className="mt-2 text-sm text-ink-dim leading-relaxed">{explanation}</p>
          )}
        </div>
      )}

      {/* No explanation available */}
      {!explanation && !keyRule && (
        <p className="text-xs text-ink-dim mb-3">
          Answer a few {label} questions to build up teaching content for this concept.
        </p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-ink-dim mb-3">
        {concept.attempts > 0 && (
          <span>{concept.correct} / {concept.attempts} correct</span>
        )}
        <span>{concept.mastery > 0 ? `${Math.round(concept.mastery * 100)}% mastery` : "No attempts yet"}</span>
      </div>

      {/* Practice button */}
      {showPractice && concept.state !== "strong" && (
        <Button onClick={handlePractice}>Practice {label}</Button>
      )}

      {/* Children slot (AI enhancement, etc.) */}
      {children}

      {/* Paywall */}
      {paywall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setPaywall(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Upgrade to continue</h2>
            <p className="mt-2 text-sm text-ink-dim">
              Concept recovery sessions are available for premium learners.
            </p>
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
