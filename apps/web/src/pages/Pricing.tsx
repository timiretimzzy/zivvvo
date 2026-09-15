import { useState } from "react";
import { useApp } from "../store";
import { getSupabaseUserId, getCurrentUser, getAccessToken } from "../auth";

const PLANS = [
  { id: "monthly", price: "$2", period: "month", savings: null },
  { id: "sixmonth", price: "$8", period: "6 months", savings: "33%" },
  { id: "yearly", price: "$12", period: "year", savings: "50%" },
] as const;

export default function PricingPage() {
  const plan = useApp((s) => s.plan);
  const planExpiresAt = useApp((s) => s.planExpiresAt);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async (planId: string) => {
    setError(null);
    setLoading(planId);
    try {
      const userId = getSupabaseUserId();
      const user = await getCurrentUser();
      const token = await getAccessToken();
      if (!userId || !user || !token) {
        setError("Please sign in first.");
        setLoading(null);
        return;
      }

      const res = await fetch("/api/paynow/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: planId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Payment initiation failed. Try again.");
        setLoading(null);
        return;
      }

      window.location.href = data.redirectUrl;
    } catch {
      setError("Network error. Check your connection.");
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("home")}
          className="rounded-lg bg-surface-2 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold">Upgrade to Premium</h1>
          <p className="text-sm text-ink-dim">Unlock unlimited practice sessions.</p>
        </div>
      </div>

      {plan === "premium" ? (
        <div className="rounded-2xl border border-ok/30 bg-ok/5 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-ok/20 px-2.5 py-0.5 text-xs font-semibold text-ok">
              ★ Premium
            </span>
          </div>
          {planExpiresAt && (
            <p className="mt-2 text-sm text-ink-dim">
              Active until {new Date(planExpiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          )}
          {!planExpiresAt && (
            <p className="mt-2 text-sm text-ink-dim">Lifetime access</p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm font-medium">Current plan: Free</p>
          <p className="mt-1 text-xs text-ink-dim">1 diagnostic + 1 practice session per day</p>
        </div>
      )}

      {plan !== "premium" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {PLANS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleUpgrade(p.id)}
                disabled={loading !== null}
                className="flex flex-col items-center rounded-2xl border border-line bg-surface p-4 text-center transition active:scale-[0.97] disabled:opacity-40"
              >
                <span className="text-2xl font-bold">{p.price}</span>
                <span className="mt-0.5 text-xs text-ink-dim">/ {p.period}</span>
                {p.savings && (
                  <span className="mt-2 rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-semibold text-ok">
                    Save {p.savings}
                  </span>
                )}
                <span className="mt-3 text-xs font-semibold text-primary">
                  {loading === p.id ? "Redirecting…" : "Upgrade"}
                </span>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">Premium includes</h2>
            <ul className="mt-2 space-y-2 text-sm text-ink-dim">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-ok">✓</span>
                Unlimited practice sessions
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-ok">✓</span>
                Mock exams
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-ok">✓</span>
                No daily limits
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-ok">✓</span>
                Works offline
              </li>
            </ul>
          </div>
        </>
      )}

      {error && (
        <p className="rounded-xl bg-bad/10 px-4 py-2 text-sm text-bad">{error}</p>
      )}
    </div>
  );
}
