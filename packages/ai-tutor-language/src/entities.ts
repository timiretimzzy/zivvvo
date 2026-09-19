/**
 * Entity and concept extraction from learner language.
 *
 * Extracts driving-specific entities (signs, markings, conditions, etc.)
 * and maps them to canonical concepts.
 */

export interface ExtractedEntity {
  text: string;
  type: EntityType;
  canonical: string;
}

export type EntityType =
  | "sign"
  | "marking"
  | "traffic-light"
  | "vehicle-part"
  | "road-feature"
  | "condition"
  | "road-user"
  | "action"
  | "legal-concept"
  | "exam-concept";

const ENTITY_PATTERNS: { pattern: RegExp; type: EntityType; canonical: string }[] = [
  // Signs
  { pattern: /\b(stop sign|red octagon)\b/i, type: "sign", canonical: "stop-sign" },
  { pattern: /\b(give way|give-way|yield sign)\b/i, type: "sign", canonical: "give-way-sign" },
  { pattern: /\b(no entry|no-entry)\b/i, type: "sign", canonical: "no-entry-sign" },
  { pattern: /\b(no overtaking|no-overtaking)\b/i, type: "sign", canonical: "no-overtaking-sign" },
  { pattern: /\b(no u-turn|no-u-turn)\b/i, type: "sign", canonical: "no-u-turn-sign" },
  { pattern: /\b(no parking|no-parking)\b/i, type: "sign", canonical: "no-parking-sign" },
  { pattern: /\b(no stopping|no-stopping)\b/i, type: "sign", canonical: "no-stopping-sign" },
  { pattern: /\b(speed (sign|restriction|limit sign))\b/i, type: "sign", canonical: "speed-restriction-sign" },
  { pattern: /\b(warning sign|triangular sign|hazard sign)\b/i, type: "sign", canonical: "warning-sign" },
  { pattern: /\b(regulatory sign|circular sign)\b/i, type: "sign", canonical: "regulatory-sign" },
  { pattern: /\b(mandatory sign)\b/i, type: "sign", canonical: "mandatory-sign" },
  { pattern: /\b(information sign|direction sign|guide sign)\b/i, type: "sign", canonical: "information-sign" },
  { pattern: /\b(one-way sign)\b/i, type: "sign", canonical: "one-way-sign" },
  { pattern: /\b(keep left|keep right)\b/i, type: "sign", canonical: "keep-left-right-sign" },
  { pattern: /\b(school|children|pedestrian warning)\b/i, type: "sign", canonical: "pedestrian-warning-sign" },
  { pattern: /\b(railway crossing sign)\b/i, type: "sign", canonical: "railway-crossing-sign" },
  { pattern: /\b(traffic signal ahead)\b/i, type: "sign", canonical: "signal-ahead-sign" },
  { pattern: /\b(steep (gradient|hill|descent|ascent))\b/i, type: "sign", canonical: "steep-gradient-sign" },
  { pattern: /\b(slippery road|road surface)\b/i, type: "sign", canonical: "slippery-road-sign" },
  { pattern: /\b(road narrows)\b/i, type: "sign", canonical: "road-narrows-sign" },
  { pattern: /\b(speed hump|traffic calming)\b/i, type: "sign", canonical: "speed-hump-sign" },

  // Road markings
  { pattern: /\b(solid (yellow|white|red) line)\b/i, type: "marking", canonical: "solid-line" },
  { pattern: /\b(broken|dashed|broken) (line|center line|centre line)\b/i, type: "marking", canonical: "broken-line" },
  { pattern: /\b(double (solid|continuous) line)\b/i, type: "marking", canonical: "double-solid-line" },
  { pattern: /\b(lane arrow|directional arrow)\b/i, type: "marking", canonical: "lane-arrow" },
  { pattern: /\b(stop line)\b/i, type: "marking", canonical: "stop-line" },
  { pattern: /\b(give-way line|yield line)\b/i, type: "marking", canonical: "give-way-line" },
  { pattern: /\b(pedestrian crossing marking|zebra crossing)\b/i, type: "marking", canonical: "pedestrian-crossing-marking" },
  { pattern: /\b(painted island|hatching|chevrons)\b/i, type: "marking", canonical: "hatching" },

  // Traffic lights
  { pattern: /\b(red light|red signal)\b/i, type: "traffic-light", canonical: "red-light" },
  { pattern: /\b(green light|green signal)\b/i, type: "traffic-light", canonical: "green-light" },
  { pattern: /\b(amber|yellow) light\b/i, type: "traffic-light", canonical: "amber-light" },
  { pattern: /\bflashing (amber|red|green)\b/i, type: "traffic-light", canonical: "flashing-light" },
  { pattern: /\bpedestrian signal\b/i, type: "traffic-light", canonical: "pedestrian-signal" },
  { pattern: /\b(arrow signal|directional arrow signal)\b/i, type: "traffic-light", canonical: "arrow-signal" },

  // Vehicle parts
  { pattern: /\btyre|tire\b/i, type: "vehicle-part", canonical: "tyre" },
  { pattern: /\bbrake(s| pedal)?\b/i, type: "vehicle-part", canonical: "brakes" },
  { pattern: /\bsteering\b/i, type: "vehicle-part", canonical: "steering" },
  { pattern: /\bclutch\b/i, type: "vehicle-part", canonical: "clutch" },
  { pattern: /\b(abs|anti-lock)\b/i, type: "vehicle-part", canonical: "abs" },
  { pattern: /\bheadlight|headlamp|head lamp\b/i, type: "vehicle-part", canonical: "headlights" },
  { pattern: /\bindicator|turn signal|blinker\b/i, type: "vehicle-part", canonical: "indicator" },
  { pattern: /\bhorn|hooter\b/i, type: "vehicle-part", canonical: "horn" },
  { pattern: /\bseat\s*belt|seatbelt|safety belt\b/i, type: "vehicle-part", canonical: "seatbelt" },
  { pattern: /\bwindscreen|windshield\b/i, type: "vehicle-part", canonical: "windscreen" },
  { pattern: /\bmirror(s| rear| side| wing| rearview)?\b/i, type: "vehicle-part", canonical: "mirrors" },
  { pattern: /\b(hand|parking) brake\b/i, type: "vehicle-part", canonical: "handbrake" },

  // Road features
  { pattern: /\b(junction|intersection|crossroad|t-junction|crossroads)\b/i, type: "road-feature", canonical: "junction" },
  { pattern: /\b(roundabout|traffic circle|rotary)\b/i, type: "road-feature", canonical: "roundabout" },
  { pattern: /\b(pedestrian crossing|zebra crossing)\b/i, type: "road-feature", canonical: "crossing" },
  { pattern: /\b(narrow bridge|bridge)\b/i, type: "road-feature", canonical: "bridge" },
  { pattern: /\b(railway crossing)\b/i, type: "road-feature", canonical: "railway-crossing" },
  { pattern: /\b(bend|curve|corner)\b/i, type: "road-feature", canonical: "bend" },
  { pattern: /\b(crest|hill top)\b/i, type: "road-feature", canonical: "crest" },
  { pattern: /\b(slip road|on-ramp|off-ramp)\b/i, type: "road-feature", canonical: "slip-road" },
  { pattern: /\b(lane|carriageway)\b/i, type: "road-feature", canonical: "lane" },

  // Road users
  { pattern: /\bpedestrian|person walking|walker\b/i, type: "road-user", canonical: "pedestrian" },
  { pattern: /\bcyclist|bicycle|bike|rider\b/i, type: "road-user", canonical: "cyclist" },
  { pattern: /\bmotorcycl|motorbike|biker\b/i, type: "road-user", canonical: "motorcycle" },
  { pattern: /\b learner (driver|plate|licence)\b/i, type: "road-user", canonical: "learner-driver" },
  { pattern: /\b(emergency vehicle|ambulance|fire truck|police)\b/i, type: "road-user", canonical: "emergency-vehicle" },

  // Conditions
  { pattern: /\b(rain|raining|wet road|heavy rain)\b/i, type: "condition", canonical: "rain" },
  { pattern: /\b(night|dark|darkness)\b/i, type: "condition", canonical: "night" },
  { pattern: /\b(fog|mist)\b/i, type: "condition", canonical: "fog" },
  { pattern: /\b(dust|smoke)\b/i, type: "condition", canonical: "dust-smoke" },
  { pattern: /\b(glare|low sun|bright light)\b/i, type: "condition", canonical: "glare" },
  { pattern: /\b(aquaplan|hydroplan|slippery|skid|slide)\b/i, type: "condition", canonical: "aquaplaning" },
  { pattern: /\b(po|pothole|potholes)\b/i, type: "condition", canonical: "pothole" },
];

