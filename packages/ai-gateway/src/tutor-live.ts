/**
 * D7: Live Tutor Provider — calls the Zivvvo server AI proxy.
 *
 * The server holds the API key. The browser never sees it.
 * Falls back to MockTutorProvider on any failure.
 */
import type { TutorProvider, ConceptExplainRequest, ConceptExplainResponse } from "./types";

export interface LiveTutorProviderConfig {
  /** Base URL of the Zivvvo API server (e.g., "" for same-origin, "http://localhost:3939" for dev). */
  baseUrl: string;
  /** Supabase auth token (JWT) for server-side verification. */
  getAuthToken: () => string | null;
  /** Whether AI consent has been given. */
  hasConsent: () => boolean;
}

export class LiveTutorProvider implements TutorProvider {
  readonly id = "live-ai-v1";
  private config: LiveTutorProviderConfig;
  private available = true;

  constructor(config: LiveTutorProviderConfig) {
    this.config = config;
  }

  isAvailable(): boolean {
    return this.available && this.config.hasConsent() && navigator.onLine;
  }

  private async post(path: string, body: Record<string, unknown>): Promise<ConceptExplainResponse> {
    const token = this.config.getAuthToken();
    if (!token) {
      return { text: "", source: "canonical", available: false };
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(`${this.config.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        this.available = false;
        return { text: "", source: "canonical", available: false };
      }
      const data = await res.json();
      // Validate response shape
      if (!data || typeof data.text !== "string" || data.text.length === 0) {
        return { text: "", source: "canonical", available: false };
      }
      return {
        text: data.text,
        source: data.source === "generated" ? "generated" : "canonical",
        available: data.available !== false,
      };
    } catch {
      this.available = false;
      return { text: "", source: "canonical", available: false };
    }
  }

  async explainConcept(req: ConceptExplainRequest): Promise<ConceptExplainResponse> {
    if (!this.isAvailable()) {
      return { text: "", source: "canonical", available: false };
    }
    return this.post("/api/ai/explain", {
      concept: req.context.concept,
      conceptLabel: req.context.conceptLabel,
      topicLabel: req.context.topicLabel,
      state: req.context.state,
      mastery: req.context.mastery,
      attempts: req.context.attempts,
      correct: req.context.correct,
      canonicalExplanation: req.context.canonicalExplanation,
      keyRule: req.context.keyRule,
      recentMistake: req.context.recentMistake,
    });
  }

  async answerQuestion(req: ConceptExplainRequest): Promise<ConceptExplainResponse> {
    if (!this.isAvailable()) {
      return { text: "", source: "canonical", available: false };
    }
    return this.post("/api/ai/ask", {
      question: req.learnerQuestion,
      concept: req.context.concept,
      conceptLabel: req.context.conceptLabel,
      topicLabel: req.context.topicLabel,
      state: req.context.state,
      canonicalExplanation: req.context.canonicalExplanation,
      keyRule: req.context.keyRule,
      recentMistake: req.context.recentMistake,
    });
  }
}
