/**
 * D7: Live Tutor Provider — calls the Zivvvo server AI proxy.
 *
 * The server holds the API key. The browser never sees it.
 * D9: Returns structured error reasons instead of silent fallback.
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
      return { text: "", source: "canonical", available: false, reason: "unauthorized" };
    }
    if (!navigator.onLine) {
      return { text: "", source: "canonical", available: false, reason: "offline" };
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
      if (res.status === 401) {
        this.available = false;
        return { text: "", source: "canonical", available: false, reason: "unauthorized" };
      }
      if (res.status === 403) {
        this.available = false;
        return { text: "", source: "canonical", available: false, reason: "forbidden" };
      }
      if (res.status === 429) {
        return { text: "", source: "canonical", available: false, reason: "rate-limited" };
      }
      if (!res.ok) {
        this.available = false;
        return { text: "", source: "canonical", available: false, reason: "server-error" };
      }
      const data = await res.json();
      // Validate response shape
      if (!data || typeof data.text !== "string" || data.text.length === 0) {
        return { text: "", source: "canonical", available: false, reason: "invalid-response" };
      }
      return {
        text: data.text,
        source: data.source === "generated" ? "generated" : "canonical",
        available: data.available !== false,
      };
    } catch (err: unknown) {
      this.available = false;
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      return {
        text: "",
        source: "canonical",
        available: false,
        reason: isAbort ? "timeout" : "offline",
      };
    }
  }

  async explainConcept(req: ConceptExplainRequest): Promise<ConceptExplainResponse> {
    if (!this.isAvailable()) {
      const reason = !navigator.onLine ? "offline" : !this.config.hasConsent() ? "unauthorized" : "not-configured";
      return { text: "", source: "canonical", available: false, reason };
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
      conversationHistory: req.conversationHistory,
    });
  }

  async answerQuestion(req: ConceptExplainRequest): Promise<ConceptExplainResponse> {
    if (!this.isAvailable()) {
      const reason = !navigator.onLine ? "offline" : !this.config.hasConsent() ? "unauthorized" : "not-configured";
      return { text: "", source: "canonical", available: false, reason };
    }
    return this.post("/api/ai/ask", {
      question: req.learnerQuestion,
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
      conversationHistory: req.conversationHistory,
    });
  }
}
