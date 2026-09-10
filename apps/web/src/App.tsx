import { useEffect, useState } from "react";
import { useApp, type Tab } from "./store";
import { syncManager } from "./sync-supabase";
import { OnboardingFlow } from "./OnboardingFlow";
import { isSoundMuted, play, setSoundMuted } from "./sound";
import HomePage from "./pages/Home";
import LearnPage from "./pages/Learn";
import PracticePage from "./pages/Practice";
import ProgressPage from "./pages/Progress";
import CoachPage from "./pages/Coach";
import ErrorBoundary from "./ErrorBoundary";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "learn", label: "Learn", icon: "▤" },
  { id: "practice", label: "Practice", icon: "▶" },
  { id: "progress", label: "Progress", icon: "◔" },
  { id: "coach", label: "Coach", icon: "✎" },
];

export default function App() {
  const ready = useApp((s) => s.ready);
  const activeLearnerId = useApp((s) => s.activeLearnerId);
  const activeSession = useApp((s) => s.activeSession);
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const learnerName = useApp((s) => s.learners.find((l) => l.id === s.activeLearnerId)?.name);
  const [muted, setMuted] = useState(isSoundMuted());

  const toggleMute = () => {
    const next = !muted;
    setSoundMuted(next);
    setMuted(next);
    if (!next) play("select");
  };

  useEffect(() => {
    if (!ready) return;
    void syncManager.refreshPending();
    void syncManager.sync();
    const onOnline = () => void syncManager.sync();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [ready]);

  return (
    <ErrorBoundary>
      {!ready ? (
        <div className="app-shell items-center justify-center text-ink-dim">Loading…</div>
      ) : !activeLearnerId ? (
        <OnboardingFlow />
      ) : (
        <div className="app-shell">
          <header className="px-4 py-3 border-b border-line flex items-center justify-between">
            <span className="font-bold">Zivvvo</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-dim">{learnerName ?? "Learner"}</span>
              <button
                onClick={toggleMute}
                aria-label={muted ? "Unmute sounds" : "Mute sounds"}
                className="rounded-lg bg-surface-2 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title={muted ? "Unmute sounds" : "Mute sounds"}
              >
                {muted ? "🔇" : "🔊"}
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-4 py-4">
            {activeSession ? (
              <PracticePage />
            ) : tab === "home" ? (
              <HomePage />
            ) : tab === "learn" ? (
              <LearnPage />
            ) : tab === "practice" ? (
              <PracticePage />
            ) : tab === "progress" ? (
              <ProgressPage />
            ) : (
              <CoachPage />
            )}
          </main>

          <nav className="safe-bottom grid grid-cols-5 border-t border-line bg-surface">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-col items-center gap-1 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  tab === t.id ? "text-primary" : "text-ink-dim"
                }`}
              >
                <span className="text-base leading-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      )}
    </ErrorBoundary>
  );
}