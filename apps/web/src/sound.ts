export type SoundName = "select" | "correct" | "wrong" | "start" | "pass" | "fail" | "levelUp";

const MUTE_KEY = "zivvvo.soundMuted";

let audioCtx: AudioContext | null = null;
let muted = loadMuted();

function loadMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = "triangle",
  gain = 0.14,
): void {
  const ctx = ensureCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.05);
}

const PLAYERS: Record<SoundName, () => void> = {
  select: () => tone(660, 0, 0.08, "triangle", 0.06),
  correct: () => {
    tone(523, 0, 0.12);
    tone(784, 0.1, 0.16);
  },
  wrong: () => {
    tone(196, 0, 0.18, "sawtooth", 0.08);
    tone(155, 0.14, 0.22, "sawtooth", 0.06);
  },
  start: () => {
    tone(392, 0, 0.09);
    tone(523, 0.09, 0.12);
  },
  pass: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.2));
  },
  fail: () => {
    tone(233, 0, 0.2, "sawtooth", 0.08);
    tone(185, 0.2, 0.26, "sawtooth", 0.06);
  },
  levelUp: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.14));
  },
};

export function play(name: SoundName): void {
  if (muted) return;
  try {
    PLAYERS[name]();
  } catch {
    /* audio unavailable */
  }
}

export function vibrate(pattern: number | number[]): void {
  if (muted) return;
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* noop */
    }
  }
}

export function isSoundMuted(): boolean {
  return muted;
}

export function setSoundMuted(value: boolean): void {
  muted = value;
  if (typeof localStorage === "undefined") return;
  try {
    if (value) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* noop */
  }
}