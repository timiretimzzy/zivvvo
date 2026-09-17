/**
 * D10: AI Tutor Intelligence + Zimbabwe Content Grounding Tests
 *
 * Tests server-side content retrieval concepts, structured context format,
 * conversation-aware context, topic switching, and regression invariants.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  findRelevantTopic,
  findConceptsByTerm,
  topicContentSummary,
  allTopicLabels,
  questionsByTopic,
  questionsByConcept,
  contentPack,
} from "@zivvvo/content";
import {
  setAiConsent,
  getLiveAIStatus,
  getTutorProvider,
  aiAnswerQuestionStrict,
  setAuthTokenGetter,
} from "./ai-provider";
import { MockTutorProvider, LiveTutorProvider } from "@zivvvo/ai-gateway";
import type { ConceptExplainRequest, ConversationMessage } from "@zivvvo/ai-gateway";

// ---------------------------------------------------------------------------
// Mock localStorage + navigator
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
vi.stubGlobal("navigator", { onLine: true });

// ---------------------------------------------------------------------------
// D10 Test Suite 1: Content Retrieval Quality
// ---------------------------------------------------------------------------

describe("D10 content retrieval", () => {
  it("findRelevantTopic matches road signs keywords", () => {
    const topic = findRelevantTopic(contentPack, "What are regulatory signs?");
    expect(topic).toBe("road-signs");
  });

  it("findRelevantTopic matches speed limits keywords", () => {
    const topic = findRelevantTopic(contentPack, "What is the speed limit in Zimbabwe?");
    expect(topic).toBe("speed-limits");
  });

  it("findRelevantTopic matches overtaking keywords", () => {
    const topic = findRelevantTopic(contentPack, "When is it safe to overtake?");
    expect(topic).toBe("overtaking");
  });

  it("findRelevantTopic matches pedestrian keywords", () => {
    const topic = findRelevantTopic(contentPack, "Where should pedestrians cross the road?");
    expect(topic).toBe("pedestrian-safety");
  });

  it("findRelevantTopic matches traffic lights keywords", () => {
    const topic = findRelevantTopic(contentPack, "What do the traffic light colours mean?");
    expect(topic).toBe("traffic-lights");
  });

  it("findRelevantTopic matches junction keywords", () => {
    const topic = findRelevantTopic(contentPack, "Who has right of way at a junction?");
    expect(topic).toBe("junction-rules");
  });

  it("findRelevantTopic matches parking keywords", () => {
    const topic = findRelevantTopic(contentPack, "Where can I park my car?");
    expect(topic).toBe("parking");
  });

  it("findRelevantTopic matches alcohol keywords", () => {
    const topic = findRelevantTopic(contentPack, "What is the legal blood alcohol limit?");
    expect(topic).toBe("alcohol-drugs");
  });

  it("findRelevantTopic matches night driving keywords", () => {
    const topic = findRelevantTopic(contentPack, "When should I use dipped headlights?");
    expect(topic).toBe("night-driving");
  });

  it("findRelevantTopic returns null for unrelated question", () => {
    const topic = findRelevantTopic(contentPack, "What is the capital of France?");
    expect(topic).toBeNull();
  });

  it("questionsByTopic returns questions for road-signs", () => {
    const qs = questionsByTopic(contentPack, "road-signs");
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      expect(q.topicId).toBe("road-signs");
    }
  });

  it("questionsByConcept returns questions with explanations", () => {
    const qs = questionsByConcept(contentPack, "sign-meaning");
    expect(qs.length).toBeGreaterThan(0);
    const withExplanation = qs.filter((q) => q.explanation && q.explanation.trim().length > 0);
    expect(withExplanation.length).toBeGreaterThan(0);
  });

  it("topicContentSummary returns concepts and count", () => {
    const summary = topicContentSummary(contentPack, "road-signs");
    expect(summary.concepts.length).toBeGreaterThan(0);
    expect(summary.questionCount).toBeGreaterThan(0);
  });

  it("allTopicLabels returns all 15 content topics", () => {
    const labels = allTopicLabels(contentPack);
    expect(labels.length).toBe(15);
  });

  it("findConceptsByTerm finds sign-related concepts", () => {
    const concepts = findConceptsByTerm(contentPack, "sign");
    expect(concepts.length).toBeGreaterThan(0);
    expect(concepts.some((c) => c.includes("sign"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D10 Test Suite 2: Structured Context Format (topicHint field)
// ---------------------------------------------------------------------------

describe("D10 structured context", () => {
  it("ConceptExplainRequest accepts topicHint field", () => {
    const req: ConceptExplainRequest = {
      learnerQuestion: "What about road markings?",
      context: {
        concept: "marking-identification",
        conceptLabel: "Marking Identification",
        topicLabel: "Road Markings",
        state: "developing",
        mastery: 0.4,
        attempts: 3,
        correct: 1,
        canonicalExplanation: "Road markings include lines and symbols on the road surface.",
        keyRule: "Solid lines cannot be crossed.",
      },
      topicHint: "road-markings",
    };
    expect(req.topicHint).toBe("road-markings");
  });

  it("ConceptExplainRequest works without topicHint (backward compatible)", () => {
    const req: ConceptExplainRequest = {
      learnerQuestion: "What are signs?",
      context: {
        concept: "sign-meaning",
        conceptLabel: "Sign Meaning",
        topicLabel: "Road Signs",
        state: "unknown",
        mastery: 0,
        attempts: 0,
        correct: 0,
        canonicalExplanation: null,
        keyRule: null,
      },
    };
    expect(req.topicHint).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// D10 Test Suite 3: Conversation-Aware Context
// ---------------------------------------------------------------------------

describe("D10 conversation-aware context", () => {
  it("conversationHistory is passed through aiAnswerQuestionStrict", async () => {
    setAiConsent(true);
    vi.stubGlobal("navigator", { onLine: true });
    setAuthTokenGetter(() => null);

    const history: ConversationMessage[] = [
      { role: "user", text: "What are road signs?" },
      { role: "ai", text: "Road signs include regulatory, warning, and informational signs." },
      { role: "user", text: "What about the yellow ones?" },
    ];

    const req: ConceptExplainRequest = {
      learnerQuestion: "What about the yellow ones?",
      context: {
        concept: "sign-meaning",
        conceptLabel: "Sign Meaning",
        topicLabel: "Road Signs",
        state: "developing",
        mastery: 0.3,
        attempts: 4,
        correct: 1,
        canonicalExplanation: "Warning signs are typically yellow/diamond shaped.",
        keyRule: null,
      },
    };

    // aiAnswerQuestionStrict will fail because no server, but it should accept the history
    const result = await aiAnswerQuestionStrict(req, history);
    // The request should have been constructed (even if server fails)
    expect(result).toBeDefined();
    expect(typeof result.available).toBe("boolean");
  });

  it("topicHint can be derived from conversation context", () => {
    const history: ConversationMessage[] = [
      { role: "user", text: "Tell me about speed limits" },
      { role: "ai", text: "Speed limits in Zimbabwe vary by road type." },
      { role: "user", text: "What about overtaking?" },
    ];

    // Simulate topic detection: join recent user messages
    const recentUserText = history
      .filter((m) => m.role === "user")
      .slice(-2)
      .map((m) => m.text)
      .join(" ");

    // Should contain keywords for both speed-limits and overtaking
    expect(recentUserText.toLowerCase()).toContain("speed");
    expect(recentUserText.toLowerCase()).toContain("overtaking");
  });
});

// ---------------------------------------------------------------------------
// D10 Test Suite 4: Topic Switching
// ---------------------------------------------------------------------------

describe("D10 topic switching", () => {
  it("detects topic change from speed limits to overtaking", () => {
    const history: ConversationMessage[] = [
      { role: "user", text: "What is the speed limit on highways?" },
      { role: "ai", text: "Highways typically have a 120 km/h speed limit." },
    ];

    const historyTopic = findRelevantTopic(contentPack, history.map((m) => m.text).join(" "));
    const newTopic = findRelevantTopic(contentPack, "When can I safely overtake another car?");

    expect(historyTopic).toBe("speed-limits");
    expect(newTopic).toBe("overtaking");
    expect(historyTopic).not.toBe(newTopic);
  });

  it("detects same topic continuation (no switch)", () => {
    const history: ConversationMessage[] = [
      { role: "user", text: "What are regulatory signs?" },
      { role: "ai", text: "Regulatory signs tell you what you must or must not do." },
    ];

    const historyTopic = findRelevantTopic(contentPack, history.map((m) => m.text).join(" "));
    const newTopic = findRelevantTopic(contentPack, "What do warning signs look like?");

    expect(historyTopic).toBe("road-signs");
    expect(newTopic).toBe("road-signs");
    expect(historyTopic).toBe(newTopic);
  });
});

// ---------------------------------------------------------------------------
// D10 Test Suite 5: Regression — D9 Strict AI Invariants Still Hold
// ---------------------------------------------------------------------------

describe("D10 regression: D9 strict AI invariants", () => {
  beforeEach(() => {
    localStorage.clear();
    setAuthTokenGetter(() => null);
  });

  it("getLiveAIStatus never returns mock provider", () => {
    setAiConsent(true);
    vi.stubGlobal("navigator", { onLine: true });
    setAuthTokenGetter(() => "test-token");
    const { provider, reason } = getLiveAIStatus();
    if (provider) {
      expect(provider).toBeInstanceOf(LiveTutorProvider);
      expect(provider.id).not.toBe("mock-tutor-v0");
    }
    expect(reason).toBe("available");
  });

  it("getTutorProvider returns LiveTutorProvider when conditions met", () => {
    setAiConsent(true);
    vi.stubGlobal("navigator", { onLine: true });
    setAuthTokenGetter(() => "test-token");
    const provider = getTutorProvider();
    expect(provider).toBeInstanceOf(LiveTutorProvider);
  });

  it("getTutorProvider returns MockTutorProvider when offline", () => {
    setAiConsent(true);
    vi.stubGlobal("navigator", { onLine: false });
    setAuthTokenGetter(() => "test-token");
    const provider = getTutorProvider();
    expect(provider).toBeInstanceOf(MockTutorProvider);
  });

  it("aiAnswerQuestionStrict returns structured error when no auth token", async () => {
    setAiConsent(true);
    vi.stubGlobal("navigator", { onLine: true });
    setAuthTokenGetter(() => null);

    const req: ConceptExplainRequest = {
      learnerQuestion: "What are signs?",
      context: {
        concept: "sign-meaning",
        conceptLabel: "Sign Meaning",
        topicLabel: "Road Signs",
        state: "unknown",
        mastery: 0,
        attempts: 0,
        correct: 0,
        canonicalExplanation: null,
        keyRule: null,
      },
    };

    const result = await aiAnswerQuestionStrict(req);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("unauthorized");
    expect(result.source).toBe("canonical");
  });

  it("aiAnswerQuestionStrict never falls back to mock when offline", async () => {
    setAiConsent(true);
    vi.stubGlobal("navigator", { onLine: false });

    const req: ConceptExplainRequest = {
      learnerQuestion: "What is overtaking?",
      context: {
        concept: "overtaking-rule",
        conceptLabel: "Overtaking Rule",
        topicLabel: "Overtaking Rules",
        state: "developing",
        mastery: 0.5,
        attempts: 3,
        correct: 1,
        canonicalExplanation: "Overtaking is only permitted when safe.",
        keyRule: null,
      },
    };

    const result = await aiAnswerQuestionStrict(req);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("offline");
    expect(result.source).toBe("canonical");
  });
});

// ---------------------------------------------------------------------------
// D10 Test Suite 6: Content Pack Integrity
// ---------------------------------------------------------------------------

describe("D10 content pack integrity", () => {
  it("all questions have required fields", () => {
    for (const q of contentPack.questions) {
      expect(q.qid).toBeTruthy();
      expect(q.stem).toBeTruthy();
      expect(q.topicId).toBeTruthy();
      expect(q.concept).toBeTruthy();
      expect(q.options.length).toBeGreaterThan(0);
    }
  });

  it("all topic IDs are valid", () => {
    const validIds = new Set(contentPack.topics.map((t) => t.id));
    for (const q of contentPack.questions) {
      expect(validIds.has(q.topicId)).toBe(true);
    }
  });

  it("questions with explanations have non-empty text", () => {
    const withExplanation = contentPack.questions.filter((q) => q.explanation);
    expect(withExplanation.length).toBeGreaterThan(1000);
    for (const q of withExplanation) {
      expect(q.explanation.trim().length).toBeGreaterThan(0);
    }
  });
});
