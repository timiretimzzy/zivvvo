import { useState, type ReactNode } from "react";

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>
      {title && <h2 className="mb-2 text-sm font-semibold text-ink-dim">{title}</h2>}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  const styles = {
    primary: "bg-primary text-slate-950 hover:brightness-110",
    ghost: "bg-surface-2 text-ink hover:brightness-110",
    danger: "bg-bad/20 text-bad border border-bad/40 hover:brightness-110",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Meter({ value, max = 1 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color = pct >= 80 ? "bg-ok" : pct >= 60 ? "bg-warn" : "bg-bad";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "ok" | "warn" | "bad" | "neutral" }) {
  const tones = {
    ok: "bg-ok/15 text-ok",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/15 text-bad",
    neutral: "bg-surface-2 text-ink-dim",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones}`}>{children}</span>;
}

export function QuestionMedia({ imageRef, className = "" }: { imageRef?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!imageRef || failed) return null;
  return (
    <div className={`mb-3 flex justify-center overflow-hidden rounded-xl bg-surface-2 ${className}`}>
      <img
        src={`/images/${imageRef}`}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-h-52 w-auto object-contain"
      />
    </div>
  );
}