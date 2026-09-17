# Zivvvo Content Taxonomy

> **Date:** 2026-09-16 | **Status:** D1 proposal (not yet implemented)
> **Purpose:** Define the knowledge hierarchy for all Zivvvo content.
> **Rule:** Classification belongs in the content data, not in application code.

---

## 1. Architecture

```
Knowledge Domain
    ↓
Topic          ← learning engine (mastery, weakness, recommendation, planning)
    ↓
Concept        ← intelligence layer (diagnosis, mistakes, recovery, coaching)
    ↓
Question       ← individual assessment items
```

**Topics** provide the stable learning structure. They are the unit of:
- Mastery calculation
- Weakness detection
- Recommendation dispatch
- Study planning
- Session selection (topic filter)
- Mock coverage reporting
- Progress display

**Concepts** provide precision underneath topics. They are the unit of:
- Fine-grained diagnosis ("you're weak on *overtaking rules*, not just *road rules*")
- Mistake grouping in the Mistake Book
- Same-concept recovery (after wrong answer, inject same-concept question)
- Targeted practice selection
- Detailed progress breakdown
- Coach explanations
- Post-mock diagnosis
- Future adaptive learning

---

## 2. Topic Hierarchy

### 2.1 Parent Categories (organizational only, not stored in data)

| Parent Category | Description |
|-----------------|-------------|
| **Road Knowledge** | Signs, markings, signals — what the road tells you |
| **Traffic Rules** | How to behave on the road — overtaking, speed, parking, junctions |
| **Vehicle & Equipment** | The machine itself — classes, licensing, equipment, towing |
| **Safety & Responsibility** | Protecting yourself and others — pedestrians, accidents, alcohol, night driving |

### 2.2 Topics

| Topic ID | Label | Parent Category | Description |
|----------|-------|-----------------|-------------|
| `road-signs` | Road Signs & Signals | Road Knowledge | Regulatory, warning, mandatory, and informational signs |
| `road-markings` | Road Markings & Lines | Road Knowledge | Lane lines, arrows, hatching, road surface markings |
| `junction-rules` | Junctions & Right of Way | Traffic Rules | Intersections, roundabouts, give-way rules, right-of-way |
| `traffic-lights` | Traffic Lights & Robots | Traffic Rules | Signal sequences, meanings, emergency vehicle rules |
| `speed-limits` | Speed Limits & Restrictions | Traffic Rules | Urban/rural limits, zone signs, speed-related rules |
| `overtaking` | Overtaking Rules | Traffic Rules | When/how to overtake, prohibited zones, mirror checks |
| `parking` | Parking Regulations | Traffic Rules | Where/when to park, restrictions, nighttime rules |
| `pedestrian-safety` | Pedestrian & Cyclist Safety | Safety & Responsibility | Crossings, cyclist rules, motorcycle-specific rules |
| `vehicle-equipment` | Vehicle Equipment & Lighting | Vehicle & Equipment | Horns, lights, mirrors, seat belts, sun visors, wipers |
| `vehicle-classes` | Licensing & Vehicle Classes | Vehicle & Equipment | Licence codes, age requirements, learner rules, insurance |
| `towing-loads` | Towing & Load Regulations | Vehicle & Equipment | Trailer rules, load limits, abnormal loads, fire extinguishers |
| `accident-procedures` | Accident & Emergency Procedures | Safety & Responsibility | What to do after an accident, emergency numbers, first response |
| `alcohol-drugs` | Alcohol, Drugs & Fitness | Safety & Responsibility | Impairment rules, medical certificates, fitness to drive |
| `night-driving` | Night & Adverse Weather Driving | Safety & Responsibility | Headlights, fog, rain, visibility, reflective plates |
| `general-rules` | General Road Rules & Roadcraft | Traffic Rules | Broad driving rules, roadcraft, defensive driving, bus/PSV rules |

**Total: 15 topics** (up from 8, with `general` eliminated)

### 2.3 Topic Rules

1. **A topic must represent a meaningful, distinguishable area of learner knowledge.**
2. **Question count is an output, not a target.** A topic with 5 legitimate questions is valid if the knowledge area is real.
3. **No topic shall be named "general" or "other".** If a question cannot be classified, it goes to `general-rules` with `confidence: LOW`.
4. **The `kind` field remains `"content"` for all topics.** The `"mixed"` kind is reserved for practice/mock-only buckets and should not be used for new topics.

