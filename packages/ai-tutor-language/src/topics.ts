/**
 * Topic classification for learner driving questions.
 *
 * Combines keyword matching with semantic expansion, alias resolution,
 * and conversation context to determine the driving topic.
 */

/**
 * Extended topic keyword map with expanded synonyms and learner language.
 * The existing TOPIC_KEYWORDS from content package is the base;
 * this extends it with natural learner language.
 */
const EXTENDED_TOPIC_KEYWORDS: Record<string, string[]> = {
  "road-signs": [
    "sign", "signs", "road sign", "road signs", "regulatory", "warning",
    "information", "guide", "prohibition", "mandatory", "circular",
    "diamond", "triangular", "octagonal", "stop sign", "give way sign",
    "no entry", "no overtaking", "no parking", "no stopping", "speed sign",
    "restriction sign", "hazard sign", "warning board", "sign board",
    "traffic sign", "road symbol", "sign meaning", "sign recognition",
    "sign action", "what does this sign mean", "what does that sign mean",
    "triangle sign", "circle sign", "red sign", "yellow sign", "blue sign",
  ],
  "road-markings": [
    "marking", "markings", "road marking", "road markings", "line", "lines",
    "lane", "road line", "painted", "double", "dashed", "broken",
    "broken line", "solid line", "continuous line", "double solid",
    "lane line", "centre line", "center line", "edge line",
    "painted island", "hatching", "chevrons", "lane arrow",
    "directional arrow", "stop line", "give-way line", "yield line",
    "pedestrian crossing marking", "yellow line", "white line", "red line",
    "what does this line mean", "road markings",
  ],
  "junction-rules": [
    "junction", "intersection", "crossroads", "crossroad", "t-junction",
    "roundabout", "traffic circle", "rotary", "turn", "turning",
    "give way", "yield", "right of way", "right-of-way", "priority",
    "precedence", "who goes first", "who has priority", "who moves first",
    "goes first", "which car goes first", "merging", "joining the road",
    "coming from the right", "approaching from", "narrow junction",
    "right turn", "left turn", "turning right", "turning left",
    "junction rules", "intersection rules",
  ],
  "traffic-lights": [
    "traffic light", "traffic lights", "traffic signal", "traffic signals",
    "robot", "robots", "signal", "signals", "stop light", "red light",
    "green light", "amber light", "yellow light", "flashing amber",
    "flashing red", "signal phase", "light sequence", "lights changing",
    "light turning red", "light turning green", "pedestrian signal",
    "arrow signal", "how do robots work", "what does the robot mean",
    "traffic light meaning",
  ],
  "speed-limits": [
    "speed", "speed limit", "speed limits", "km/h", "kilometres per hour",
    "how fast", "maximum speed", "legal speed", "speed restriction",
    "speed zone", "school zone speed", "urban speed", "rural speed",
    "slowing down", "appropriate speed", "too fast", "excessive speed",
    "speed control", "speedometer", "speed sign", "speed hump",
    "traffic calming",
  ],
  "overtaking": [
    "overtake", "overtaking", "passing", "pass", "pass another car",
    "safe to overtake", "overtake on", "go past", "go around",
    "no overtaking", "passing line", "overtake on right", "blind bend",
    "oncoming traffic", "when can i overtake", "when not to overtake",
    "overtaking rules", "can i overtake",
  ],
  "parking": [
    "park", "parking", "parked", "stopping", "no parking", "no stopping",
    "stand", "standing", "allowed to stop", "parking bay", "parking rules",
    "where can i park", "where must i not park", "parking near",
    "parking at", "pull over", "leave my car", "roadside parking",
    "parking on a hill", "parking near a junction", "parking at a crossing",
    "can i park here",
  ],
  "pedestrian-safety": [
    "pedestrian", "pedestrians", "person walking", "walker", "crossing",
    "zebra crossing", "pedestrian crossing", "school children", "children",
    "cyclist", "cyclists", "bicycle", "bike", "cycling", "pedal cyclist",
    "cyclist safety", "pedestrian right", "vulnerable road user",
    "sharing the road", "motorcycle", "motorcyclist", "motorbike",
    "pedestrian safety", "cyclist rules",
  ],
  "vehicle-equipment": [
    "equipment", "vehicle equipment", "tyre", "tyres", "tire", "brake",
    "brakes", "lights", "vehicle condition", "spare", "fire extinguisher",
    "seat belt", "seatbelt", "hooter", "horn", "indicator", "indicators",
    "turn signal", "mirrors", "rear-view mirror", "windscreen", "wipers",
    "headlights", "brake lights", "warning lights", "dashboard",
    "vehicle safety", "pre-drive inspection", "what should i check",
    "vehicle equipment",
  ],
  "vehicle-classes": [
    "class", "classes", "vehicle class", "licence class", "licence",
    "license", "category", "psv", "driving licence", "learner licence",
    "learner's licence", "provisional licence", "learner permit",
    "requirement", "application", "test", "minimum age", "age requirement",
    "how old to drive", "can i drive at 16", "licence requirement",
    "driving class", "learner driver", "l plate", "learner plate",
    "vehicle class",
  ],
  "towing-loads": [
    "tow", "towing", "load", "loads", "trailer", "cargo", "towing",
    "towing requirements", "trailer coupling", "tow bar", "securing cargo",
    "heavy load", "overloaded", "overloading", "roof load", "load secure",
    "abnormal load", "towing rules", "can i tow",
  ],
  "accident-procedures": [
    "accident", "crash", "collision", "breakdown", "emergency", "incident",
    "first aid", "bleeding", "accident reporting", "report accident",
    "after an accident", "what happens after", "emergency scene",
    "injured person", "accident procedure", "what do i do after",
  ],
  "alcohol-drugs": [
    "alcohol", "drug", "drugs", "drunk", "drink driving", "dui",
    "intoxication", "blood alcohol", "drink and drive",
    "drinking and driving", "under the influence", "medication",
    "fatigue", "tired", "sleepy", "drowsy", "fitness to drive",
    "impaired driving", "can i drink and drive", "alcohol and driving",
  ],
  "night-driving": [
    "night", "night driving", "dark", "darkness", "headlight", "headlights",
    "visibility", "dipped", "dipped beam", "high beam", "fog", "mist",
    "rain", "heavy rain", "adverse weather", "rainy weather", "wet road",
    "slippery", "aquaplaning", "hydroplaning", "glare", "low sun",
    "poor visibility", "night driving rules", "what lights at night",
  ],
  "general-rules": [
    "rule", "rules", "regulation", "law", "road rule", "general rule",
    "roadcraft", "insurance", "defensive", "defensive driving", "hazard",
    "hazards", "safe distance", "following distance", "stopping distance",
    "reaction time", "reaction distance", "skidding", "side of the road",
    "drive on", "left-hand traffic", "observation", "anticipation",
    "blind spot", "blind spots", "hazard perception", "mirror use",
    "lane discipline", "courtesy", "road rage", "distraction",
    "phone driving", "risk", "what should i check before driving",
    "defensive driving rules",
  ],
};

