import { useState } from "react";
import { pack } from "../catalog";
import {
  nuggetsByTopic,
  toggleNuggetRead,
  totalReadCount,
  totalNuggetCount,
  getReadNuggets,
  type Nugget,
  type TopicNuggets,
} from "../nuggets";
import { Card, Meter } from "../ui";

function NuggetCard({ nugget, isRead, onToggle }: { nugget: Nugget; isRead: boolean; onToggle: () => void }) {
  return (
    <div className={`rounded-xl border p-3 transition ${isRead ? "border-ok/30 bg-ok/5" : "border-line bg-surface"}`}>
      <p className="text-sm font-medium leading-snug">{nugget.stem}</p>
      <p className="mt-2 text-sm text-ink-dim leading-relaxed">{nugget.explanation}</p>
      <button
        onClick={onToggle}
        className={`mt-2 flex items-center gap-1.5 text-xs font-medium transition ${isRead ? "text-ok" : "text-ink-dim hover:text-ink"}`}
      >
        <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${isRead ? "border-ok bg-ok text-white" : "border-ink-dim"}`}>
          {isRead && "✓"}
        </span>
        {isRead ? "Read" : "Mark as read"}
      </button>
    </div>
  );
}

function TopicSection({
  topic,
  readSet,
  onToggle,
  isOpen,
  onOpen,
}: {
  topic: TopicNuggets;
  readSet: Set<string>;
  onToggle: (qid: string) => void;
  isOpen: boolean;
  onOpen: () => void;
}) {
  const pct = topic.nuggets.length > 0 ? topic.readCount / topic.nuggets.length : 0;
  return (
    <Card>
      <button onClick={onOpen} className="w-full text-left">
        <div className="flex items-center justify-between">
          <span className="font-semibold">{topic.topicLabel}</span>
          <span className="text-xs text-ink-dim">{topic.readCount}/{topic.nuggets.length}</span>
        </div>
        <div className="mt-2">
          <Meter value={pct} />
        </div>
      </button>
      {isOpen && (
        <div className="mt-3 space-y-3">
          {topic.nuggets.map((n) => (
            <NuggetCard
              key={n.qid}
              nugget={n}
              isRead={readSet.has(n.qid)}
              onToggle={() => onToggle(n.qid)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Nuggets() {
  const topics = nuggetsByTopic(pack);
  const [readSet, setReadSet] = useState<Set<string>>(getReadNuggets);
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  const totalRead = totalReadCount(topics);
  const totalAll = totalNuggetCount(topics);

  const handleToggle = (qid: string) => {
    const next = toggleNuggetRead(qid);
    setReadSet(new Set(next));
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Read & Learn</h1>
        <p className="text-sm text-ink-dim">
          {totalRead} of {totalAll} nuggets read. Tap a topic to browse.
        </p>
      </div>

      {topics.map((t) => (
        <TopicSection
          key={t.topicId}
          topic={t}
          readSet={readSet}
          onToggle={handleToggle}
          isOpen={openTopic === t.topicId}
          onOpen={() => setOpenTopic(openTopic === t.topicId ? null : t.topicId)}
        />
      ))}
    </div>
  );
}
