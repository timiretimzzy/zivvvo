# Zivvvo Content Classification Analysis

> **Date:** 2026-09-16 | **Status:** D1 analysis (not yet implemented)
> **Purpose:** Analyze current content state and propose classification changes.
> **Depends on:** CONTENT_TAXONOMY.md, CURRENT_PRODUCT_AUDIT.md

---

## 1. Current State

| Metric | Value |
|--------|-------|
| Total questions | 1,396 |
| Topics (current) | 8 |
| Concepts (current) | 23 (22 meaningful + 1 "other") |
| Unique stems | 462 (934 are variants/duplicates) |
| Questions with null concept | 443 (31.7%) |
| Questions with "other" concept | 387 (27.7%) |
| Questions with null difficulty | 1,179 (84.5%) |
| Questions with null imageRef | 950 (68.1%) |
| Questions with empty explanation | 250 (17.9%) |
| Questions with status "answered" | 1,136 (81.4%) |
| Duplicate QIDs | 0 |
| Same-stem/different-answer pairs | 31 stems (331 questions) |

### Current Topic Distribution

| Topic | Count | % | Status |
|-------|-------|---|--------|
| `general` | 990 | 70.9% | **Must be eliminated** |
| `regulations` | 214 | 15.3% | **Must be reclassified** |
| `road-signs` | 77 | 5.5% | Keep, expand |
| `junction-rules` | 60 | 4.3% | Keep, expand |
| `carriageway-lines` | 30 | 2.1% | Rename → `road-markings` |
| `vehicle-classes` | 13 | 0.9% | Keep |
| `traffic-lights` | 11 | 0.8% | Keep |
| `confusing-pair` | 1 | 0.1% | **Merge into appropriate topic** |

### Current Concept Distribution

| Concept | Count | % | Status |
|---------|-------|---|--------|
| (null) | 443 | 31.7% | **Must be eliminated** |
| `other` | 387 | 27.7% | **Must be eliminated** |
| `lines` | 76 | 5.4% | Keep, rename → `marking-identification` / `marking-rule` |
| `robot` | 70 | 5.0% | Keep, rename → `signal-sequence` / `signal-behaviour` |
| `roadcraft` | 66 | 4.7% | Keep |
| `cycles` | 51 | 3.7% | Keep, rename → `cyclist-rule` / `motorcycle-rule` |
| `speed` | 46 | 3.3% | Keep, rename → `speed-limit` / `speed-rule` |
| `lights` | 38 | 2.7% | Keep, rename → `lighting-rule` |
| `age` | 34 | 2.4% | Keep, rename → `licence-requirement` |
| `parking` | 30 | 2.1% | Keep, rename → `parking-rule` / `parking-restriction` |
| `accident` | 23 | 1.6% | Keep, rename → `accident-procedure` |
| `lplate` | 22 | 1.6% | Keep, rename → `learner-rule` |
| `towing` | 22 | 1.6% | Keep, rename → `towing-rule` |
| `overtaking` | 22 | 1.6% | Keep, rename → `overtaking-rule` / `overtaking-prohibition` |
| `load` | 18 | 1.3% | Keep, rename → `load-rule` |
| `pedestrian` | 16 | 1.1% | Keep, rename → `pedestrian-rule` |
| `horn` | 13 | 0.9% | Keep, rename → `equipment-rule` |
| `alcohol` | 8 | 0.6% | Keep, rename → `alcohol-rule` |
| `distance` | 3 | 0.2% | Keep, merge into `speed-rule` |
| `insurance` | 3 | 0.2% | Keep, rename → `insurance-rule` |
| `junction` | 2 | 0.1% | Keep, rename → `intersection-behaviour` |
| `motorcycle` | 1 | 0.1% | Keep, merge into `motorcycle-rule` |
| `road-markings` | 1 | 0.1% | Keep, merge into `marking-identification` |
| `rail-crossing` | 1 | 0.1% | Keep, merge into `sign-action` |

---

## 2. Proposed State

### 2.1 Proposed Topics (15)

