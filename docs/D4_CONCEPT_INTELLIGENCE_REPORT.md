# D4: Concept Intelligence Layer — Report

**Date**: 2026-09-17  
**Status**: PASS  
**Verification**: 258 tests pass, typecheck clean, production build pass

---

## Architecture

```
Content (1,396 questions)
    ↓
Question.qid → concept → topic
    ↓
AttemptEvent.qid → ConceptEvidence → ConceptMastery → ConceptWeakness
    ↓
Existing Intelligence Engines (mastery/SRS/recommend/planner)
    ↓
Concept Intelligence Layer (additive)
    ↓
Richer Learner State
```

### Dependency Flow

```
packages/content/src/index.ts        (concept catalog, qid→concept map, getFamilyId)
    ↓
packages/assessment-engine/src/concept.ts  (concept intelligence layer)
    ↓
Consumes: computeStat() from @zivvvo/learning-engine
Consumes: AttemptEvent[] from @zivvvo/assessment-engine
Consumes: ContentPack from @zivvvo/content
```

**No circular dependencies.** The concept layer lives in the assessment-engine, which already imports from both content and learning-engine.

---

## Concept Catalog

28 concepts derived from the migrated content. No manual mapping — all from `Question.concept`.

| Concept | Questions | Families | Topic |
|---------|-----------|----------|-------|
| sign-recognition | 234 | 46 | road-signs |
| right-of-way | 219 | 31 | junction-rules |
| roadcraft | 206 | 99 | general-rules |
| signal-sequence | 65 | 24 | traffic-lights |
| lighting-rule | 62 | 23 | night-driving |
| marking-identification | 56 | 22 | road-markings |
| speed-limit | 54 | 16 | speed-limits |
| marking-rule | 53 | 23 | road-markings |
| parking-rule | 52 | 15 | parking |
| cyclist-rule | 49 | 19 | pedestrian-safety |
| sign-meaning | 44 | 13 | road-signs |
| intersection-behaviour | 39 | 15 | junction-rules |
| equipment-rule | 36 | 14 | vehicle-equipment |
| overtaking-rule | 36 | 17 | overtaking |
| licence-class | 28 | 12 | vehicle-classes |
| accident-procedure | 26 | 11 | accident-procedures |
| towing-rule | 23 | 9 | towing-loads |
| licence-requirement | 18 | 10 | vehicle-classes |
| load-rule | 18 | 7 | towing-loads |
| seatbelt-rule | 15 | 7 | vehicle-equipment |
| sign-action | 14 | 8 | road-signs |
| weather-rule | 13 | 7 | night-driving |
| learner-rule | 11 | 5 | vehicle-classes |
| emergency-response | 8 | 4 | accident-procedures |
| fitness-to-drive | 6 | 1 | alcohol-drugs |
| alcohol-rule | 5 | 3 | alcohol-drugs |
| psv-rule | 3 | 1 | general-rules |
| motorcycle-rule | 3 | 1 | pedestrian-safety |

**Total: 1,396 questions mapped, 462 families covered, 28 concepts across 15 topics.**

---

## Topic → Concept Relationships

| Topic | Concepts |
|-------|----------|
| road-signs | sign-recognition, sign-meaning, sign-action |
| junction-rules | right-of-way, intersection-behaviour |
| general-rules | roadcraft, psv-rule |
| traffic-lights | signal-sequence |
| speed-limits | speed-limit |
| overtaking | overtaking-rule |
| parking | parking-rule |
| pedestrian-safety | cyclist-rule, motorcycle-rule |
| road-markings | marking-rule, marking-identification |
| vehicle-equipment | equipment-rule, seatbelt-rule, lighting-rule |
| vehicle-classes | licence-requirement, licence-class, learner-rule |
| towing-loads | towing-rule, load-rule |
| accident-procedures | accident-procedure, emergency-response |
| alcohol-drugs | alcohol-rule, fitness-to-drive |
| night-driving | lighting-rule, weather-rule |

**Note:** `lighting-rule` spans two topics: `vehicle-equipment` (6 questions) and `night-driving` (56 questions). This is correct — the same concept applies in different contexts.

