# D5.1: Mock Diagnosis Integration — Report

**Date:** 2026-09-17
**Status:** PASS
**Test count:** 291/291 (7 new D5.1 tests)
**Typecheck:** Clean
**Build:** Clean

---

## Summary

D5.1 completes the remaining D5 gap: when a learner finishes a mock exam, they now receive an immediate concept-level diagnosis showing which concepts that mock exposed as strong or needing attention, with a direct path into targeted practice.

## Mock Diagnosis Flow

```
mock finishes
    ↓
sessionAttempts filtered by sessionId
    ↓
mockDiagnosis(sessionAttempts)  →  ConceptDiagnosis[]
    ↓
UI categorizes: strong (>=80%), developing (50-79%), weak (<50%)
    ↓
weak/developing concepts show "Practice" button
    ↓
conceptSession()  →  conceptRecoveryCandidates()
    ↓
buildReviewSession()  →  D3.5 family dedup
    ↓
SessionRunner
```

## Changes Made

### 1. Practice.tsx — Mock Result Section

**Added:** Concept diagnosis card between "Strengthened" and "Review answers" buttons.

**UI structure:**
```
Mock result
82%
41 / 50 correct

Still reviewing        (existing)
...

Strengthened           (existing)
...

Concept breakdown      ← NEW
Needs attention
  Right of way         3 / 6  [Practice]
  Road markings        2 / 5  [Practice]
Developing
  Speed limits         3 / 4  [Practice]
Strong
  Sign recognition     8 / 8
  Parking rules        4 / 4
```

**Concept categorization thresholds:**
- **Strong:** pct >= 80% (no practice button shown)
- **Developing:** 50% <= pct < 80% (practice button shown)
- **Weak:** pct < 50% (practice button shown, prioritized at top)

**Empty diagnosis handling:**
When `mockDiagnosis()` returns 0 records (e.g., questions without concept mapping), shows:
```
Concept breakdown
Not enough concept data from this mock.
```

**Paywall enforcement:**
Concept recovery sessions from mock results go through `canStartSession("concept-recovery")` — free users see the upgrade modal at the paywall gate.

### 2. Engine Imports Added

`mockDiagnosis` added to the Practice.tsx import from `../engine`.

### 3. SessionRunner Store Access

Added `canStartSession`, `setTab`, `startSession`, `learnerId` to SessionRunner's `useApp()` selectors for the concept practice flow.

## APIs Consumed

| API | Source | Purpose |
|-----|--------|---------|
| `mockDiagnosis()` | `engine.ts` → `mockConceptDiagnosis()` | Post-mock concept breakdown |
| `conceptSession()` | `engine.ts` → `conceptRecoveryCandidates()` → `buildReviewSession()` | Targeted practice |
| `canStartSession()` | Zustand store | Paywall enforcement |

## Family Deduplication

The `conceptSession()` path inherits D3.5 family deduplication:
1. `conceptRecoveryCandidates()` returns candidate qids
2. `buildReviewSession()` calls `sample()` which uses `canAddToSession()` with family map
3. MAX 1 QUESTION PER FAMILY PER SESSION enforced

Regression test proves: `conceptSession()` returns session with unique qids.

## Test Coverage

New tests in `apps/web/src/d5-intelligence.test.ts`:

| Test | Description |
|------|-------------|
| mock diagnosis: expected concepts | Diagnosis contains concepts from mock attempts |
| mock diagnosis: correct counts | `correct/total` matches actual mock answers |
| mock diagnosis: strong/weak separation | Strong (>=80%) and weak (<50%) concepts separated correctly |
| mock diagnosis: no false evidence | Concepts with 0 mock evidence not falsely diagnosed |
| mock diagnosis: empty input | Empty diagnosis returns [] without crash |
| mock diagnosis: family dedup | `conceptSession()` returns unique families |
| mock diagnosis: pct consistency | `pct === round(correct/total * 100)` |

## Test Results

```
Test Files  26 passed (26)
     Tests  291 passed (291)
  Duration  27.50s
```

- 284 existing tests: all pass (no regressions)
- 7 new D5.1 tests: all pass

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/pages/Practice.tsx` | +103 lines (mock diagnosis section, store access, paywall) |
| `apps/web/src/d5-intelligence.test.ts` | +75 lines (7 D5.1 tests + helper fix) |

**Net new code:** ~178 lines

## Content Integrity

| Check | Result |
|-------|--------|
| Questions changed | 0 |
| Answers changed | 0 |
| Images changed | 0 |
| Concepts changed | 0 |
| Families changed | 0 |

## Verification Checklist

- [x] Mock Results displays concept diagnosis
- [x] Diagnosis uses actual mock attempts
- [x] Existing mock score unchanged
- [x] Strong/developing/needs-attention states accurate
- [x] Unknown concepts handled (empty diagnosis fallback)
- [x] Concepts without mock evidence not falsely diagnosed
- [x] Learner can launch targeted concept practice
- [x] Targeted practice uses existing `conceptSession()`
- [x] D3.5 family deduplication enforced
- [x] Empty diagnosis does not crash
- [x] Mobile layout works (existing card/typography system)
- [x] No new intelligence algorithm
- [x] No content changes
- [x] 291/291 tests pass
- [x] Typecheck clean
- [x] Production build clean
- [x] D5.1 report exists