| Topic ID | Label | Parent Category | Est. Count |
|----------|-------|-----------------|------------|
| `road-signs` | Road Signs & Signals | Road Knowledge | ~350 |
| `road-markings` | Road Markings & Lines | Road Knowledge | ~50 |
| `junction-rules` | Junctions & Right of Way | Traffic Rules | ~220 |
| `traffic-lights` | Traffic Lights & Robots | Traffic Rules | ~70 |
| `speed-limits` | Speed Limits & Restrictions | Traffic Rules | ~60 |
| `overtaking` | Overtaking Rules | Traffic Rules | ~45 |
| `parking` | Parking Regulations | Traffic Rules | ~40 |
| `pedestrian-safety` | Pedestrian & Cyclist Safety | Safety & Responsibility | ~85 |
| `vehicle-equipment` | Vehicle Equipment & Lighting | Vehicle & Equipment | ~70 |
| `vehicle-classes` | Licensing & Vehicle Classes | Vehicle & Equipment | ~35 |
| `towing-loads` | Towing & Load Regulations | Vehicle & Equipment | ~50 |
| `accident-procedures` | Accident & Emergency Procedures | Safety & Responsibility | ~35 |
| `alcohol-drugs` | Alcohol, Drugs & Fitness | Safety & Responsibility | ~20 |
| `night-driving` | Night & Adverse Weather Driving | Safety & Responsibility | ~40 |
| `general-rules` | General Road Rules & Roadcraft | Traffic Rules | ~225 |

**Note:** Counts are estimates based on classification analysis. Actual counts will be determined during D3 remapping.

### 2.2 Proposed Concepts (36)

See CONTENT_TAXONOMY.md §3.2 for full list.

---

## 3. General Topic Decomposition (990 questions)

### 3.1 High-Confidence Classifications (605 questions, 61.1%)

| Proposed Topic | Count | Reasoning |
|----------------|-------|-----------|
| `junction-rules` | 158 | Intersection diagrams, right-of-way questions with images |
| `road-signs` | 150 | Road sign questions with images ("This sign means...") |
| `traffic-lights` | 51 | Robot/traffic light questions |
| `speed-limits` | 42 | Speed-related questions |
| `cycles-motorcycles` → `pedestrian-safety` | 37 | Cycle/motorcycle questions |
| `towing-loads` | 30 | Towing and load questions |
| `night-driving` | 28 | Night driving and lighting questions |
| `parking` | 21 | Parking questions |
| `overtaking` | 21 | Overtaking questions |
| `pedestrian-safety` | 17 | Pedestrian crossing questions |
| `accident-procedures` | 15 | Accident procedure questions |
| `road-markings` | 10 | Road marking questions |
| `vehicle-equipment` | 10 | Horn and equipment questions |
| `vehicle-classes` | 6 | Licensing questions |
| `safety-equipment` → `vehicle-equipment` | 5 | Seat belt questions |
| `alcohol-drugs` | 4 | Alcohol/drug questions |

### 3.2 Medium-Confidence Classifications (186 questions, 18.8%)

These questions have stems that suggest a topic but with some ambiguity:

- General road rule questions with "must"/"should"/"may" stems → `general-rules`
- Questions about bus behaviour → `general-rules` (PSV rules)
- Questions about weather driving → `night-driving`
- Questions about mobile phone use → `general-rules`
- Questions about vehicle sun visors → `vehicle-equipment`

### 3.3 Low-Confidence Classifications (199 questions, 20.1%)

These questions have vague or generic stems:

- "Which statement is appropriate?" / "Which statement is true?" — need context from options
- "During rainy weather" — could be `night-driving` or `general-rules`
- "A car sun visor provides a shield against" — `vehicle-equipment`
- Road marking questions without images → `road-markings`
- Questions about give-way signs → `road-signs` or `junction-rules`

**Strategy:** Classify to `general-rules` with `confidence: LOW`. Do not force into specific topics when uncertain.

### 3.4 Questions Moving from `regulations` (214 questions)

The `regulations` topic (214 questions) should be reclassified into specific topics:

| Proposed Topic | Est. Count | Reasoning |
|----------------|------------|-----------|
| `general-rules` | ~102 | Questions with "other" concept in regulations |
| `pedestrian-safety` | ~18 | Cycle and pedestrian questions |
| `speed-limits` | ~15 | Speed questions |
| `vehicle-equipment` | ~15 | Lighting and equipment questions |
| `parking` | ~8 | Parking questions |
| `traffic-lights` | ~8 | Robot questions |
| `road-signs` | ~8 | Roadcraft/sign questions |
| `vehicle-classes` | ~8 | Age and licensing questions |
| `overtaking` | ~6 | Overtaking questions |
| `towing-loads` | ~10 | Towing and load questions |
| `accident-procedures` | ~6 | Accident questions |
| Other | ~10 | Distributed across remaining topics |

