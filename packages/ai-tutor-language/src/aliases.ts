/**
 * Semantic alias expansion for driving vocabulary.
 *
 * Maps learner language to canonical driving concepts.
 * Uses confidence-weighted mappings rather than blind string replacement.
 */

export interface AliasMapping {
  canonical: string;
  confidence: number;
  topicHint?: string;
}

/**
 * Master alias map: learner term → canonical driving concept.
 * Confidence: 1.0 = exact synonym, 0.8 = close equivalent, 0.6 = contextual alias.
 */
const ALIAS_MAP: Record<string, AliasMapping> = {
  // Right of way / priority
  "who goes first": { canonical: "right of way", confidence: 1.0, topicHint: "junction-rules" },
  "who goes before": { canonical: "right of way", confidence: 1.0, topicHint: "junction-rules" },
  "who moves first": { canonical: "right of way", confidence: 1.0, topicHint: "junction-rules" },
  "who has priority": { canonical: "right of way", confidence: 1.0, topicHint: "junction-rules" },
  "who has right of way": { canonical: "right of way", confidence: 1.0, topicHint: "junction-rules" },
  "who gets to go first": { canonical: "right of way", confidence: 1.0, topicHint: "junction-rules" },
  "which car goes first": { canonical: "right of way", confidence: 1.0, topicHint: "junction-rules" },
  "which vehicle goes first": { canonical: "right of way", confidence: 1.0, topicHint: "junction-rules" },
  "precedence": { canonical: "right of way", confidence: 0.9, topicHint: "junction-rules" },
  "give way": { canonical: "right of way", confidence: 0.8, topicHint: "junction-rules" },
  "yield": { canonical: "right of way", confidence: 0.8, topicHint: "junction-rules" },
  "priority": { canonical: "right of way", confidence: 0.7, topicHint: "junction-rules" },

  // Signs
  "warning board": { canonical: "warning sign", confidence: 0.9, topicHint: "road-signs" },
  "hazard sign": { canonical: "warning sign", confidence: 0.9, topicHint: "road-signs" },
  "restriction sign": { canonical: "regulatory sign", confidence: 0.9, topicHint: "road-signs" },
  "mandatory sign": { canonical: "mandatory sign", confidence: 1.0, topicHint: "road-signs" },
  "prohibitory sign": { canonical: "prohibitory sign", confidence: 1.0, topicHint: "road-signs" },
  "information board": { canonical: "information sign", confidence: 0.9, topicHint: "road-signs" },
  "direction sign": { canonical: "information sign", confidence: 0.8, topicHint: "road-signs" },
  "sign board": { canonical: "road sign", confidence: 0.9, topicHint: "road-signs" },
  "road board": { canonical: "road sign", confidence: 0.8, topicHint: "road-signs" },
  "traffic sign": { canonical: "road sign", confidence: 1.0, topicHint: "road-signs" },

  // Traffic lights
  "traffic signal": { canonical: "traffic light", confidence: 1.0, topicHint: "traffic-lights" },
  "signal lights": { canonical: "traffic light", confidence: 0.9, topicHint: "traffic-lights" },
  "stop light": { canonical: "traffic light", confidence: 0.9, topicHint: "traffic-lights" },

  // Overtaking
  "go past another car": { canonical: "overtaking", confidence: 0.9, topicHint: "overtaking" },
  "go around slower car": { canonical: "overtaking", confidence: 0.9, topicHint: "overtaking" },
  "pass a slower vehicle": { canonical: "overtaking", confidence: 0.9, topicHint: "overtaking" },
  "get past": { canonical: "overtaking", confidence: 0.7, topicHint: "overtaking" },

  // Parking
  "leave my car": { canonical: "parking", confidence: 0.7, topicHint: "parking" },
  "pull over": { canonical: "parking", confidence: 0.8, topicHint: "parking" },
  "wait by the roadside": { canonical: "parking", confidence: 0.8, topicHint: "parking" },

  // Vehicle equipment
  "safety belt": { canonical: "seat belt", confidence: 1.0, topicHint: "vehicle-equipment" },
  "rear mirror": { canonical: "rear-view mirror", confidence: 0.9, topicHint: "vehicle-equipment" },
  "wing mirror": { canonical: "side mirror", confidence: 0.9, topicHint: "vehicle-equipment" },
  "signal light": { canonical: "indicator", confidence: 0.8, topicHint: "vehicle-equipment" },
  "turn signal": { canonical: "indicator", confidence: 0.9, topicHint: "vehicle-equipment" },
  "brake light": { canonical: "brake lights", confidence: 1.0, topicHint: "vehicle-equipment" },
  "headlamp": { canonical: "headlights", confidence: 0.9, topicHint: "vehicle-equipment" },
  "high beam": { canonical: "headlights", confidence: 0.8, topicHint: "vehicle-equipment" },
  "dipped beam": { canonical: "dipped headlights", confidence: 0.9, topicHint: "vehicle-equipment" },

  // Speed
  "how fast can i go": { canonical: "speed limit", confidence: 0.9, topicHint: "speed-limits" },
  "how fast should i drive": { canonical: "speed limit", confidence: 0.8, topicHint: "speed-limits" },
  "maximum speed": { canonical: "speed limit", confidence: 1.0, topicHint: "speed-limits" },
  "legal speed": { canonical: "speed limit", confidence: 0.9, topicHint: "speed-limits" },

  // Weather
  "car slides on water": { canonical: "aquaplaning", confidence: 0.9, topicHint: "night-driving" },
  "water makes steering light": { canonical: "aquaplaning", confidence: 0.9, topicHint: "night-driving" },
  "road loses grip in rain": { canonical: "aquaplaning", confidence: 0.8, topicHint: "night-driving" },
  "wet road": { canonical: "rain", confidence: 0.7, topicHint: "night-driving" },
  "slippery road": { canonical: "rain", confidence: 0.6, topicHint: "night-driving" },

  // Vehicle problems
  "car won't stop properly": { canonical: "brake failure", confidence: 0.8, topicHint: "vehicle-equipment" },
  "car pulls when braking": { canonical: "braking imbalance", confidence: 0.8, topicHint: "vehicle-equipment" },
  "wheel shakes when braking": { canonical: "brake vibration", confidence: 0.8, topicHint: "vehicle-equipment" },
  "steering feels loose": { canonical: "steering problem", confidence: 0.8, topicHint: "vehicle-equipment" },
  "car drifts": { canonical: "alignment problem", confidence: 0.7, topicHint: "vehicle-equipment" },
  "tyre feels soft": { canonical: "tyre pressure", confidence: 0.8, topicHint: "vehicle-equipment" },
  "car overheats": { canonical: "overheating", confidence: 0.9, topicHint: "vehicle-equipment" },
  "engine temperature high": { canonical: "overheating", confidence: 0.9, topicHint: "vehicle-equipment" },

  // Licensing
  "how old to drive": { canonical: "age requirement", confidence: 0.9, topicHint: "vehicle-classes" },
  "can i drive at 16": { canonical: "age requirement", confidence: 0.9, topicHint: "vehicle-classes" },
  "what side drive": { canonical: "left-hand traffic", confidence: 0.9, topicHint: "general-rules" },

  // Junctions
  "crossroads": { canonical: "junction", confidence: 0.9, topicHint: "junction-rules" },
  "joining road": { canonical: "merging", confidence: 0.8, topicHint: "junction-rules" },
  "traffic circle": { canonical: "roundabout", confidence: 0.9, topicHint: "junction-rules" },
  "rotary": { canonical: "roundabout", confidence: 0.8, topicHint: "junction-rules" },
};