---

## 3. Concept Definitions

### 3.1 Concept Rules

1. **Every question has exactly one primary `concept`.**
2. **Concepts are strings** drawn from a curated list (no free-text).
3. **Concepts are scoped within topics** but not unique to them — the same concept can appear in multiple topics (e.g., "right-of-way" in `junction-rules` and `pedestrian-safety`).
4. **The `other` concept is eliminated.** Every question gets a meaningful concept.
5. **Null concepts are eliminated.** Every question gets a concept.

### 3.2 Concept List

| Concept ID | Label | Typical Topics | Description |
|------------|-------|----------------|-------------|
| `sign-recognition` | Sign Recognition | `road-signs` | Identifying what a sign means |
| `sign-meaning` | Sign Meaning | `road-signs` | Understanding the implication of a sign |
| `sign-action` | Sign Action | `road-signs` | Knowing what to do when you see a sign |
| `marking-identification` | Marking Identification | `road-markings` | Identifying what a road marking means |
| `marking-rule` | Marking Rule | `road-markings` | Rules associated with road markings |
| `right-of-way` | Right of Way | `junction-rules`, `pedestrian-safety` | Who goes first at intersections/crossings |
| `intersection-behaviour` | Intersection Behaviour | `junction-rules` | What to do at junctions (turning, merging, give-way) |
| `roundabout` | Roundabouts | `junction-rules` | Roundabout-specific rules |
| `signal-sequence` | Signal Sequence | `traffic-lights` | Understanding robot/light sequences |
| `signal-behaviour` | Signal Behaviour | `traffic-lights` | What to do when lights change |
| `speed-limit` | Speed Limits | `speed-limits` | Knowing the legal limits |
| `speed-rule` | Speed Rules | `speed-limits` | Rules about appropriate speed |
| `overtaking-rule` | Overtaking Rules | `overtaking` | When/how to overtake safely |
| `overtaking-prohibition` | Overtaking Prohibition | `overtaking` | When overtaking is forbidden |
| `parking-rule` | Parking Rules | `parking` | Where/when to park legally |
| `parking-restriction` | Parking Restrictions | `parking` | When parking is prohibited |
| `pedestrian-rule` | Pedestrian Rules | `pedestrian-safety` | Rules about pedestrian crossings and safety |
| `cyclist-rule` | Cyclist Rules | `pedestrian-safety` | Rules about pedal cyclists |
| `motorcycle-rule` | Motorcycle Rules | `pedestrian-safety` | Motorcycle-specific rules |
| `equipment-rule` | Equipment Rules | `vehicle-equipment` | Required equipment (horns, lights, mirrors) |
| `lighting-rule` | Lighting Rules | `vehicle-equipment`, `night-driving` | When/how to use vehicle lights |
| `seatbelt-rule` | Seat Belt Rules | `vehicle-equipment` | Seat belt requirements and exemptions |
| `licence-class` | Licence Classes | `vehicle-classes` | Understanding licence codes and vehicle classes |
| `licence-requirement` | Licence Requirements | `vehicle-classes` | Age, medical, and other licence requirements |
| `learner-rule` | Learner Rules | `vehicle-classes` | Rules specific to learner drivers |
| `towing-rule` | Towing Rules | `towing-loads` | Trailer and towing regulations |
| `load-rule` | Load Rules | `towing-loads` | Cargo, abnormal loads, fire extinguishers |
| `accident-procedure` | Accident Procedures | `accident-procedures` | What to do after an accident |
| `emergency-response` | Emergency Response | `accident-procedures` | Emergency numbers, first aid, scene management |
| `alcohol-rule` | Alcohol Rules | `alcohol-drugs` | Drink-driving limits and rules |
| `drug-rule` | Drug Rules | `alcohol-drugs` | Drug impairment rules |
| `fitness-to-drive` | Fitness to Drive | `alcohol-drugs`, `vehicle-classes` | Medical certificates, fatigue, fitness |
| `night-rule` | Night Driving Rules | `night-driving` | Rules specific to nighttime driving |
| `weather-rule` | Weather Driving Rules | `night-driving` | Driving in rain, fog, adverse conditions |
| `defensive-driving` | Defensive Driving | `general-rules` | General safe driving practices |
| `roadcraft` | Roadcraft | `general-rules` | Vehicle positioning, mirror use, anticipation |
| `psv-rule` | PSV Rules | `general-rules` | Public service vehicle specific rules |
| `insurance-rule` | Insurance Rules | `vehicle-classes` | Insurance requirements |

