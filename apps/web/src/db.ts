import Dexie, { type Table } from "dexie";
import type { AttemptEvent, LearningSession } from "@zivvvo/assessment-engine";
import type { EngagementState, ReviewState } from "@zivvvo/learning-engine";
import type { ConfidenceBand, GoalId } from "./onboarding";

export interface StoredLearner {
  id: string;
  name: string;
  diagnosticCompleted: boolean;
  createdAt: number;
  goal?: GoalId;
  examDate?: number;
  dailyMinutes?: number;
  initialConfidence?: ConfidenceBand;
  supabaseUserId?: string;
  plan: "free" | "premium";
  planExpiresAt?: number;
}

export type ReviewRow = ReviewState & { id: string };

export class ZivvvoDB extends Dexie {
  attempts!: Table<AttemptEvent, string>;
  reviews!: Table<ReviewRow, string>;
  sessions!: Table<LearningSession, string>;
  learners!: Table<StoredLearner, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  engagements!: Table<{ id: string } & EngagementState, string>;

  constructor() {
    super("zivvvo");
    this.version(1).stores({
      attempts: "id, learnerId, qid, ts, syncedAt",
      reviews: "id, learnerId, qid, next",
      sessions: "id, learnerId, type, createdAt",
      learners: "id",
      meta: "key",
    });
    this.version(2).stores({
      attempts: "id, learnerId, qid, ts, syncedAt",
      reviews: "id, learnerId, qid, next",
      sessions: "id, learnerId, type, createdAt",
      learners: "id",
      meta: "key",
      engagements: "id",
    });
    this.version(3).stores({
      attempts: "id, learnerId, qid, ts, syncedAt",
      reviews: "id, learnerId, qid, next",
      sessions: "id, learnerId, type, createdAt",
      learners: "id, plan",
      meta: "key",
      engagements: "id",
    });
  }
}

export const db = new ZivvvoDB();

export const reviewId = (learnerId: string, qid: string): string => `${learnerId}:${qid}`;

/** Offline-first write-through: append the attempt, then drop a local marker. */
export async function persistAttempt(a: AttemptEvent): Promise<void> {
  await db.attempts.put(a);
}

export async function persistReview(r: ReviewState): Promise<void> {
  await db.reviews.put({ ...r, id: reviewId(r.learnerId, r.qid) });
}

export async function persistSession(s: LearningSession): Promise<void> {
  await db.sessions.put(s);
}

export async function persistEngagement(learnerId: string, state: EngagementState): Promise<void> {
  await db.engagements.put({ id: learnerId, ...state });
}

export async function loadLearnerData(learnerId: string): Promise<{
  attempts: AttemptEvent[];
  reviews: ReviewState[];
  sessions: LearningSession[];
  engagement: EngagementState | null;
}> {
  const [attempts, reviews, sessions, engagement] = await Promise.all([
    db.attempts.where("learnerId").equals(learnerId).toArray(),
    db.reviews.where("learnerId").equals(learnerId).toArray(),
    db.sessions.where("learnerId").equals(learnerId).toArray(),
    db.engagements.get(learnerId),
  ]);
  const cleanReviews: ReviewState[] = reviews.map(({ id: _id, ...rest }) => rest);
  return { attempts, reviews: cleanReviews, sessions, engagement: engagement ?? null };
}