/**
 * D7: AI Coach Provider Selection
 *
 * Handles provider selection, consent, network detection, and caching.
 * The provider is selected automatically:
 *   Online + consent + configured → LiveTutorProvider
 *   Otherwise → MockTutorProvider
 *
 * No client-side secrets. The server holds the API key.
 */
import { MockTutorProvider, LiveTutorProvider, type TutorProvider, type ConceptExplainRequest, type ConceptExplainResponse, type ConversationMessage } from "@zivvvo/ai-gateway";

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

const CONSENT_KEY = "zivvvo_ai_consent";

export function getAiConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "true";
  } catch {
    return false;
  }
}

export function setAiConsent(consent: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, consent ? "true" : "false");
  } catch { /* storage unavailable */ }
}

export function hasAiConsent(): boolean {
  return getAiConsent();
}

// ---------------------------------------------------------------------------
// Cache (deterministic concept explanations)
// ---------------------------------------------------------------------------

const EXPLAIN_CACHE_KEY = "zivvvo_ai_explain_cache";

interface CacheEntry {
  text: string;
  source: "canonical" | "generated";
  ts: number;
}

function getCacheKey(concept: string, state: string): string {
  return `${concept}::${state}`;
}

function getCachedExplanation(concept: string, state: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(EXPLAIN_CACHE_KEY);
    if (!raw) return null;
    const cache: Record<string, CacheEntry> = JSON.parse(raw);
    const entry = cache[getCacheKey(concept, state)];
    if (!entry) return null;
    // Cache valid for 24 hours
    if (Date.now() - entry.ts > 86400000) return null;
    return entry;
  } catch {
    return null;
  }
}

function setCachedExplanation(concept: string, state: string, text: string, source: "canonical" | "generated"): void {
  try {
    const raw = localStorage.getItem(EXPLAIN_CACHE_KEY);
    const cache: Record<string, CacheEntry> = raw ? JSON.parse(raw) : {};
    cache[getCacheKey(concept, state)] = { text, source, ts: Date.now() };
    // Keep only last 50 entries
    const keys = Object.keys(cache);
    if (keys.length > 50) {
      const sorted = keys.sort((a, b) => (cache[a]?.ts ?? 0) - (cache[b]?.ts ?? 0));
      for (const k of sorted.slice(0, keys.length - 50)) {
        delete cache[k];
      }
    }
    localStorage.setItem(EXPLAIN_CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------------------
// Auth token (from Supabase session)
// ---------------------------------------------------------------------------

let authTokenGetter: (() => string | null) | null = null;

export type AuthTokenGetter = () => string | null;

export function setAuthTokenGetter(getter: AuthTokenGetter): void {
  authTokenGetter = getter;
}

function getAuthToken(): string | null {
  return authTokenGetter?.() ?? null;
}

// ---------------------------------------------------------------------------
// Provider instance
// ---------------------------------------------------------------------------

const mockProvider = new MockTutorProvider();
let liveProvider: LiveTutorProvider | null = null;

function getLiveProvider(): LiveTutorProvider {
  if (!liveProvider) {
    liveProvider = new LiveTutorProvider({
      baseUrl: "", // same-origin
      getAuthToken,
      hasConsent: hasAiConsent,
    });
  }
  return liveProvider;
}

/**
 * Get the current AI tutor provider.
 * Returns live provider when online + consent + configured.
 * Returns mock provider otherwise.
 */
export function getTutorProvider(): TutorProvider {
  if (hasAiConsent() && navigator.onLine) {
    const live = getLiveProvider();
    if (live.isAvailable()) return live;
  }
  return mockProvider;
}

/**
 * Explain a concept using AI (with cache + fallback).
 */
export async function aiExplainConcept(req: ConceptExplainRequest): Promise<ConceptExplainResponse> {
  // Check cache first
  const cached = getCachedExplanation(req.context.concept, req.context.state);
  if (cached) {
    return { text: cached.text, source: cached.source, available: true };
  }

  const provider = getTutorProvider();
  const result = await provider.explainConcept(req);

  // Cache successful generated explanations
  if (result.available && result.text.length > 0) {
    setCachedExplanation(req.context.concept, req.context.state, result.text, result.source);
  }

  // If live provider failed, fall back to mock
  if (!result.available && provider.id !== "mock-tutor-v0") {
    const mockResult = await mockProvider.explainConcept(req);
    if (mockResult.text.length > 0) {
      return mockResult;
    }
  }

  return result;
}

/**
 * Answer a learner question using AI (with fallback).
 */
export async function aiAnswerQuestion(
  req: ConceptExplainRequest,
  conversationHistory?: ConversationMessage[],
): Promise<ConceptExplainResponse> {
  const enriched: ConceptExplainRequest = {
    ...req,
    conversationHistory: conversationHistory ?? req.conversationHistory,
  };
  const provider = getTutorProvider();
  const result = await provider.answerQuestion(enriched);

  // If live provider failed, fall back to mock
  if (!result.available && provider.id !== "mock-tutor-v0") {
    return mockProvider.answerQuestion(enriched);
  }

  return result;
}
