#!/usr/bin/env node
/**
 * D2 Content Classification & Validation Pipeline
 *
 * Reads content-v1.json, classifies every question against the approved taxonomy,
 * detects duplicates, validates integrity, and produces:
 *   - docs/CONTENT_MIGRATION_PREVIEW.md   (per-question migration plan)
 *   - docs/CONTENT_VALIDATION_REPORT.md   (structural + semantic stats)
 *   - docs/LOW_CONFIDENCE_REVIEW.md       (detailed audit of LOW-confidence questions)
 *
 * DOES NOT modify content-v1.json. Read-only analysis.
 *
 * Terminology: "question records" = individual entries in content-v1.json.
 *   A question record has a unique QID. Multiple records can share the same stem.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CONTENT_PATH = join(ROOT, "packages", "content", "src", "data", "content-v1.json");
const DOCS_DIR = join(ROOT, "docs");

// ─── Approved Taxonomy ───────────────────────────────────────────────────────

const PROPOSED_TOPICS = [
  { id: "road-signs", label: "Road Signs & Signals", parent: "Road Knowledge" },
  { id: "road-markings", label: "Road Markings & Lines", parent: "Road Knowledge" },
  { id: "junction-rules", label: "Junctions & Right of Way", parent: "Traffic Rules" },
  { id: "traffic-lights", label: "Traffic Lights & Robots", parent: "Traffic Rules" },
  { id: "speed-limits", label: "Speed Limits & Restrictions", parent: "Traffic Rules" },
  { id: "overtaking", label: "Overtaking Rules", parent: "Traffic Rules" },
  { id: "parking", label: "Parking Regulations", parent: "Traffic Rules" },
  { id: "pedestrian-safety", label: "Pedestrian & Cyclist Safety", parent: "Safety & Responsibility" },
  { id: "vehicle-equipment", label: "Vehicle Equipment & Lighting", parent: "Vehicle & Equipment" },
  { id: "vehicle-classes", label: "Licensing & Vehicle Classes", parent: "Vehicle & Equipment" },
  { id: "towing-loads", label: "Towing & Load Regulations", parent: "Vehicle & Equipment" },
  { id: "accident-procedures", label: "Accident & Emergency Procedures", parent: "Safety & Responsibility" },
  { id: "alcohol-drugs", label: "Alcohol, Drugs & Fitness", parent: "Safety & Responsibility" },
  { id: "night-driving", label: "Night & Adverse Weather Driving", parent: "Safety & Responsibility" },
  { id: "general-rules", label: "General Road Rules & Roadcraft", parent: "Traffic Rules" },
];

const PROPOSED_CONCEPTS = [
  "sign-recognition", "sign-meaning", "sign-action",
  "marking-identification", "marking-rule",
  "right-of-way", "intersection-behaviour", "roundabout",
  "signal-sequence", "signal-behaviour",
  "speed-limit", "speed-rule",
  "overtaking-rule", "overtaking-prohibition",
  "parking-rule", "parking-restriction",
  "pedestrian-rule", "cyclist-rule", "motorcycle-rule",
  "equipment-rule", "lighting-rule", "seatbelt-rule",
  "licence-class", "licence-requirement", "learner-rule",
  "towing-rule", "load-rule",
  "accident-procedure", "emergency-response",
  "alcohol-rule", "drug-rule", "fitness-to-drive",
  "night-rule", "weather-rule",
  "defensive-driving", "roadcraft", "psv-rule", "insurance-rule",
];

const PROPOSED_CONCEPT_SET = new Set(PROPOSED_CONCEPTS);
const PROPOSED_TOPIC_SET = new Set(PROPOSED_TOPICS.map((t) => t.id));

// ─── Classification Engine ───────────────────────────────────────────────────
//
// Rules are ordered from most-specific to most-generic.
// "defensive-driving" must NEVER be a fallback — it is a specific concept for
// genuine defensive-driving questions only.
//
// Priority tiers:
//   1. Image + specific stem pattern → HIGH
//   2. Non-image + specific keyword → HIGH/MEDIUM
//   3. Concept-hint from existing field → MEDIUM
//   4. Generic rule patterns → MEDIUM (with specific topic assignment)
//   5. Final fallback → general-rules/roadcraft (LOW)

// ─── QID-Based Overrides ─────────────────────────────────────────────────────
// Explicit overrides for questions that the stem-based classifier cannot
// reliably classify. These were identified by manual review of complete
// question records (stem + options + explanation + imageRef).

const QID_OVERRIDES = new Map([
  // ── Road-marking questions (reviewed from LOW-confidence) ────────────────
  // "A dualised carriageway means" — road layout definition
  ["47092", { topic: "road-markings", concept: "marking-identification", confidence: "MEDIUM", reason: "Dual carriageway definition (manual review)" }],
  ["49623", { topic: "road-markings", concept: "marking-identification", confidence: "MEDIUM", reason: "Dual carriageway definition (manual review)" }],
  ["50013", { topic: "road-markings", concept: "marking-identification", confidence: "MEDIUM", reason: "Dual carriageway definition (manual review)" }],
  // "Converging lanes means" — lane merging definition
  ["49459", { topic: "road-markings", concept: "marking-identification", confidence: "MEDIUM", reason: "Converging lanes definition (manual review)" }],
  ["49849", { topic: "road-markings", concept: "marking-identification", confidence: "MEDIUM", reason: "Converging lanes definition (manual review)" }],
  ["47318", { topic: "road-markings", concept: "marking-identification", confidence: "MEDIUM", reason: "Converging lanes definition (manual review)" }],
  // "A yellow line on the left hand side of the road" — yellow line rule
  ["49555", { topic: "road-markings", concept: "marking-rule", confidence: "MEDIUM", reason: "Yellow line crossing rule (manual review)" }],
  ["49945", { topic: "road-markings", concept: "marking-rule", confidence: "MEDIUM", reason: "Yellow line crossing rule (manual review)" }],
  ["47024", { topic: "road-markings", concept: "marking-rule", confidence: "MEDIUM", reason: "Yellow line crossing rule (manual review)" }],
  ["51221", { topic: "road-markings", concept: "marking-rule", confidence: "MEDIUM", reason: "Yellow line crossing rule (manual review)" }],
  // "What does a yellow line along the left edge..." — yellow line rule
  ["60004", { topic: "road-markings", concept: "marking-rule", confidence: "MEDIUM", reason: "Yellow line straddling rule (manual review)" }],
  // "What does it mean when one traffic lane divides into two" — lane marking definition
  ["60005", { topic: "road-markings", concept: "marking-identification", confidence: "MEDIUM", reason: "Diverging lanes definition (manual review)" }],
  // "If the broken line of a double centre marking..." — centre marking rule
  ["60008", { topic: "road-markings", concept: "marking-rule", confidence: "MEDIUM", reason: "Double centre marking crossing rule (manual review)" }],
  // "What is the correct sequence for a safe lane change?" — procedure, not marking
  ["60009", { topic: "general-rules", concept: "roadcraft", confidence: "LOW", reason: "Lane change procedure — not a marking question (manual review)" }],

  // ── Vehicle-class/licensing questions (reviewed from LOW-confidence) ─────
  // "The minimum legal age...learn to drive" — licence age requirement
  ["49549", { topic: "vehicle-classes", concept: "licence-requirement", confidence: "MEDIUM", reason: "Minimum learner age (manual review)" }],
  ["49939", { topic: "vehicle-classes", concept: "licence-requirement", confidence: "MEDIUM", reason: "Minimum learner age (manual review)" }],
  ["47018", { topic: "vehicle-classes", concept: "licence-requirement", confidence: "MEDIUM", reason: "Minimum learner age (manual review)" }],
  // "A tractor drivers permit is issued to a person who is aged" — tractor licence age
  ["49616", { topic: "vehicle-classes", concept: "licence-requirement", confidence: "MEDIUM", reason: "Tractor permit age requirement (manual review)" }],
  ["50006", { topic: "vehicle-classes", concept: "licence-requirement", confidence: "MEDIUM", reason: "Tractor permit age requirement (manual review)" }],
  ["47085", { topic: "vehicle-classes", concept: "licence-requirement", confidence: "MEDIUM", reason: "Tractor permit age requirement (manual review)" }],
  // "Lastly, it's important to take screenshots..." — meta/instructional, not driving
  ["50189", { topic: "general-rules", concept: "roadcraft", confidence: "LOW", reason: "Meta/instructional question — not a driving question (manual review)" }],

  // ── Road-sign questions (reviewed from LOW-confidence) ───────────────────
  // "Under what circumstances may a driver legally proceed when the signal facing them is red?" — traffic lights
  ["60020", { topic: "traffic-lights", concept: "signal-sequence", confidence: "MEDIUM", reason: "Red signal proceed rule — traffic lights, not signs (manual review)" }],
  // "What is the correct way to approach a give-way sign?" — road sign
  ["60095", { topic: "road-signs", concept: "sign-action", confidence: "MEDIUM", reason: "Give-way sign approach (manual review)" }],

  // ── Statement questions (reviewed from LOW-confidence, options reveal subject) ──
  // "Which statement is appropriate?" — road signage about congestion
  ["49328", { topic: "road-signs", concept: "sign-meaning", confidence: "MEDIUM", reason: "Statement about road signage (options reveal subject)" }],
  ["49718", { topic: "road-signs", concept: "sign-meaning", confidence: "MEDIUM", reason: "Statement about road signage (options reveal subject)" }],
  ["47187", { topic: "road-signs", concept: "sign-meaning", confidence: "MEDIUM", reason: "Statement about road signage (options reveal subject)" }],
  // "Which statement is true?" — steering backlash (vehicle equipment)
  ["49330", { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "MEDIUM", reason: "Statement about steering backlash (options reveal subject)" }],
  ["49720", { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "MEDIUM", reason: "Statement about steering backlash (options reveal subject)" }],
  ["47189", { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "MEDIUM", reason: "Statement about steering backlash (options reveal subject)" }],
  // "Which statement is not appropriate?" — sun visors (vehicle equipment)
  ["49332", { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "MEDIUM", reason: "Statement about sun visors (options reveal subject)" }],
  ["49722", { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "MEDIUM", reason: "Statement about sun visors (options reveal subject)" }],
  ["47191", { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "MEDIUM", reason: "Statement about sun visors (options reveal subject)" }],
  // "Which statement is not true?" — road test requirements (licensing)
  ["49343", { topic: "vehicle-classes", concept: "licence-requirement", confidence: "MEDIUM", reason: "Statement about road test requirements (options reveal subject)" }],
  ["49733", { topic: "vehicle-classes", concept: "licence-requirement", confidence: "MEDIUM", reason: "Statement about road test requirements (options reveal subject)" }],
  ["47202", { topic: "vehicle-classes", concept: "licence-requirement", confidence: "MEDIUM", reason: "Statement about road test requirements (options reveal subject)" }],
  // "Which statement is true?" — courteous driving (general rule)
  ["49345", { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Statement about courteous driving (options reveal subject)" }],
  ["49735", { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Statement about courteous driving (options reveal subject)" }],
  ["47204", { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Statement about courteous driving (options reveal subject)" }],
]);

function classifyTopic(q) {
  // Check QID overrides first
  const override = QID_OVERRIDES.get(String(q.qid));
  if (override) return override;

  const stem = q.stem;
  const hasImage = !!q.imageRef;
  const lc = stem.toLowerCase();

  // ══════════════════════════════════════════════════════════════════════════
  // TIER 1: IMAGE-BASED QUESTIONS (HIGH confidence)
  // ══════════════════════════════════════════════════════════════════════════

  // Road sign images
  if (hasImage && /sign|this sign|road sign|sign means|sign indicates|sign is a|at this sign|approaching this sign/i.test(stem)) {
    return { topic: "road-signs", concept: "sign-recognition", confidence: "HIGH", reason: "Image-based road sign question" };
  }

  // Intersection/junction diagrams
  if (hasImage && /intersection|crossing|junction|traffic circle|roundabout/i.test(stem)) {
    return { topic: "junction-rules", concept: "right-of-way", confidence: "HIGH", reason: "Image-based intersection diagram" };
  }

  // Lane/road marking diagrams
  if (hasImage && /lane|line|marking|carriageway/i.test(stem)) {
    return { topic: "road-markings", concept: "marking-identification", confidence: "HIGH", reason: "Image-based road marking diagram" };
  }

  // Right-of-way with images
  if (hasImage && /right of way|who.*first|who.*goes|who.*stop|which car/i.test(stem)) {
    return { topic: "junction-rules", concept: "right-of-way", confidence: "HIGH", reason: "Image-based right-of-way question" };
  }

  // Catch remaining image questions with indication/meaning stems
  if (hasImage && /indicate|means|when.*see|when.*approach|at.*this/i.test(stem)) {
    return { topic: "road-signs", concept: "sign-meaning", confidence: "HIGH", reason: "Image-based indication/meaning question" };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIER 2: SPECIFIC KEYWORD RULES (HIGH/MEDIUM confidence)
  // ══════════════════════════════════════════════════════════════════════════

  // ── ROAD MARKINGS ───────────────────────────────────────────────────────

  if (/broken yellow line|continuous white line|double white line|double prohibition|prohibition line/i.test(stem)) {
    return { topic: "road-markings", concept: "marking-identification", confidence: "HIGH", reason: "Road marking identification question" };
  }
  if (/direction arrow|diverging lane|lane.*end|lane.*merge|changing lane|dual carriageway/i.test(stem)) {
    return { topic: "road-markings", concept: "marking-rule", confidence: "HIGH", reason: "Road marking/rule question" };
  }
  if (/lane.*straight|straight.*lane|turn.*lane|lane.*intersection/i.test(stem)) {
    return { topic: "road-markings", concept: "marking-rule", confidence: "HIGH", reason: "Lane usage question" };
  }
  if (/centre line|center line|centre.*line|center.*line/i.test(stem)) {
    return { topic: "road-markings", concept: "marking-identification", confidence: "HIGH", reason: "Centre line marking question" };
  }
  if (/solid line|unbroken line|crossing.*line|ride on.*line|drive on.*line/i.test(stem)) {
    return { topic: "road-markings", concept: "marking-rule", confidence: "HIGH", reason: "Line usage rule question" };
  }
  if (/hatched.*area|hatching|chevron|buffer zone/i.test(stem)) {
    return { topic: "road-markings", concept: "marking-identification", confidence: "MEDIUM", reason: "Hatched area marking question" };
  }
  if (/zebra.*cross|pedestrian.*crossing|crosswalk/i.test(stem)) {
    return { topic: "road-markings", concept: "marking-rule", confidence: "HIGH", reason: "Pedestrian crossing marking question" };
  }

  // ── ROAD SIGNS ──────────────────────────────────────────────────────────

  if (/sign.*mean|sign.*indicat|sign.*fitted|sign.*is a|one way|one-way sign|give way sign|speed restriction sign/i.test(stem)) {
    return { topic: "road-signs", concept: "sign-meaning", confidence: "HIGH", reason: "Road sign meaning question" };
  }
  if (/insignia.*command|insignia.*warning|command sign|warning sign|regulatory sign|prohibition sign/i.test(stem)) {
    return { topic: "road-signs", concept: "sign-recognition", confidence: "HIGH", reason: "Road sign classification question" };
  }
  if (/T plates|reflective T|warning.*plate/i.test(stem)) {
    return { topic: "road-signs", concept: "sign-recognition", confidence: "HIGH", reason: "Warning sign/plate question" };
  }
  if (/sign.*broken down|sign.*road work|sign.*construction/i.test(stem)) {
    return { topic: "road-signs", concept: "sign-recognition", confidence: "HIGH", reason: "Road sign recognition question" };
  }
  if (/weight restriction|height restriction|width restriction/i.test(stem)) {
    return { topic: "road-signs", concept: "sign-meaning", confidence: "MEDIUM", reason: "Restriction sign question" };
  }
  if (/prohibitory.*sign|restrictive.*sign|information.*sign|direction.*sign/i.test(stem)) {
    return { topic: "road-signs", concept: "sign-recognition", confidence: "MEDIUM", reason: "Sign type classification question" };
  }
  if (/road.*mark.*sign|sign.*mark|paint.*mark|mark.*road/i.test(stem)) {
    return { topic: "road-markings", concept: "marking-identification", confidence: "MEDIUM", reason: "Road marking vs sign question" };
  }

  // ── TRAFFIC LIGHTS / ROBOTS ─────────────────────────────────────────────

  if (/robot|traffic light|green amber red|red.*amber.*green/i.test(stem)) {
    return { topic: "traffic-lights", concept: "signal-sequence", confidence: "HIGH", reason: "Traffic light/robot question" };
  }
  if (/pedestrian.*signal|pedestrian.*light|walk.*signal/i.test(stem)) {
    return { topic: "traffic-lights", concept: "signal-behaviour", confidence: "MEDIUM", reason: "Pedestrian signal question" };
  }
  if (/amber.*light|flashing.*amber|amber.*mean/i.test(stem)) {
    return { topic: "traffic-lights", concept: "signal-sequence", confidence: "MEDIUM", reason: "Amber light question" };
  }

  // ── OVERTAKING ──────────────────────────────────────────────────────────

  if (/overtake|overtaking|passing.*broken.down|passing.*animal|pass.*vehicle|side.*pass/i.test(stem)) {
    return { topic: "overtaking", concept: "overtaking-rule", confidence: "HIGH", reason: "Overtaking/passing question" };
  }
  if (/overtake.*hill|overtake.*bend|overtake.*corner|overtake.*bridge|overtake.*crest/i.test(stem)) {
    return { topic: "overtaking", concept: "overtaking-prohibition", confidence: "HIGH", reason: "Overtaking prohibition question" };
  }
  if (/overtaking.*lane|right.*lane.*overtake|left.*lane.*overtake/i.test(stem)) {
    return { topic: "overtaking", concept: "overtaking-rule", confidence: "MEDIUM", reason: "Overtaking lane question" };
  }

  // ── SPEED ───────────────────────────────────────────────────────────────

  if (/speed|km\/h|kilometre.*per.*hour|max.*speed|speed.*limit|slow.*moving|combine harvester/i.test(stem)) {
    return { topic: "speed-limits", concept: "speed-limit", confidence: "HIGH", reason: "Speed-related question" };
  }
  if (/speed.*trap|radar|speed camera|speed monitoring/i.test(stem)) {
    return { topic: "speed-limits", concept: "speed-rule", confidence: "MEDIUM", reason: "Speed enforcement question" };
  }

  // ── PARKING / STOPPING ──────────────────────────────────────────────────

  if (/park|parking|temporarily parked|parking brake|intend to stop|stop on the road|stopping.*road|pull off the road|distance from a corner.*stop/i.test(stem)) {
    return { topic: "parking", concept: "parking-rule", confidence: "HIGH", reason: "Parking/stopping question" };
  }
  if (/prohibited.*park|no.*park|restriction.*park|park.*restriction/i.test(stem)) {
    return { topic: "parking", concept: "parking-restriction", confidence: "MEDIUM", reason: "Parking restriction question" };
  }

  // ── PEDESTRIAN / CYCLIST / MOTORCYCLE ───────────────────────────────────

  if (/pedestrian/i.test(stem)) {
    return { topic: "pedestrian-safety", concept: "pedestrian-rule", confidence: "HIGH", reason: "Pedestrian-specific question" };
  }
  if (/cycl|pedal cyclist/i.test(stem)) {
    return { topic: "pedestrian-safety", concept: "cyclist-rule", confidence: "HIGH", reason: "Cyclist question" };
  }
  if (/motorcycle|motor cycle|motorbike/i.test(stem)) {
    return { topic: "pedestrian-safety", concept: "motorcycle-rule", confidence: "HIGH", reason: "Motorcycle question" };
  }

  // ── ALCOHOL / DRUGS ─────────────────────────────────────────────────────

  if (/alcohol|drug|drunk|intoxicated/i.test(stem)) {
    return { topic: "alcohol-drugs", concept: "alcohol-rule", confidence: "HIGH", reason: "Alcohol/drug question" };
  }
  if (/blood.*alcohol|breath.*alcohol|alcohol.*limit|limit.*alcohol/i.test(stem)) {
    return { topic: "alcohol-drugs", concept: "alcohol-rule", confidence: "HIGH", reason: "Blood alcohol limit question" };
  }
  if (/medication|medicine|prescription/i.test(stem)) {
    return { topic: "alcohol-drugs", concept: "drug-rule", confidence: "MEDIUM", reason: "Medication/drug question" };
  }

  // ── LICENSING / VEHICLE CLASSES ─────────────────────────────────────────

  if (/minimum age|age.*requirement|age.*omnibus|age.*taxi|age.*driver/i.test(stem)) {
    return { topic: "vehicle-classes", concept: "licence-requirement", confidence: "HIGH", reason: "Age/licence requirement question" };
  }
  if (/licen[sc]|licence code|driver.*class|vehicle.*class/i.test(stem)) {
    return { topic: "vehicle-classes", concept: "licence-class", confidence: "HIGH", reason: "Licensing/vehicle class question" };
  }
  if (/L.?plate|learner.*plate|learner.*driver|learner.*car/i.test(stem)) {
    return { topic: "vehicle-classes", concept: "learner-rule", confidence: "HIGH", reason: "Learner driver question" };
  }
  if (/omnibus|taxi.*driver|public service|PSV/i.test(stem)) {
    return { topic: "vehicle-classes", concept: "licence-class", confidence: "MEDIUM", reason: "PSV/vehicle class question" };
  }
  if (/insurance|medical.*certificate/i.test(stem)) {
    return { topic: "vehicle-classes", concept: "insurance-rule", confidence: "MEDIUM", reason: "Insurance/licensing question" };
  }
  if (/disqualified|suspension.*licence|revoke.*licence|endorsement/i.test(stem)) {
    return { topic: "vehicle-classes", concept: "licence-requirement", confidence: "MEDIUM", reason: "Licence disqualification question" };
  }

  // ── ACCIDENT PROCEDURES ─────────────────────────────────────────────────

  if (/accident/i.test(stem)) {
    return { topic: "accident-procedures", concept: "accident-procedure", confidence: "HIGH", reason: "Accident procedure question" };
  }
  if (/emergency vehicle|emergency.*approach|warning device/i.test(stem)) {
    return { topic: "accident-procedures", concept: "emergency-response", confidence: "HIGH", reason: "Emergency vehicle question" };
  }
  if (/first aid|injury|collision|crash/i.test(stem)) {
    return { topic: "accident-procedures", concept: "accident-procedure", confidence: "MEDIUM", reason: "Accident/injury question" };
  }

  // ── TOWING / LOADS ──────────────────────────────────────────────────────

  if (/tow|trailer|caravan/i.test(stem)) {
    return { topic: "towing-loads", concept: "towing-rule", confidence: "HIGH", reason: "Towing-related question" };
  }
  if (/load|cargo|abnormal.*load|fire.*extinguisher/i.test(stem)) {
    return { topic: "towing-loads", concept: "load-rule", confidence: "HIGH", reason: "Load-related question" };
  }

  // ── VEHICLE EQUIPMENT ───────────────────────────────────────────────────

  if (/horn|hooter/i.test(stem)) {
    return { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "HIGH", reason: "Horn/vehicle equipment question" };
  }
  if (/seat.?belt|safety belt/i.test(stem)) {
    return { topic: "vehicle-equipment", concept: "seatbelt-rule", confidence: "HIGH", reason: "Seat belt question" };
  }
  if (/sun visor|visor|windscreen|wiper|mirror/i.test(stem)) {
    return { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "HIGH", reason: "Vehicle equipment question" };
  }
  if (/breakdown triangle|warning triangle|reflective triangle/i.test(stem)) {
    return { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "MEDIUM", reason: "Emergency equipment question" };
  }
  if (/tyre|tire|wheel|brake|exhaust/i.test(stem)) {
    return { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "MEDIUM", reason: "Vehicle component question" };
  }
  if (/reflect|reflective|reflecto/i.test(stem)) {
    return { topic: "vehicle-equipment", concept: "lighting-rule", confidence: "MEDIUM", reason: "Reflector/visibility question" };
  }
  if (/muffler|silencer/i.test(stem)) {
    return { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "MEDIUM", reason: "Exhaust/muffler question" };
  }

  // ── NIGHT DRIVING / LIGHTING ────────────────────────────────────────────

  if (/night|dark|headlamp|headlight|fog.*light|beam|dip.*lamp|dip.*head|bright beam/i.test(stem)) {
    return { topic: "night-driving", concept: "lighting-rule", confidence: "HIGH", reason: "Night driving/lighting question" };
  }
  if (/light.*dazzl|dazzl.*light|oncoming.*light|beacon.*light|flashing.*light/i.test(stem)) {
    return { topic: "night-driving", concept: "lighting-rule", confidence: "HIGH", reason: "Lighting/visibility question" };
  }
  if (/rainy weather|wet road|rain|adverse weather|fog|mist|ice|snow|flood/i.test(stem)) {
    return { topic: "night-driving", concept: "weather-rule", confidence: "MEDIUM", reason: "Adverse weather driving question" };
  }
  if (/visibility|visible|visibility.*distance/i.test(stem)) {
    return { topic: "night-driving", concept: "lighting-rule", confidence: "MEDIUM", reason: "Visibility question" };
  }

  // ── JUNCTION / RIGHT OF WAY ─────────────────────────────────────────────

  if (/right of way|right-of-way/i.test(stem)) {
    return { topic: "junction-rules", concept: "right-of-way", confidence: "HIGH", reason: "Right-of-way question" };
  }
  if (/which car.*(goes|stops|last|first|breaking|not breaking|moves|second)/i.test(stem)) {
    return { topic: "junction-rules", concept: "intersection-behaviour", confidence: "HIGH", reason: "Intersection behaviour question" };
  }
  if (/intersection|junction|uncontrolled.*junction|traffic circle|roundabout/i.test(stem)) {
    return { topic: "junction-rules", concept: "intersection-behaviour", confidence: "HIGH", reason: "Intersection/junction question" };
  }
  if (/give way|yield|precedence|priority/i.test(stem)) {
    return { topic: "junction-rules", concept: "intersection-behaviour", confidence: "HIGH", reason: "Give-way/precedence question" };
  }
  if (/turning right|turning left|turn.*intersection/i.test(stem)) {
    return { topic: "junction-rules", concept: "intersection-behaviour", confidence: "HIGH", reason: "Turning at intersection question" };
  }
  if (/traffic circle.*indicate|indicate.*traffic circle/i.test(stem)) {
    return { topic: "junction-rules", concept: "roundabout", confidence: "HIGH", reason: "Roundabout indication question" };
  }

  // ── RAILWAY CROSSINGS ───────────────────────────────────────────────────

  if (/rail|railway|train|level crossing|booms/i.test(stem)) {
    return { topic: "road-signs", concept: "sign-action", confidence: "MEDIUM", reason: "Railway crossing question" };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIER 3: CONCEPT-HINT RULES (MEDIUM confidence)
  // Use existing concept field as classification hint
  // ══════════════════════════════════════════════════════════════════════════

  if (/which statement/i.test(stem)) {
    if (q.concept === "lines") return { topic: "road-markings", concept: "marking-rule", confidence: "MEDIUM", reason: "Statement about road markings (existing concept hint)" };
    if (q.concept === "overtaking") return { topic: "overtaking", concept: "overtaking-rule", confidence: "MEDIUM", reason: "Statement about overtaking (existing concept hint)" };
    if (q.concept === "lplate") return { topic: "vehicle-classes", concept: "learner-rule", confidence: "MEDIUM", reason: "Statement about learner rules (existing concept hint)" };
    if (q.concept === "lights") return { topic: "night-driving", concept: "lighting-rule", confidence: "MEDIUM", reason: "Statement about lighting (existing concept hint)" };
    if (q.concept === "parking") return { topic: "parking", concept: "parking-rule", confidence: "MEDIUM", reason: "Statement about parking (existing concept hint)" };
    if (q.concept === "speed") return { topic: "speed-limits", concept: "speed-rule", confidence: "MEDIUM", reason: "Statement about speed (existing concept hint)" };
    if (q.concept === "signs") return { topic: "road-signs", concept: "sign-meaning", confidence: "MEDIUM", reason: "Statement about signs (existing concept hint)" };
    if (q.concept === "signals") return { topic: "traffic-lights", concept: "signal-behaviour", confidence: "MEDIUM", reason: "Statement about signals (existing concept hint)" };
    if (q.concept === "junction") return { topic: "junction-rules", concept: "intersection-behaviour", confidence: "MEDIUM", reason: "Statement about junctions (existing concept hint)" };
    return { topic: "general-rules", concept: "roadcraft", confidence: "LOW", reason: "Generic statement question — needs context from options" };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIER 4: GENERIC RULE PATTERNS (MEDIUM confidence)
  // These are must/should/shall questions — classify by topic-specific keywords
  // NOT by defensive-driving. Defensive-driving is only for genuine hazard-
  // perception and defensive-driving technique questions.
  // ══════════════════════════════════════════════════════════════════════════

  // Vehicle skid/hazard → general-rules/roadcraft
  if (/vehicle.*skid|skidding|skid/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Skid control roadcraft question" };
  }
  if (/narrow bridge/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Narrow bridge roadcraft question" };
  }
  if (/blind spot/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Blind spot roadcraft question" };
  }
  if (/sleepy|fatigue|drowsy|tired/i.test(stem)) {
    return { topic: "alcohol-drugs", concept: "fitness-to-drive", confidence: "MEDIUM", reason: "Fatigue/fitness question" };
  }
  if (/travelling in a bus|when in a bus|bus passenger/i.test(stem)) {
    return { topic: "general-rules", concept: "psv-rule", confidence: "MEDIUM", reason: "PSV/bus rule question" };
  }
  if (/mobile phone|cell phone|phone call/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Distraction/phone rule question" };
  }
  if (/gear|fuel|economical|saving fuel/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Driving technique/roadcraft question" };
  }
  if (/animal drawn|animal-drawn/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Animal-drawn vehicle question" };
  }
  if (/stray.*animal|rabbit.*cross|animal.*road/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Animal hazard question" };
  }
  if (/clutch|gearbox|transmission|engine/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Vehicle mechanics/roadcraft question" };
  }
  if (/pre.driving check|vehicle check|before.*drive/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Pre-driving check question" };
  }
  if (/uphill|downhill|gradient|slope/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Hill driving roadcraft question" };
  }
  if (/indicate|indicator|signal.*turn|turn.*signal/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Signalling/roadcraft question" };
  }
  if (/hazard perception|hazardous/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Hazard perception question" };
  }
  if (/distance.*behind|following.*distance|safe.*distance/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Following distance roadcraft question" };
  }
  if (/steering|steer/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Steering technique question" };
  }
  if (/reversing|reverse.*park|backing/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Reversing/manoeuvre question" };
  }
  if (/road.*surface|pothole|uneven.*road|slippery/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Road surface condition question" };
  }
  if (/mountain.*pass|steep.*hill|cog.*wheel/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Mountain/steep gradient question" };
  }
  if (/bend|curve|corner/i.test(stem)) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Bend/curve driving question" };
  }
  if (/tunnel/i.test(stem)) {
    return { topic: "night-driving", concept: "lighting-rule", confidence: "MEDIUM", reason: "Tunnel driving/lighting question" };
  }
  if (/horn|hooter|warning.*signal/i.test(stem)) {
    return { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "MEDIUM", reason: "Horn/warning signal question" };
  }
  if (/towing|trailer|caravan/i.test(stem)) {
    return { topic: "towing-loads", concept: "towing-rule", confidence: "MEDIUM", reason: "Towing question" };
  }
  if (/exhaust|smoke|emission/i.test(stem)) {
    return { topic: "vehicle-equipment", concept: "equipment-rule", confidence: "MEDIUM", reason: "Exhaust/emission question" };
  }
  if (/reflector|reflective/i.test(stem)) {
    return { topic: "vehicle-equipment", concept: "lighting-rule", confidence: "MEDIUM", reason: "Reflector/visibility question" };
  }
  if (/seat|seating/i.test(stem)) {
    return { topic: "vehicle-equipment", concept: "seatbelt-rule", confidence: "MEDIUM", reason: "Seating/seatbelt question" };
  }

  // Generic must/should/shall/prohibited/allowed — try to narrow by topic keywords
  if (/must|should|shall|prohibited|allowed|exempted/i.test(stem)) {
    // Try to narrow down by topic-specific keywords in the generic rule
    if (/sign|signal|marking/i.test(stem)) return { topic: "road-signs", concept: "sign-action", confidence: "MEDIUM", reason: "General rule about signs/markings" };
    if (/overtake|passing/i.test(stem)) return { topic: "overtaking", concept: "overtaking-rule", confidence: "MEDIUM", reason: "General rule about overtaking" };
    if (/speed/i.test(stem)) return { topic: "speed-limits", concept: "speed-rule", confidence: "MEDIUM", reason: "General rule about speed" };
    if (/park|stop/i.test(stem)) return { topic: "parking", concept: "parking-rule", confidence: "MEDIUM", reason: "General rule about parking/stopping" };
    if (/pedestrian|cyclist/i.test(stem)) return { topic: "pedestrian-safety", concept: "pedestrian-rule", confidence: "MEDIUM", reason: "General rule about pedestrians" };
    if (/alcohol|drug|drunk/i.test(stem)) return { topic: "alcohol-drugs", concept: "alcohol-rule", confidence: "MEDIUM", reason: "General rule about alcohol" };
    if (/licence|license|learner|plate/i.test(stem)) return { topic: "vehicle-classes", concept: "licence-class", confidence: "MEDIUM", reason: "General rule about licensing" };
    if (/accident|emergency/i.test(stem)) return { topic: "accident-procedures", concept: "accident-procedure", confidence: "MEDIUM", reason: "General rule about accidents" };
    if (/light|lamp|beam|night/i.test(stem)) return { topic: "night-driving", concept: "lighting-rule", confidence: "MEDIUM", reason: "General rule about lighting" };
    if (/tow|trailer|load/i.test(stem)) return { topic: "towing-loads", concept: "towing-rule", confidence: "MEDIUM", reason: "General rule about towing" };
    if (/rain|wet|fog|weather/i.test(stem)) return { topic: "night-driving", concept: "weather-rule", confidence: "MEDIUM", reason: "General rule about weather" };
    if (/turn|intersection|junction|give way/i.test(stem)) return { topic: "junction-rules", concept: "intersection-behaviour", confidence: "MEDIUM", reason: "General rule about junctions" };
    // Truly generic — cannot narrow further
    return { topic: "general-rules", concept: "roadcraft", confidence: "MEDIUM", reason: "Generic road rule question" };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIER 5: FINAL FALLBACK (LOW confidence)
  // ══════════════════════════════════════════════════════════════════════════

  // Image present but stem does not match any known pattern
  if (hasImage) {
    return { topic: "general-rules", concept: "roadcraft", confidence: "LOW", reason: "Image present but stem does not match known patterns" };
  }

  // Genuinely unclassifiable — general-rules/roadcraft (NOT defensive-driving)
  return { topic: "general-rules", concept: "roadcraft", confidence: "LOW", reason: "Genuinely unclassifiable from stem alone" };
}

// ─── Duplicate Detection ─────────────────────────────────────────────────────

function classifyDuplicates(questions) {
  const stemMap = new Map();
  for (const q of questions) {
    const stem = q.stem.trim();
    if (!stemMap.has(stem)) stemMap.set(stem, []);
    stemMap.get(stem).push(q);
  }

  const groups = [];
  for (const [stem, qs] of stemMap) {
    if (qs.length === 1) continue;

    const correctSets = qs.map((q) => q.correctIndexes.slice().sort().join(","));
    const allSameCorrect = new Set(correctSets).size === 1;
    const images = qs.map((q) => q.imageRef);
    const hasDifferentImages = new Set(images).size > 1;
    const hasAnyImage = images.some((i) => i !== null);
    const allSameImage = new Set(images).size === 1;
    const topics = qs.map((q) => q.topicId);
    const differentTopics = new Set(topics).size > 1;
    const concepts = qs.map((q) => q.concept);
    const differentConcepts = new Set(concepts).size > 1;

    let type;
    let imageValidation = null;

    if (allSameCorrect && !hasDifferentImages && !differentTopics && !differentConcepts) {
      type = "EXACT_DUPLICATE";
    } else if (allSameCorrect && hasDifferentImages) {
      type = "IMAGE_CONTEXT_VARIANT";
    } else if (allSameCorrect && (differentTopics || differentConcepts)) {
      type = "USEFUL_VARIANT";
    } else if (!allSameCorrect) {
      if (hasDifferentImages) {
        type = "LIKELY_LEGITIMATE_SAME_STEM_VARIANT";
        imageValidation = "DIFFERENT_IMAGES — different scenarios, likely legitimate";
      } else if (allSameImage && hasAnyImage) {
        type = "POSSIBLE_CONTENT_ERROR";
        imageValidation = "SAME_IMAGE — same image with different correct answers, needs manual review";
      } else if (!hasAnyImage) {
        type = "LIKELY_LEGITIMATE_SAME_STEM_VARIANT";
        imageValidation = "NO_IMAGES — no images, answers differ (options may vary)";
      } else {
        type = "LIKELY_LEGITIMATE_SAME_STEM_VARIANT";
        imageValidation = "MIXED — mixed image presence";
      }
    } else {
      type = "USEFUL_VARIANT";
    }

    groups.push({
      stem,
      type,
      qids: qs.map((q) => q.qid),
      count: qs.length,
      correctSets: allSameCorrect ? null : correctSets,
      imageValidation,
      images: hasAnyImage ? images : null,
    });
  }

  return groups;
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateContent(pack) {
  const issues = [];

  const qids = pack.questions.map((q) => q.qid);
  const uniqueQids = new Set(qids);
  if (uniqueQids.size !== qids.length) {
    issues.push({ severity: "ERROR", message: `Duplicate QIDs: ${qids.length - uniqueQids.size} duplicates` });
  }

  const topicIds = new Set(pack.topics.map((t) => t.id));
  for (const q of pack.questions) {
    if (!topicIds.has(q.topicId)) {
      issues.push({ severity: "ERROR", message: `QID ${q.qid}: invalid topicId "${q.topicId}"` });
    }
  }

  for (const q of pack.questions) {
    for (const i of q.correctIndexes) {
      if (i < 0 || i >= q.options.length) {
        issues.push({ severity: "ERROR", message: `QID ${q.qid}: invalid correctIndex ${i} (options length: ${q.options.length})` });
      }
      if (!q.options[i]?.isCorrect) {
        issues.push({ severity: "ERROR", message: `QID ${q.qid}: correctIndex ${i} points to non-correct option` });
      }
    }
  }

  for (const q of pack.questions) {
    if (q.status === "answered" && q.correctIndexes.length === 0) {
      issues.push({ severity: "WARNING", message: `QID ${q.qid}: answered but no correctIndexes` });
    }
  }

  const actualCounts = new Map();
  for (const q of pack.questions) {
    actualCounts.set(q.topicId, (actualCounts.get(q.topicId) ?? 0) + 1);
  }
  for (const t of pack.topics) {
    const actual = actualCounts.get(t.id) ?? 0;
    if (actual !== t.count) {
      issues.push({ severity: "WARNING", message: `Topic "${t.id}": declared count ${t.count}, actual ${actual}` });
    }
  }

  const actualAnswered = pack.questions.filter((q) => q.status === "answered").length;
  const actualWithExplanation = pack.questions.filter((q) => q.explanation).length;
  const actualWithImage = pack.questions.filter((q) => q.imageRef).length;
  if (actualAnswered !== pack.stats.answered) {
    issues.push({ severity: "WARNING", message: `Stats.answered: declared ${pack.stats.answered}, actual ${actualAnswered}` });
  }
  if (actualWithExplanation !== pack.stats.withExplanation) {
    issues.push({ severity: "WARNING", message: `Stats.withExplanation: declared ${pack.stats.withExplanation}, actual ${actualWithExplanation}` });
  }
  if (actualWithImage !== pack.stats.withImage) {
    issues.push({ severity: "WARNING", message: `Stats.withImage: declared ${pack.stats.withImage}, actual ${actualWithImage}` });
  }

  return issues;
}

// ─── Migration Preview Generator ─────────────────────────────────────────────

function generateMigrationPreview(pack, classifications, dupGroups) {
  const dupMap = new Map();
  for (const g of dupGroups) {
    for (const qid of g.qids) {
      dupMap.set(qid, g);
    }
  }

  const lines = [];
  lines.push("# Zivvvo Content Migration Preview");
  lines.push("");
  lines.push("> **Generated by:** `tools/zivvvo/classify-content.mjs`");
  lines.push("> **Status:** D2 dry-run. DO NOT apply until D3 approval.");
  lines.push("> **Rule:** Only `topicId` and `concept` change. QIDs, stems, options, answers, images, explanations are preserved.");
  lines.push("");
  lines.push("---");
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total question records | ${pack.questions.length} |`);
  lines.push(`| Question records remapped | ${classifications.filter((c) => c.proposedTopic !== pack.questions.find((q) => q.qid === c.qid)?.topicId || c.proposedConcept !== pack.questions.find((q) => q.qid === c.qid)?.concept).length} |`);
  lines.push(`| HIGH confidence | ${classifications.filter((c) => c.confidence === "HIGH").length} |`);
  lines.push(`| MEDIUM confidence | ${classifications.filter((c) => c.confidence === "MEDIUM").length} |`);
  lines.push(`| LOW confidence | ${classifications.filter((c) => c.confidence === "LOW").length} |`);
  lines.push(`| AMBIGUOUS | ${classifications.filter((c) => c.confidence === "AMBIGUOUS").length} |`);
  lines.push("");

  const dupTypes = {};
  for (const g of dupGroups) {
    dupTypes[g.type] = (dupTypes[g.type] ?? 0) + 1;
  }
  lines.push("## Duplicate Classification");
  lines.push("");
  lines.push(`| Type | Groups | Question Records |`);
  lines.push(`|------|--------|------------------|`);
  for (const [type, count] of Object.entries(dupTypes).sort((a, b) => b[1] - a[1])) {
    const totalQ = dupGroups.filter((g) => g.type === type).reduce((s, g) => s + g.count, 0);
    lines.push(`| ${type} | ${count} | ${totalQ} |`);
  }
  lines.push("");

  lines.push("## Proposed Topic Distribution");
  lines.push("");
  lines.push(`| Topic | Current | Proposed | Change |`);
  lines.push(`|-------|---------|----------|--------|`);
  const currentTopicCounts = new Map();
  for (const q of pack.questions) {
    currentTopicCounts.set(q.topicId, (currentTopicCounts.get(q.topicId) ?? 0) + 1);
  }
  const proposedTopicCounts = new Map();
  for (const c of classifications) {
    proposedTopicCounts.set(c.proposedTopic, (proposedTopicCounts.get(c.proposedTopic) ?? 0) + 1);
  }
  for (const t of PROPOSED_TOPICS) {
    const cur = currentTopicCounts.get(t.id) ?? 0;
    const prop = proposedTopicCounts.get(t.id) ?? 0;
    const diff = prop - cur;
    lines.push(`| ${t.id} | ${cur} | ${prop} | ${diff >= 0 ? "+" : ""}${diff} |`);
  }
  lines.push("");

  lines.push("## Proposed Concept Distribution");
  lines.push("");
  lines.push(`| Concept | Count | % |`);
  lines.push(`|---------|-------|---|`);
  const conceptCounts = new Map();
  for (const c of classifications) {
    conceptCounts.set(c.proposedConcept, (conceptCounts.get(c.proposedConcept) ?? 0) + 1);
  }
  for (const [concept, count] of [...conceptCounts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${concept} | ${count} | ${(count / pack.questions.length * 100).toFixed(1)}% |`);
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## Per-Question Migration");
  lines.push("");
  lines.push("> Each row shows the current state and proposed change for one question record.");
  lines.push("> Only `topicId` and `concept` change. All other fields are preserved.");
  lines.push("");
  lines.push("| QID | Current Topic | Proposed Topic | Current Concept | Proposed Concept | Confidence | Reason | Dup Status |");
  lines.push("|-----|---------------|----------------|-----------------|------------------|------------|--------|------------|");

  for (const c of classifications) {
    const q = pack.questions.find((q) => q.qid === c.qid);
    const dup = dupMap.get(c.qid);
    const dupStatus = dup ? dup.type : "UNIQUE";
    const topicChanged = c.proposedTopic !== q.topicId;
    const conceptChanged = c.proposedConcept !== (q.concept ?? "");
    const marker = topicChanged || conceptChanged ? "" : " (no change)";

    lines.push(
      `| ${c.qid} | ${q.topicId} | ${c.proposedTopic}${topicChanged ? " ←" : ""} | ${q.concept ?? "(null)"} | ${c.proposedConcept}${conceptChanged ? " ←" : ""} | ${c.confidence} | ${c.reason} | ${dupStatus}${marker} |`
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Safety Checklist");
  lines.push("");
  lines.push("- [ ] All QIDs preserved (count: old = new)");
  lines.push("- [ ] No stems changed");
  lines.push("- [ ] No options changed");
  lines.push("- [ ] No correctIndexes changed");
  lines.push("- [ ] No imageRef changed");
  lines.push("- [ ] No explanation changed");
  lines.push("- [ ] No status changed");
  lines.push("- [ ] Only topicId and concept modified");
  lines.push("");
  lines.push("*This document is a dry-run preview. Do not apply changes until D3 approval.*");

  return lines.join("\n");
}

// ─── Validation Report Generator ─────────────────────────────────────────────

function generateValidationReport(pack, classifications, dupGroups, issues) {
  const lines = [];
  lines.push("# Zivvvo Content Validation Report");
  lines.push("");
  lines.push("> **Generated by:** `tools/zivvvo/classify-content.mjs`");
  lines.push("> **Date:** " + new Date().toISOString().split("T")[0]);
  lines.push("> **Terminology:** \"question records\" = individual entries in content-v1.json. A question record has a unique QID. Multiple records can share the same stem.");
  lines.push("");

  // ── Current State ───────────────────────────────────────────────────────
  lines.push("## Current State");
  lines.push("");
  const uniqueStems = new Set(pack.questions.map((q) => q.stem.trim()));
  const stemCount = new Map();
  for (const q of pack.questions) {
    const s = q.stem.trim();
    stemCount.set(s, (stemCount.get(s) ?? 0) + 1);
  }
  const singletonStems = [...stemCount.values()].filter((c) => c === 1).length;
  const duplicateStems = [...stemCount.values()].filter((c) => c > 1).length;

  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total question records | ${pack.questions.length} |`);
  lines.push(`| Unique stem values | ${uniqueStems.size} |`);
  lines.push(`| Singleton stems | ${singletonStems} |`);
  lines.push(`| Stems with multiple records | ${duplicateStems} |`);
  lines.push(`| Topics (current) | ${pack.topics.length} |`);
  lines.push(`| Concepts (declared) | ${pack.concepts.length} |`);
  lines.push(`| Null concept | ${pack.questions.filter((q) => q.concept === null).length} |`);
  lines.push(`| "other" concept | ${pack.questions.filter((q) => q.concept === "other").length} |`);
  lines.push(`| Null difficulty | ${pack.questions.filter((q) => q.difficulty === null).length} |`);
  lines.push(`| Null imageRef | ${pack.questions.filter((q) => q.imageRef === null).length} |`);
  lines.push(`| Empty explanation | ${pack.questions.filter((q) => !q.explanation).length} |`);
  lines.push(`| Status "answered" | ${pack.questions.filter((q) => q.status === "answered").length} |`);
  lines.push("");

  // ── Structural Validation ───────────────────────────────────────────────
  // These checks verify data integrity — independent of classification.
  lines.push("## Structural Validation");
  lines.push("");
  const structuralIssues = issues.filter((i) => i.severity === "ERROR");
  const warningIssues = issues.filter((i) => i.severity === "WARNING");
  lines.push(`| Check | Status |`);
  lines.push(`|-------|--------|`);
  lines.push(`| QID uniqueness | ${structuralIssues.some((i) => i.message.includes("Duplicate QIDs")) ? "FAIL" : "PASS"} |`);
  lines.push(`| Topic IDs valid | ${structuralIssues.some((i) => i.message.includes("invalid topicId")) ? "FAIL" : "PASS"} |`);
  lines.push(`| Answer indexes valid | ${structuralIssues.some((i) => i.message.includes("correctIndex")) ? "FAIL" : "PASS"} |`);
  lines.push(`| Answered have answers | ${warningIssues.some((i) => i.message.includes("answered but no correctIndexes")) ? "WARN" : "PASS"} |`);
  lines.push(`| Topic counts match | ${warningIssues.some((i) => i.message.includes("declared count")) ? "WARN" : "PASS"} |`);
  lines.push(`| Stats match | ${warningIssues.some((i) => i.message.includes("Stats.")) ? "WARN" : "PASS"} |`);
  if (structuralIssues.length > 0) {
    lines.push("");
    for (const issue of structuralIssues) {
      lines.push(`- **ERROR:** ${issue.message}`);
    }
  }
  if (warningIssues.length > 0) {
    lines.push("");
    for (const issue of warningIssues) {
      lines.push(`- **WARNING:** ${issue.message}`);
    }
  }
  lines.push("");

  // ── Semantic Classification ─────────────────────────────────────────────
  // These metrics describe how well the classifier can assign topics/concepts.
  lines.push("## Semantic Classification");
  lines.push("");
  const confCounts = { HIGH: 0, MEDIUM: 0, LOW: 0, AMBIGUOUS: 0 };
  for (const c of classifications) confCounts[c.confidence]++;
  lines.push(`| Confidence | Count | % |`);
  lines.push(`|------------|-------|---|`);
  for (const [conf, count] of Object.entries(confCounts)) {
    lines.push(`| ${conf} | ${count} | ${(count / pack.questions.length * 100).toFixed(1)}% |`);
  }
  lines.push(`| **Manual review required** | **${confCounts.LOW + confCounts.AMBIGUOUS}** | **${((confCounts.LOW + confCounts.AMBIGUOUS) / pack.questions.length * 100).toFixed(1)}% |`);
  lines.push("");

  const lowConf = classifications.filter((c) => c.confidence === "LOW");
  if (lowConf.length > 0) {
    lines.push("### LOW Confidence Breakdown");
    lines.push("");
    lines.push(`${lowConf.length} question records are classified LOW confidence. See \`docs/LOW_CONFIDENCE_REVIEW.md\` for full audit.`);
    lines.push("");
    const lowByTopic = new Map();
    for (const c of lowConf) {
      const key = c.proposedTopic;
      if (!lowByTopic.has(key)) lowByTopic.set(key, []);
      lowByTopic.get(key).push(c);
    }
    lines.push(`| Proposed Topic | LOW Count |`);
    lines.push(`|----------------|-----------|`);
    for (const [topic, qs] of [...lowByTopic.entries()].sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`| ${topic} | ${qs.length} |`);
    }
    lines.push("");
  }

  // ── Duplicate Analysis ──────────────────────────────────────────────────
  lines.push("## Duplicate Analysis");
  lines.push("");
  const dupTypes = {};
  for (const g of dupGroups) dupTypes[g.type] = (dupTypes[g.type] ?? 0) + 1;
  lines.push(`| Type | Groups | Question Records |`);
  lines.push(`|------|--------|------------------|`);
  for (const [type, count] of Object.entries(dupTypes).sort((a, b) => b[1] - a[1])) {
    const totalQ = dupGroups.filter((g) => g.type === type).reduce((s, g) => s + g.count, 0);
    lines.push(`| ${type} | ${count} | ${totalQ} |`);
  }
  lines.push("");

  // Same-stem/different-answer groups with image validation
  const sameStemDiffAnswer = dupGroups.filter((g) => g.type === "LIKELY_LEGITIMATE_SAME_STEM_VARIANT" || g.type === "POSSIBLE_CONTENT_ERROR");
  if (sameStemDiffAnswer.length > 0) {
    lines.push("## Same-Stem/Different-Answer Validation");
    lines.push("");
    lines.push(`| Type | Stem (first 60 chars) | QIDs | Image Validation |`);
    lines.push(`|------|----------------------|------|------------------|`);
    for (const g of sameStemDiffAnswer.slice(0, 30)) {
      lines.push(`| ${g.type} | ${g.stem.substring(0, 60)}... | ${g.qids.length} qids | ${g.imageValidation || "N/A"} |`);
    }
    if (sameStemDiffAnswer.length > 30) {
      lines.push(`| ... | ... | ... | (${sameStemDiffAnswer.length - 30} more groups) |`);
    }
    lines.push("");
  }

  // ── Proposed Topic Distribution ─────────────────────────────────────────
  lines.push("## Proposed Topic Distribution");
  lines.push("");
  const proposedTopicCounts = new Map();
  for (const c of classifications) {
    proposedTopicCounts.set(c.proposedTopic, (proposedTopicCounts.get(c.proposedTopic) ?? 0) + 1);
  }
  lines.push(`| Topic | Count | % |`);
  lines.push(`|-------|-------|---|`);
  for (const t of PROPOSED_TOPICS) {
    const count = proposedTopicCounts.get(t.id) ?? 0;
    lines.push(`| ${t.id} | ${count} | ${(count / pack.questions.length * 100).toFixed(1)}% |`);
  }
  lines.push("");

  // ── Proposed Concept Distribution ───────────────────────────────────────
  lines.push("## Proposed Concept Distribution");
  lines.push("");
  const conceptCounts = new Map();
  for (const c of classifications) {
    conceptCounts.set(c.proposedConcept, (conceptCounts.get(c.proposedConcept) ?? 0) + 1);
  }
  lines.push(`| Concept | Count | % |`);
  lines.push(`|---------|-------|---|`);
  for (const [concept, count] of [...conceptCounts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${concept} | ${count} | ${(count / pack.questions.length * 100).toFixed(1)}% |`);
  }
  lines.push("");

  // ── Safety Checks ───────────────────────────────────────────────────────
  lines.push("## Safety Checks");
  lines.push("");
  lines.push(`| Check | Status |`);
  lines.push(`|-------|--------|`);
  lines.push(`| QID count preserved | PENDING (D3 will verify) |`);
  lines.push(`| QID set preserved | PENDING (D3 will verify) |`);
  lines.push(`| Stems unchanged | PENDING (D3 will verify) |`);
  lines.push(`| Options unchanged | PENDING (D3 will verify) |`);
  lines.push(`| CorrectIndexes unchanged | PENDING (D3 will verify) |`);
  lines.push(`| ImageRef unchanged | PENDING (D3 will verify) |`);
  lines.push(`| Explanation unchanged | PENDING (D3 will verify) |`);
  lines.push(`| Status unchanged | PENDING (D3 will verify) |`);
  lines.push("");

  lines.push("*This report is generated by D2 tooling. Safety checks will be verified during D3 migration.*");

  return lines.join("\n");
}

// ─── LOW Confidence Review Generator ─────────────────────────────────────────

function generateLowConfidenceReview(pack, classifications, dupGroups) {
  const lowConf = classifications.filter((c) => c.confidence === "LOW");

  function semanticFamily(q) {
    const stem = q.stem.toLowerCase();
    if (/line|marking|lane|carriageway|diverging|direction arrow/i.test(stem)) return "road-markings";
    if (/sign|one way|one-way/i.test(stem)) return "road-signs";
    if (/age|minimum age|licence|license|omnibus|taxi.*driver|vehicle.*class/i.test(stem)) return "vehicle-classes";
    if (/rail|railway|train|level crossing|booms/i.test(stem)) return "railway-crossing";
    if (/light|lamp|beam|dazzle|reflector|headlamp/i.test(stem)) return "lighting";
    if (/park|stop.*road|stopping|intend to stop/i.test(stem)) return "parking";
    if (/overtake|overtaking|passing/i.test(stem)) return "overtaking";
    if (/speed|km\/h|slow|fast/i.test(stem)) return "speed";
    if (/pedestrian|cyclist|motorcycle|bike/i.test(stem)) return "pedestrian-cyclist";
    if (/tow|trailer|load|cargo/i.test(stem)) return "towing-load";
    if (/accident|emergency/i.test(stem)) return "accident";
    if (/which statement/i.test(stem)) return "statement";
    if (/must|should|shall|prohibited/i.test(stem)) return "general-driving-rule";
    return "genuinely-unclassifiable";
  }

  const byFamily = new Map();
  for (const c of lowConf) {
    const q = pack.questions.find((q) => q.qid === c.qid);
    const family = semanticFamily(q);
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push({ ...c, q, family });
  }

  const lines = [];
  lines.push("# LOW Confidence Classification Review");
  lines.push("");
  lines.push("> **Generated by:** `tools/zivvvo/classify-content.mjs`");
  lines.push("> **Date:** " + new Date().toISOString().split("T")[0]);
  lines.push(`> **Total LOW confidence:** ${lowConf.length} question records`);
  lines.push("");
  lines.push("---");
  lines.push("");

  lines.push("## Summary by Semantic Family");
  lines.push("");
  lines.push(`| Family | Count | Classification Note |`);
  lines.push(`|--------|-------|---------------------|`);
  const familyOrder = [
    "road-markings", "road-signs", "vehicle-classes", "lighting",
    "parking", "junction", "overtaking", "pedestrian-cyclist",
    "general-driving-rule", "statement", "genuinely-unclassifiable",
  ];
  for (const family of familyOrder) {
    const qs = byFamily.get(family);
    if (!qs || qs.length === 0) continue;
    const note =
      family === "genuinely-unclassifiable" ? "Cannot classify from stem alone — manual review required" :
      family === "statement" ? "Needs option text to determine topic — manual review required" :
      "Pattern exists but confidence LOW — verify during content review";
    lines.push(`| ${family} | ${qs.length} | ${note} |`);
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## Per-Question Detail");
  lines.push("");

  for (const family of familyOrder) {
    const qs = byFamily.get(family);
    if (!qs || qs.length === 0) continue;

    lines.push(`### ${family} (${qs.length} question records)`);
    lines.push("");
    lines.push(`| QID | Current Topic | Current Concept | Proposed Topic | Proposed Concept | Reason | Recommended Action |`);
    lines.push(`|-----|---------------|-----------------|----------------|------------------|--------|-------------------|`);

    for (const c of qs) {
      const action =
        family === "genuinely-unclassifiable" ? "Manual review" :
        family === "statement" ? "Review options" :
        "Verify during content review";
      lines.push(
        `| ${c.qid} | ${c.q.topicId} | ${c.q.concept ?? "(null)"} | ${c.proposedTopic} | ${c.proposedConcept} | ${c.reason} | ${action} |`
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Recommended Next Steps");
  lines.push("");
  lines.push("1. **Road markings:** Review stems for correct topic assignment. Most appear classifiable to `road-markings`.");
  lines.push("2. **Vehicle classes:** Review age/licence questions. Most appear classifiable to `vehicle-classes`.");
  lines.push("3. **Road signs:** Review sign-related questions without images. Most appear classifiable to `road-signs`.");
  lines.push("4. **Lighting:** Review light/beam questions. Most appear classifiable to `night-driving` or `vehicle-equipment`.");
  lines.push("5. **Statement questions:** Need option text to classify. Consider reading explanations for topic hints.");
  lines.push("6. **Genuinely unclassifiable:** Accept as `general-rules` — these are edge cases that may need human judgment.");
  lines.push("");
  lines.push("*This review is for D3 content migration planning. Do not modify questions based on this review alone.*");

  return lines.join("\n");
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log("D2 Content Classification & Validation Pipeline");
  console.log("================================================\n");

  const raw = readFileSync(CONTENT_PATH, "utf8");
  const pack = JSON.parse(raw);
  console.log(`Loaded ${pack.questions.length} question records from ${pack.topics.length} topics\n`);

  console.log("Running structural validation...");
  const issues = validateContent(pack);
  console.log(`  Found ${issues.length} issues (${issues.filter((i) => i.severity === "ERROR").length} errors, ${issues.filter((i) => i.severity === "WARNING").length} warnings)\n`);

  console.log("Classifying question records...");
  const classifications = pack.questions.map((q) => {
    const proposed = classifyTopic(q);
    return {
      qid: q.qid,
      currentTopic: q.topicId,
      currentConcept: q.concept,
      proposedTopic: proposed.topic,
      proposedConcept: proposed.concept,
      confidence: proposed.confidence,
      reason: proposed.reason,
    };
  });

  const confCounts = { HIGH: 0, MEDIUM: 0, LOW: 0, AMBIGUOUS: 0 };
  for (const c of classifications) confCounts[c.confidence]++;
  console.log(`  HIGH: ${confCounts.HIGH} | MEDIUM: ${confCounts.MEDIUM} | LOW: ${confCounts.LOW} | AMBIGUOUS: ${confCounts.AMBIGUOUS}\n`);

  console.log("Detecting duplicates...");
  const dupGroups = classifyDuplicates(pack.questions);
  const dupTypes = {};
  for (const g of dupGroups) dupTypes[g.type] = (dupTypes[g.type] ?? 0) + 1;
  console.log(`  Found ${dupGroups.length} duplicate groups:`);
  for (const [type, count] of Object.entries(dupTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }
  console.log();

  mkdirSync(DOCS_DIR, { recursive: true });

  console.log("Generating CONTENT_MIGRATION_PREVIEW.md...");
  const preview = generateMigrationPreview(pack, classifications, dupGroups);
  writeFileSync(join(DOCS_DIR, "CONTENT_MIGRATION_PREVIEW.md"), preview);
  console.log("  Done\n");

  console.log("Generating CONTENT_VALIDATION_REPORT.md...");
  const report = generateValidationReport(pack, classifications, dupGroups, issues);
  writeFileSync(join(DOCS_DIR, "CONTENT_VALIDATION_REPORT.md"), report);
  console.log("  Done\n");

  console.log("Generating LOW_CONFIDENCE_REVIEW.md...");
  const review = generateLowConfidenceReview(pack, classifications, dupGroups);
  writeFileSync(join(DOCS_DIR, "LOW_CONFIDENCE_REVIEW.md"), review);
  console.log("  Done\n");

  console.log("=== D2 COMPLETE ===");
  console.log(`Question records: ${pack.questions.length}`);
  console.log(`Classified: HIGH=${confCounts.HIGH} MEDIUM=${confCounts.MEDIUM} LOW=${confCounts.LOW} AMBIGUOUS=${confCounts.AMBIGUOUS}`);
  console.log(`Duplicate groups: ${dupGroups.length}`);
  console.log(`Structural issues: ${issues.length}`);
  console.log(`\nReports written to:`);
  console.log(`  docs/CONTENT_MIGRATION_PREVIEW.md`);
  console.log(`  docs/CONTENT_VALIDATION_REPORT.md`);
  console.log(`  docs/LOW_CONFIDENCE_REVIEW.md`);
  console.log(`\nSTOP: Awaiting D3 approval before modifying content-v1.json.`);
}

// Run main only when executed directly (not when imported)
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith("classify-content.mjs") ||
  process.argv[1].endsWith("classify-content.js")
);
if (isMainModule) {
  main();
}

export { classifyTopic, classifyDuplicates, QID_OVERRIDES, PROPOSED_TOPICS, PROPOSED_CONCEPTS };
