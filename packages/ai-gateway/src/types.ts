/**
 * AI gateway contracts (docs/AI_ARCHITECTURE.md).
 *
 * Phase 2 is local-first and deterministic: objective questions are scored
 * against the canonical key embedded in the content model. Subjective and
 * free-text marking is behind this interface so a provider (mock now, an LLM
 * later with consent) can be swapped without touching app logic.
 *
 * D6 extends this with TutorProvider for the personal tutor loop.
 * The AI provider ONLY generates language — it never decides mastery,
 * weakness, correctness, or question selection.
 */

// ---------------------------------------------------------------------------
// Existing: Score & Explain (unchanged)
// ---------------------------------------------------------------------------

export interface ScoreRequest {
  questionStem: string;
  canonical: string | null;
  userAnswer: string;
  context?: Record<string, unknown>;
}

export interface ScoreResponse {
  score: 0 | 0.5 | 1;
  scoreCanonical: boolean;
  usedFallback: boolean;
  reason: string;
}

export interface ExplainRequest {
  questionStem: string;
  options: { text: string; isCorrect: boolean }[];
  userAnswer: string | null;
}

export interface ExplainResponse {
  text: string;
  source: "canonical" | "generated";
}

export interface AIService {
  readonly id: string;
  score(req: ScoreRequest): Promise<ScoreResponse>;
  explain(req: ExplainRequest): Promise<ExplainResponse>;
}

// ---------------------------------------------------------------------------
// D6: Tutor Provider — AI coach abstraction
// ---------------------------------------------------------------------------

/**
 * Contextual information about a concept for the AI to explain.
 * ALL intelligence (mastery, weakness, evidence) comes from the deterministic
 * engine. The AI provider only generates natural language.
 */
export interface ConceptTutorContext {
  concept: string;
  conceptLabel: string;
  topicLabel: string;
  mastery: number;
  attempts: number;
  correct: number;
  state: "strong" | "developing" | "needs-attention" | "unknown";
  /** Author-written explanation (T0 baseline — always correct). */
  canonicalExplanation: string | null;
  /** Key rule derived from content. */
  keyRule: string | null;
  /** Recent mistake details (if any). */
  recentMistake?: {
    stem: string;
    correctAnswer: string;
    learnerAnswer: string;
  };
}

export interface ConversationMessage {
  role: "user" | "ai";
  text: string;
}

export interface ConceptExplainRequest {
  context: ConceptTutorContext;
  /** The learner's question (optional — for Q&A mode). */
  learnerQuestion?: string;
  /** Recent conversation messages for continuity (optional). */
  conversationHistory?: ConversationMessage[];
}

export interface ConceptExplainResponse {
  /** AI-generated explanation (enhancement over T0). */
  text: string;
  source: "canonical" | "generated";
  /** Whether the AI was available for this request. */
  available: boolean;
}

/**
 * Tutor Provider — AI coach abstraction.
 *
 * The deterministic application supplies the context.
 * The AI provider only generates language.
 *
 * Architecture:
 *   Deterministic Tutor Context → Tutor Provider → AI explanation
 *
 * NEVER:
 *   AI → decides learner mastery
 */
export interface TutorProvider {
  readonly id: string;

  /**
   * Explain a concept to the learner using the provided context.
   * The AI may simplify, rephrase, or add examples — but must not
   * contradict the canonical explanation.
   */
  explainConcept(req: ConceptExplainRequest): Promise<ConceptExplainResponse>;

  /**
   * Answer a learner's question about a concept.
   * The AI uses the context to ground its response in actual application data.
   */
  answerQuestion(req: ConceptExplainRequest): Promise<ConceptExplainResponse>;

  /**
   * Whether this provider is currently available (online, quota, etc.).
   * Used for offline-first fallback.
   */
  isAvailable(): boolean;
}