/**
 * Extract entities from normalized text.
 */
export function extractEntities(normalizedText: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  for (const { pattern, type, canonical } of ENTITY_PATTERNS) {
    if (pattern.test(normalizedText) && !seen.has(canonical)) {
      seen.add(canonical);
      const match = normalizedText.match(pattern);
      entities.push({
        text: match?.[0] ?? canonical,
        type,
        canonical,
      });
    }
  }

  return entities;
}

/**
 * Map extracted entities to likely concepts.
 */
export function entitiesToConcepts(entities: ExtractedEntity[]): string[] {
  const concepts = new Set<string>();

  for (const entity of entities) {
    switch (entity.type) {
      case "sign":
        concepts.add("sign-meaning");
        if (entity.canonical === "warning-sign") concepts.add("sign-recognition");
        if (entity.canonical === "regulatory-sign") concepts.add("sign-action");
        break;
      case "marking":
        concepts.add("road-markings");
        concepts.add("lines");
        break;
      case "traffic-light":
        concepts.add("robot");
        concepts.add("lights");
        break;
      case "vehicle-part":
        concepts.add("vehicle-equipment");
        if (entity.canonical === "tyre") concepts.add("tyres");
        if (entity.canonical === "brakes") concepts.add("braking");
        if (entity.canonical === "steering") concepts.add("steering");
        break;
      case "road-feature":
        if (entity.canonical === "junction" || entity.canonical === "roundabout") {
          concepts.add("junction");
        }
        break;
      case "road-user":
        if (entity.canonical === "pedestrian" || entity.canonical === "cyclist") {
          concepts.add("pedestrian");
          concepts.add("cycles");
        }
        if (entity.canonical === "motorcycle") concepts.add("motorcycle");
        break;
      case "condition":
        if (entity.canonical === "rain" || entity.canonical === "aquaplaning") {
          concepts.add("distance");
        }
        break;
      default:
        break;
    }
  }

  return [...concepts];
}
