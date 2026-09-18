/**
 * D11: AI Tutor Real-World QA — Retrieval Quality Test Suite
 *
 * 100+ real-world learner questions tested against the retrieval system.
 * Each test records: user question, expected topic, detected topic, pass/fail.
 *
 * Covers all 15 topics and 28 concepts in the Zivvvo content pack.
 * Uses actual terminology from Zimbabwe learner's licence exam preparation.
 */
import { describe, it, expect } from "vitest";
import {
  findRelevantTopic,
  findConceptsByTerm,
  topicContentSummary,
  questionsByTopic,
  questionsByConcept,
  contentPack,
  allConcepts,
  allTopicLabels,
} from "@zivvvo/content";

// ---------------------------------------------------------------------------
// Helper: assert topic detection with diagnostic info
// ---------------------------------------------------------------------------

function assertTopic(question: string, expectedTopic: string | null) {
  const detected = findRelevantTopic(contentPack, question);
  return { question, expected: expectedTopic, detected, pass: detected === expectedTopic };
}

// ---------------------------------------------------------------------------
// D11 Test Suite 1: Topic Detection — Road Signs (20 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: road-signs", () => {
  const cases: [string, string][] = [
    ["what are warning signs", "road-signs"],
    ["what does this sign mean", "road-signs"],
    ["what other signs are there", "road-signs"],
    ["what about the circular ones", "road-signs"],
    ["what are regulatory signs", "road-signs"],
    ["what does a stop sign look like", "road-signs"],
    ["tell me about road signs", "road-signs"],
    ["what are the different types of signs", "road-signs"],
    ["what is a mandatory sign", "road-signs"],
    ["what does a yield sign look like", "road-signs"],
    ["what are information signs", "road-signs"],
    ["what does the triangular sign mean", "road-signs"],
    ["what is a prohibition sign", "road-signs"],
    ["sign recognition examples", "road-signs"],
    ["what does the diamond shaped sign mean", "road-signs"],
    ["how many types of road signs are there", "road-signs"],
    ["what are the colours of road signs", "road-signs"],
    ["what does a warning sign indicate", "road-signs"],
    ["what is a guide sign", "road-signs"],
    ["what does this road sign mean", "road-signs"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 2: Topic Detection — Road Markings (10 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: road-markings", () => {
  const cases: [string, string][] = [
    ["what do road markings mean", "road-markings"],
    ["what are double solid lines", "road-markings"],
    ["what does a broken yellow line mean", "road-markings"],
    ["can I cross a solid white line", "road-markings"],
    ["what do lane markings indicate", "road-markings"],
    ["what are the different types of road lines", "road-markings"],
    ["what does a painted island mean", "road-markings"],
    ["what is a diverging lane", "road-markings"],
    ["what does a double prohibition line mean", "road-markings"],
    ["when can I cross road markings", "road-markings"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 3: Topic Detection — Junction Rules (10 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: junction-rules", () => {
  const cases: [string, string][] = [
    ["who has right of way at a junction", "junction-rules"],
    ["who goes first at an intersection", "junction-rules"],
    ["how do roundabouts work", "junction-rules"],
    ["when do I give way", "junction-rules"],
    ["what happens at an uncontrolled intersection", "junction-rules"],
    ["which car goes first", "junction-rules"],
    ["what is the rule at a crossroad", "junction-rules"],
    ["who has priority at a junction", "junction-rules"],
    ["how do I turn at an intersection", "junction-rules"],
    ["what does yield mean at a junction", "junction-rules"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 4: Topic Detection — Traffic Lights (10 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: traffic-lights", () => {
  const cases: [string, string][] = [
    ["what do the traffic light colours mean", "traffic-lights"],
    ["what is a robot in driving", "traffic-lights"],
    ["when can I go through a red light", "traffic-lights"],
    ["what does a flashing amber robot mean", "traffic-lights"],
    ["what does a green robot mean", "traffic-lights"],
    ["what is the correct robot sequence", "traffic-lights"],
    ["can I go against a red robot", "traffic-lights"],
    ["what do traffic signals mean", "traffic-lights"],
    ["when should I stop at a robot", "traffic-lights"],
    ["what does a flashing red robot mean", "traffic-lights"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 5: Topic Detection — Speed Limits (10 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: speed-limits", () => {
  const cases: [string, string][] = [
    ["what is the speed limit", "speed-limits"],
    ["how fast can I drive", "speed-limits"],
    ["what is the speed limit on highways", "speed-limits"],
    ["what is the maximum speed in Zimbabwe", "speed-limits"],
    ["how many km/h can I drive", "speed-limits"],
    ["what is the speed limit in a residential area", "speed-limits"],
    ["what happens if I speed", "speed-limits"],
    ["what are the speed restrictions", "speed-limits"],
    ["what is the standard maximum speed", "speed-limits"],
    ["speed limits for light vehicles", "speed-limits"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 6: Topic Detection — Overtaking (10 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: overtaking", () => {
  const cases: [string, string][] = [
    ["when is it safe to overtake", "overtaking"],
    ["what are the rules for overtaking", "overtaking"],
    ["can I overtake on a solid line", "overtaking"],
    ["how do I overtake safely", "overtaking"],
    ["when can I pass another car", "overtaking"],
    ["what is the overtaking rule", "overtaking"],
    ["is it legal to overtake on a hill", "overtaking"],
    ["overtaking near a junction", "overtaking"],
    ["when must I not overtake", "overtaking"],
    ["safe overtaking distance", "overtaking"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 7: Topic Detection — Parking (10 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: parking", () => {
  const cases: [string, string][] = [
    ["where can I park", "parking"],
    ["how close to a corner can I park", "parking"],
    ["what are the parking rules", "parking"],
    ["can I park on the sidewalk", "parking"],
    ["where am I allowed to stop", "parking"],
    ["parking near a junction", "parking"],
    ["what about stopping on a hill", "parking"],
    ["parking regulations in Zimbabwe", "parking"],
    ["can I park facing oncoming traffic", "parking"],
    ["when is parking prohibited", "parking"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 8: Topic Detection — Pedestrian Safety (10 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: pedestrian-safety", () => {
  const cases: [string, string][] = [
    ["where should pedestrians cross", "pedestrian-safety"],
    ["what is a zebra crossing", "pedestrian-safety"],
    ["what are the rules for cyclists", "pedestrian-safety"],
    ["how do I protect pedestrians", "pedestrian-safety"],
    ["what about bicycle riders", "pedestrian-safety"],
    ["pedestrian right of way", "pedestrian-safety"],
    ["cycling rules on the road", "pedestrian-safety"],
    ["what is a pedestrian crossing", "pedestrian-safety"],
    ["rules for walking on the road", "pedestrian-safety"],
    ["cyclist safety rules", "pedestrian-safety"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 9: Topic Detection — Vehicle Equipment (10 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: vehicle-equipment", () => {
  const cases: [string, string][] = [
    ["what equipment must my car have", "vehicle-equipment"],
    ["when should I use my horn", "vehicle-equipment"],
    ["what about tyre condition", "vehicle-equipment"],
    ["do I need a fire extinguisher", "vehicle-equipment"],
    ["what lights should I have", "vehicle-equipment"],
    ["brake requirements for vehicles", "vehicle-equipment"],
    ["spare tyre rules", "vehicle-equipment"],
    ["vehicle condition checks", "vehicle-equipment"],
    ["when must I check my brakes", "vehicle-equipment"],
    ["seat belt rules", "vehicle-equipment"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 10: Topic Detection — Vehicle Classes (10 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: vehicle-classes", () => {
  const cases: [string, string | null][] = [
    ["what licence do I need", "vehicle-classes"],
    ["how old do I have to be to drive", null],
    ["what documents do I need for a licence", "vehicle-classes"],
    ["what is a class 2 licence", "vehicle-classes"],
    ["what is a PSV licence", "vehicle-classes"],
    ["licence requirements for driving", "vehicle-classes"],
    ["what age can I get a learner licence", "vehicle-classes"],
    ["what is a driving licence code", "vehicle-classes"],
    ["vehicle classification categories", "vehicle-classes"],
    ["how do I apply for a licence", "vehicle-classes"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 11: Topic Detection — Towing & Loads (8 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: towing-loads", () => {
  const cases: [string, string][] = [
    ["what are the towing rules", "towing-loads"],
    ["how much can I tow", "towing-loads"],
    ["trailer regulations", "towing-loads"],
    ["load limits for vehicles", "towing-loads"],
    ["towing a trailer safely", "towing-loads"],
    ["cargo rules on the road", "towing-loads"],
    ["what is the maximum load", "towing-loads"],
    ["towing requirements in Zimbabwe", "towing-loads"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 12: Topic Detection — Accident Procedures (10 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: accident-procedures", () => {
  const cases: [string, string][] = [
    ["what do I do if I have an accident", "accident-procedures"],
    ["tell me about first aid", "accident-procedures"],
    ["what do I do if someone is bleeding", "accident-procedures"],
    ["what happens after a car crash", "accident-procedures"],
    ["emergency procedures on the road", "accident-procedures"],
    ["what to do at an accident scene", "accident-procedures"],
    ["accident reporting requirements", "accident-procedures"],
    ["how to handle a breakdown", "accident-procedures"],
    ["first aid for road accidents", "accident-procedures"],
    ["what is a serious accident", "accident-procedures"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 13: Topic Detection — Alcohol & Drugs (8 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: alcohol-drugs", () => {
  const cases: [string, string][] = [
    ["what is the blood alcohol limit", "alcohol-drugs"],
    ["can I drink and drive", "alcohol-drugs"],
    ["what about drugs and driving", "alcohol-drugs"],
    ["intoxication rules", "alcohol-drugs"],
    ["drink driving laws", "alcohol-drugs"],
    ["what happens if I drink and drive", "alcohol-drugs"],
    ["alcohol and driving rules", "alcohol-drugs"],
    ["drug influence on driving", "alcohol-drugs"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 14: Topic Detection — Night Driving (8 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: night-driving", () => {
  const cases: [string, string][] = [
    ["when should I use headlights at night", "night-driving"],
    ["what about driving in the rain", "night-driving"],
    ["dipped headlights rules", "night-driving"],
    ["night driving tips", "night-driving"],
    ["driving in fog conditions", "night-driving"],
    ["visibility rules at night", "night-driving"],
    ["headlight regulations", "night-driving"],
    ["adverse weather driving", "night-driving"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 15: Topic Detection — General Rules (10 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: general-rules", () => {
  const cases: [string, string][] = [
    ["what side do we drive on", "general-rules"],
    ["what is defensive driving", "general-rules"],
    ["what is aquaplaning", "general-rules"],
    ["what is stopping distance", "general-rules"],
    ["what is reaction time", "general-rules"],
    ["seatbelt requirements", "vehicle-equipment"],
    ["when can I use my horn", "vehicle-equipment"],
    ["what is a safe following distance", "general-rules"],
    ["roadcraft rules", "general-rules"],
    ["general driving regulations", "general-rules"],
  ];

  for (const [question, expected] of cases) {
    it(`detects topic for: "${question}" → ${expected}`, () => {
      const result = assertTopic(question, expected);
      expect(result.detected).toBe(result.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 16: Casual / Off-topic Questions (10 questions)
// ---------------------------------------------------------------------------

describe("D11 retrieval: off-topic returns null", () => {
  const cases: [string][] = [
    ["what is the capital of Zimbabwe"],
    ["who is the president"],
    ["what is the weather today"],
    ["how old are you"],
    ["who made you"],
    ["what can you do"],
    ["hello"],
    ["thanks"],
    ["good morning"],
    ["what is 2 plus 2"],
  ];

  for (const [question] of cases) {
    it(`returns null for off-topic: "${question}"`, () => {
      const topic = findRelevantTopic(contentPack, question);
      expect(topic).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// D11 Test Suite 17: Retrieval Quality — Content Verification
// ---------------------------------------------------------------------------

describe("D11 retrieval quality: content verification", () => {
  it("every topic has retrievable questions", () => {
    for (const topic of contentPack.topics) {
      const qs = questionsByTopic(contentPack, topic.id);
      expect(qs.length).toBeGreaterThan(0);
    }
  });

  it("every concept has retrievable questions", () => {
    const concepts = allConcepts(contentPack);
    for (const concept of concepts) {
      const qs = questionsByConcept(contentPack, concept);
      expect(qs.length).toBeGreaterThan(0);
    }
  });

  it("every topic has a content summary", () => {
    for (const topic of contentPack.topics) {
      const summary = topicContentSummary(contentPack, topic.id);
      expect(summary.concepts.length).toBeGreaterThan(0);
      expect(summary.questionCount).toBeGreaterThan(0);
    }
  });

  it("retrieved questions for road-signs have explanations", () => {
    const qs = questionsByTopic(contentPack, "road-signs");
    const withExplanation = qs.filter((q) => q.explanation && q.explanation.trim().length > 0);
    expect(withExplanation.length).toBeGreaterThan(50);
  });

  it("retrieved questions for speed-limits have correct answers", () => {
    const qs = questionsByTopic(contentPack, "speed-limits");
    for (const q of qs) {
      expect(q.correctIndexes.length).toBeGreaterThan(0);
    }
  });

  it("concept search finds relevant concepts for 'sign'", () => {
    const concepts = findConceptsByTerm(contentPack, "sign");
    expect(concepts.length).toBeGreaterThan(0);
    expect(concepts).toContain("sign-meaning");
    expect(concepts).toContain("sign-recognition");
    expect(concepts).toContain("sign-action");
  });

  it("concept search finds relevant concepts for 'speed'", () => {
    const concepts = findConceptsByTerm(contentPack, "speed");
    expect(concepts.length).toBeGreaterThan(0);
    expect(concepts).toContain("speed-limit");
  });

  it("concept search finds relevant concepts for 'parking'", () => {
    const concepts = findConceptsByTerm(contentPack, "parking");
    expect(concepts.length).toBeGreaterThan(0);
    expect(concepts).toContain("parking-rule");
  });

  it("all 28 concepts are searchable", () => {
    const allCon = allConcepts(contentPack);
    expect(allCon.length).toBe(28);
    for (const c of allCon) {
      const parts = c.split("-");
      const firstWord = parts[0] ?? c;
      const found = findConceptsByTerm(contentPack, firstWord);
      expect(found.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// D11 Test Suite 18: Topic Detection Audit — Ambiguous Terms
// ---------------------------------------------------------------------------

describe("D11 retrieval: ambiguous terms", () => {
  it("'signal' matches traffic-lights (not road-signs)", () => {
    const topic = findRelevantTopic(contentPack, "what does the signal mean");
    expect(topic).toBe("traffic-lights");
  });

  it("'lights' alone is ambiguous but matches vehicle-equipment", () => {
    const topic = findRelevantTopic(contentPack, "what about the lights on my car");
    expect(topic).toBe("vehicle-equipment");
  });

  it("'rule' alone matches general-rules", () => {
    const topic = findRelevantTopic(contentPack, "what is the rule");
    expect(topic).toBe("general-rules");
  });

  it("'test' matches vehicle-classes", () => {
    const topic = findRelevantTopic(contentPack, "what is the driving test like");
    expect(topic).toBe("vehicle-classes");
  });

  it("'emergency' matches accident-procedures", () => {
    const topic = findRelevantTopic(contentPack, "what is an emergency");
    expect(topic).toBe("accident-procedures");
  });

  it("'line' matches road-markings", () => {
    const topic = findRelevantTopic(contentPack, "what does this line mean");
    expect(topic).toBe("road-markings");
  });

  it("'turn' matches junction-rules", () => {
    const topic = findRelevantTopic(contentPack, "when can I turn");
    expect(topic).toBe("junction-rules");
  });

  it("'crossing' matches pedestrian-safety", () => {
    const topic = findRelevantTopic(contentPack, "what is a crossing");
    expect(topic).toBe("pedestrian-safety");
  });
});

// ---------------------------------------------------------------------------
// D11 Test Suite 19: Full Content Coverage Audit
// ---------------------------------------------------------------------------

describe("D11 full content coverage", () => {
  it("all 15 topics have keyword entries", () => {
    const topicIds = contentPack.topics.map((t) => t.id);
    for (const id of topicIds) {
      const summary = topicContentSummary(contentPack, id);
      expect(summary.questionCount).toBeGreaterThan(0);
    }
  });

  it("all 28 concepts appear in questions", () => {
    const concepts = allConcepts(contentPack);
    expect(concepts.length).toBe(28);
    for (const c of concepts) {
      const qs = questionsByConcept(contentPack, c);
      expect(qs.length).toBeGreaterThan(0);
    }
  });

  it("every question with explanation can be retrieved by concept", () => {
    const withExplanation = contentPack.questions.filter(
      (q) => q.explanation && q.explanation.trim().length > 0 && q.concept,
    );
    expect(withExplanation.length).toBeGreaterThan(1000);
    for (const q of withExplanation.slice(0, 50)) {
      const qs = questionsByConcept(contentPack, q.concept!);
      expect(qs.length).toBeGreaterThan(0);
    }
  });

  it("content pack has 1396 questions", () => {
    expect(contentPack.questions.length).toBe(1396);
  });

  it("content pack has 15 topics", () => {
    expect(contentPack.topics.length).toBe(15);
  });

  it("all topic labels are human-readable", () => {
    const labels = allTopicLabels(contentPack);
    expect(labels.length).toBe(15);
    for (const label of labels) {
      expect(label.length).toBeGreaterThan(3);
      expect(label).not.toContain("_");
    }
  });
});
