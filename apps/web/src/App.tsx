import { useEffect, useState } from "react";
import { useApp, type Tab } from "./store";
import { useSync } from "./sync";
import { syncManager } from "./sync-supabase";
import { OnboardingFlow } from "./OnboardingFlow";
import { isSoundMuted, play, setSoundMuted } from "./sound";
import { onAuthStateChange, signInWithGoogle } from "./auth";
import { Button } from "./ui";
import HomePage from "./pages/Home";
import LearnPage from "./pages/Learn";
import PracticePage from "./pages/Practice";
import ProgressPage from "./pages/Progress";
import CoachPage from "./pages/Coach";
import SettingsPage from "./pages/Settings";
import ErrorBoundary from "./ErrorBoundary";
import type { User } from "@supabase/supabase-js";

function SyncIndicator() {
  const sync = useSync();
  if (!sync.configured) return null;
  const handleClick = () => {
    if (sync.state !== "syncing") void syncManager.sync();
  };
  if (sync.state === "syncing") {
    return (
      <span className="flex items-center gap-1 text-xs text-ink-dim" title="Syncing…">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ink-dim border-t-transparent" />
      </span>
    );
  }
  if (sync.state === "error") {
    return (
      <button
        onClick={handleClick}
        className="flex items-center gap-1 rounded-full bg-bad/15 px-2 py-0.5 text-xs text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title={`Sync error: ${sync.lastError} — tap to retry`}
      >
        ✕ Sync
      </button>
    );
  }
  if (sync.pending > 0) {
    return (
      <button
        onClick={handleClick}
        className="flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-xs text-warn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title={`${sync.pending} pending — tap to sync`}
      >
        {sync.pending} queued
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-ok" title="All synced">
      ✓ Synced
    </span>
  );
}

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      console.error("[Zivvvo] Login failed:", e);
      setError(e?.message ?? "Sign-in failed. Check console for details.");
      setLoading(false);
    }
  };
  return (
    <div className="app-shell items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-3xl font-bold">Zivvvo</h1>
          <p className="mt-2 text-ink-dim">Adaptive road-rules practice for the ZVID provisional licence test.</p>
        </div>
        <Button onClick={handleSignIn} disabled={loading}>
          {loading ? "Redirecting…" : "Sign in with Google"}
        </Button>
        {error && (
          <p className="text-sm text-bad bg-bad/10 rounded-xl px-4 py-2">{error}</p>
        )}
        <p className="text-xs text-ink-dim">Sign in to sync your progress across devices.</p>
      </div>
    </div>
  );
}

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
  const [muted, setMuted] = useState(isSoundMuted());
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    return onAuthStateChange((user) => {
      setAuthUser(user);
      setAuthChecked(true);
    });
  }, []);

  const openSettings = () => {
    if (showSettings) {
      setShowSettings(false);
    } else {
      setShowSettings(true);
      setTab("home");
    }
  };

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

  const handleSignOut = async () => {
    await useApp.getState().signOut();
  };

  const userName = authUser?.user_metadata?.full_name ?? authUser?.email?.split("@")[0] ?? null;
  const userAvatar = authUser?.user_metadata?.avatar_url ?? null;

  return (
    <ErrorBoundary>
      {!ready || !authChecked ? (
        <div className="app-shell items-center justify-center text-ink-dim">Loading…</div>
      ) : !authUser ? (
        <LoginScreen />
      ) : !activeLearnerId ? (
        <OnboardingFlow />
      ) : (
        <div className="app-shell">
          <header className="px-4 py-3 border-b border-line flex items-center justify-between">
            <span className="font-bold">Zivvvo</span>
            <div className="flex items-center gap-3">
              <SyncIndicator />
              {userName && (
                <span className="flex items-center gap-2 text-xs text-ink-dim">
                  {userAvatar && (
                    <img src={userAvatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                  )}
                  {userName}
                </span>
              )}
              <button
                onClick={toggleMute}
                aria-label={muted ? "Unmute sounds" : "Mute sounds"}
                className="rounded-lg bg-surface-2 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title={muted ? "Unmute sounds" : "Mute sounds"}
              >
                {muted ? "🔇" : "🔊"}
              </button>
              <button
                onClick={openSettings}
                aria-label="Settings"
                className={`rounded-lg px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  showSettings ? "bg-primary text-slate-950" : "bg-surface-2"
                }`}
                title="Settings"
              >
                ⚙
              </button>
              <button
                onClick={handleSignOut}
                className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-ink-dim hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title="Sign out"
              >
                ↗
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-4 py-4">
            {activeSession ? (
              <PracticePage />
            ) : showSettings ? (
              <SettingsPage onBack={openSettings} />
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

          <nav className="safe-bottom grid grid-cols-5 border-t border-line bg-surface relative z-50">
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