---

## Concept Intelligence API

### Content Package (`packages/content/src/index.ts`)

| Export | Signature | Description |
|--------|-----------|-------------|
| `conceptCatalog` | `(pack: ContentPack) => ConceptInfo[]` | Canonical concept catalog with question/family counts |
| `conceptsForTopic` | `(pack: ContentPack, topicId: string) => ConceptInfo[]` | Concepts belonging to a topic |
| `allConcepts` | `(pack: ContentPack) => string[]` | All unique concept strings |
| `qidToConceptMap` | `(pack: ContentPack) => Map<string, string \| null>` | Fast qid → concept lookup |
| `qidToTopicMap` | `(pack: ContentPack) => Map<string, string>` | Fast qid → topic lookup |

### Assessment Engine (`packages/assessment-engine/src/concept.ts`)

| Export | Signature | Description |
|--------|-----------|-------------|
| `enrichEvidence` | `(attempts, pack) => ConceptEvidence[]` | Map AttemptEvents to concept-tagged evidence |
| `conceptMastery` | `(attempts, pack, config) => ConceptMastery[]` | Per-concept mastery using existing computeStat |
| `detectConceptWeakness` | `(attempts, pack, config, now?) => ConceptWeakness[]` | Per-concept weakness detection |
| `conceptRecoveryCandidates` | `(concept, pack, excludeFamilies?) => RecoveryCandidate[]` | Family-deduped recovery questions for a concept |
| `mistakeClusters` | `(attempts, pack) => MistakeCluster[]` | Mistakes grouped by concept |
| `mockConceptDiagnosis` | `(mockAttempts, pack) => ConceptDiagnosis[]` | Post-mock concept breakdown |
| `conceptReadinessBreakdown` | `(attempts, pack, config) => { strong, developing, weak, unknown }` | Concept-level readiness buckets |

---

## Data Flow

### Attempt → Concept Evidence

```
AttemptEvent { qid: "52713", isCorrect: true, confidence: "sure" }
    ↓
qidToConceptMap(pack) → "52713" → "licence-class"
qidToTopicMap(pack)   → "52713" → "vehicle-classes"
getFamilyId("52713")  → "52713:52728"
    ↓
ConceptEvidence {
  qid: "52713",
  concept: "licence-class",
  topicId: "vehicle-classes",
  isCorrect: true,
  confidence: "sure",
  familyId: "52713:52728",
  ts: 1700000000000
}
```

### Concept Mastery Calculation

```
All attempts for concept "right-of-way" (219 questions, 31 families)
    ↓
computeStat(attempts, "right-of-way", config)
    ↓
MasteryStat {
  evidence: 12,
  correct: 8,
  accuracy: 0.67,
  recentAccuracy: 0.75,
  mastery: 0.69,
  confidence: 0.67,
  status: "developing"
}
    ↓
ConceptMastery {
  concept: "right-of-way",
  topicId: "junction-rules",
  state: "developing",  // mastery >= 0.6
  ...
}
```

### Concept State Thresholds

Reuses the existing learning-engine thresholds exactly:

| State | Condition |
|-------|-----------|
| `unknown` | evidence < 3 (minEvidence) |
| `strong` | mastery >= 0.8 (strongThreshold) |
| `developing` | mastery >= 0.6 (developingThreshold) |
| `needs-attention` | mastery < 0.6 |

---

## Confidence Intelligence

The existing `AttemptEvent.confidence` field is preserved in concept evidence:

| Signal | Interpretation |
|--------|---------------|
| `correct + sure` | Solid knowledge |
| `correct + unsure` | Fragile knowledge — may need reinforcement |
| `incorrect + sure` | **Misconception** — learner believes wrong answer |
| `incorrect + unsure` | Knowledge gap — learner knows they're uncertain |

All four signals are preserved in `ConceptEvidence.confidence` and flow through to mastery calculations via `computeStat()`.

---

## Weakness Detection

Concept weakness uses the same pattern classification as the topic-level weakness engine:

