# D3 Migration Report

> **Generated:** 2026-09-16
> **Status:** PASS

---

## Executive Result

```
D3 STATUS: PASS
```

---

## Dataset

```
Before: 1396
After: 1396
QID preservation: PASS
```

---

## Content Preservation

| Field | Changed | Status |
|-------|---------|--------|
| Stems | 0 | PASS |
| Options | 0 | PASS |
| Answers (correctIndexes) | 0 | PASS |
| Explanations | 0 | PASS |
| ImageRefs | 0 | PASS |
| Other non-migration fields | 0 | PASS |

Content hash (SHA-256 of all preserved fields): `ef7ed4b059a1be362a73b1926c7598895dccde577a47909d53a352667d112ac2`

Identical before and after migration.

---

## Migration

### Topic Distribution (final)

| Topic | Count | % |
|-------|------:|---|
| road-signs | 292 | 20.9% |
| junction-rules | 258 | 18.5% |
| general-rules | 209 | 15.0% |
| road-markings | 109 | 7.8% |
| night-driving | 69 | 4.9% |
| traffic-lights | 65 | 4.7% |
| vehicle-classes | 57 | 4.1% |
| vehicle-equipment | 57 | 4.1% |
| speed-limits | 54 | 3.9% |
| pedestrian-safety | 52 | 3.7% |
| parking | 52 | 3.7% |
| towing-loads | 41 | 2.9% |
| overtaking | 36 | 2.6% |
| accident-procedures | 34 | 2.4% |
| alcohol-drugs | 11 | 0.8% |
| **Total** | **1396** | **100%** |

Old topics eliminated:
- general (990) → distributed across 15 new topics
- regulations (214) → distributed across 15 new topics
- carriageway-lines (30) → road-markings
- confusing-pair (1) → distributed

### Concept Distribution (final, 28 concepts)

| Concept | Count | % |
|---------|------:|---|
| sign-recognition | 234 | 16.8% |
| right-of-way | 219 | 15.7% |
| roadcraft | 206 | 14.8% |
| signal-sequence | 65 | 4.7% |
| lighting-rule | 62 | 4.4% |
| marking-identification | 56 | 4.0% |
| speed-limit | 54 | 3.9% |
| marking-rule | 53 | 3.8% |
| parking-rule | 52 | 3.7% |
| cyclist-rule | 49 | 3.5% |
| sign-meaning | 44 | 3.2% |
| intersection-behaviour | 39 | 2.8% |
| equipment-rule | 36 | 2.6% |
| overtaking-rule | 36 | 2.6% |
| licence-class | 28 | 2.0% |
| accident-procedure | 26 | 1.9% |
| towing-rule | 23 | 1.6% |
| licence-requirement | 18 | 1.3% |
| load-rule | 18 | 1.3% |
| seatbelt-rule | 15 | 1.1% |
| sign-action | 14 | 1.0% |
| weather-rule | 13 | 0.9% |
| learner-rule | 11 | 0.8% |
| emergency-response | 8 | 0.6% |
| fitness-to-drive | 6 | 0.4% |
| alcohol-rule | 5 | 0.4% |
| psv-rule | 3 | 0.2% |
| motorcycle-rule | 3 | 0.2% |

### Confidence Distribution

| Confidence | Count | % |
|------------|------:|---|
| HIGH | 1070 | 76.6% |
| MEDIUM | 291 | 20.8% |
| LOW | 35 | 2.5% |
| AMBIGUOUS | 0 | 0% |

### LOW Confidence Records (35)

| Category | Count | Notes |
|----------|------:|-------|
| Genuinely unclassifiable | 33 | Stem alone insufficient for reliable classification |
| 60009 — lane change procedure | 1 | Edge case: procedure question, not a marking question |
| 50189 — meta/instructional | 1 | Edge case: app usage question, not a driving question |

All LOW records are intentionally preserved. Forcing uncertain questions into incorrect concepts would damage the adaptive learning system.

---

## Duplicate Preservation

| Type | Groups | Records |
|------|-------:|--------:|
| USEFUL_VARIANT | 240 | 797 |
| LIKELY_LEGITIMATE_SAME_STEM_VARIANT | 27 | 317 |
| EXACT_DUPLICATE | 15 | 45 |
| IMAGE_CONTEXT_VARIANT | 9 | 56 |
| POSSIBLE_CONTENT_ERROR | 4 | 14 |

```
Records deleted: 0
Records merged: 0
```

---

## Possible Content Errors

```
Possible content-error groups preserved: 4
Content answers changed during D3: 0
```

The 4 POSSIBLE_CONTENT_ERROR groups (14 question records) remain flagged for future content QA. These are same-stem/different-answer groups with the same image, indicating potential content errors. D3 did not modify any answers.

---

## Tests

```
Typecheck: PASS
Test suite: PASS (218/218)
Build: PASS
```

---

## Files Changed

| File | Reason |
|------|--------|
| `packages/content/src/data/content-v1.json` | D3 migration: topicId and concept fields updated for all 1,396 records; topics array replaced with 15-topic taxonomy; stats updated |
| `tools/zivvvo/classify-content.mjs` | D2 classifier: added exports, QID_OVERRIDES, fixed defensive-driving dump, added ~40+ semantic rules |
| `tools/zivvvo/d3-pre-checksum.mjs` | D3 tooling: pre-migration checksum baseline generator |
| `tools/zivvvo/d3-migrate.mjs` | D3 tooling: migration script with dry-run/apply/validate modes |
| `docs/CONTENT_MIGRATION_PREVIEW.md` | D2 report: per-question migration table (regenerated) |
| `docs/CONTENT_VALIDATION_REPORT.md` | D2 report: structural + semantic validation (regenerated) |
| `docs/LOW_CONFIDENCE_REVIEW.md` | D2 report: LOW-confidence audit (regenerated) |
| `docs/d3-baseline/pre-migration-baseline.json` | D3 artifact: pre-migration checksum baseline |

---

## D3 Gate Checklist

- [x] 1,396 records before
- [x] 1,396 records after
- [x] All QIDs preserved
- [x] No duplicate QIDs
- [x] No question content changed
- [x] Only approved migration fields changed (topicId, concept)
- [x] Approved 15-topic taxonomy applied
- [x] No defensive-driving fallback
- [x] Concepts applied correctly (28 concepts)
- [x] 35 LOW records preserved honestly
- [x] 4 possible-content-error groups remain flagged
- [x] Duplicate records preserved
- [x] Content integrity tests pass
- [x] Learning engine tests pass
- [x] Assessment engine tests pass
- [x] Full test suite passes (218/218)
- [x] Typecheck passes
- [x] Production build passes
- [x] D3 migration report generated
- [x] No unrelated systems modified