**Total: 36 concepts** (up from 23, with `other` eliminated)

### 3.3 Concept Assignment Rules

1. **Primary concept:** Each question gets exactly one `concept` — the concept it most directly tests.
2. **No `relatedConcepts` field for now.** The learning engine operates at the topic level. Concept-level intelligence (diagnosis, recovery) uses the primary concept. If a question genuinely tests multiple concepts, assign the **most central** concept and note the secondary concept in the explanation if needed.
3. **Future consideration:** If post-mock diagnosis or Coach needs multi-concept analysis, add `relatedConcepts: string[]` as an additive field (backward-compatible).

---

## 4. Question Classification Rules

### 4.1 Topic Assignment

For each question, determine topic by examining:

1. **Image reference** — if present, what does the image depict? (sign, diagram, intersection)
2. **Stem content** — what knowledge is being tested?
3. **Options** — what do the answer choices reveal about the topic?
4. **Explanation** — if present, what does it explain?

### 4.2 Confidence Levels

| Level | Meaning | Action |
|-------|---------|--------|
| `HIGH` | Clear stem + clear topic match | Classify directly |
| `MEDIUM` | Stem suggests topic but some ambiguity | Classify with best match |
| `LOW` | Stem is vague or generic | Classify to `general-rules` |
| `AMBIGUOUS` | Question could legitimately belong to 2+ topics | Flag for manual review |

### 4.3 Image Questions

- **Road sign images** → `road-signs`
- **Intersection/traffic diagrams** → `junction-rules`
- **Road marking diagrams** → `road-markings`
- **Traffic light diagrams** → `traffic-lights`
- **Other images** → classify by stem content, not by image presence

### 4.4 Duplicate/Variant Questions

| Type | Definition | Action |
|------|-----------|--------|
| Exact duplicate | Same stem, same answer, same topic, same concept | Keep one, mark others as variants |
| Useful variant | Same stem, different topic/concept | Keep all — they test different knowledge areas |
| Image/context variant | Same stem, different image | Keep all — different images = different questions |
| Same stem, different answer | Same stem, different correct answer | Keep all — genuinely different questions |
| Possible content error | Same stem, contradictory answers | Flag for manual review |

### 4.5 Multi-Topic Questions

Some questions legitimately span topics. For example:
- "A broken yellow line near a pedestrian crossing" → could be `road-markings` or `pedestrian-safety`
- "Overtaking at a give-way sign" → could be `overtaking` or `road-signs`

**Rule:** Assign to the topic that the question **most directly tests**. If the question is about the line marking itself, assign to `road-markings`. If it's about the pedestrian safety implication, assign to `pedestrian-safety`.

---

## 5. Content Pack Schema

The `ContentPack` type in `packages/content/src/types.ts` requires:

```typescript
interface ContentPack {
  version: 1;
  exam: "zvid-provisional";
  topics: Topic[];      // ← 15 topics
  concepts: string[];   // ← 36 concepts
  questions: Question[];
  stats: { total, answered, withExplanation, withImage };
}
```

Each question:

```typescript
interface Question {
  qid: string;          // ← MUST remain stable (historical attempts reference this)
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  topicId: string;      // ← FK into topics array
  concept: string;      // ← from curated concept list (no null, no "other")
  difficulty: Difficulty | null;
  explanation: string;
  imageRef: string | null;
  status: CorrectnessStatus;
  correctIndexes: number[];
}
```

**Schema changes:** None required. The existing `concept: string | null` field becomes `concept: string` (non-null). No new fields needed for D1.

---

## 6. Validation Rules

A content pack is valid if:

1. Every question has a non-null `concept` from the curated concept list
2. Every question has a `topicId` from the topics array
3. Every topic's `count` matches the actual question count
4. Every `correctIndexes` entry is a valid index into `options`
5. Every answered question has `correctIndexes.length > 0`
6. No duplicate `qid` values
7. Every `concept` in the questions array exists in the `concepts` array
8. Stats match actual question data

---

*This taxonomy is the single source of truth for content classification. Update it when the knowledge model changes.*
