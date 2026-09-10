import { useMemo } from "react";
import { useApp } from "../store";
import { topicMastery, smartTopicSession } from "../engine";
import { Card, Button, Meter } from "../ui";

export default function LearnPage() {
  const attempts = useApp((s) => s.attempts);
  const startSession = useApp((s) => s.startSession);

  const rows = useMemo(() => topicMastery(attempts).sort((a, b) => b.stat.mastery - a.stat.mastery), [attempts]);

  const practice = (topicId: string) => {
    const learnerId = useApp.getState().activeLearnerId;
    if (!learnerId) return;
    const r = smartTopicSession(topicId, attempts, learnerId);
    void startSession(r.session);
  };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Learn</h1>
      <p className="text-sm text-ink-dim">Topics and their current strength (smoothed mastery).</p>
      {rows.map(({ stat, topic }) => (
        <Card key={topic.id}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold">{topic.label}</span>
            <span className="text-xs text-ink-dim">{stat.evidence} attempt{stat.evidence === 1 ? "" : "s"}</span>
          </div>
          <Meter value={stat.mastery} />
          <div className="mt-2 text-xs text-ink-dim">
            {Math.round(stat.mastery * 100)}% mastery · {stat.status}
          </div>
          <div className="mt-3">
            <Button variant="ghost" onClick={() => practice(topic.id)}>
              Practise {topic.label.replace(/ & /g, " ")}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}