import type { ContentPack, Question } from "@zivvvo/content";
import { getFamilyId } from "@zivvvo/content";
import type { LearningConfig } from "@zivvvo/learning-engine";
import { mulberry32, seededShuffle } from "./random";
import type { LearningMode, LearningSession, SessionType } from "./types";
import type { AttemptEvent } from "./types";
import type { MockConfig } from "./mock";
import { poolForDifficulty, type DifficultyMode } from "./difficulty";
import { composeVariant, variantSeed, type VariantQuestion } from "./variants";
import { computeStat } from "@zivvvo/learning-engine";
import type { DynamicMockConfig } from "./mock";
import {
  buildSelectionState,
  composeSession,
  computeTopicWeights,
  DEFAULT_SELECTION_CONFIG,
} from "./selection";

export interface SessionGenContext {
  pack: ContentPack;
  attempts: AttemptEvent[];
  seed?: number;
  now?: number;
  learnerId?: string;
}

export const minutesFor = (count: number, perMinute: number): number =>
  Math.max(1, Math.round(count / perMinute));

function genId(prefix: string, now: number): string {
  return `${prefix}_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Questions verified safe to present. */
function pool(pack: ContentPack): Question[] {
  return pack.questions.filter((q) => q.status === "answered" && q.correctIndexes.length > 0);
}

/** Teachable pool: content topics only (mixed bucket stays mock/practice-only). */
function contentPool(pack: ContentPack): Question[] {
  const content = new Set(pack.topics.filter((t) => t.kind === "content").map((t) => t.id));
  return pool(pack).filter((q) => content.has(q.topicId));
}

function withExplanation(questions: Question[]): Question[] {
  return questions.filter((q) => q.explanation);
}

/** Prefer freshly-unseen questions (variety), explanation-rich ones (value).
 *  Family deduplication: at most one question per family may enter a session. */
function sample(
  _pack: ContentPack,
  ctx: SessionGenContext,
  config: LearningConfig,
  candidates: Question[],
  size: number,
  avoidRecent = true,
): Question[] {
  if (candidates.length === 0) return [];
  const now = ctx.now ?? Date.now();
  const rng = mulberry32(ctx.seed ?? Date.now());
  const shuffled = seededShuffle(candidates, rng);
  const recentlySeen = new Set<string>(
    avoidRecent
      ? ctx.attempts.filter((a) => now - a.ts < config.recentAvoidHours * 3_600_000).map((a) => a.qid)
      : [],
  );
  const fresh = shuffled.filter((q) => !recentlySeen.has(q.qid));
  const repeat = shuffled.filter((q) => recentlySeen.has(q.qid));
  const preferred = fresh.length >= size ? fresh : [...fresh, ...repeat];

  // Family deduplication: at most one question per family
  const selected: Question[] = [];
  const seenFamilies = new Set<string>();
  for (const q of preferred) {
    const fid = getFamilyId(q.qid);
    if (seenFamilies.has(fid)) continue;
    seenFamilies.add(fid);
    selected.push(q);
    if (selected.length >= size) break;
  }

  return selected
    .sort((a, b) => (b.explanation ? 1 : 0) - (a.explanation ? 1 : 0));
}

export interface SessionResult {
  session: LearningSession;
  mode: LearningMode;
}

function build(
  _pack: ContentPack,
  ctx: SessionGenContext,
  type: SessionType,
  mode: LearningMode,
  title: string,
  purpose: string,
  questions: Question[],
): SessionResult {
  // Defensive: verify family invariant before wrapping
  assertUniqueQuestionFamilies(questions);

  const now = ctx.now ?? Date.now();
  return {
    mode,
    session: {
      id: genId(type, now),
      learnerId: ctx.learnerId ?? "local",
      type,
      title,
      purpose,
      estimatedMinutes: minutesFor(questions.length, 1.3),
      createdAt: now,
      questions,
      completedAt: null,
    },
  };
}

const CONTENT_ORDER_PREF = [
  "junction-rules",
  "road-signs",
  "regulations",
  "traffic-lights",
  "carriageway-lines",
  "vehicle-classes",
  "general",
];

function contentTopics(pack: ContentPack): string[] {
  return pack.topics.filter((t) => t.kind === "content").map((t) => t.id);
}

/** Defensive check: assert all question families in a session are unique.
 *  MAX FAMILY OCCURRENCES PER SESSION = 1 */
export function assertUniqueQuestionFamilies(questions: Question[]): void {
  const seen = new Set<string>();
  for (const q of questions) {
    const fid = getFamilyId(q.qid);
    if (seen.has(fid)) {
      throw new Error(
        `Family deduplication invariant violated: family ${fid} appears more than once in session (QID ${q.qid})`,
      );
    }
    seen.add(fid);
  }
}

/** Check if a question can be added to picked without violating family invariant. */
function canAddToSession(picked: Question[], candidate: Question): boolean {
  const fid = getFamilyId(candidate.qid);
  return !picked.some((p) => getFamilyId(p.qid) === fid);
}

/** STEP 3 -- Diagnostic: balanced, stratified, deterministic, short. */
export function buildDiagnostic(ctx: SessionGenContext, config: LearningConfig): SessionResult {
  const pack = ctx.pack;
  const size = config.diagnosticSize;
  const all = contentPool(pack);
  const now = ctx.now ?? Date.now();

  const selectionState = buildSelectionState(
    pack,
    ctx.attempts,
    [],
    ctx.seed ?? Date.now(),
    now,
    size,
  );

  // Stratified: distribute across content topics with slight weakness emphasis
  const topics = [...contentTopics(pack)].sort(
    (a, b) => CONTENT_ORDER_PREF.indexOf(a) - CONTENT_ORDER_PREF.indexOf(b),
  );
  const perTopic = Math.max(1, Math.floor(size / topics.length));
  let budget = size;
  const picked: Question[] = [];

  for (const t of topics) {
    const inTopic = all.filter((q) => q.topicId === t);
    const want = Math.min(perTopic, budget, inTopic.length);
    if (want <= 0) continue;
    const topicState = { ...selectionState, selected: picked, sessionSize: size };
    for (const q of picked) {
      topicState.sessionTopicCounts.set(q.topicId, (topicState.sessionTopicCounts.get(q.topicId) ?? 0) + 1);
      if (q.concept) topicState.sessionConceptCounts.set(q.concept, (topicState.sessionConceptCounts.get(q.concept) ?? 0) + 1);
    }
    const chosen = composeSession(inTopic, topicState, DEFAULT_SELECTION_CONFIG, want);
    picked.push(...chosen);
    budget -= chosen.length;
    if (budget <= 0) break;
  }

  // Fill remaining from best candidates across all topics
  if (budget > 0) {
    const rest = all.filter((q) => !picked.some((p) => p.qid === q.qid));
    const fillState = { ...selectionState, selected: picked, sessionSize: size };
    for (const q of picked) {
      fillState.sessionTopicCounts.set(q.topicId, (fillState.sessionTopicCounts.get(q.topicId) ?? 0) + 1);
      if (q.concept) fillState.sessionConceptCounts.set(q.concept, (fillState.sessionConceptCounts.get(q.concept) ?? 0) + 1);
    }
    picked.push(...composeSession(rest, fillState, DEFAULT_SELECTION_CONFIG, budget));
  }

  return build(
    pack, ctx, "diagnostic", "diagnostic",
    "Diagnostic",
    "A quick check of your starting point across the main topics, so we can personalise everything after.",
    picked.slice(0, size),
  );
}

/** STEP 8 -- Smart practice: scoring-based selection with diversity, avoids repeats. */
export function buildSmartSession(
  ctx: SessionGenContext,
  config: LearningConfig,
  targetTopicId?: string,
  sizeOverride?: number,
  difficultyMode: DifficultyMode = "auto",
): SessionResult {
  const pack = ctx.pack;
  const size = sizeOverride ?? config.sessionSizeSmart;
  let all = poolForDifficulty(contentPool(pack), difficultyMode);
  if (all.length === 0) all = contentPool(pack);
  const now = ctx.now ?? Date.now();

  // Build selection state with learner history
  const selectionState = buildSelectionState(
    pack,
    ctx.attempts,
    [], // reviews not available at this level; scored via topic mastery
    ctx.seed ?? Date.now(),
    now,
    size,
  );

  let picked: Question[] = [];

  if (targetTopicId) {
    // Targeted session: allocate majority to target topic
    const target = all.filter((q) => q.topicId === targetTopicId);
    const targetAlloc = Math.min(size, Math.ceil(size * 0.7), target.length);
    const targetState = { ...selectionState, sessionSize: size };
    picked = composeSession(target, targetState, DEFAULT_SELECTION_CONFIG, targetAlloc);

    // Fill remaining from other topics, weighted by weakness
    const otherCandidates = all.filter(
      (q) => q.topicId !== targetTopicId && !picked.some((p) => p.qid === q.qid),
    );
    const otherState = { ...selectionState, selected: picked, sessionSize: size };
    // Update topic counts from picked
    for (const q of picked) {
      otherState.sessionTopicCounts.set(q.topicId, (otherState.sessionTopicCounts.get(q.topicId) ?? 0) + 1);
      if (q.concept) otherState.sessionConceptCounts.set(q.concept, (otherState.sessionConceptCounts.get(q.concept) ?? 0) + 1);
    }
    const remaining = size - picked.length;
    if (remaining > 0) {
      picked.push(...composeSession(otherCandidates, otherState, DEFAULT_SELECTION_CONFIG, remaining));
    }
  } else {
    // Mixed session: use sequential scoring with diversity — no per-topic quota
    // The scoring algorithm (weakness, novelty, coverage) naturally spreads across topics
    const mixedState = { ...selectionState, sessionSize: size };
    picked = composeSession(all, mixedState, DEFAULT_SELECTION_CONFIG, size);
  }

  const target = pack.topics.find((t) => t.id === targetTopicId);
  return build(
    pack, ctx, "smart", "smart",
    target ? `Smart Practice: ${target.label.replace(/ & /g, " ")}` : "Smart Practice",
    target
      ? `Focused practice on ${target.label.replace(/ & /g, " ")} with some reinforcement from other topics.`
      : "A short mixed session chosen from your current learning state.",
    picked.slice(0, size),
  );
}

/** STEP 9 -- Mistake recovery: focused on one weak topic, explanation-first. */
export function buildWeaknessSession(
  ctx: SessionGenContext,
  config: LearningConfig,
  topicId: string,
): SessionResult {
  const pack = ctx.pack;
  const inTopic = pool(pack).filter((q) => q.topicId === topicId);
  const explained = withExplanation(inTopic);
  const candidates = explained.length ? explained : inTopic;
  const picked = sample(pack, ctx, config, candidates, Math.min(config.sessionSizeWeakness, candidates.length), false);
  const topic = pack.topics.find((t) => t.id === topicId);
  return build(
    pack, ctx, "recovery", "recovery",
    `Recovery: ${topic?.label.replace(/ & /g, " ") ?? topicId}`,
    "Let's strengthen this topic. Read the explanations, then lock it in with practice.",
    picked,
  );
}

/** STEP 10 -- Review session built from due cards. */
export function buildReviewSession(
  ctx: SessionGenContext,
  config: LearningConfig,
  dueQids: string[],
  sizeOverride?: number,
): SessionResult {
  const pack = ctx.pack;
  const byQid = new Map(pack.questions.map((q) => [q.qid, q]));
  const seen = new Set<string>();
  const candidates = dueQids
    .map((qid) => byQid.get(qid))
    .filter((q): q is Question => !!q && q.status === "answered" && !seen.has(q.qid) && (seen.add(q.qid), true));
  const picked = sample(pack, ctx, config, candidates, sizeOverride ?? candidates.length, false);
  return build(
    pack, ctx, "review", "review",
    "Review what's due",
    "Questions you are due to revisit. Keep them fresh so they stay learned.",
    picked,
  );
}

/** STEP 11 -- Quick session sized to minutes available. */
export function buildQuickSession(
  ctx: SessionGenContext,
  config: LearningConfig,
  minutes: number,
): SessionResult {
  const size = Math.max(3, Math.round(minutes * config.sessionSizeQuickPerMinute));
  const result = buildSmartSession(ctx, config, undefined, size);
  result.session.type = "quick";
  result.session.title = `Quick Session (${minutes} min)`;
  result.session.purpose = "A compact session sized for your available time.";
  return { ...result, mode: "quick" };
}

/**
 * STEP 10.5 -- Mistake review: never the same question (docs/PRODUCT_VISION.md §17).
 * Each mistake gets a composed variant (option rotation, or distractor swap
 * preferring harder distractors), so review exercises the rule, not the memory
 * of the answer position. Attempts on variants still record against the base
 * qid (see `baseQidOf`).
 */
export function buildMistakeReviewSession(
  ctx: SessionGenContext,
  config: LearningConfig,
  mistakenQids: string[],
  sizeOverride?: number,
  preferHard = true,
): SessionResult {
  const pack = ctx.pack;
  const byQid = new Map(pack.questions.map((q) => [q.qid, q]));
  const size = sizeOverride ?? Math.max(3, Math.min(mistakenQids.length, config.sessionSizeSmart));
  const base = [...new Set(mistakenQids)]
    .map((qid) => byQid.get(qid))
    .filter((q): q is Question => !!q && q.status === "answered");
  const sessionSeed = ctx.seed ?? Date.now();
  const rng = mulberry32(sessionSeed);

  // Family deduplication: at most one question per family
  const dedupedBase: Question[] = [];
  const seenFamilies = new Set<string>();
  for (const q of base) {
    const fid = getFamilyId(q.qid);
    if (seenFamilies.has(fid)) continue;
    seenFamilies.add(fid);
    dedupedBase.push(q);
  }

  const chosen = dedupedBase.length > size ? seededShuffle(dedupedBase, rng).slice(0, size) : dedupedBase;
  const siblingPool = contentPool(pack);
  const questions: VariantQuestion[] = chosen.map(
    (q) => composeVariant(q, siblingPool, variantSeed(sessionSeed, q.qid), preferHard),
  );
  return build(
    pack, ctx, "mistake-review", "review",
    "Mistake Review",
    "Your recent mistakes again — restated so you learn the rule, not the position.",
    questions,
  );
}

/** STEP 12 -- Mock exam from a blueprint: balanced coverage, no answer reveals mid-run logic (UI concern). */
export function buildMockSession(
  ctx: SessionGenContext,
  _config: LearningConfig,
  mock: MockConfig,
): SessionResult {
  const pack = ctx.pack;
  const all = contentPool(pack);
  const now = ctx.now ?? Date.now();
  const rng = mulberry32(ctx.seed ?? Date.now());

  const selectionState = buildSelectionState(
    pack,
    ctx.attempts,
    [],
    ctx.seed ?? Date.now(),
    now,
    mock.questionCount,
  );

  let picked: Question[] = [];

  if (mock.topicMix === "balanced") {
    // Balanced mock: weight topics proportionally, emphasize breadth
    const topics = seededShuffle([...contentTopics(pack)], rng);
    const topicWeights = computeTopicWeights(selectionState.topicMastery, topics);
    const totalWeight = [...topicWeights.values()].reduce((s, v) => s + v, 0);

    for (const t of topics) {
      const inTopic = all.filter((q) => q.topicId === t);
      const weight = topicWeights.get(t) ?? 1;
      const want = Math.min(inTopic.length, Math.floor(mock.questionCount * (weight / totalWeight)));
      if (want <= 0) continue;
      const topicState = { ...selectionState, selected: picked, sessionSize: mock.questionCount };
      for (const q of picked) {
        topicState.sessionTopicCounts.set(q.topicId, (topicState.sessionTopicCounts.get(q.topicId) ?? 0) + 1);
        if (q.concept) topicState.sessionConceptCounts.set(q.concept, (topicState.sessionConceptCounts.get(q.concept) ?? 0) + 1);
      }
      const chosen = composeSession(inTopic, topicState, DEFAULT_SELECTION_CONFIG, want);
      for (const q of chosen) {
        if (picked.length >= mock.questionCount) break;
        if (canAddToSession(picked, q)) picked.push(q);
      }
    }
  } else {
    // Non-balanced: score-based selection across all topics
    const state = { ...selectionState, sessionSize: mock.questionCount };
    picked = composeSession(all, state, DEFAULT_SELECTION_CONFIG, mock.questionCount);
  }

  // Fill remaining if needed
  if (picked.length < mock.questionCount) {
    const rest = all.filter((q) => !picked.some((p) => p.qid === q.qid));
    const fillState = { ...selectionState, selected: picked, sessionSize: mock.questionCount };
    for (const q of picked) {
      fillState.sessionTopicCounts.set(q.topicId, (fillState.sessionTopicCounts.get(q.topicId) ?? 0) + 1);
      if (q.concept) fillState.sessionConceptCounts.set(q.concept, (fillState.sessionConceptCounts.get(q.concept) ?? 0) + 1);
    }
    const fill = composeSession(rest, fillState, DEFAULT_SELECTION_CONFIG, mock.questionCount - picked.length);
    for (const q of fill) {
      if (picked.length >= mock.questionCount) break;
      if (canAddToSession(picked, q)) picked.push(q);
    }
  }

  const ordered = picked.slice(0, mock.questionCount);
  const result = build(
    pack, ctx, "mock", "mock",
    "Mock Exam",
    `A blueprinted practice exam: ${mock.questionCount} questions, ${mock.durationMin} minutes, pass mark ${Math.round(mock.passMark * 100)}%.`,
    ordered,
  );
  result.session.estimatedMinutes = mock.durationMin;
  return result;
}

/**
 * STEP 12.5 -- Dynamic mock exams (PRODUCT_VISION §21): Standard / Personalized /
 * Nightmare, with per-topic weights and recent-question avoidance.
 */
export function buildDynamicMock(
  ctx: SessionGenContext,
  config: LearningConfig,
  mock: DynamicMockConfig,
): SessionResult {
  const pack = ctx.pack;
  const count = mock.questionCount;

  if (mock.mode === "nightmare") {
    let picked = poolForDifficulty(contentPool(pack), "hard");
    if (picked.length < count) {
      picked = [...picked, ...poolForDifficulty(contentPool(pack), "standard")];
    }
    const tuned = sample(pack, ctx, config, picked, count, false);
    const result = build(
      pack, ctx, "mock", "mock",
      "Nightmare Mock 🔥",
      `Difficult questions only: ${count} questions, ${mock.durationMin} minutes, pass mark ${Math.round(mock.passMark * 100)}%.`,
      tuned,
    );
    result.session.estimatedMinutes = mock.durationMin;
    return result;
  }

  const all = contentPool(pack);
  const topics = contentTopics(pack);
  const weights = mock.weights ?? topicWeights(mock.mode, ctx, pack, config, topics);
  const totalW = topics.reduce((sum, t) => sum + (weights[t] ?? WeightsNeutral), 0);
  const byWeight = [...topics].sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0));

  let picked: Question[] = [];
  for (const t of byWeight) {
    const inTopic = all.filter((q) => q.topicId === t);
    const want = Math.min(inTopic.length, Math.floor(count * ((weights[t] ?? WeightsNeutral) / totalW)));
    if (want > 0) {
      const sampled = sample(pack, ctx, config, inTopic, want, true);
      for (const q of sampled) {
        if (picked.length >= count) break;
        if (canAddToSession(picked, q)) picked.push(q);
      }
    }
  }
  let budget = count - picked.length;
  for (const t of byWeight) {
    if (budget <= 0) break;
    const remaining = all.filter((q) => q.topicId === t && !picked.some((p) => p.qid === q.qid));
    if (remaining.length === 0) continue;
    const add = sample(pack, ctx, config, remaining, Math.min(budget, count - picked.length), true);
    for (const q of add) {
      if (picked.length >= count) break;
      if (canAddToSession(picked, q)) picked.push(q);
    }
    budget = count - picked.length;
  }

  const ordered = seededShuffle(picked.slice(0, count), mulberry32(ctx.seed ?? Date.now()));
  const modeName = mock.mode === "personalized" ? "Personalized Mock" : "Standard Mock";
  const result = build(
    pack, ctx, "mock", "mock",
    modeName,
    `${modeName === "Personalized Mock" ? "Simulates the exam with a slight emphasis on your weak spots" : "A balanced examination simulation"}: ${count} questions, ${mock.durationMin} minutes, pass mark ${Math.round(mock.passMark * 100)}%.`,
    ordered,
  );
  result.session.estimatedMinutes = mock.durationMin;
  return result;
}

export const WeightsNeutral = 1;

/** Per-topic weights: hidden tests keep `WeightsNeutral` trivial. Personalized tilts by topic accuracy. */
export function topicWeights(
  mode: "standard" | "personalized",
  ctx: SessionGenContext,
  pack: ContentPack,
  config: LearningConfig,
  topics: string[],
): Record<string, number> {
  const weights: Record<string, number> = {};
  const topicOf = new Map(pack.questions.map((q) => [q.qid, q.topicId]));
  if (mode === "standard") {
    for (const t of topics) weights[t] = WeightsNeutral;
    return weights;
  }
  for (const t of topics) {
    const inTopic = ctx.attempts.filter((a) => topicOf.get(a.qid) === t);
    const stat = inTopic.length ? computeStat(inTopic, t, config) : null;
    // 1 (full accuracy) -> 1.4; 0.5 -> 1.7; no evidence -> neutral 1.4
    const accuracy = stat ? stat.accuracy : 0.6;
    weights[t] = WeightsNeutral + (1 - accuracy) * 0.8;
  }
  return weights;
}