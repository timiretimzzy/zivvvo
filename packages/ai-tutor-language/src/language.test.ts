/**
 * Tests for the Zivvvo AI Tutor Language Understanding Pipeline.
 * Validates normalization, intent detection, entity extraction, alias expansion,
 * conversation context, topic classification, and knowledge retrieval.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeText,
  detectIntent,
  detectComparison,
  detectScenario,
  expandTerms,
  extractEntities,
  entitiesToConcepts,
  classifyTopic,
  classifyTopicWithConversation,
  isFollowUp,
  resolveReferences,
  detectTopicSwitch,
  buildConversationBlock,
  retrieveKnowledge,
  buildKnowledgeBlock,
  understandQuestion,
  formatUnderstandingForPrompt,
} from "@zivvvo/ai-tutor-language";

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------
describe("normalizeText", () => {
  it("fixes common spelling mistakes", () => {
    expect(normalizeText("lisence")).toBe("licence");
    expect(normalizeText("license")).toBe("licence");
    expect(normalizeText("regulashions")).toBe("regulations");
    expect(normalizeText("overtakeing")).toBe("overtaking");
    expect(normalizeText("pedestrain")).toBe("pedestrian");
    expect(normalizeText("emergancy")).toBe("emergency");
  });

  it("converts Zimbabwean terms", () => {
    expect(normalizeText("robot")).toBe("traffic light");
    expect(normalizeText("hooter")).toBe("horn");
    expect(normalizeText("kombi")).toBe("minibus");
    expect(normalizeText("l plates")).toBe("learner plate");
    expect(normalizeText("vid")).toBe("vehicle inspectorate department");
    expect(normalizeText("zrp")).toBe("zimbabwe republic police");
  });

  it("handles compound Zimbabwean phrases", () => {
    expect(normalizeText("red robot")).toBe("red traffic light");
    expect(normalizeText("green robot")).toBe("green traffic light");
    expect(normalizeText("provisional licence")).toBe("learner licence");
    expect(normalizeText("learners licence")).toBe("learner licence");
  });

  it("normalizes whitespace", () => {
    expect(normalizeText("  hello   world  ")).toBe("hello world");
    expect(normalizeText("what\nis\na\nrobot")).toBe("what is a traffic light");
  });

  it("lowercases input", () => {
    expect(normalizeText("WHAT IS A STOP SIGN")).toBe("what is a stop sign");
  });
});

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------
describe("detectIntent", () => {
  it("detects definition intent", () => {
    expect(detectIntent("what is a stop sign")).toBe("definition");
    expect(detectIntent("explain right of way")).toBe("definition");
    expect(detectIntent("define pedestrian crossing")).toBe("definition");
  });

  it("detects meaning intent", () => {
    expect(detectIntent("what does this sign mean")).toBe("meaning");
    expect(detectIntent("what do they call overtaking")).toBe("meaning");
    expect(detectIntent("what is the meaning of a stop sign")).toBe("meaning");
  });

  it("detects action intent", () => {
    expect(detectIntent("what should i do at a red robot")).toBe("action");
    expect(detectIntent("how should the driver react")).toBe("action");
    expect(detectIntent("what am i supposed to do")).toBe("action");
  });

  it("detects comparison intent", () => {
    expect(detectIntent("difference between stop and give way signs")).toBe("comparison");
    expect(detectIntent("automatic vs manual licence")).toBe("comparison");
  });

  it("detects procedure intent", () => {
    expect(detectIntent("how do i change lanes")).toBe("procedure");
    expect(detectIntent("steps for parallel parking")).toBe("procedure");
  });

  it("detects legality intent", () => {
    expect(detectIntent("is it legal to use phone while driving")).toBe("legality");
    expect(detectIntent("can i overtake on a solid line")).toBe("legality");
    expect(detectIntent("am i allowed to park here")).toBe("legality");
    expect(detectIntent("do i have to wear a seatbelt")).toBe("legality");
  });

  it("detects why intent", () => {
    expect(detectIntent("why must i stop at a stop sign")).toBe("why");
    expect(detectIntent("why do we use dipped headlights at night")).toBe("why");
  });

  it("detects scenario intent", () => {
    expect(detectIntent("if i am approaching a junction")).toBe("scenario");
    expect(detectIntent("what if a pedestrian crosses suddenly")).toBe("scenario");
    expect(detectIntent("i am driving on a wet road")).toBe("scenario");
  });

  it("detects troubleshooting intent", () => {
    expect(detectIntent("my brakes are not working")).toBe("troubleshooting");
    expect(detectIntent("the car keeps skidding")).toBe("troubleshooting");
  });

  it("detects exam intent", () => {
    expect(detectIntent("will this come in the test")).toBe("exam");
    expect(detectIntent("quiz me on road signs")).toBe("exam");
  });

  it("detects follow-up intent", () => {
    expect(detectIntent("what about at night")).toBe("follow-up");
    expect(detectIntent("how about in fog")).toBe("follow-up");
  });

  it("returns general for unrecognized queries", () => {
    expect(detectIntent("random statement")).toBe("general");
  });
});

// ---------------------------------------------------------------------------
// Comparison detection
// ---------------------------------------------------------------------------
describe("detectComparison", () => {
  it("detects explicit comparison patterns", () => {
    const r1 = detectComparison("difference between stop and give way signs");
    expect(r1).not.toBeNull();
    expect(r1!.left).toContain("stop");
    expect(r1!.right).toContain("give way");

    const r2 = detectComparison("automatic vs manual transmission");
    expect(r2).not.toBeNull();
    expect(r2!.left).toContain("automatic");
    expect(r2!.right).toContain("manual");
  });

  it("returns null for non-comparison queries", () => {
    expect(detectComparison("what is a stop sign")).toBeNull();
    expect(detectComparison("how do i park")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario detection
// ---------------------------------------------------------------------------
describe("detectScenario", () => {
  it("extracts participants", () => {
    const s = detectScenario("i am driving and a pedestrian crosses");
    expect(s.present).toBe(true);
    expect(s.participants).toContain("learner-vehicle");
    expect(s.participants).toContain("pedestrian");
  });

  it("extracts conditions", () => {
    const s = detectScenario("driving at night in heavy rain");
    expect(s.conditions).toContain("night");
    expect(s.conditions).toContain("rain");
  });

  it("extracts road features", () => {
    const s = detectScenario("at a roundabout");
    expect(s.roadFeatures).toContain("roundabout");
  });

  it("extracts actions", () => {
    const s = detectScenario("while overtaking on a wet road");
    expect(s.actions).toContain("overtaking");
    expect(s.conditions).toContain("rain");
  });

  it("returns present=false for non-scenario queries", () => {
    const s = detectScenario("what is the highway code");
    expect(s.present).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Alias expansion
// ---------------------------------------------------------------------------
describe("expandTerms", () => {
  it("expands common learner phrases", () => {
    const e1 = expandTerms("who goes first at a junction");
    expect(e1.length).toBeGreaterThan(0);
    expect(e1.some((x) => x.canonical === "right of way")).toBe(true);

    const e2 = expandTerms("how fast can i go");
    expect(e2.some((x) => x.canonical === "speed limit")).toBe(true);

    const e3 = expandTerms("pull over");
    expect(e3.some((x) => x.canonical === "parking")).toBe(true);
  });

  it("expands vehicle equipment terms", () => {
    const e = expandTerms("wing mirror");
    expect(e.some((x) => x.canonical === "side mirror")).toBe(true);
  });

  it("expands junction terms", () => {
    const e = expandTerms("crossroads");
    expect(e.some((x) => x.canonical === "junction")).toBe(true);
  });

  it("returns empty for unrecognized queries", () => {
    const e = expandTerms("what is 2+2");
    expect(e).toHaveLength(0);
  });

  it("deduplicates by canonical", () => {
    const e = expandTerms("who goes first and who has priority");
    const canon = e.map((x) => x.canonical);
    expect(new Set(canon).size).toBe(canon.length);
  });
});

// ---------------------------------------------------------------------------
// Entity extraction
// ---------------------------------------------------------------------------
describe("extractEntities", () => {
  it("extracts signs", () => {
    const e = extractEntities("what does a stop sign mean");
    expect(e.some((x) => x.canonical === "stop-sign")).toBe(true);
  });

  it("extracts traffic lights", () => {
    const e = extractEntities("what does a red light mean");
    expect(e.some((x) => x.type === "traffic-light")).toBe(true);
  });

  it("extracts road features", () => {
    const e = extractEntities("at a roundabout");
    expect(e.some((x) => x.type === "road-feature")).toBe(true);
  });

  it("extracts road users", () => {
    const e = extractEntities("pedestrian crossing");
    expect(e.some((x) => x.type === "road-user")).toBe(true);
  });

  it("extracts vehicle parts", () => {
    const e = extractEntities("my brakes are not working");
    expect(e.some((x) => x.type === "vehicle-part")).toBe(true);
  });

  it("extracts conditions", () => {
    const e = extractEntities("driving in heavy rain");
    expect(e.some((x) => x.type === "condition")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Entity to concepts
// ---------------------------------------------------------------------------
describe("entitiesToConcepts", () => {
  it("maps entities to concept names", () => {
    const e = extractEntities("stop sign");
    const c = entitiesToConcepts(e);
    expect(c.length).toBeGreaterThan(0);
    expect(typeof c[0]).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Follow-up detection
// ---------------------------------------------------------------------------
describe("isFollowUp", () => {
  it("detects follow-up patterns", () => {
    expect(isFollowUp("what about at night")).toBe(true);
    expect(isFollowUp("how about in fog")).toBe(true);
    expect(isFollowUp("what if there is a pedestrian")).toBe(true);
    expect(isFollowUp("tell me more")).toBe(true);
    expect(isFollowUp("go deeper")).toBe(true);
  });

  it("returns false for standalone questions", () => {
    expect(isFollowUp("what is a stop sign")).toBe(false);
    expect(isFollowUp("how do i park correctly")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Conversation reference resolution
// ---------------------------------------------------------------------------
describe("resolveReferences", () => {
  it("resolves topic from conversation history", () => {
    const history = [
      { role: "user" as const, text: "what is a stop sign" },
      { role: "ai" as const, text: "A stop sign means you must come to a complete stop" },
    ];
    const refs = resolveReferences("what about at night", history);
    expect(refs.isContextual).toBe(true);
  });

  it("returns non-contextual for long independent questions", () => {
    const history = [
      { role: "user" as const, text: "what is a stop sign" },
    ];
    const refs = resolveReferences("how do I properly park my vehicle in a designated parking bay", history);
    expect(refs.isContextual).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Topic classification
// ---------------------------------------------------------------------------
describe("classifyTopic", () => {
  it("classifies road signs", () => {
    expect(classifyTopic("what does a stop sign mean").topic).toBe("road-signs");
  });

  it("classifies junction rules", () => {
    expect(classifyTopic("who goes first at a junction").topic).toBe("junction-rules");
  });

  it("classifies traffic lights", () => {
    expect(classifyTopic("what does a red robot mean").topic).toBe("traffic-lights");
  });

  it("classifies speed limits", () => {
    expect(classifyTopic("what is the speed limit in a school zone").topic).toBe("speed-limits");
  });

  it("classifies overtaking", () => {
    expect(classifyTopic("when can i overtake").topic).toBe("overtaking");
  });

  it("classifies parking", () => {
    expect(classifyTopic("can i park here").topic).toBe("parking");
  });

  it("classifies pedestrian safety", () => {
    expect(classifyTopic("zebra crossing rules").topic).toBe("pedestrian-safety");
  });

  it("classifies vehicle equipment", () => {
    expect(classifyTopic("tyre pressure check").topic).toBe("vehicle-equipment");
  });

  it("classifies vehicle classes", () => {
    expect(classifyTopic("licence class requirements").topic).toBe("vehicle-classes");
  });

  it("classifies night driving", () => {
    expect(classifyTopic("what lights at night").topic).toBe("night-driving");
  });
});

// ---------------------------------------------------------------------------
// Conversation context topic classification
// ---------------------------------------------------------------------------
describe("classifyTopicWithConversation", () => {
  it("uses conversation context to classify follow-up", () => {
    const history = [
      { role: "user" as const, text: "tell me about stop signs" },
      { role: "ai" as const, text: "Stop signs require a complete stop at the stop line." },
    ];
    // Short follow-up should benefit from context
    const result = classifyTopicWithConversation("what about give way signs", history);
    expect(result.topic).toBe("road-signs");
  });
});

// ---------------------------------------------------------------------------
// Topic switch detection
// ---------------------------------------------------------------------------
describe("detectTopicSwitch", () => {
  it("detects topic switch", () => {
    const history = [
      { role: "user" as const, text: "tell me about stop signs" },
      { role: "ai" as const, text: "Stop signs require a complete stop." },
    ];
    expect(detectTopicSwitch("parking rules are different", history, "parking", "road-signs")).toBe(true);
  });

  it("does not flag same topic as switch", () => {
    const history = [
      { role: "user" as const, text: "tell me about stop signs" },
    ];
    expect(detectTopicSwitch("what about give way signs", history, "road-signs", "road-signs")).toBe(false);
  });

  it("does not flag follow-ups as topic switch", () => {
    const history = [
      { role: "user" as const, text: "tell me about stop signs" },
    ];
    expect(detectTopicSwitch("what about at night", history, "night-driving", "road-signs")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Conversation block building
// ---------------------------------------------------------------------------
describe("buildConversationBlock", () => {
  it("builds a formatted block from conversation history", () => {
    const history = [
      { role: "user" as const, text: "what is a stop sign" },
      { role: "ai" as const, text: "A stop sign means you must stop." },
    ];
    const block = buildConversationBlock(history);
    expect(block).toContain("what is a stop sign");
    expect(block).toContain("A stop sign means you must stop.");
  });

  it("returns empty string for empty history", () => {
    expect(buildConversationBlock([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Knowledge retrieval
// ---------------------------------------------------------------------------
describe("retrieveKnowledge", () => {
  it("retrieves relevant entries for a query", () => {
    const results = retrieveKnowledge("what is a stop sign", "road-signs");
    expect(results.length).toBeGreaterThan(0);
  });

  it("scores entries by relevance", () => {
    const results = retrieveKnowledge("stop sign rules", "road-signs");
    if (results.length > 1) {
      expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
    }
  });

  it("returns low-relevance results for very unrelated queries", () => {
    const results = retrieveKnowledge("quantum physics", "road-signs");
    expect(results.every((r) => r.score <= 3)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Knowledge block building
// ---------------------------------------------------------------------------
describe("buildKnowledgeBlock", () => {
  it("builds a formatted knowledge block", () => {
    const results = retrieveKnowledge("stop sign", "road-signs");
    const block = buildKnowledgeBlock(results);
    expect(block.length).toBeGreaterThan(0);
  });

  it("returns empty string for no results", () => {
    expect(buildKnowledgeBlock([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Full pipeline: understandQuestion
// ---------------------------------------------------------------------------
describe("understandQuestion", () => {
  it("processes a simple question end-to-end", () => {
    const result = understandQuestion("what is a stop sign");
    expect(result.understanding.intent).toBe("definition");
    expect(result.understanding.normalizedQuery).toContain("stop sign");
    expect(result.understanding.topicId).toBe("road-signs");
  });

  it("handles Zimbabwean terms in full pipeline", () => {
    const result = understandQuestion("what does the robot mean");
    expect(result.understanding.normalizedQuery).toContain("traffic light");
  });

  it("detects scenario in full pipeline", () => {
    const result = understandQuestion("if i am driving at night in rain and a pedestrian crosses");
    expect(result.understanding.scenario.present).toBe(true);
  });

  it("detects comparison in full pipeline", () => {
    const result = understandQuestion("difference between stop and give way signs");
    expect(result.understanding.comparison.present).toBe(true);
  });

  it("uses conversation history for context", () => {
    const history = [
      { role: "user" as const, text: "what is a stop sign" },
      { role: "ai" as const, text: "A stop sign means you must come to a complete stop." },
    ];
    const result = understandQuestion("what about give way", history);
    expect(result.understanding.isFollowUp).toBe(true);
    expect(result.understanding.topicId).toBe("junction-rules");
  });

  it("expands aliases", () => {
    const result = understandQuestion("who goes first at a junction");
    expect(result.understanding.expandedTerms).toContain("right of way");
  });

  it("retrieves knowledge entries", () => {
    const result = understandQuestion("what does a stop sign mean");
    expect(result.knowledgeEntries.length).toBeGreaterThan(0);
    expect(result.knowledgeBlock.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Prompt formatting
// ---------------------------------------------------------------------------
describe("formatUnderstandingForPrompt", () => {
  it("formats understanding into prompt section", () => {
    const result = understandQuestion("what is a stop sign");
    const formatted = formatUnderstandingForPrompt(result);
    expect(formatted).toContain("<language_understanding>");
    expect(formatted).toContain("Intent: definition");
    expect(formatted).toContain("<driving_knowledge>");
  });

  it("includes comparison in formatted output", () => {
    const result = understandQuestion("difference between stop and give way signs");
    const formatted = formatUnderstandingForPrompt(result);
    expect(formatted).toContain("Comparison:");
  });

  it("includes follow-up indicator", () => {
    const history = [
      { role: "user" as const, text: "what is a stop sign" },
      { role: "ai" as const, text: "A stop sign requires a complete stop." },
    ];
    const result = understandQuestion("what about at night", history);
    const formatted = formatUnderstandingForPrompt(result);
    expect(formatted).toContain("follow-up");
  });
});
