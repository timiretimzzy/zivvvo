/**
 * Intent detection for learner driving questions.
 *
 * Classifies the learner's question intent based on interrogative words,
 * question patterns, and semantic cues.
 */

import type { Intent } from "./types.js";

interface IntentPattern {
  intent: Intent;
  patterns: RegExp[];
  weight: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: "meaning",
    patterns: [
      /^what does (this|that|the|a|an)\b.*\bmean/i,
      /^what (is|are) the meaning of\b/i,
      /^what do (you|they) call\b/i,
    ],
    weight: 1.1,
  },
  {
    intent: "definition",
    patterns: [
      /^what (is|are|does|do) (a |an |the )?/i,
      /^define\b/i,
      /^explain\b/i,
      /^tell me about\b/i,
      /^describe\b/i,
    ],
    weight: 1.0,
  },
  {
    intent: "action",
    patterns: [
      /^what should (i|we|the driver|you)\b/i,
      /^what do (i|we|the driver|you) do\b/i,
      /^how should (i|we|the driver|you)\b/i,
      /^what (must|have to|need to) (i|we|the driver)\b/i,
      /^what am i supposed to\b/i,
      /^how (do|should) i (react|respond|handle|deal|approach)\b/i,
      /^what happens next\b/i,
      /^what action\b/i,
    ],
    weight: 1.0,
  },
  {
    intent: "comparison",
    patterns: [
      /difference between\b/i,
      /\bvs\.?\b/i,
      /\bversus\b/i,
      /how is .+ different from\b/i,
      /are .+ and .+ the same/i,
      /what'?s the difference\b/i,
      /compare\b/i,
      /distinguish between\b/i,
      /how do i tell .+ apart/i,
      /which one is\b/i,
    ],
    weight: 1.0,
  },
  {
    intent: "procedure",
    patterns: [
      /^how do (i|we|you)\b/i,
      /^how should (i|we|you)\b/i,
      /^what is the (correct )?way to\b/i,
      /^steps for\b/i,
      /^procedure for\b/i,
      /^walk me through\b/i,
      /^teach me how\b/i,
    ],
    weight: 0.9,
  },
  {
    intent: "legality",
    patterns: [
      /^is (it|this|that) (legal|allowed|permitted|okay|ok)\b/i,
      /^can (i|we|you|a learner)\b/i,
      /^am i (allowed|permitted) to\b/i,
      /^may (i|we|you)\b/i,
      /^is (it|this|that) (against|prohibited|forbidden|illegal)\b/i,
      /^do (i|we|you) have to\b/i,
      /^must (i|we|you)\b/i,
      /^what (are|is) the rules? for\b/i,
      /^what does the law say\b/i,
      /^when is (it|this) prohibited\b/i,
    ],
    weight: 0.9,
  },
  {
    intent: "why",
    patterns: [
      /^why\b/i,
      /^why (do|does|is|are|can|can't|should|must|would)\b/i,
      /^what'?s the reason for\b/i,
      /^what (makes|causes)\b/i,
    ],
    weight: 1.0,
  },
  {
    intent: "when",
    patterns: [
      /^when (should|can|must|do|does|is|are|would|could)\b/i,
      /^at what (point|time|speed)\b/i,
      /^under what conditions?\b/i,
    ],
    weight: 0.9,
  },
  {
    intent: "where",
    patterns: [
      /^where (can|should|must|do|does|is|are|would)\b/i,
      /^where (is it|are they) (prohibited|allowed|permitted)\b/i,
    ],
    weight: 0.9,
  },
  {
    intent: "which",
    patterns: [
      /^which (lane|light|sign|vehicle|car|one|gear|licence|class)\b/i,
      /^which (goes|has|should|must|can|would)\b/i,
    ],
    weight: 0.9,
  },
  {
    intent: "scenario",
    patterns: [
      /\bif (i|the|a|there|it|we|you)\b/i,
      /\bsuppose\b/i,
      /\bimagine\b/i,
      /\blet'?s say\b/i,
      /\bwhat if\b/i,
      /\byou'?re driving\b/i,
      /\bi'?m (approaching|driving|coming|turning|overtaking)\b/i,
      /\bthere is (a |an |the )?\b/i,
      /\bthe car (in front|behind|on|approaching)\b/i,
      /\bat (an? )?(intersection|junction|crossroads|roundabout|crossing)\b/i,
      /\bon a (wet|dry|narrow|steep|busy|quiet)\b/i,
    ],
    weight: 0.8,
  },
  {
    intent: "troubleshooting",
    patterns: [
      /^my (car|brakes?|steering|tyre|tyres|engine|battery|lights?)\b/i,
      /^the (car|brakes?|steering|engine) (is|feels?|keeps?|won't|doesn't|isn't)\b/i,
      /\bwhat (does|do|is) (it|this|that) mean\b/i,
      /\bwhy (is|does|do) (the|my|it)\b/i,
    ],
    weight: 0.8,
  },
  {
    intent: "exam",
    patterns: [
      /\bwill (this|it|that) come (in|on) (the|my) test\b/i,
      /\bis this (important|relevant|on) (for|in|on) (the|my) (test|exam)\b/i,
      /what should i study\b/i,
      /what should i know for\b/i,
      /how is this asked\b/i,
      /\bquiz me\b/i,
      /\btest me\b/i,
      /\bask me\b/i,
    ],
    weight: 0.9,
  },
  {
    intent: "follow-up",
    patterns: [
      /^and (what about|how about|why|when|where|which|if|the|those|these|regulatory|mandatory|warning|information|at night|in rain)\b/i,
      /^what about\b/i,
      /^how about\b/i,
      /^what if\b/i,
      /^and\b/i,
      /^what about (that|them|it|there|those|these)\b/i,
    ],
    weight: 0.7,
  },
  {
    intent: "clarification",
    patterns: [
      /^so (basically|essentially|you'?re saying)\b/i,
      /^meaning\b/i,
      /^so (i should|the answer is|you mean)\b/i,
      /^just to confirm\b/i,
      /^am i (right|correct)\b/i,
      /^correct\??$/i,
      /^right\??$/i,
    ],
    weight: 0.6,
  },
];

/**
 * Detect the intent of a learner question.
 * Returns the highest-confidence intent.
 */
export function detectIntent(normalizedText: string): Intent {
  let bestIntent: Intent = "general";
  let bestWeight = 0;

  for (const { intent, patterns, weight } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedText) && weight > bestWeight) {
        bestIntent = intent;
        bestWeight = weight;
        break;
      }
    }
  }

  return bestIntent;
}