| Kind | Condition | Meaning |
|------|-----------|---------|
| `early` | evidence < minEvidence OR mastery < developingThreshold | Insufficient evidence or early weakness |
| `recurring` | >= recurringMissCount (2) misses in last recurringMissWindow (4) attempts | Pattern repeats |
| `deteriorating` | allAcc - recentAcc >= deteriorationMargin (0.15) | Performance dropping |
| `long-unreviewed` | lastAttempt > weakGapDays (14) ago | Needs refresh |
| `none` | mastery >= developingThreshold | Not weak |

**Critical: `unknown` concepts (0 attempts) are NEVER flagged as weaknesses.**

---

## Family Protection (D3.5 Invariant)

- `conceptRecoveryCandidates()` returns questions deduplicated by family ID
- `getFamilyId()` used throughout — same family map as D3.5
- Within a concept recovery session: max 1 question per family
- Across sessions: families can be reused (excluded via `excludeFamilies` parameter)

---

## Offline Operation

All concept intelligence functions are **synchronous** and operate on local data only:

- `ContentPack` — local JSON
- `AttemptEvent[]` — local IndexedDB
- `LearningConfig` — local defaults
- No `fetch()`, no `async`, no network dependency

Concept intelligence calculates identically offline and online.

---

## Coverage Report

### Questions Mapped

- **1,396 / 1,396** questions have concept assignments (100%)
- **0** questions without concepts in the answerable pool

### Families Mapped

- **462** unique families
- **295** group families (2+ questions)
- **167** singleton families
- All families mapped to concepts via their questions

### Concepts with Low Coverage

| Concept | Questions | Families | Risk |
|---------|-----------|----------|------|
| psv-rule | 3 | 1 | Very small pool — limited evidence quality |
| motorcycle-rule | 3 | 1 | Very small pool — limited evidence quality |
| alcohol-rule | 5 | 3 | Small pool |
| fitness-to-drive | 6 | 1 | Small pool |

These concepts have insufficient content for reliable mastery assessment. The `unknown` state will correctly apply until the learner accumulates evidence. The existing readiness engine remains authoritative and is not distorted by small-concept evidence.

---

## Test Results

### New Concept Tests (22)

| # | Test | Validates |
|---|------|-----------|
| 1 | concept aggregation | Attempts from multiple questions aggregate correctly |
| 2 | multiple concepts | No cross-contamination between concepts |
| 3 | topic aggregation | Concepts grouped into correct topics |
| 4 | unknown concept (zero) | 0 attempts → UNKNOWN state |
| 5 | unknown concept (insufficient) | < minEvidence → UNKNOWN state |
| 6 | weak concept | Sufficient poor evidence → needs-attention |
| 7 | fragile knowledge | correct+sure vs correct+unsure distinguished |
| 8 | misconception signal | incorrect+sure vs incorrect+unsure preserved |
| 9 | concept recovery | Recovery candidates from correct concept |
| 10 | concept recovery exclusion | Exclude families parameter works |
| 11 | family deduplication | Recovery candidates have unique families |
| 12 | cross-session reuse | Families reusable across sessions |
| 13 | mistake clustering | Mistakes aggregate by concept correctly |
| 14 | post-mock diagnosis | Mock mistakes aggregate by concept |
| 15 | offline operation | All functions synchronous, no network |
| 16 | existing regression | Content pack not mutated |
| 17 | concept catalog (28 concepts) | Correct count derived |
| 18 | concept catalog (counts) | Question and family counts correct |
| 19 | conceptsForTopic | Only correct topic's concepts returned |
| 20 | readiness breakdown | Concepts categorized into 4 buckets |
| 21 | weakness detection (correct) | Weakness kind correctly identified |
| 22 | weakness detection (unknown) | Unknown concepts NOT flagged as weak |

### Full Suite

```
New concept tests:    22
Existing tests:      236
Total:               258
Typecheck:           Clean
Build:               Pass
```

---

## Files Changed