/**
 * Expand a normalized query into related canonical terms.
 * Returns an array of expanded terms with topic hints.
 */
export function expandTerms(query: string): AliasMapping[] {
  const results: AliasMapping[] = [];
  const lower = query.toLowerCase();

  for (const [phrase, mapping] of Object.entries(ALIAS_MAP)) {
    if (lower.includes(phrase)) {
      results.push({ ...mapping, canonical: phrase + " → " + mapping.canonical });
      results.push({ canonical: mapping.canonical, confidence: mapping.confidence, topicHint: mapping.topicHint });
    }
  }

  // Deduplicate by canonical term, keeping highest confidence
  const seen = new Map<string, AliasMapping>();
  for (const r of results) {
    const existing = seen.get(r.canonical);
    if (!existing || r.confidence > existing.confidence) {
      seen.set(r.canonical, r);
    }
  }

  return [...seen.values()];
}

/**
 * Get topic hint from expanded terms.
 * Returns the most likely topic based on expanded aliases.
 */
export function getTopicHintFromExpansions(expansions: AliasMapping[]): string | null {
  const topicCounts = new Map<string, number>();
  for (const e of expansions) {
    if (e.topicHint) {
      topicCounts.set(e.topicHint, (topicCounts.get(e.topicHint) ?? 0) + e.confidence);
    }
  }
  let best: string | null = null;
  let bestScore = 0;
  for (const [topic, score] of topicCounts) {
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }
  return best;
}