/**
 * Score a text against topic keywords and return the best matching topic.
 * Enhanced version with multi-word phrase priority and extended vocabulary.
 */
export function classifyTopic(text: string): { topic: string | null; score: number } {
  const lower = text.toLowerCase();
  let bestTopic: string | null = null;
  let bestScore = 0;

  for (const [topicId, keywords] of Object.entries(EXTENDED_TOPIC_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (matchesKeyword(lower, kw)) {
        // Multi-word phrases score higher
        score += kw.includes(" ") ? 2 : 1;
        // Longer phrases score even higher
        if (kw.split(" ").length >= 3) score += 1;
      }
    }
    // Topic name bonus
    const topicName = topicId.replace(/-/g, " ");
    if (lower.includes(topicName)) score += 3;

    // Specific topics beat general-rules on equal scores
    if (score > bestScore || (score === bestScore && score > 0 && bestTopic === "general-rules" && topicId !== "general-rules")) {
      bestScore = score;
      bestTopic = topicId;
    }
  }

  return { topic: bestScore > 0 ? bestTopic : null, score: bestScore };
}

/**
 * Classify topic with conversation context.
 * Uses role-weighted scoring from recent messages.
 */
export function classifyTopicWithConversation(
  currentText: string,
  conversationHistory: { role: string; text: string }[],
): { topic: string | null; score: number } {
  // First: classify the current message independently
  const current = classifyTopic(currentText);

  // If strong match (score >= 2), use it directly
  if (current.score >= 2) return current;

  // If the message is a follow-up or short, use conversation context
  const isShortOrFollowup = currentText.length < 25 || /^(what about|how about|and|why|how|when|where|which|can i|what if)\b/i.test(currentText.trim().toLowerCase());

  if (isShortOrFollowup && conversationHistory.length > 0) {
    // Score recent messages with role weights
    const topicScores = new Map<string, number>();
    const recent = conversationHistory.slice(-6);

    for (const msg of recent) {
      const weight = msg.role === "user" ? 2 : 1;
      const { topic, score } = classifyTopic(msg.text);
      if (topic) {
        topicScores.set(topic, (topicScores.get(topic) ?? 0) + score * weight);
      }
    }

    let bestTopic: string | null = null;
    let bestScore = 0;
    for (const [topic, total] of topicScores) {
      if (total > bestScore || (total === bestScore && bestTopic === "general-rules" && topic !== "general-rules")) {
        bestScore = total;
        bestTopic = topic;
      }
    }

    // If conversation topic is strong enough, use it for follow-ups
    if (bestTopic && bestScore >= 2) {
      return { topic: bestTopic, score: bestScore };
    }

    // For follow-ups with weak current match, prefer conversation topic
    if (bestTopic && current.score < 2) {
      return { topic: bestTopic, score: bestScore };
    }
  }

  return current;
}

function matchesKeyword(text: string, keyword: string): boolean {
  if (keyword.length <= 4) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(text);
  }
  return text.includes(keyword);
}