| File | Lines Changed | Description |
|------|---------------|-------------|
| `packages/content/src/index.ts` | +80 | ConceptInfo type, conceptCatalog(), conceptsForTopic(), allConcepts(), qidToConceptMap(), qidToTopicMap() |
| `packages/assessment-engine/src/concept.ts` | +410 | Full concept intelligence layer (7 exported functions, 8 interfaces) |
| `packages/assessment-engine/src/index.ts` | +1 | Export concept module |
| `packages/assessment-engine/src/concept.test.ts` | +526 | 22 comprehensive tests |

---

## Content Integrity

| Metric | Before D4 | After D4 | Status |
|--------|-----------|----------|--------|
| QIDs | 1,396 | 1,396 | ✅ Unchanged |
| Questions | 1,396 | 1,396 | ✅ Unchanged |
| Answers | All preserved | All preserved | ✅ Unchanged |
| Images | All preserved | All preserved | ✅ Unchanged |
| Topic assignments | D3 taxonomy | D3 taxonomy | ✅ Unchanged |
| Concepts | 28 | 28 | ✅ Unchanged |
| Families | 462 | 462 | ✅ Unchanged |

---

## Known Limitations

1. **Small-concept pools**: `psv-rule` (3 Qs), `motorcycle-rule` (3 Qs), `alcohol-rule` (5 Qs), `fitness-to-drive` (6 Qs) have very limited evidence potential. Mastery calculations for these concepts will remain in `unknown` state longer and should not be over-interpreted.

2. **lighting-rule spans two topics**: This concept appears in both `vehicle-equipment` (6 Qs) and `night-driving` (56 Qs). The concept intelligence layer treats it as a single concept across both topics. This is architecturally correct but means mastery is aggregated across contexts.

3. **Declared concepts array stale**: The `concepts[]` array in `content-v1.json` lists 23 short tags that don't match the 28 actual concept strings used in questions. The concept catalog is derived from actual question data, not this array.

4. **No UI integration yet**: The concept intelligence layer is a pure API/data layer. UI integration (Home, Progress, Learn, Mistake Book, Coach) is a separate phase per the plan.

5. **No AI/LLM**: All calculations are deterministic. No AI-generated scores or classifications.

---

## D4 STATUS: PASS

**Concept catalog:**
- Concepts: 28
- Topics: 15
- Relationships: Derived from migrated content, not manual

**Concept intelligence:**
- Mastery: ✅ Uses existing computeStat() — no new algorithm
- Weakness: ✅ Extends existing classifyPattern() — recurring, deteriorating, long-unreviewed
- Confidence: ✅ All 4 signals preserved (sure/unsure × correct/incorrect)
- Unknown-state: ✅ UNKNOWN (0 attempts) never == WEAK
- Recovery: ✅ Family-deduped candidates per concept
- Mistake clustering: ✅ Grouped by concept, sorted by count
- Mock diagnosis: ✅ Per-concept breakdown from mock attempts

**Family protection:**
- D3.5 invariant: ✅ PASS (max 1 family per recovery session)

**Offline:**
- ✅ PASS (all synchronous, no network dependency)

**Coverage:**
- Questions mapped: 1,396 / 1,396 (100%)
- Families mapped: 462 / 462 (100%)
- Concepts with low coverage: 4 (psv-rule, motorcycle-rule, alcohol-rule, fitness-to-drive)

**Tests:**
- New concept tests: 22
- Existing tests: 236
- Total: 258
- Typecheck: Clean
- Build: Pass

**Content integrity:**
- QIDs changed: 0
- Questions changed: 0
- Answers changed: 0
- Images changed: 0
- Topic assignments changed: 0

**Files changed:**
- `packages/content/src/index.ts`
- `packages/assessment-engine/src/concept.ts`
- `packages/assessment-engine/src/index.ts`
- `packages/assessment-engine/src/concept.test.ts`

**Report:** `docs/D4_CONCEPT_INTELLIGENCE_REPORT.md`

**Known limitations:**
- 4 concepts with very few questions (< 6) — limited evidence quality
- `lighting-rule` spans 2 topics — concept aggregated across contexts
- Declared `concepts[]` array in JSON is stale — catalog derived from actual data
- No UI integration — pure intelligence layer only