/**
 * Detect comparison structures in text.
 * Returns the two things being compared, or null.
 */
export function detectComparison(text: string): { left: string; right: string } | null {
  const diffMatch = text.match(/difference between (.+?) and (.+)/i);
  if (diffMatch) return { left: diffMatch[1]!.trim(), right: diffMatch[2]!.trim() };

  const vsMatch = text.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (vsMatch) return { left: vsMatch[1]!.trim(), right: vsMatch[2]!.trim() };

  const versusMatch = text.match(/(.+?)\s+versus\s+(.+)/i);
  if (versusMatch) return { left: versusMatch[1]!.trim(), right: versusMatch[2]!.trim() };

  const compareMatch = text.match(/compare (.+?) (with|and|to) (.+)/i);
  if (compareMatch) return { left: compareMatch[1]!.trim(), right: compareMatch[3]!.trim() };

  const differentMatch = text.match(/how is (.+?) different from (.+)/i);
  if (differentMatch) return { left: differentMatch[1]!.trim(), right: differentMatch[2]!.trim() };

  return null;
}

/**
 * Detect scenario conditions from learner text.
 */
export function detectScenario(text: string): {
  present: boolean;
  participants?: string[];
  conditions?: string[];
  actions?: string[];
  roadFeatures?: string[];
} {
  const participants: string[] = [];
  const conditions: string[] = [];
  const actions: string[] = [];
  const roadFeatures: string[] = [];

  // Detect participants
  if (/\b(i|me|my|we|you)\b/i.test(text)) participants.push("learner-vehicle");
  if (/\b(a |the )?(car|vehicle|truck|bus|lorry|van)\b/i.test(text)) participants.push("other-vehicle");
  if (/\bpedestrian|person|people|walk|walker\b/i.test(text)) participants.push("pedestrian");
  if (/\bcyclist|bicycle|bike|cycling\b/i.test(text)) participants.push("cyclist");
  if (/\bmotorcycl|motorbike|biker\b/i.test(text)) participants.push("motorcycle");
  if (/\bemergency vehicle|ambulance|fire|police\b/i.test(text)) participants.push("emergency-vehicle");

  // Detect conditions
  if (/\bif\b/i.test(text)) conditions.push("conditional");
  if (/\b(raining|rain|wet|heavy rain)\b/i.test(text)) conditions.push("rain");
  if (/\bnight|dark|darkness|low light\b/i.test(text)) conditions.push("night");
  if (/\bfog|mist|smoke|dust\b/i.test(text)) conditions.push("low-visibility");
  if (/\bsteep|hill|slope|gradient|descent|ascent\b/i.test(text)) conditions.push("gradient");
  if (/\bnarrow\b/i.test(text)) conditions.push("narrow-road");
  if (/\bbusy|traffic|congestion\b/i.test(text)) conditions.push("heavy-traffic");

  // Detect actions
  if (/\bovertak|pass(ing)?\b/i.test(text)) actions.push("overtaking");
  if (/\bturn(ing)?\b/i.test(text)) actions.push("turning");
  if (/\bstop(ped|ping)?\b/i.test(text) && !/\bstopping distance/i.test(text)) actions.push("stopping");
  if (/\bpark(ing|ed)?\b/i.test(text)) actions.push("parking");
  if (/\brevers|back(ing)?\s*up\b/i.test(text)) actions.push("reversing");
  if (/\bmerg|join(ing)?\b/i.test(text)) actions.push("merging");

  // Detect road features
  if (/\bjunction|intersection|crossroad|t-junction\b/i.test(text)) roadFeatures.push("junction");
  if (/\broundabout|traffic circle|rotary\b/i.test(text)) roadFeatures.push("roundabout");
  if (/\bcrossing|zebra|pedestrian crossing\b/i.test(text)) roadFeatures.push("crossing");
  if (/\bbend|curve|corner\b/i.test(text)) roadFeatures.push("bend");
  if (/\bbridge|narrow bridge\b/i.test(text)) roadFeatures.push("bridge");
  if (/\brailway crossing|train tracks?\b/i.test(text)) roadFeatures.push("railway-crossing");
  if (/\bhill|slope|gradient\b/i.test(text)) roadFeatures.push("gradient");
  if (/\blane|lanes?\b/i.test(text)) roadFeatures.push("lane");
  if (/\btraffic light|robot\b/i.test(text)) roadFeatures.push("traffic-light");
  if (/\bsign|signs\b/i.test(text)) roadFeatures.push("sign");
  if (/\bmarking|line|lines\b/i.test(text)) roadFeatures.push("marking");

  const present = participants.length > 0 || conditions.length > 0 || actions.length > 0 || roadFeatures.length > 0;

  return {
    present,
    participants: participants.length > 0 ? participants : undefined,
    conditions: conditions.length > 0 ? conditions : undefined,
    actions: actions.length > 0 ? actions : undefined,
    roadFeatures: roadFeatures.length > 0 ? roadFeatures : undefined,
  };
}