### 3.5 `confusing-pair` (1 question)

The single question in `confusing-pair` should be classified into its appropriate topic based on content.

---

## 4. Topic Mapping (Old → New)

| Old Topic | New Topic | Questions | Notes |
|-----------|-----------|-----------|-------|
| `vehicle-classes` | `vehicle-classes` | 13 | Keep |
| `carriageway-lines` | `road-markings` | 30 | Rename |
| `junction-rules` | `junction-rules` | 60 + ~158 from general | Expand |
| `general` | (distributed) | 990 | **Eliminated** |
| `road-signs` | `road-signs` | 77 + ~150 from general | Expand |
| `regulations` | (distributed) | 214 | **Eliminated** |
| `traffic-lights` | `traffic-lights` | 11 + ~51 from general | Expand |
| `confusing-pair` | (appropriate topic) | 1 | Merge |

---

## 5. Concept Mapping (Old → New)

| Old Concept | New Concept | Questions | Notes |
|-------------|-------------|-----------|-------|
| `lines` | `marking-identification` / `marking-rule` | 76 | Split by question type |
| `robot` | `signal-sequence` / `signal-behaviour` | 70 | Split by question type |
| `roadcraft` | `roadcraft` | 66 | Keep |
| `cycles` | `cyclist-rule` / `motorcycle-rule` | 51 | Split |
| `speed` | `speed-limit` / `speed-rule` | 46 | Split |
| `lights` | `lighting-rule` | 38 | Keep |
| `age` | `licence-requirement` | 34 | Rename |
| `parking` | `parking-rule` / `parking-restriction` | 30 | Split |
| `accident` | `accident-procedure` | 23 | Rename |
| `lplate` | `learner-rule` | 22 | Rename |
| `towing` | `towing-rule` | 22 | Rename |
| `overtaking` | `overtaking-rule` / `overtaking-prohibition` | 22 | Split |
| `load` | `load-rule` | 18 | Rename |
| `pedestrian` | `pedestrian-rule` | 16 | Rename |
| `horn` | `equipment-rule` | 13 | Merge into equipment |
| `alcohol` | `alcohol-rule` | 8 | Rename |
| `distance` | `speed-rule` | 3 | Merge into speed |
| `insurance` | `insurance-rule` | 3 | Rename |
| `junction` | `intersection-behaviour` | 2 | Rename |
| `motorcycle` | `motorcycle-rule` | 1 | Merge into cycles |
| `road-markings` | `marking-identification` | 1 | Merge into lines |
| `rail-crossing` | `sign-action` | 1 | Merge into sign |
| `other` | (distributed) | 387 | **Eliminated** |
| (null) | (distributed) | 443 | **Eliminated** |

---

## 6. Confidence Summary

| Confidence | Count | % | Action |
|------------|-------|---|--------|
| HIGH | 605 | 61.1% | Classify directly |
| MEDIUM | 186 | 18.8% | Classify with best match |
| LOW | 199 | 20.1% | Classify to `general-rules` |
| AMBIGUOUS | ~31 | 3.1% | Flag for manual review (same-stem/different-answer) |

---

## 7. Duplicate Analysis

| Type | Stems | Questions | Action |
|------|-------|-----------|--------|
| Exact duplicate | 15 | 45 | Keep one per topic, mark others |
| Useful variant | 240 | 797 | Keep all (different topics/concepts) |
| Image/context variant | 9 | 56 | Keep all (different images = different questions) |
| Same stem, different answer | 31 | 331 | Keep all (genuinely different questions) |
| **Total duplicate groups** | **295** | **1,229** | |

**Unique questions (non-duplicate):** 167

### Same-Stem/Different-Answer Analysis (31 stems)

These 31 stems have multiple QIDs with different correct answers. Examples:

- "A broken yellow line on the left hand side of the road indicates:" — 7 QIDs, 3 different correct answers
- "Which car moves second at this intersection?" — 6 QIDs, different answers (intersection diagrams with different layouts)
- "Which car goes first?" — 15 QIDs, different answers (multiple intersection scenarios)

