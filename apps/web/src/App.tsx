import { useEffect, useState, useCallback, useRef } from "react";
import { useApp, type Tab } from "./store";
import { useSync } from "./sync";
import { syncManager, fetchPlanStatus } from "./sync-supabase";
import { OnboardingFlow } from "./OnboardingFlow";
import { isSoundMuted, play, setSoundMuted } from "./sound";
import { onAuthStateChange, signInWithGoogle, getAccessToken } from "./auth";
import { setAuthTokenGetter } from "./ai-provider";
import HomePage from "./pages/Home";
import LearnPage from "./pages/Learn";
import PracticePage from "./pages/Practice";
import ProgressPage from "./pages/Progress";
import CoachPage from "./pages/Coach";
import SettingsPage from "./pages/Settings";
import PricingPage from "./pages/Pricing";
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

function PaymentReturnPage() {
  const setPlan = useApp((s) => s.setPlan);
  const [status, setStatus] = useState<"checking" | "paid" | "failed">("checking");
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  const timers = useRef<number[]>([]);
  const retries = useRef(0);
  const MAX_RETRIES = 30;

  useEffect(() => {
    return () => { timers.current.forEach(clearTimeout); };
  }, []);

  const schedulePoll = useCallback((delayMs: number) => {
    retries.current++;
    if (retries.current > MAX_RETRIES) {
      setStatus("failed");
      return;
    }
    const id = window.setTimeout(poll, delayMs);
    timers.current.push(id);
  }, []);

  const poll = useCallback(async () => {
    if (!ref) { setStatus("failed"); return; }
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/paynow/status?ref=${encodeURIComponent(ref)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401) { setStatus("failed"); return; }
      const data = await res.json();
      if (data.status === "paid") {
        setStatus("paid");
        const ps = await fetchPlanStatus().catch(() => null);
        setPlan("premium", ps?.planExpiresAt);
        const id = window.setTimeout(() => { window.location.replace("/"); }, 1500);
        timers.current.push(id);
      } else if (data.status === "pending") {
        schedulePoll(2000);
      } else {
        setStatus("failed");
      }
    } catch {
      schedulePoll(3000);
    }
  }, [ref, setPlan, schedulePoll]);

  useEffect(() => { poll(); }, [poll]);

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {status === "checking" && (
        <>
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-ink-dim border-t-primary" />
          <p className="text-sm text-ink-dim">Confirming your payment…</p>
        </>
      )}
      {status === "paid" && (
        <>
          <div className="mb-4 text-5xl">✓</div>
          <h2 className="text-xl font-bold text-ok">Payment confirmed!</h2>
          <p className="mt-2 text-sm text-ink-dim">Redirecting you to the app…</p>
        </>
      )}
      {status === "failed" && (
        <>
          <div className="mb-4 text-5xl">✕</div>
          <h2 className="text-xl font-bold text-bad">Payment not confirmed</h2>
          <p className="mt-2 text-sm text-ink-dim">Something went wrong. Please try again or contact support.</p>
          <button onClick={() => window.location.replace("/")} className="mt-4 text-sm text-primary font-medium">
            Back to app
          </button>
        </>
      )}
    </div>
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
      setError(e?.message ?? "Sign-in failed. Check console.");
      setLoading(false);
    }
  };

  return (
    <div className="app-shell overflow-y-auto">
      <div className="mx-auto max-w-lg space-y-8 px-6 py-10 text-center">
        <div className="flex justify-center">
          <img src="/logo-wordmark.png" alt="Zivvvo" className="h-14 w-auto" />
        </div>
        <div>
          <p className="mt-3 text-lg text-ink-dim">
            Pass your Zimbabwe VID Class 2 provisional licence test with confidence.
          </p>
        </div>

        <div className="space-y-4 text-left">
          <div className="rounded-xl bg-surface-2 p-4">
            <h3 className="font-semibold">1,200+ Exam Questions</h3>
            <p className="mt-1 text-sm text-ink-dim">Covering all road signs, rules, and vehicle controls for the ZVID test.</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-4">
            <h3 className="font-semibold">AI-Powered Explanations</h3>
            <p className="mt-1 text-sm text-ink-dim">Every answered question includes a clear explanation of the correct answer.</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-4">
            <h3 className="font-semibold">Works Offline</h3>
            <p className="mt-1 text-sm text-ink-dim">Study anywhere — no internet needed. Your progress syncs when you're back online.</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-4">
            <h3 className="font-semibold">Smart Study Plans</h3>
            <p className="mt-1 text-sm text-ink-dim">Adaptive practice targets your weak topics and tracks your exam readiness.</p>
          </div>
        </div>

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
        >
          {loading ? "Redirecting…" : "Sign in with Google"}
        </button>
        {error && (
          <p className="rounded-xl bg-bad/10 px-4 py-2 text-sm text-bad">{error}</p>
        )}

        <p className="text-xs text-ink-dim">
          Sign in to sync your progress across devices.
        </p>

        <footer className="border-t border-line pt-4 text-xs text-ink-dim">
          <a href="/privacy.html" className="underline hover:text-ink">Privacy Policy</a>
          {" · "}
          <a href="https://github.com/timiretimzzy/zivvvo" className="underline hover:text-ink" target="_blank" rel="noopener noreferrer">GitHub</a>
        </footer>
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
  const prevAuthUser = useRef<User | null>(null);

  useEffect(() => {
    return onAuthStateChange((user) => {
      setAuthUser(user);
      setAuthChecked(true);
      if (user) {
        const state = useApp.getState();
        if (!state.activeLearnerId || state.currentSupabaseUserId !== user.id) {
          void state.init(user.id);
        }
      } else if (prevAuthUser.current) {
        // Session expired or signed out — only clear auth state, NOT local data.
        // On explicit sign-out, store.signOut() already wiped IndexedDB.
        // On session expiry (token refresh failure), preserve local data so
        // cloud restore can recover it on next sign-in.
        useApp.setState({
          currentSupabaseUserId: null,
          plan: "free",
          planExpiresAt: undefined,
        });
      }
      prevAuthUser.current = user;
    });
  }, []);

  // Wire AI provider auth token getter (caches token from session)
  useEffect(() => {
    let cachedToken: string | null = null;
    void getAccessToken().then((t) => { cachedToken = t; });
    setAuthTokenGetter(() => cachedToken);
    // Refresh token when auth state changes
    const unsub = onAuthStateChange((user) => {
      if (user) {
        void getAccessToken().then((t) => { cachedToken = t; });
      } else {
        cachedToken = null;
      }
    });
    return unsub;
  }, []);

  const openSettings = () => {
    setShowSettings((prev) => !prev);
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
    if (!window.confirm("Sign out? Your data is saved to the cloud and will restore when you sign back in.")) return;
    await useApp.getState().signOut();
  };

  const userName = authUser?.user_metadata?.full_name ?? authUser?.email?.split("@")[0] ?? null;
  const userAvatar = authUser?.user_metadata?.avatar_url ?? null;

  const isPaymentReturn = window.location.pathname === "/payment/return";

  return (
    <ErrorBoundary>
      {isPaymentReturn ? (
        <div className="app-shell"><PaymentReturnPage /></div>
      ) : !ready || !authChecked ? (
        <div className="app-shell items-center justify-center text-ink-dim">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-ink-dim border-t-primary" />
          <p className="text-sm">Loading…</p>
        </div>
      ) : !authUser ? (
        <LoginScreen />
      ) : !activeLearnerId ? (
        <OnboardingFlow />
      ) : (
        <div className="app-shell">
          <header className="px-4 py-3 border-b border-line flex items-center justify-between">
            <img src="/logo-wordmark.png" alt="Zivvvo" className="h-6 w-auto" />
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
                ⏻
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-4 py-4">
            {activeSession ? (
              <PracticePage />
            ) : showSettings ? (
              <SettingsPage onBack={openSettings} />
            ) : tab === "pricing" ? (
              <PricingPage onBack={() => setTab("home")} />
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
