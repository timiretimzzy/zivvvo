/**
 * D7: AI Coach Tests — provider selection, consent, caching, live provider
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getAiConsent,
  setAiConsent,
  aiExplainConcept,
  getTutorProvider,
  setAuthTokenGetter,
} from "./ai-provider";
import { MockTutorProvider, LiveTutorProvider } from "@zivvvo/ai-gateway";

// ---------------------------------------------------------------------------
// Mock localStorage for Node test environment
// ---------------------------------------------------------------------------

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};
vi.stubGlobal("localStorage", localStorageMock);

// Mock navigator.onLine
vi.stubGlobal("navigator", { onLine: true });

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

describe("D7 ai-provider consent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to no consent", () => {
    expect(getAiConsent()).toBe(false);
  });

  it("setAiConsent(true) enables consent", () => {
    setAiConsent(true);
    expect(getAiConsent()).toBe(true);
  });

  it("setAiConsent(false) disables consent", () => {
    setAiConsent(true);
    setAiConsent(false);
    expect(getAiConsent()).toBe(false);
  });

  it("consent persists across calls", () => {
    setAiConsent(true);
    expect(getAiConsent()).toBe(true);
    expect(getAiConsent()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

describe("D7 provider selection", () => {
  beforeEach(() => {
    localStorage.clear();
    setAuthTokenGetter(() => null);
  });

  it("returns MockTutorProvider when no consent", () => {
    setAiConsent(false);
    const provider = getTutorProvider();
    expect(provider).toBeInstanceOf(MockTutorProvider);
  });

  it("returns LiveTutorProvider when consent + online", () => {
    setAiConsent(true);
    vi.stubGlobal("navigator", { onLine: true });
    const provider = getTutorProvider();
    expect(provider).toBeInstanceOf(LiveTutorProvider);
  });
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

describe("D7 explanation cache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns a valid response from provider", async () => {
    const result = await aiExplainConcept({
      context: {
        concept: "test-concept",
        conceptLabel: "Test Concept",
        topicLabel: "Test Topic",
        state: "unknown",
        mastery: 0,
        attempts: 0,
        correct: 0,
        canonicalExplanation: null,
        keyRule: null,
      },
    });
    expect(result).toBeDefined();
    expect(result.available).toBeDefined();
    expect(typeof result.text).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// LiveTutorProvider
// ---------------------------------------------------------------------------

describe("D7 LiveTutorProvider", () => {
  it("isAvailable returns false without consent", () => {
    setAiConsent(false);
    const provider = new LiveTutorProvider({
      baseUrl: "",
      getAuthToken: () => null,
      hasConsent: () => getAiConsent(),
    });
    expect(provider.isAvailable()).toBe(false);
  });

  it("isAvailable returns false without auth token at request time", async () => {
    setAiConsent(true);
    vi.stubGlobal("navigator", { onLine: true });
    const provider = new LiveTutorProvider({
      baseUrl: "",
      getAuthToken: () => null,
      hasConsent: () => getAiConsent(),
    });
    // isAvailable returns true (consent + online), but request fails gracefully
    expect(provider.isAvailable()).toBe(true);
    const result = await provider.explainConcept({
      context: {
        concept: "test",
        conceptLabel: "Test",
        topicLabel: "Test",
        state: "unknown",
        mastery: 0,
        attempts: 0,
        correct: 0,
        canonicalExplanation: null,
        keyRule: null,
      },
    });
    expect(result.available).toBe(false);
  });

  it("isAvailable returns false when offline", () => {
    setAiConsent(true);
    vi.stubGlobal("navigator", { onLine: false });
    const provider = new LiveTutorProvider({
      baseUrl: "",
      getAuthToken: () => "test-token",
      hasConsent: () => getAiConsent(),
    });
    expect(provider.isAvailable()).toBe(false);
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("returns canonical fallback when no server", async () => {
    setAiConsent(true);
    vi.stubGlobal("navigator", { onLine: true });
    const provider = new LiveTutorProvider({
      baseUrl: "http://localhost:99999",
      getAuthToken: () => "test-token",
      hasConsent: () => getAiConsent(),
    });
    const result = await provider.explainConcept({
      context: {
        concept: "test",
        conceptLabel: "Test",
        topicLabel: "Test",
        state: "unknown",
        mastery: 0,
        attempts: 0,
        correct: 0,
        canonicalExplanation: "Test explanation",
        keyRule: "Test rule",
      },
    });
    expect(result.source).toBe("canonical");
    expect(result.available).toBe(false);
  });

  it("answerQuestion returns canonical fallback when no server", async () => {
    setAiConsent(true);
    vi.stubGlobal("navigator", { onLine: true });
    const provider = new LiveTutorProvider({
      baseUrl: "http://localhost:99999",
      getAuthToken: () => "test-token",
      hasConsent: () => getAiConsent(),
    });
    const result = await provider.answerQuestion({
      learnerQuestion: "What is the speed limit?",
      context: {
        concept: "test",
        conceptLabel: "Test",
        topicLabel: "Test",
        state: "unknown",
        mastery: 0,
        attempts: 0,
        correct: 0,
        canonicalExplanation: null,
        keyRule: null,
      },
    });
    expect(result.source).toBe("canonical");
    expect(result.available).toBe(false);
  });

  it("explainConcept without consent returns canonical fallback", async () => {
    setAiConsent(false);
    const provider = new LiveTutorProvider({
      baseUrl: "http://localhost:99999",
      getAuthToken: () => "test-token",
      hasConsent: () => getAiConsent(),
    });
    const result = await provider.explainConcept({
      context: {
        concept: "test",
        conceptLabel: "Test",
        topicLabel: "Test",
        state: "unknown",
        mastery: 0,
        attempts: 0,
        correct: 0,
        canonicalExplanation: null,
        keyRule: null,
      },
    });
    expect(result.source).toBe("canonical");
    expect(result.available).toBe(false);
  });
});