**These are NOT errors.** They are legitimate question variants where the same stem appears with different intersection diagrams (images) or different answer options. Each QID represents a distinct question.

---

## 8. Learning Engine Impact

### 8.1 Systems That Consume `topicId` (NO CHANGES NEEDED)

| System | File | How It Uses TopicId |
|--------|------|---------------------|
| `masteryBy()` | `learning-engine/src/mastery.ts` | Groups attempts by `questionTopic(qid)` |
| `weaknesses()` | `apps/web/src/engine.ts` | Iterates `pack.topics.filter(x => x.kind === "content")` |
| `getNextBestActivity()` | `learning-engine/src/recommend.ts` | Uses `catalog.contentTopics()` and `catalog.questionTopic()` |
| `buildPlan()` | `learning-engine/src/planner.ts` | Uses `PlanTopic[]` with topic mastery |
| `buildDiagnostic()` | `assessment-engine/src/diagnostic.ts` | Groups by `topicId` |
| `buildMockSession()` | `assessment-engine/src/sessions.ts` | Balances across `contentTopics()` |
| `buildWeaknessSession()` | `assessment-engine/src/sessions.ts` | Filters by `topicId` |
| `mockReview()` | `assessment-engine/src/mock.ts` | Groups by `topicId` |
| `computeReadiness()` | `assessment-engine/src/readiness.ts` | Per-topic readiness scoring |
| `summarizeSession()` | `assessment-engine/src/summaries.ts` | Per-topic summary |
| `topicMastery()` | `apps/web/src/engine.ts` | Maps mastery to topic labels |
| `catalog` adapter | `apps/web/src/catalog.ts` | `questionTopic()` returns `topicId` |

**All of these continue to work unchanged** because the new topics are still valid `topicId` values in the topics array. The learning engine does not hardcode specific topic IDs.

### 8.2 Systems That Consume `concept` (MINIMAL CHANGES)

| System | File | How It Uses Concept |
|--------|------|---------------------|
| `mockReview()` | `assessment-engine/src/mock.ts` | Lists missed concepts in `biggestRisk.concepts` |
| `questionsByConcept()` | `packages/content/src/index.ts` | Filters questions by concept |
| UI display | Various | Shows concept name in progress/coach views |

**These continue to work** because concepts are just strings. New concept names are still valid strings.

### 8.3 Where Concept-Level Intelligence Should Be Added (FUTURE)

| Feature | Current State | Proposed Addition |
|---------|---------------|-------------------|
| Concept mastery | Not computed | Add `conceptMastery()` using same `masteryBy()` pattern |
| Concept weakness | Not detected | Add `detectConceptWeakness()` using same `detectWeakness()` pattern |
| Same-concept recovery | Not implemented | After wrong answer, inject same-concept question |
| Concept progress UI | Not shown | Add concept breakdown to Progress page |
| Post-mock concept diagnosis | Partial (only in `biggestRisk`) | Expand to full concept-level breakdown |
| Coach concept context | Not used | Pass concept data to AI coach prompts |

---

## 9. Data-Model Decision

### Current Schema

```typescript
concept: string | null;
```

### Proposed Schema (D1)

```typescript
concept: string;  // non-null, from curated list
```

**No new fields needed for D1.** The existing `concept` field is sufficient.

### Future Consideration

If multi-concept analysis is needed later:

```typescript
concept: string;              // primary concept (required)
relatedConcepts?: string[];   // secondary concepts (optional, additive)
```

This is backward-compatible — existing code reads `concept` and ignores `relatedConcepts`.

---

## 10. Exceptions Requiring Manual Review

### 10.1 Same-Stem/Different-Answer Questions (31 stems)

These need individual review to confirm they are legitimate variants, not content errors.

### 10.2 Low-Confidence Classifications (199 questions)

These questions have vague stems and may need human judgment to classify correctly.

### 10.3 The "Screenshot" Question

QID `50189` has stem: "Lastly, it's important to take and keep screenshots of all your wrong responses. You do this during the 'Review' stage..."

This appears to be a meta-question about the app itself, not a VID exam question. Should be flagged for removal or reclassification.

---

*This analysis is the basis for D2/D3 content migration. Do not proceed to bulk remapping until this document is reviewed and approved.*
