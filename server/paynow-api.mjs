import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

import ws from "ws";

// ---------------------------------------------------------------------------
// D10: Load content pack for server-side retrieval
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contentData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../packages/content/src/data/content-v1.json"), "utf8")
);

// D12: Load Driving Instructor Knowledge Base
const kbEntries = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../packages/ai-tutor-language/kb-entries.json"), "utf8")
);

// Pre-index KB entries by topic and keyword for fast retrieval
const kbByTopic = new Map();
const kbByKeyword = new Map();
for (const entry of kbEntries) {
  if (!kbByTopic.has(entry.topicId)) kbByTopic.set(entry.topicId, []);
  kbByTopic.get(entry.topicId).push(entry);
  for (const kw of [...entry.keywords, ...entry.aliases, entry.title.toLowerCase()]) {
    const key = kw.toLowerCase();
    if (!kbByKeyword.has(key)) kbByKeyword.set(key, []);
    kbByKeyword.get(key).push(entry);
  }
}

/**
 * D12: Retrieve relevant KB entries for a learner question.
 * Scores by keyword match, topic match, and title match.
 * Returns top 5 entries sorted by relevance.
 */
function retrieveKB(normalizedText, topicId) {
  const scores = new Map();
  const reasons = new Map();

  // Keyword/alias scoring
  for (const [kw, entries] of kbByKeyword) {
    if (normalizedText.includes(kw)) {
      for (const entry of entries) {
        const prev = scores.get(entry.id) ?? 0;
        scores.set(entry.id, prev + 2);
        const r = reasons.get(entry.id) ?? [];
        r.push(`keyword:${kw}`);
        reasons.set(entry.id, r);
      }
    }
  }

  // Topic bonus
  if (topicId && kbByTopic.has(topicId)) {
    for (const entry of kbByTopic.get(topicId)) {
      const prev = scores.get(entry.id) ?? 0;
      scores.set(entry.id, prev + 1);
      const r = reasons.get(entry.id) ?? [];
      r.push("topic-match");
      reasons.set(entry.id, r);
    }
  }

  // Sort and return top 5
  const results = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, score]) => ({
      entry: kbEntries.find((e) => e.id === id),
      score,
      reason: (reasons.get(id) ?? []).join(", "),
    }))
    .filter((r) => r.entry);

  return results;
}

/**
 * D12: Build a formatted knowledge block from KB entries for the AI prompt.
 */
function buildKBBlock(retrieved) {
  if (!retrieved || retrieved.length === 0) return "";
  const lines = [];
  for (const r of retrieved.slice(0, 3)) {
    lines.push(`### ${r.entry.title} [${r.entry.topicId}]`);
    lines.push(r.entry.content);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * D12: Detect genuine ambiguity in a learner question.
 * Returns possible meanings when the question is genuinely ambiguous.
 */
function detectAmbiguity(text, topicId) {
  const normalized = text.toLowerCase().trim();
  const ambiguous = [];

  // "what does X mean" with short/ambiguous subjects
  const meanMatch = normalized.match(/^what does (the |a |an |this |that )?(\w+) mean/i);
  if (meanMatch) {
    const subject = meanMatch[2]?.toLowerCase();
    const ambiguousSubjects = {
      "yellow": ["yellow traffic light", "yellow road sign", "yellow road marking", "yellow vehicle plate"],
      "red": ["red traffic light", "red road sign", "red road marking"],
      "green": ["green traffic light", "green road sign", "green arrow signal"],
      "amber": ["amber traffic light", "amber road sign"],
      "blue": ["blue road sign", "blue parking sign"],
      "white": ["white road marking", "white line"],
      "orange": ["orange temporary sign", "orange hazard marking"],
      "circle": ["circular sign", "roundabout sign"],
      "triangle": ["triangular warning sign", "yield sign"],
      "diamond": ["diamond-shaped sign"],
      "square": ["square information sign", "rectangular sign"],
      "arrow": ["directional arrow marking", "arrow signal", "lane arrow"],
      "one": ["one-way sign", "single sign meaning"],
      "that": [],
      "this": [],
      "it": [],
    };
    if (subject && ambiguousSubjects[subject]) {
      ambiguous.push(...ambiguousSubjects[subject]);
    }
  }

  // Short vague questions
  if (normalized.length < 15 && !topicId) {
    if (/^(what about|how about|what if|what does|what is|explain|tell me)\b/.test(normalized)) {
      ambiguous.push("Could you specify what you're asking about?");
    }
  }

  return ambiguous;
}

/**
 * D12: Classify the source/grounding level of a knowledge claim.
 */
function classifyGrounding(content) {
  const lower = content.toLowerCase();
  if (/zimbabwe|zim|vid|zrp|🇿🇼/.test(lower)) return "verified-zimbabwe-rule";
  if (/according to zivvvo|zivvvo.*study|zivvvo.*material/.test(lower)) return "zivvvo-exam-content";
  if (/always|never|must|shall|required|law|regulation|legally/.test(lower)) return "general-driving-principle";
  if (/recommended|suggested|advised|good practice|best practice|safer/.test(lower)) return "safety-guidance";
  return "instructor-guidance";
}

// Topic keyword map for server-side retrieval
const TOPIC_KEYWORDS = {
  "road-signs": ["sign", "signs", "regulatory", "warning", "information", "guide", "road sign", "prohibition", "mandatory", "circular", "diamond", "triangular"],
  "road-markings": ["marking", "markings", "line", "lines", "lane", "road marking", "painted", "double", "dashed", "broken yellow", "painted island", "diverging lane"],
  "junction-rules": ["junction", "intersection", "roundabout", "turn", "turning", "give way", "right of way", "who goes first", "goes first", "crossroad", "yield", "priority"],
  "traffic-lights": ["traffic light", "traffic lights", "signal", "signals", "stop light", "robot", "robots", "red light", "green light", "flashing amber"],
  "speed-limits": ["speed", "speed limit", "km/h", "kilometres per hour", "how fast", "maximum speed"],
  "overtaking": ["overtake", "overtaking", "passing", "pass", "safe to overtake", "overtake on"],
  "parking": ["park", "parking", "stopping", "stand", "standing", "allowed to stop"],
  "pedestrian-safety": ["pedestrian", "crossing", "zebra", "walk", "walking", "cyclist", "bicycle", "cycling", "cyclist safety", "pedestrian right", "pedal cyclist"],
  "vehicle-equipment": ["equipment", "tyre", "tyres", "tire", "brake", "lights", "vehicle condition", "spare", "fire extinguisher", "seat belt", "use my horn", "hooter", "seatbelt"],
  "vehicle-classes": ["class", "classes", "vehicle class", "licence class", "category", "psv", "driving licence", "licence", "license", "learner", "learner's", "requirement", "application", "test", "minimum age", "age requirement", "how old to drive"],
  "towing-loads": ["tow", "towing", "load", "loads", "trailer", "cargo", "towing requirements"],
  "accident-procedures": ["accident", "crash", "collision", "breakdown", "emergency", "incident", "first aid", "bleeding", "accident reporting"],
  "alcohol-drugs": ["alcohol", "drug", "drugs", "drunk", "drink driving", "dui", "intoxication", "blood alcohol", "drink and drive", "drinking and driving", "under the influence"],
  "night-driving": ["night", "headlight", "headlights", "visibility", "dark", "dipped", "fog", "rain", "adverse weather", "rainy weather"],
  "general-rules": ["rule", "rules", "regulation", "law", "road rule", "general rule", "roadcraft", "insurance", "defensive", "hazard", "hazards", "safe distance", "following distance", "cell", "cells", "road cell", "aquaplaning", "reaction time", "reaction distance", "stopping distance", "skidding", "side of the road", "drive on"],
};

const VALID_TOPIC_IDS = new Set(contentData.topics.map((t) => t.id));

// Pre-index questions by topic and concept for fast retrieval
const questionsByTopicIndex = new Map();
const questionsByConceptIndex = new Map();
for (const q of contentData.questions) {
  if (!questionsByTopicIndex.has(q.topicId)) questionsByTopicIndex.set(q.topicId, []);
  questionsByTopicIndex.get(q.topicId).push(q);
  if (q.concept) {
    if (!questionsByConceptIndex.has(q.concept)) questionsByConceptIndex.set(q.concept, []);
    questionsByConceptIndex.get(q.concept).push(q);
  }
}

/**
 * Check if a keyword matches in text. For short keywords (<=4 chars),
 * uses word-boundary matching to avoid substring false positives.
 */
function matchesKeyword(text, keyword) {
  if (keyword.length <= 4) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`);
    return regex.test(text);
  }
  return text.includes(keyword);
}

// ---------------------------------------------------------------------------
// D12: Language Understanding Pipeline
// Normalization, intent detection, semantic expansion, entity extraction,
// conversation context resolution, and enhanced topic classification.
// ---------------------------------------------------------------------------

// Spelling fixes (longest first to avoid partial matches)
const SPELLING_FIXES = [
  ["righ of way", "right of way"], ["roght of way", "right of way"],
  ["rightofway", "right of way"], ["righ or way", "right of way"],
  ["regulashions", "regulations"], ["overtakeing", "overtaking"],
  ["overtakin", "overtaking"], ["pedestrain", "pedestrian"],
  ["pedesrian", "pedestrian"], ["cylist", "cyclist"],
  ["junciton", "junction"], ["intersecton", "intersection"],
  ["traffic ligths", "traffic lights"], ["traffic lighs", "traffic lights"],
  ["trianffic light", "traffic light"], ["seatbelt", "seat belt"],
  ["lisence", "licence"], ["license", "licence"],
  ["honn", "horn"], ["miror", "mirror"],
  ["windscrean", "windscreen"], ["windshield", "windscreen"],
  ["aquaplaningg", "aquaplaning"], ["aquaplanning", "aquaplaning"],
  ["hydroplaning", "aquaplaning"], ["emergancy", "emergency"],
  ["manouvre", "manoeuvre"], ["maneuver", "manoeuvre"],
  ["compulsary", "compulsory"], ["indicater", "indicator"],
  ["necesary", "necessary"], ["nessecary", "necessary"],
].sort((a, b) => b[0].length - a[0].length);

// Zimbabwean terms
const ZIMBABWEAN_TERMS = [
  ["robot", "traffic light"], ["robots", "traffic lights"],
  ["red robot", "red traffic light"], ["green robot", "green traffic light"],
  ["amber robot", "amber traffic light"], ["hooter", "horn"],
  ["kombi", "minibus"], ["omnibus", "minibus"],
  ["commuter omnibus", "minibus"], ["l plates", "learner plate"],
  ["l-plate", "learner plate"], ["learner plate", "learner plate"],
  ["reg", "registration"], ["vid", "vehicle inspectorate department"],
  ["zrp", "zimbabwe republic police"],
  ["provisional licence", "learner licence"],
  ["learners licence", "learner licence"], ["learner's licence", "learner licence"],
];

function normalizeText(raw) {
  let text = raw.toLowerCase().normalize("NFKC").trim();
  for (const [wrong, correct] of SPELLING_FIXES) {
    text = text.split(wrong).join(correct);
  }
  for (const [local, canonical] of ZIMBABWEAN_TERMS) {
    text = text.replace(new RegExp(`\\b${local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), canonical);
  }
  return text.replace(/\s+/g, " ").trim();
}

