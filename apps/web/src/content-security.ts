/**
 * Content Security Layer – Zivvvo
 *
 * Provides per-user option shuffling (watermark) and user fingerprinting
 * for leak tracing.  Deterministic so the same user always sees the same
 * order for the same question.
 *
 * Copyright © 2026 Zivvvo. All rights reserved.
 */

import type { Question } from "@zivvvo/content";

/* ── Mulberry32 seeded PRNG ─────────────────────────────────────────── */

/** Simple 32-bit seeded PRNG – fast, reproducible, good enough for shuffle. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Hash helper (djb2 variant) ─────────────────────────────────────── */

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/* ── Exports ────────────────────────────────────────────────────────── */

/**
 * Deterministic seed-based shuffle: same user+question always produces the
 * same permutation.  Used as a watermark – if answers leak, the option
 * order reveals which account leaked them.
 */
export function shuffleOptions<T>(options: T[], seed: string): T[] {
  const arr = options.slice();
  const rng = mulberry32(djb2(seed));

  // Fisher-Yates shuffle with seeded RNG
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }

  return arr;
}

/**
 * Create a per-user shuffled clone of a single question.
 * The `correctIndexes` array is re-mapped to match the new option order
 * so correctness data stays consistent.
 */
export function secureQuestion(q: Question, userId: string): Question {
  const seed = `${userId}::${q.qid}`;
  const shuffledOptions = shuffleOptions(q.options, seed);

  // Rebuild correctIndexes to point at the new positions
  const correctTexts = new Set(
    q.options
      .map((opt, i) => (opt.isCorrect ? i : -1))
      .filter((i) => i !== -1)
      .map((i) => q.options[i]!.text)
  );
  const newCorrectIndexes = shuffledOptions
    .map((opt, i) => (correctTexts.has(opt.text) ? i : -1))
    .filter((i) => i !== -1);

  return {
    ...q,
    options: shuffledOptions,
    correctIndexes: newCorrectIndexes,
  };
}

/**
 * Batch-secure a list of questions for a given user.
 */
export function secureQuestions(questions: Question[], userId: string): Question[] {
  return questions.map((q) => secureQuestion(q, userId));
}

/**
 * Generate a short fingerprint for a user ID, embedded in session data.
 * If leaked answer sets are recovered, this lets you trace the source.
 */
export function userFingerprint(userId: string): string {
  const hash = djb2(`fingerprint::${userId}`);
  // 8-char hex fingerprint
  return hash.toString(16).padStart(8, "0");
}
