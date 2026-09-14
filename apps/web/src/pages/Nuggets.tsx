import { useState, useCallback, useEffect, useRef } from "react";
import {
  nuggetsByTopic,
  markNuggetRead,
  totalReadCount,
  totalNuggetCount,
  type TopicNuggets,
} from "../nuggets";

function StoriesViewer({
  topic,
  onClose,
}: {
  topic: TopicNuggets;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const nugget = topic.nuggets[index];

  useEffect(() => {
    if (nugget) markNuggetRead(nugget.id);
  }, [nugget]);

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i < topic.nuggets.length - 1) return i + 1;
      onClose();
      return i;
    });
  }, [topic.nuggets.length, onClose]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) { touchStartX.current = t.clientX; touchStartY.current = t.clientY; }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width * 0.5) goNext();
    else goPrev();
  };

  if (!nugget) return null;

  const progress = topic.nuggets.length > 1 ? index / (topic.nuggets.length - 1) : 1;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      onClick={handleTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-center gap-2 px-3 pt-2 pb-2">
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink"
        >
          ✕
        </button>
        <div className="flex-1 flex gap-1">
          {topic.nuggets.map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full bg-ink transition-all duration-300"
                style={{
                  width: i < index ? "100%" : i === index ? `${progress * 100}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>
        <span className="shrink-0 pl-2 text-xs text-ink-dim tabular-nums">
          {index + 1}/{topic.nuggets.length}
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 pb-6 overflow-hidden">
        {nugget.imageRef && (
          <img
            src={`/images/${nugget.imageRef}`}
            alt=""
            className="mb-4 max-h-[35vh] w-auto max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <h2
          className="text-xl font-bold text-center leading-tight"
          onClick={(e) => e.stopPropagation()}
        >
          {nugget.title}
        </h2>
        <p
          className="mt-3 text-sm text-ink-dim leading-relaxed text-center max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {nugget.text}
        </p>
      </div>

      <div className="px-5 pb-4 safe-bottom">
        <div className="flex items-center justify-between text-xs text-ink-dim">
          <span>{topic.topicLabel}</span>
          <span>{index + 1} of {topic.nuggets.length}</span>
        </div>
      </div>
    </div>
  );
}

export default function Nuggets() {
  const topics = nuggetsByTopic();
  const [viewingTopic, setViewingTopic] = useState<string | null>(null);

  const totalRead = totalReadCount(topics);
  const totalAll = totalNuggetCount(topics);

  const activeTopic = topics.find((t) => t.topicId === viewingTopic);

  if (activeTopic) {
    return (
      <StoriesViewer
        key={activeTopic.topicId}
        topic={activeTopic}
        onClose={() => setViewingTopic(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Nuggets</h1>
        <p className="text-sm text-ink-dim">
          {totalRead} of {totalAll} read. Tap a topic to start.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {topics.map((t) => {
          const pct = t.nuggets.length > 0 ? t.readCount / t.nuggets.length : 0;
          return (
            <button
              key={t.topicId}
              onClick={() => setViewingTopic(t.topicId)}
              className="rounded-2xl border border-line bg-surface p-4 text-left transition active:scale-[0.97]"
            >
              <div className="text-sm font-semibold leading-snug">{t.topicLabel}</div>
              <div className="mt-2 text-xs text-ink-dim">
                {t.readCount}/{t.nuggets.length}
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round(pct * 100)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