// Intent detection patterns
const INTENT_PATTERNS = [
  { intent: "definition", patterns: [/^what (is|are|does|do) (a |an |the )?/i, /^define\b/i, /^explain\b/i, /^tell me about\b/i], weight: 1.0 },
  { intent: "meaning", patterns: [/^what does (this|that|the|a|an)\b.*\bmean/i, /^what do (you|they) call\b/i], weight: 1.0 },
  { intent: "action", patterns: [/^what should (i|we|the driver|you)\b/i, /^what do (i|we|the driver|you) do\b/i, /^how should (i|we|the driver|you)\b/i, /^what am i supposed to\b/i, /^how (do|should) i (react|respond|handle|deal|approach)\b/i], weight: 1.0 },
  { intent: "comparison", patterns: [/difference between\b/i, /\bvs\.?\b/i, /\bversus\b/i, /how is .+ different from\b/i, /what'?s the difference\b/i, /compare\b/i], weight: 1.0 },
  { intent: "procedure", patterns: [/^how do (i|we|you)\b/i, /^how should (i|we|you)\b/i, /^what is the (correct )?way to\b/i, /^steps for\b/i, /^walk me through\b/i], weight: 0.9 },
  { intent: "legality", patterns: [/^is (it|this|that) (legal|allowed|permitted|okay|ok)\b/i, /^can (i|we|you|a learner)\b/i, /^am i (allowed|permitted) to\b/i, /^may (i|we|you)\b/i, /^do (i|we|you) have to\b/i, /^must (i|we|you)\b/i, /^what (are|is) the rules? for\b/i], weight: 0.9 },
  { intent: "why", patterns: [/^why\b/i, /^why (do|does|is|are|can|can't|should|must|would)\b/i], weight: 1.0 },
  { intent: "when", patterns: [/^when (should|can|must|do|does|is|are|would)\b/i, /^at what (point|time|speed)\b/i], weight: 0.9 },
  { intent: "where", patterns: [/^where (can|should|must|do|does|is|are|would)\b/i], weight: 0.9 },
  { intent: "which", patterns: [/^which (lane|light|sign|vehicle|car|one|gear|licence|class)\b/i], weight: 0.9 },
  { intent: "scenario", patterns: [/\bif (i|the|a|there|it|we|you)\b/i, /\bwhat if\b/i, /\bi'?m (approaching|driving|coming|turning)\b/i, /\bat (an? )?(intersection|junction|crossroads|roundabout)\b/i, /\bon a (wet|dry|narrow|steep|busy)\b/i], weight: 0.8 },
  { intent: "troubleshooting", patterns: [/^my (car|brakes?|steering|tyre|engine|battery|lights?)\b/i, /^the (car|brakes?|engine) (is|feels?|keeps?|won't|doesn't)\b/i], weight: 0.8 },
  { intent: "exam", patterns: [/\bwill (this|it) come (in|on) (the|my) test\b/i, /what should i study\b/i, /\bquiz me\b/i, /\btest me\b/i], weight: 0.9 },
  { intent: "follow-up", patterns: [/^(what about|how about|what if)\b/i, /^and\b/i, /^(why|how|when|where|which)\s*\??$/i], weight: 0.7 },
];

function detectIntent(text) {
  let best = "general"; let bestW = 0;
  for (const { intent, patterns, weight } of INTENT_PATTERNS) {
    for (const p of patterns) {
      if (p.test(text) && weight > bestW) { best = intent; bestW = weight; break; }
    }
  }
  return best;
}

// Alias expansion: learner term -> canonical concept
const ALIAS_MAP = {
  "who goes first": { canonical: "right of way", topicHint: "junction-rules" },
  "who goes before": { canonical: "right of way", topicHint: "junction-rules" },
  "who moves first": { canonical: "right of way", topicHint: "junction-rules" },
  "who has priority": { canonical: "right of way", topicHint: "junction-rules" },
  "which car goes first": { canonical: "right of way", topicHint: "junction-rules" },
  "precedence": { canonical: "right of way", topicHint: "junction-rules" },
  "give way": { canonical: "right of way", topicHint: "junction-rules" },
  "yield": { canonical: "right of way", topicHint: "junction-rules" },
  "warning board": { canonical: "warning sign", topicHint: "road-signs" },
  "hazard sign": { canonical: "warning sign", topicHint: "road-signs" },
  "traffic sign": { canonical: "road sign", topicHint: "road-signs" },
  "traffic signal": { canonical: "traffic light", topicHint: "traffic-lights" },
  "stop light": { canonical: "traffic light", topicHint: "traffic-lights" },
  "go past another car": { canonical: "overtaking", topicHint: "overtaking" },
  "pass a slower vehicle": { canonical: "overtaking", topicHint: "overtaking" },
  "pull over": { canonical: "parking", topicHint: "parking" },
  "safety belt": { canonical: "seat belt", topicHint: "vehicle-equipment" },
  "wing mirror": { canonical: "side mirror", topicHint: "vehicle-equipment" },
  "turn signal": { canonical: "indicator", topicHint: "vehicle-equipment" },
  "how fast can i go": { canonical: "speed limit", topicHint: "speed-limits" },
  "maximum speed": { canonical: "speed limit", topicHint: "speed-limits" },
  "car slides on water": { canonical: "aquaplaning", topicHint: "night-driving" },
  "car won't stop properly": { canonical: "brake failure", topicHint: "vehicle-equipment" },
  "car overheats": { canonical: "overheating", topicHint: "vehicle-equipment" },
  "how old to drive": { canonical: "age requirement", topicHint: "vehicle-classes" },
  "crossroads": { canonical: "junction", topicHint: "junction-rules" },
  "traffic circle": { canonical: "roundabout", topicHint: "junction-rules" },
  "rotary": { canonical: "roundabout", topicHint: "junction-rules" },
};

function expandTerms(query) {
  const results = []; const lower = query.toLowerCase();
  for (const [phrase, mapping] of Object.entries(ALIAS_MAP)) {
    if (lower.includes(phrase)) {
      results.push({ canonical: mapping.canonical, confidence: 0.9, topicHint: mapping.topicHint });
    }
  }
  const seen = new Map();
  for (const r of results) {
    const existing = seen.get(r.canonical);
    if (!existing || r.confidence > existing.confidence) seen.set(r.canonical, r);
  }
  return [...seen.values()];
}

// Scenario detection
function detectScenario(text) {
  const participants = [], conditions = [], actions = [], roadFeatures = [];
  if (/\b(i|me|my|we|you)\b/i.test(text)) participants.push("learner-vehicle");
  if (/\b(a |the )?(car|vehicle|truck|bus|lorry|van)\b/i.test(text)) participants.push("other-vehicle");
  if (/\bpedestrian|person|people|walk\b/i.test(text)) participants.push("pedestrian");
  if (/\bcyclist|bicycle|bike\b/i.test(text)) participants.push("cyclist");
  if (/\b(raining|rain|wet|heavy rain)\b/i.test(text)) conditions.push("rain");
  if (/\bnight|dark|darkness\b/i.test(text)) conditions.push("night");
  if (/\bfog|mist|smoke|dust\b/i.test(text)) conditions.push("low-visibility");
  if (/\bsteep|hill|slope|gradient\b/i.test(text)) conditions.push("gradient");
  if (/\bnarrow\b/i.test(text)) conditions.push("narrow-road");
  if (/\bovertak|pass(ing)?\b/i.test(text)) actions.push("overtaking");
  if (/\bturn(ing)?\b/i.test(text)) actions.push("turning");
  if (/\bstop(ped|ping)?\b/i.test(text) && !/\bstopping distance/i.test(text)) actions.push("stopping");
  if (/\bjunction|intersection|crossroad|t-junction\b/i.test(text)) roadFeatures.push("junction");
  if (/\broundabout|traffic circle\b/i.test(text)) roadFeatures.push("roundabout");
  if (/\bcrossing|zebra\b/i.test(text)) roadFeatures.push("crossing");
  if (/\bbend|curve|corner\b/i.test(text)) roadFeatures.push("bend");
  if (/\bbridge\b/i.test(text)) roadFeatures.push("bridge");
  const present = participants.length > 0 || conditions.length > 0 || actions.length > 0 || roadFeatures.length > 0;
  return { present, participants: participants.length ? participants : undefined, conditions: conditions.length ? conditions : undefined, actions: actions.length ? actions : undefined, roadFeatures: roadFeatures.length ? roadFeatures : undefined };
}

// Extended topic keywords with expanded learner language
const EXTENDED_TOPIC_KEYWORDS = {
  "road-signs": ["sign", "signs", "road sign", "regulatory", "warning", "information", "guide", "prohibition", "mandatory", "circular", "diamond", "triangular", "stop sign", "give way sign", "no entry", "no overtaking", "no parking", "no stopping", "speed sign", "hazard sign", "warning board", "traffic sign", "road symbol", "sign meaning", "triangle sign", "circle sign", "what does this sign mean", "sign recognition", "sign action"],
  "road-markings": ["marking", "markings", "road marking", "line", "lines", "lane", "painted", "double", "dashed", "broken", "solid line", "continuous line", "double solid", "lane arrow", "stop line", "give-way line", "painted island", "hatching", "chevrons", "yellow line", "white line", "road markings", "what does this line mean"],
  "junction-rules": ["junction", "intersection", "crossroads", "crossroad", "t-junction", "roundabout", "traffic circle", "rotary", "turn", "turning", "give way", "yield", "right of way", "right-of-way", "priority", "precedence", "who goes first", "who has priority", "who moves first", "goes first", "merging", "joining", "turning right", "turning left", "junction rules"],
  "traffic-lights": ["traffic light", "traffic lights", "traffic signal", "robot", "robots", "signal", "signals", "stop light", "red light", "green light", "amber light", "flashing amber", "pedestrian signal", "arrow signal", "how do robots work", "what does the robot mean"],
  "speed-limits": ["speed", "speed limit", "km/h", "how fast", "maximum speed", "legal speed", "speed restriction", "speed zone", "school zone", "appropriate speed", "too fast", "speed control", "speed hump", "traffic calming"],
  "overtaking": ["overtake", "overtaking", "passing", "pass", "safe to overtake", "overtake on", "go past", "no overtaking", "when can i overtake", "overtaking rules", "can i overtake"],
  "parking": ["park", "parking", "parked", "stopping", "no parking", "no stopping", "stand", "standing", "allowed to stop", "parking bay", "parking rules", "where can i park", "pull over", "can i park here", "parking near"],
  "pedestrian-safety": ["pedestrian", "pedestrians", "crossing", "zebra crossing", "pedestrian crossing", "school children", "children", "cyclist", "cyclists", "bicycle", "bike", "cycling", "motorcycle", "motorcyclist", "pedestrian safety", "vulnerable road user", "sharing the road"],
  "vehicle-equipment": ["equipment", "vehicle equipment", "tyre", "tyres", "tire", "brake", "brakes", "lights", "vehicle condition", "seat belt", "seatbelt", "hooter", "horn", "indicator", "mirrors", "windscreen", "wipers", "headlights", "brake lights", "warning lights", "what should i check", "vehicle equipment"],
  "vehicle-classes": ["class", "classes", "vehicle class", "licence class", "licence", "license", "psv", "driving licence", "learner licence", "provisional licence", "requirement", "minimum age", "age requirement", "how old to drive", "licence requirement", "l plate", "learner plate", "vehicle class"],
  "towing-loads": ["tow", "towing", "load", "loads", "trailer", "cargo", "towing requirements", "trailer coupling", "heavy load", "overloaded", "overloading", "towing rules", "can i tow"],
  "accident-procedures": ["accident", "crash", "collision", "breakdown", "emergency", "incident", "first aid", "bleeding", "accident reporting", "report accident", "after an accident", "accident procedure", "what do i do after"],
  "alcohol-drugs": ["alcohol", "drug", "drugs", "drunk", "drink driving", "intoxication", "blood alcohol", "drink and drive", "under the influence", "medication", "fatigue", "tired", "sleepy", "fitness to drive", "alcohol and driving"],
  "night-driving": ["night", "night driving", "dark", "darkness", "headlight", "headlights", "visibility", "dipped", "fog", "mist", "rain", "heavy rain", "adverse weather", "wet road", "slippery", "aquaplaning", "hydroplaning", "glare", "poor visibility", "what lights at night"],
  "general-rules": ["rule", "rules", "regulation", "law", "road rule", "roadcraft", "insurance", "defensive", "defensive driving", "hazard", "hazards", "safe distance", "following distance", "stopping distance", "reaction time", "skidding", "side of the road", "drive on", "left-hand traffic", "observation", "anticipation", "blind spot", "hazard perception", "mirror use", "lane discipline", "courtesy", "road rage", "distraction", "what should i check before driving"],
};

// Conversation reference resolution
const FOLLOW_UP_PATTERNS = [
  /^(what about|how about|what if)\b/i,
  /^(and|or|but)\s+(what about|how about|why|when|where|which|if|the|those|these)\b/i,
  /^(and|or|but)\s+(regulatory|mandatory|warning|information|at night|in rain)\b/i,
  /^(why|how|when|where|which)\s*\??$/i,
  /^(explain|tell me more|go deeper|make it easier|give examples?)\b/i,
];

function isFollowUp(text) {
  return FOLLOW_UP_PATTERNS.some((p) => p.test(text.trim().toLowerCase()));
}

function resolveReferences(currentMessage, conversationHistory) {
  const trimmed = currentMessage.trim().toLowerCase();
  if (currentMessage.length > 20 && !isFollowUp(currentMessage)) {
    return { resolvedTopic: null, resolvedEntity: null, isContextual: false };
  }
  const isContextual = isFollowUp(currentMessage) || /^(that|those|them|it|this|there)\b/i.test(trimmed) || trimmed.length < 15;
  if (!isContextual) return { resolvedTopic: null, resolvedEntity: null, isContextual: false };

  const recent = conversationHistory.slice(-6);
  let resolvedTopic = null;
  for (const msg of [...recent].reverse()) {
    if (msg.role !== "user") continue;
    const lower = msg.text.toLowerCase();
    const m = lower.match(/\b(signs?|road signs?|warning signs?|regulatory signs?|junctions?|right of way|traffic lights?|robots?|speed|overtaking|parking|pedestrians?|cyclists?|markings?|lines?|lane|licen[cs]e|alcohol|drugs?|night driving|rain|fog)\b/);
    if (m) { resolvedTopic = m[0]; break; }
  }
  let resolvedEntity = null;
  const aiMsgs = recent.filter((m) => m.role === "ai");
  if (aiMsgs.length > 0) {
    const lastAi = aiMsgs[aiMsgs.length - 1].text.toLowerCase();
    const em = lastAi.match(/\b(warning signs?|regulatory signs?|stop signs?|give way|right of way|junctions?|roundabouts?|traffic lights?|robots?|speed limits?|overtaking|parking|pedestrians?|cyclists?|markings?|seat belts?|brakes?|tyres?|headlights?)\b/);
    if (em) resolvedEntity = em[0];
  }
  return { resolvedTopic, resolvedEntity, isContextual };
}

/**
 * Enhanced topic classification with conversation context.
 * Combines current message scoring + conversation context + alias expansion.
 */
function classifyTopicEnhanced(text, conversationHistory) {
  const normalized = normalizeText(text);

  // Direct classification
  const direct = matchTopicWithScore(normalized);

  // Expanded terms
  const expansions = expandTerms(normalized);
  const expansionTopic = expansions.length > 0
    ? (() => { const counts = {}; for (const e of expansions) { if (e.topicHint) counts[e.topicHint] = (counts[e.topicHint] || 0) + 1; } let best = null, bestS = 0; for (const [t, s] of Object.entries(counts)) { if (s > bestS) { bestS = s; best = t; } } return best; })()
    : null;

  // Conversation context
  const refs = resolveReferences(text, conversationHistory || []);
  let contextTopic = null;
  if (refs.resolvedTopic) {
    const r = matchTopicWithScore(refs.resolvedTopic);
    contextTopic = r.topic;
  }

  // If it's a follow-up and direct match is weak, use conversation context
  const isShort = text.length < 25 || isFollowUp(text);
  if (isShort && direct.score < 2 && (contextTopic || expansionTopic)) {
    return contextTopic || expansionTopic;
  }

  return direct.topic || expansionTopic || contextTopic;
}

/**
 * Score a text against topic keywords and return the best matching topic.
 * Multi-word phrases score 2 points, single words score 1 point.
 * Short keywords use word-boundary matching.
 * Topic-name bonus: if the topic name appears in the query, +3 points.
 * Tiebreaker: specific topics beat general-rules on equal scores.
 */
function matchTopic(text) {
  return matchTopicWithScore(text).topic;
}

/**
 * Match topic with confidence score.
 * Score >= 2 = strong match (phrase or multiple keywords).
 * Score 1 = weak match (single keyword only).
 */
function matchTopicWithScore(text) {
  const lower = text.toLowerCase();
  let bestTopic = null;
  let bestScore = 0;
  for (const [topicId, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (!VALID_TOPIC_IDS.has(topicId)) continue;
    let score = 0;
    for (const kw of keywords) {
      if (matchesKeyword(lower, kw)) {
        score += kw.includes(" ") ? 2 : 1;
      }
    }
    const topicName = topicId.replace(/-/g, " ");
    if (lower.includes(topicName)) {
      score += 3;
    }
    if (score > bestScore || (score === bestScore && score > 0 && bestTopic === "general-rules" && topicId !== "general-rules")) {
      bestScore = score;
      bestTopic = topicId;
    }
  }
  return { topic: bestScore > 0 ? bestTopic : null, score: bestScore };
}

/**
 * D10: Retrieve relevant Zivvvo content for a learner question.
 * Returns an object with topic info, example questions, and explanations.
 */
function retrieveForQuestion(learnerQuestion, conversationHistory) {
  const topicId = classifyTopicEnhanced(learnerQuestion, conversationHistory);
  const result = { topicLabel: null, concepts: [], exampleQuestions: [], topicSummary: null };

  const effectiveTopic = topicId;
  if (!effectiveTopic) return result;

  const topic = contentData.topics.find((t) => t.id === effectiveTopic);
  result.topicLabel = topic?.label ?? effectiveTopic;

  // Get topic concept summary
  const topicQuestions = questionsByTopicIndex.get(effectiveTopic) || [];
  const conceptSet = new Set(topicQuestions.filter((q) => q.concept).map((q) => q.concept));
  result.concepts = [...conceptSet];

  // Get up to 3 example questions with explanations (prefer ones with explanations)
  const withExplanation = topicQuestions.filter((q) => q.explanation && q.explanation.trim().length > 0);
  const sampled = withExplanation.slice(0, 3);
  result.exampleQuestions = sampled.map((q) => ({
    stem: q.stem,
    explanation: q.explanation,
    correctAnswer: q.options.filter((o) => o.isCorrect).map((o) => o.text).join("; "),
  }));

  result.topicSummary = `${result.topicLabel}: covers ${result.concepts.length} concept areas with ${topicQuestions.length} practice questions in Zivvvo.`;

  return result;
}

/**
 * D10: Retrieve relevant content for a specific concept.
 */
function retrieveForConcept(concept, topicId) {
  const result = { conceptQuestions: [] };
  const qs = questionsByConceptIndex.get(concept) || [];
  const withExplanation = qs.filter((q) => q.explanation && q.explanation.trim().length > 0);
  result.conceptQuestions = withExplanation.slice(0, 2).map((q) => ({
    stem: q.stem,
    explanation: q.explanation,
    correctAnswer: q.options.filter((o) => o.isCorrect).map((o) => o.text).join("; "),
  }));
  return result;
}

/**
 * D10: Detect topic switches from conversation history.
 * Returns the inferred topic from recent messages.
 */
/**
 * Detect the current topic from conversation history.
 *
 * Uses per-message scoring with role-based weights:
 *   1. CURRENT USER MESSAGE: Scored independently. If it has a STRONG match
 *      (score >= 2) or is a DIRECT new question (not a context-dependent
 *      follow-up), that topic wins — the user is switching.
 *   2. WEIGHTED HISTORY: All messages scored independently, then combined
 *      with weights (user=2, AI=1). User intent dominates.
 *   3. AI RESPONSES: Never dominant — only contribute weak context (weight 1).
 *
 * Follow-up detection: phrases like "what about", "how about", "what if"
 * reference previous context and should use history, even if they contain
 * a topic keyword (e.g. "What about at night?" in a parking conversation
 * means parking-at-night, not night-driving).
 *
 * This prevents:
 *   - AI responses introducing adjacent-topic keywords
 *   - Vague follow-ups overriding established topic context
 *   - While still allowing intentional topic switches
 */
function detectConversationTopic(conversationHistory) {
  if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) return null;

  const recent = conversationHistory.slice(-6);
  const len = recent.length;
  const currentMsg = recent[len - 1];

  // If current message is from user, check for a strong topic match
  if (currentMsg.role === "user") {
    const { topic: currentTopic, score: currentScore } = matchTopicWithScore(currentMsg.text);

    // Detect context-dependent follow-ups (reference previous context)
    const trimmed = currentMsg.text.trim().toLowerCase();
    const isFollowUp = /^(what about|how about|what if|what about that|how about that|what about them|what about it|what about there)/.test(trimmed);

    // Strong match (score >= 2) or direct question with a topic match: switch
    if (currentTopic && (currentScore >= 2 || !isFollowUp)) return currentTopic;

    // Weak/follow-up match: score all messages independently and combine with weights
    const topicScores = {};
    for (let i = 0; i < len - 1; i++) {
      const msg = recent[i];
      const weight = msg.role === "user" ? 2 : 1;
      const { topic, score } = matchTopicWithScore(msg.text);
      if (topic) {
        topicScores[topic] = (topicScores[topic] || 0) + score * weight;
      }
    }

    let bestTopic = null;
    let bestScore = 0;
    for (const [topic, total] of Object.entries(topicScores)) {
      if (total > bestScore || (total === bestScore && bestTopic === "general-rules" && topic !== "general-rules")) {
        bestScore = total;
        bestTopic = topic;
      }
    }

    return bestTopic || currentTopic;
  }

  // Current message is from AI — score all messages independently with weights
  const topicScores = {};
  for (const msg of recent) {
    const weight = msg.role === "user" ? 2 : 1;
    const { topic, score } = matchTopicWithScore(msg.text);
    if (topic) {
      topicScores[topic] = (topicScores[topic] || 0) + score * weight;
    }
  }

  let bestTopic = null;
  let bestScore = 0;
  for (const [topic, total] of Object.entries(topicScores)) {
    if (total > bestScore || (total === bestScore && bestTopic === "general-rules" && topic !== "general-rules")) {
      bestScore = total;
      bestTopic = topic;
    }
  }
  return bestTopic;
}

// Load env from .env file
const envPath = new URL("./.env", import.meta.url).pathname;
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

const PORT = process.env.PORT || 3939;
const PAYNOW_ID = process.env.PAYNOW_ID;
const PAYNOW_KEY = process.env.PAYNOW_KEY;
const RETURN_URL = process.env.RETURN_URL || "https://www.zivvvo.co.zw/payment/return";
const RESULT_URL = process.env.RESULT_URL || "https://www.zivvvo.co.zw/api/paynow/result";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!PAYNOW_ID || !PAYNOW_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required environment variables. Check server/.env");
  process.exit(1);
}

if (!process.env.OPENROUTER_API_KEY) {
  console.warn("Warning: OPENROUTER_API_KEY not set. AI Coach will use deterministic fallback.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
  db: { schema: "zivvvo" },
  realtime: { transport: ws },
});

const PLANS = {
  monthly:  { amount: 2.00,  months: 1,  label: "Monthly" },
  sixmonth: { amount: 8.00,  months: 6,  label: "6 Months" },
  yearly:   { amount: 12.00, months: 12, label: "Yearly" },
};

// Test plan only available in non-production
if (process.env.NODE_ENV !== "production") {
  PLANS.test10 = { amount: 0.10, months: 1, label: "Test ($0.10)" };
}

function generateHash(values, key) {
  const concatenated = values.join("") + key;
  return crypto.createHash("sha512").update(concatenated, "utf8").digest("hex").toUpperCase();
}

function generateReference() {
  return `zivvvo-${crypto.randomUUID()}`;
}

function calculateExpiry(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

// Activate plan for a user — idempotent, handles both first-time and renewal
async function activatePlan(userId, months) {
  const expiresAt = calculateExpiry(months);
  const { data: ls } = await supabase
    .from("learner_state")
    .select("plan, plan_expires_at")
    .eq("user_id", userId)
    .single();

  // If already premium with a future expiry, extend from that expiry (renewal)
  let finalExpiry = expiresAt;
  if (ls && ls.plan === "premium" && ls.plan_expires_at && ls.plan_expires_at > Date.now()) {
    // Extend from current expiry, not from now
    const base = new Date(ls.plan_expires_at);
    base.setMonth(base.getMonth() + months);
    finalExpiry = base.getTime();
  }

  const { error } = await supabase
    .from("learner_state")
    .upsert({
      user_id: userId,
      plan: "premium",
      plan_expires_at: finalExpiry,
      updated_at: Date.now(),
    }, { onConflict: "user_id" });

  return { error, expiresAt: finalExpiry };
}

// Simple in-memory rate limiter
const rateBuckets = new Map();
function rateLimit(maxPerMin) {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = rateBuckets.get(ip);
    if (!bucket || now - bucket.start > 60000) {
      rateBuckets.set(ip, { start: now, count: 1 });
      return next();
    }
    bucket.count++;
    if (bucket.count > maxPerMin) {
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  };
}

// Cleanup old rate limit buckets every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.start < cutoff) rateBuckets.delete(ip);
  }
}, 300000);

// Verify Supabase JWT from Authorization header
async function verifyAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization" });
  }
  const token = auth.slice(7);
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.authUserId = data.user.id;
    next();
  } catch {
    return res.status(401).json({ error: "Auth verification failed" });
  }
}

// D8: Verify the authenticated user has an active premium plan
async function verifyEntitlement(req, res, next) {
  try {
    const { data: ls, error } = await supabase
      .from("learner_state")
      .select("plan, plan_expires_at")
      .eq("user_id", req.authUserId)
      .single();
    if (error || !ls) {
      return res.status(403).json({ error: "Could not verify plan status" });
    }
    if (ls.plan !== "premium") {
      return res.status(403).json({ error: "Premium plan required" });
    }
    if (ls.plan_expires_at && new Date(ls.plan_expires_at).getTime() < Date.now()) {
      return res.status(403).json({ error: "Premium plan has expired" });
    }
    next();
  } catch {
    return res.status(500).json({ error: "Entitlement check failed" });
  }
}

const app = express();
app.use(cors({ origin: ["https://www.zivvvo.co.zw", "https://zivvvo.co.zw"] }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Initiate a Paynow transaction (requires auth)
app.post("/api/paynow/initiate", rateLimit(10), verifyAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.authUserId;

    if (!plan || !PLANS[plan]) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const planInfo = PLANS[plan];
    const reference = generateReference();

    const { error: insertErr } = await supabase.from("payments").insert({
      reference,
      user_id: userId,
      plan,
      amount: planInfo.amount,
      currency: "USD",
      status: "pending",
    });
    if (insertErr) {
      console.error("Insert payment error:", insertErr);
      return res.status(500).json({ error: "Failed to create transaction" });
    }

    const params = new URLSearchParams();
    params.append("id", PAYNOW_ID);
    params.append("reference", reference);
    params.append("amount", planInfo.amount.toFixed(2));
    params.append("additionalinfo", `Zivvvo ${planInfo.label} Plan`);
    params.append("returnurl", `${RETURN_URL}?ref=${encodeURIComponent(reference)}`);
    params.append("resulturl", RESULT_URL);
    params.append("status", "Message");

    const hashValues = [
      PAYNOW_ID.toString(),
      reference,
      planInfo.amount.toFixed(2),
      `Zivvvo ${planInfo.label} Plan`,
      `${RETURN_URL}?ref=${encodeURIComponent(reference)}`,
      RESULT_URL,
      "Message",
    ];
    params.append("hash", generateHash(hashValues, PAYNOW_KEY));

    const paynowRes = await fetch("https://www.paynow.co.zw/interface/initiatetransaction", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });

    const raw = await paynowRes.text();
    const parsed = new URLSearchParams(raw);
    const data = Object.fromEntries(parsed.entries());
    if (data.status !== undefined) data.Status = data.status;
    if (data.browserurl !== undefined) data.BrowserUrl = data.browserurl;
    if (data.pollurl !== undefined) data.PollUrl = data.pollurl;
    if (data.hash !== undefined) data.Hash = data.hash;
    if (data.error !== undefined) data.Error = data.error;

    if (data.Status !== "Ok") {
      console.error("Paynow initiate failed:", data);
      await supabase.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("reference", reference);
      return res.status(502).json({ error: data.Error || "Payment initiation failed" });
    }

    const responseHashValues = [data.Status, data.BrowserUrl, data.PollUrl];
    const expectedHash = generateHash(responseHashValues, PAYNOW_KEY);
    if (data.Hash !== expectedHash) {
      console.error("Hash mismatch on initiate response:", {
        status: data.Status,
        browserUrl: data.BrowserUrl?.substring(0, 60),
        pollUrl: data.PollUrl?.substring(0, 60),
        expectedHash,
        gotHash: data.Hash,
      });
      // Mark payment as failed so it doesn't stay pending forever
      await supabase.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("reference", reference);
      return res.status(502).json({ error: "Invalid response hash" });
    }

    const { error: updateErr } = await supabase
      .from("payments")
      .update({ paynow_poll_url: data.PollUrl, updated_at: new Date().toISOString() })
      .eq("reference", reference);
    if (updateErr) console.error("Failed to save poll URL:", updateErr);

    res.json({ redirectUrl: data.BrowserUrl, reference });
  } catch (err) {
    console.error("Initiate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Paynow result webhook — idempotent, hash-verified
app.post("/api/paynow/result", async (req, res) => {
  try {
    const raw = req.body;

    if (!raw) {
      return res.status(400).send("Empty body");
    }

    const fields = {};
    const hashValues = [];
    if (typeof raw === "string") {
      for (const [k, v] of new URLSearchParams(raw)) {
        fields[k] = v;
        if (k !== "hash") hashValues.push(v);
      }
    } else {
      for (const [k, v] of Object.entries(raw)) {
        fields[k] = String(v);
        if (k !== "hash") hashValues.push(String(v));
      }
    }

    const reference = fields.Reference || fields.reference;
    const status = fields.Status || fields.status;
    const paynowHash = fields.Hash || fields.hash;

    if (!reference || !status) {
      return res.status(400).send("Missing fields");
    }

    const expectedHash = generateHash(hashValues, PAYNOW_KEY);
    if (!paynowHash || paynowHash.toUpperCase() !== expectedHash.toUpperCase()) {
      console.error("Hash mismatch/rejected on result for", reference, "\nReceived:", hashValues, "\nExpected:", expectedHash);
      return res.status(403).send("Invalid hash");
    }

    const { data: payment, error: lookupErr } = await supabase
      .from("payments")
      .select("*")
      .eq("reference", reference)
      .single();

    if (lookupErr || !payment) {
      console.error("Payment not found:", reference);
      return res.status(404).send("Not found");
    }

    // Idempotency: if already paid, still attempt activation (in case first
    // webhook marked paid but activation failed before this retry).
    if (payment.status === "paid") {
      if (status === "Paid") {
        const planInfo = PLANS[payment.plan];
        if (planInfo) {
          const { error: actErr } = await activatePlan(payment.user_id, planInfo.months);
          if (actErr) console.error("Retry activation failed:", actErr.message);
        }
      }
      return res.status(200).send("OK");
    }

    if (status === "Paid") {
      const planInfo = PLANS[payment.plan];
      if (!planInfo) {
        console.error("Unknown plan:", payment.plan);
        return res.status(500).send("Unknown plan");
      }

      // Step 1: Mark payment as paid FIRST (idempotent — re-delivered webhooks
      // find it already paid and retry activation above).
      const { error: payErr } = await supabase
        .from("payments")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("reference", reference);
      if (payErr) {
        console.error("Failed to mark payment paid:", payErr);
        return res.status(500).send("Failed to record payment");
      }

      // Step 2: Activate the plan
      const { error: updateErr, expiresAt } = await activatePlan(payment.user_id, planInfo.months);

      if (updateErr) {
        console.error("CRITICAL: Plan activation failed after payment marked paid:", updateErr,
          { user_id: payment.user_id, reference });
      } else {
        console.log(`Plan activated: ${payment.user_id} -> premium until ${new Date(expiresAt).toISOString()}`);
      }
    } else {
      const { error: cancelErr } = await supabase
        .from("payments")
        .update({ status: status.toLowerCase(), updated_at: new Date().toISOString() })
        .eq("reference", reference);
      if (cancelErr) console.error("Failed to update payment status:", cancelErr);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Result webhook error:", err);
    res.status(500).send("Error");
  }
});

// Check transaction status (requires auth, can only check own)
// Fallback: if payment is "paid" but plan wasn't activated, retry here.
app.get("/api/paynow/status", rateLimit(30), verifyAuth, async (req, res) => {
  try {
    const { ref } = req.query;
    if (!ref) return res.status(400).json({ error: "Missing ref" });

    const { data: payment, error } = await supabase
      .from("payments")
      .select("status, plan, amount, user_id")
      .eq("reference", ref)
      .eq("user_id", req.authUserId)
      .single();

    if (error || !payment) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Fallback: if payment is paid but plan might not be activated,
    // try (re)activating. Always attempts — handles first-time AND renewals.
    if (payment.status === "paid") {
      const planInfo = PLANS[payment.plan];
      if (planInfo) {
        const { error: actErr } = await activatePlan(payment.user_id, planInfo.months);
        if (actErr) console.error("Status fallback activation failed:", actErr.message);
      }
    }

    res.json({ status: payment.status, plan: payment.plan, amount: payment.amount });
  } catch (err) {
    console.error("Status check error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// D7: AI Coach endpoints — server-side LLM proxy
// ---------------------------------------------------------------------------

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

const AI_SYSTEM_PROMPT = `You are a knowledgeable driving instructor for Zimbabwe's Class 2 learner's licence, working through the Zivvvo app.

IDENTITY:
You are an experienced Zimbabwe driving instructor — not a chatbot, not a question bank. You teach with the authority of someone who has guided hundreds of learners through their licence.

RESPONSE FORMAT:
Use Markdown formatting naturally:
- **Bold** for key terms and rules
- Bullet lists for multiple points
- Numbered lists for steps/procedures
- > Blockquotes for important rules or warnings
- Tables when comparing concepts
- ## Headings for longer explanations with multiple sections
Keep responses readable on a phone screen.

SOURCE HIERARCHY — CRITICAL:
The <driving_knowledge> section contains verified Zimbabwe driving instructor knowledge. Use it as your primary teaching source.
The <retrieved_content> section contains Zivvvo exam material. Use it for exam-specific questions.
When answering, clearly distinguish:
- **Zimbabwe law/regulation** — cite it as law (e.g., "In Zimbabwe, the law requires...")
- **Exam material** — cite as Zivvvo study content
- **General driving principle** — frame as general knowledge (e.g., "As a general principle...")
- **Safety advice** — frame as guidance (e.g., "For safety, I recommend...")
- **Instructor knowledge** — frame as teaching (e.g., "From experience teaching learners...")

Never present general driving conventions as Zimbabwe law unless you have specific evidence.
Never invent Zimbabwe legal rules from international knowledge.

AMBIGUITY:
If a question is genuinely ambiguous (e.g., "What does yellow mean?"), ask a focused clarification:
- "Do you mean a yellow traffic light, yellow road sign, or yellow road marking?"
Do NOT over-clarify obvious questions. "What is aquaplaning?" is clear — answer it.

SCENARIO REASONING:
For scenario questions (rain, night, junction, mechanical problems), decompose before answering:
1. What is the situation?
2. What controls or hazards are present?
3. What is the immediate priority?
4. What are the correct actions in order?
5. What should be avoided?

Then give the answer as a clear, ordered procedure.

INSTRUCTOR BEHAVIOUR:
- Answer directly for simple questions
- Go deeper for complex scenarios
- Vary your response structure (don't always use numbered lists)
- Teach terminology naturally: "The driving term for this is **right of way**..."
- Preserve Zimbabwean terms: "robot (traffic light)" is fine once
- For mechanical questions: distinguish possible causes from confirmed diagnoses
- Never claim certainty you don't have
- When you're not sure, say so

WHAT YOU CAN TEACH:
- Road signs, markings, signals
- Junction rules, right of way, priority
- Speed limits, overtaking, parking
- Pedestrian and cyclist safety
- Vehicle equipment, maintenance, tyre care
- Accident procedures, emergency response
- Night driving, adverse weather, aquaplaning
- Vehicle dynamics (understeer, oversteer, ABS, braking)
- Defensive driving, hazard perception
- Licence requirements, vehicle classes
- Engine braking, manual/automatic transmission
- Driver fatigue, distraction, psychology

SAFETY BOUNDARIES — NEVER:
- Inspect or certify a vehicle
- Diagnose mechanical faults with certainty
- Guarantee legality without jurisdictional context
- Replace professional mechanical inspection
- Certify a learner as legally licensed
- Present yourself as an official authority

Keep explanations under 200 words for simple answers. Expand for complex scenarios. Use language a learner driver can understand.`;

// In-memory rate limit for AI requests (per IP)
const aiRateBuckets = new Map();
function aiRateLimit(maxPerMin) {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = aiRateBuckets.get(ip);
    if (!bucket || now - bucket.start > 60000) {
      aiRateBuckets.set(ip, { start: now, count: 1 });
      return next();
    }
    bucket.count++;
    if (bucket.count > maxPerMin) {
      return res.status(429).json({ error: "Too many AI requests. Please wait a moment." });
    }
    next();
  };
}

// Cleanup old AI rate limit buckets every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [ip, bucket] of aiRateBuckets) {
    if (bucket.start < cutoff) aiRateBuckets.delete(ip);
  }
}, 300000);

async function callOpenRouter(messages, maxTokens = 500) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://www.zivvvo.co.zw",
        "X-Title": "Zivvvo AI Tutor",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LLM_HTTP_${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      throw new Error("LLM_EMPTY_RESPONSE");
    }
    return text.trim();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// Build a conversation history block for the LLM message array
function buildConversationBlock(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const recent = history.slice(-6); // Keep last 6 messages (3 turns)
  return recent.map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.text}`).join("\n\n");
}

// D10: Build structured retrieved content block
function buildRetrievedContentBlock(retrieved) {
  if (!retrieved) return null;
  const parts = [];
  if (retrieved.topicSummary) parts.push(`Topic overview: ${retrieved.topicSummary}`);
  if (retrieved.concepts && retrieved.concepts.length > 0) {
    parts.push(`Concepts covered: ${retrieved.concepts.join(", ")}`);
  }
  if (retrieved.exampleQuestions && retrieved.exampleQuestions.length > 0) {
    parts.push("Relevant Zivvvo study material:");
    for (const eq of retrieved.exampleQuestions) {
      parts.push(`  Q: ${eq.stem}`);
      parts.push(`  Correct answer: ${eq.correctAnswer}`);
      if (eq.explanation) parts.push(`  Explanation: ${eq.explanation}`);
    }
  }
  if (retrieved.conceptQuestions && retrieved.conceptQuestions.length > 0) {
    parts.push("Reference questions for this concept:");
    for (const cq of retrieved.conceptQuestions) {
      parts.push(`  Q: ${cq.stem}`);
      parts.push(`  Correct answer: ${cq.correctAnswer}`);
      if (cq.explanation) parts.push(`  Explanation: ${cq.explanation}`);
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

// POST /api/ai/explain — concept explanation (premium only)
app.post("/api/ai/explain", aiRateLimit(10), verifyAuth, verifyEntitlement, async (req, res) => {
  try {
    const { concept, conceptLabel, topicLabel, state, mastery, attempts, correct, canonicalExplanation, keyRule, recentMistake, conversationHistory } = req.body;
    if (!concept || !conceptLabel) {
      return res.status(400).json({ error: "Missing concept or conceptLabel" });
    }

    // D10: Retrieve relevant content for this concept
    const conceptRetrieval = retrieveForConcept(concept, null);

    // D12: Retrieve from Driving Instructor KB
    const normalizedConcept = normalizeText(conceptLabel || concept);
    const kbResults = retrieveKB(normalizedConcept, null);
    const kbBlock = buildKBBlock(kbResults);

    const learnerContextParts = [
      `Concept: ${conceptLabel}`,
      topicLabel ? `Topic: ${topicLabel}` : null,
      state && state !== "unknown" ? `Learner state: ${state}` : null,
      attempts ? `Evidence: ${correct || 0} correct / ${attempts} attempts` : null,
      mastery ? `Mastery: ${Math.round(mastery * 100)}%` : null,
      canonicalExplanation ? `Authoritative Zivvvo explanation: ${canonicalExplanation}` : null,
      keyRule ? `Key rule: ${keyRule}` : null,
      recentMistake ? `Recent mistake: ${recentMistake.stem}\nLearner answer: ${recentMistake.learnerAnswer}\nCorrect answer: ${recentMistake.correctAnswer}` : null,
    ].filter(Boolean).join("\n");

    const historyBlock = buildConversationBlock(conversationHistory);
    const retrievedBlock = buildRetrievedContentBlock(conceptRetrieval);

    const sections = [];
    if (historyBlock) sections.push(`<conversation_context>\n${historyBlock}\n</conversation_context>`);
    sections.push(`<learner_context>\n${learnerContextParts}\n</learner_context>`);
    if (kbBlock) sections.push(`<driving_knowledge>\n${kbBlock}\n</driving_knowledge>`);
    if (retrievedBlock) sections.push(`<retrieved_content>\n${retrievedBlock}\n</retrieved_content>`);
    sections.push(`<current_question>\nExplain this concept to the learner.\n</current_question>`);

    const userMessage = sections.join("\n\n");

    const messages = [
      { role: "system", content: AI_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ];
    const text = await callOpenRouter(messages);
    res.json({ text, source: "generated", available: true });
  } catch (err) {
    if (err.message === "AI_PROVIDER_NOT_CONFIGURED") {
      return res.json({ text: "", source: "canonical", available: false });
    }
    if (err.name === "AbortError") {
      return res.json({ text: "", source: "canonical", available: false });
    }
    console.error("AI explain error:", err.message);
    res.json({ text: "", source: "canonical", available: false });
  }
});

// POST /api/ai/ask — answer learner question (premium only)
app.post("/api/ai/ask", aiRateLimit(10), verifyAuth, verifyEntitlement, async (req, res) => {
  try {
    const { question, concept, conceptLabel, topicLabel, state, mastery, attempts, correct, canonicalExplanation, keyRule, recentMistake, conversationHistory, topicHint } = req.body;
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({ error: "Missing question" });
    }
    if (question.length > 500) {
      return res.status(400).json({ error: "Question too long (max 500 characters)" });
    }

    // D10: Retrieve relevant Zivvvo content for this question
    const questionRetrieval = retrieveForQuestion(question, conversationHistory);

    // D10: Also retrieve concept-specific content if available
    let conceptRetrieval = null;
    if (concept) {
      conceptRetrieval = retrieveForConcept(concept, null);
    }

    // D12: Language understanding pipeline
    const normalized = normalizeText(question);
    const intent = detectIntent(normalized);
    const scenario = detectScenario(normalized);
    const expansions = expandTerms(normalized);
    const refs = resolveReferences(question, conversationHistory || []);

    // D12: Retrieve from Driving Instructor KB
    const kbResults = retrieveKB(normalized, currentTopic);
    const kbBlock = buildKBBlock(kbResults);

    // D12: Detect ambiguity
    const ambiguity = detectAmbiguity(question, currentTopic);

    // D10: Detect topic switch
    const historyTopic = detectConversationTopic(conversationHistory);
    const currentTopic = classifyTopicEnhanced(question, conversationHistory);
    const topicSwitched = historyTopic && currentTopic && historyTopic !== currentTopic;

    const learnerContextParts = [];
    if (concept || conceptLabel) learnerContextParts.push(`Concept: ${conceptLabel || concept}`);
    if (topicLabel) learnerContextParts.push(`Topic: ${topicLabel}`);
    if (state) learnerContextParts.push(`Learner state: ${state}`);
    if (mastery) learnerContextParts.push(`Mastery: ${Math.round(mastery * 100)}%`);
    if (attempts) learnerContextParts.push(`Evidence: ${correct || 0} correct / ${attempts} attempts`);
    if (canonicalExplanation) learnerContextParts.push(`Authoritative Zivvvo explanation: ${canonicalExplanation}`);
    if (keyRule) learnerContextParts.push(`Key rule: ${keyRule}`);
    if (recentMistake) learnerContextParts.push(`Recent mistake context: ${recentMistake.stem}\nCorrect answer: ${recentMistake.correctAnswer}`);

    const historyBlock = buildConversationBlock(conversationHistory);

    // D10: Build retrieved content from question retrieval + concept retrieval
    const mergedRetrieval = { ...questionRetrieval };
    if (conceptRetrieval && conceptRetrieval.conceptQuestions.length > 0) {
      mergedRetrieval.conceptQuestions = conceptRetrieval.conceptQuestions;
    }
    const retrievedBlock = buildRetrievedContentBlock(mergedRetrieval);

    // D12: Build language understanding block
    const langParts = [];
    langParts.push(`Intent: ${intent}`);
    if (currentTopic) langParts.push(`Detected topic: ${currentTopic}`);
    if (scenario.present) {
      if (scenario.participants) langParts.push(`Participants: ${scenario.participants.join(", ")}`);
      if (scenario.conditions) langParts.push(`Conditions: ${scenario.conditions.join(", ")}`);
      if (scenario.roadFeatures) langParts.push(`Road features: ${scenario.roadFeatures.join(", ")}`);
    }
    if (refs.isContextual) langParts.push("This is a follow-up to the previous conversation.");
    if (refs.resolvedTopic) langParts.push(`Context topic: ${refs.resolvedTopic}`);
    if (refs.resolvedEntity) langParts.push(`Referenced entity: ${refs.resolvedEntity}`);
    if (expansions.length > 0) langParts.push(`Expanded concepts: ${expansions.map((e) => e.canonical).join(", ")}`);
    if (ambiguity.length > 0) langParts.push(`Possible interpretations: ${ambiguity.join("; ")}`);
    langParts.push(`Answer confidence: ${kbResults.length > 0 ? "high" : questionRetrieval.exampleQuestions?.length > 0 ? "medium" : "low"}`);

    const sections = [];
    if (langParts.length > 0) sections.push(`<language_understanding>\n${langParts.join("\n")}\n</language_understanding>`);
    if (historyBlock) sections.push(`<conversation_context>\n${historyBlock}\n</conversation_context>`);
    if (learnerContextParts.length > 0) sections.push(`<learner_context>\n${learnerContextParts.join("\n")}\n</learner_context>`);
    if (kbBlock) sections.push(`<driving_knowledge>\n${kbBlock}\n</driving_knowledge>`);
    if (retrievedBlock) sections.push(`<retrieved_content>\n${retrievedBlock}\n</retrieved_content>`);

    let questionText = question;
    if (topicSwitched) {
      questionText = `[Topic switch detected — the learner is now asking about ${mergedRetrieval.topicLabel || "a new topic"}]\nLearner question: ${question}`;
    } else {
      questionText = `Learner question: ${question}`;
    }
    sections.push(`<current_question>\n${questionText}\n</current_question>`);

    const userMessage = sections.join("\n\n");

    const messages = [
      { role: "system", content: AI_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ];
    const text = await callOpenRouter(messages);
    res.json({ text, source: "generated", available: true });
  } catch (err) {
    if (err.message === "AI_PROVIDER_NOT_CONFIGURED") {
      return res.json({ text: "", source: "canonical", available: false });
    }
    if (err.name === "AbortError") {
      return res.json({ text: "", source: "canonical", available: false });
    }
    console.error("AI ask error:", err.message);
    res.json({ text: "", source: "canonical", available: false });
  }
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled:", err);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, () => {
  console.log(`Zivvvo API running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
