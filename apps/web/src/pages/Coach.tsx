import { useMemo } from "react";
import { useApp } from "../store";
import { weaknesses } from "../engine";
import { Card, Tag } from "../ui";

const KIND_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
  recurring: { label: "Recurring", tone: "bad" },
  deteriorating: { label: "Deteriorating", tone: "bad" },
  "long-unreviewed": { label: "Cold", tone: "warn" },
  early: { label: "Early", tone: "warn" },
};

export default function CoachPage() {
  const attempts = useApp((s) => s.attempts);

  const weak = useMemo(() => weaknesses(attempts), [attempts]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Coach</h1>
      <p className="text-sm text-ink-dim">Evidence-ranked areas needing attention.</p>
      {weak.length === 0 && (
        <Card>
          <p className="text-sm text-ink-dim">Nothing demanding attention right now. Keep practising to keep it that way.</p>
        </Card>
      )}
      {weak.map(({ signal, topic }) => (
        <Card key={topic.id}>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold">{topic.label}</span>
            <Tag tone={KIND_LABEL[signal.kind]?.tone ?? "neutral"}>{KIND_LABEL[signal.kind]?.label ?? signal.kind}</Tag>
          </div>
          <div className="space-y-1 text-xs text-ink-dim">
            {signal.reasons.map((r, i) => (
              <p key={`${signal.kind}-${i}`}>{r}</p>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}