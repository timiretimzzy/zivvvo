# D5: Adaptive Intelligence UI Integration — Report

**Date:** 2026-09-17
**Status:** COMPLETE
**Test count:** 284/284 (26 new D5 tests)
**Typecheck:** Clean
**Build:** Clean

---

## Summary

D5 integrates the D4 Concept Intelligence Layer into the existing UI surfaces. The UI is a pure consumer of D4 APIs — no new intelligence algorithms were introduced. All integration follows the EXTEND > REFACTOR > REPLACE principle.

## Architecture

```
D4 APIs (concept.ts)          D5 Engine Selectors (engine.ts)         UI Pages
─────────────────────────     ──────────────────────────────────     ─────────────────
conceptMastery()          →   concepts()                          →  Progress
detectConceptWeakness()   →   conceptWeaknesses()                 →  Home, Practice
mistakeClusters()         →   conceptMistakes()                   →  Practice
mockConceptDiagnosis()    →   mockDiagnosis()                     →  (Mock results)
conceptReadinessBreakdown()→  conceptReadiness()                  →  Progress
conceptRecoveryCandidates()→  conceptSession()                    →  Practice
conceptRecoveryCandidates()→  topConceptWeakness()                →  Practice
conceptRecoveryCandidates()→  weakestConcept()                    →  Practice
enrichEvidence()          →   recommendationReason()              →  Home
```

## Changes Made

### 1. Engine Layer (`apps/web/src/engine.ts`)

Added 10 concept intelligence helpers:

| Function | Purpose | Consumes |
|----------|---------|----------|
| `concepts()` | Per-concept mastery for active learner | `conceptMastery()` |
| `conceptWeaknesses()` | Evidence-based concept weaknesses | `detectConceptWeakness()` |
| `conceptMistakes()` | Mistakes clustered by concept | `mistakeClusters()` |
| `mockDiagnosis()` | Post-mock concept diagnosis | `mockConceptDiagnosis()` |
| `conceptReadiness()` | Concept readiness breakdown (strong/developing/weak/unknown) | `conceptReadinessBreakdown()` |
| `recommendationReason()` | Concept-aware recommendation explanation | `detectConceptWeakness()` |
| `conceptSession()` | Targeted concept practice session | `conceptRecoveryCandidates()` |
| `topConceptWeakness()` | Weakest concept for a topic | `detectConceptWeakness()` |
| `weakestConcept()` | Overall weakest concept | `detectConceptWeakness()` |
| `formatConcept()` | Display helper for concept names | — |

All helpers are synchronous, offline-first, and delegate to D4 APIs via the existing `computeStat()` engine.

### 2. Home Page (`apps/web/src/pages/Home.tsx`)

**Change:** Added concept-aware recommendation reason under the "What's next" card.

- Imports `recommendationReason` from engine
- Computes `conceptReason` via `useMemo` when activity changes
- Displays concept weakness message in primary color below the standard reason
- UNKNOWN-safe: shows nothing when no concept weakness detected

**User-visible text example:**
> "Your weakest topic is Junction Rules at 45% accuracy."
> "You've missed several Junction Rule questions recently."

### 3. Progress Page (`apps/web/src/pages/Progress.tsx`)

**Change:** Expanded the Topics card to show concept-level detail under each topic bar.

- Imports `conceptsForTopic()` from content, `concepts()` and `conceptReadiness()` from engine
- Computes concept mastery map with states (strong/developing/needs-attention/unknown)
- Under each topic bar, shows concepts with color-coded mastery:
  - **Green** (`text-ok`): strong concepts
  - **Amber** (`text-warn`): developing concepts
  - **Red** (`text-bad`): needs-attention concepts
  - **Gray** (`text-ink-dim`): unknown (no data)

**User-visible text example:**
```
Junction Rules                          45%
██████░░░░░░░░░░░░░░
  Right of way                          38%
  Traffic signals                       52%
  Roundabout                            41%
```

### 4. Practice Page (`apps/web/src/pages/Practice.tsx`)

**Changes:**

a) **Concept-grouped mistakes in Mistakes card:**
- Shows concept count alongside miss count
- Example: "12 recent misses. Grouped by 4 concepts."

b) **New "Focus by concept" section:**
- Shows top 3 concept clusters after the Challenge section
- Each card displays: concept name, topic, miss count, question count
- "Practice [Concept]" button launches a targeted session via `conceptSession()`
- Weakest concept gets red badge, others get amber

c) **Concept-targeted session launcher:**
- `launchConceptSession()` function wraps `conceptSession()` with paywall guard
- Uses `canStartSession("concept-recovery")` for paywall enforcement
- Family-deduped via D3.5 infrastructure

**User-visible text example:**
```
FOCUS BY CONCEPT
[Roundabout] Junction Rules
3 misses across 2 questions.
[Practice Roundabout]

[Right of Way] Junction Rules
2 misses across 3 questions.
[Practice Right Of Way]
```

## What Was NOT Changed

- No new top-level tab created (as per spec)
- No new intelligence algorithms (all delegated to D4)
- No new Supabase tables or sync logic
- No changes to Zustand store schema
- No changes to auth, payment, or settings flows
- All existing UI text and behavior preserved
- UNKNOWN ≠ WEAK distinction preserved in all displays

## Test Coverage

New test file: `apps/web/src/d5-intelligence.test.ts`

| Describe block | Tests | Coverage |
|----------------|-------|----------|
| `concepts()` | 3 | Empty input, ConceptMastery shape, mastery computation |
| `conceptWeaknesses()` | 4 | Empty input, no weaknesses, weakness detection, shape |
| `conceptMistakes()` | 4 | Empty input, no mistakes, clustering, topicId shape |
| `mockDiagnosis()` | 3 | Empty input, no attempts, diagnosis shape |
| `conceptReadiness()` | 3 | Breakdown shape, all classified, ConceptReadiness shape |
| `recommendationReason()` | 3 | No weaknesses, recovery reason, smart session reason |
| `conceptSession()` | 2 | Unknown concept returns null, valid concept returns session |
| `topConceptWeakness()` | 2 | No attempts returns null, returns weakest for topic |
| `weakestConcept()` | 2 | No attempts returns null, returns overall weakest |
| **Total** | **26** | |

## Test Results

```
Test Files  26 passed (26)
     Tests  284 passed (284)
  Duration  22.36s
```

- 258 existing tests: all pass (no regressions)
- 26 new D5 tests: all pass

## Files Modified

| File | Lines (before) | Lines (after) | Delta |
|------|----------------|---------------|-------|
| `apps/web/src/engine.ts` | 221 | 346 | +125 |
| `apps/web/src/pages/Home.tsx` | 300 | 307 | +7 |
| `apps/web/src/pages/Progress.tsx` | 186 | 223 | +37 |
| `apps/web/src/pages/Practice.tsx` | 608 | 635 | +27 |
| `apps/web/src/d5-intelligence.test.ts` | — | 293 | +293 (new) |

**Net new code:** ~489 lines (364 production + 125 test additions to existing + new test file)

## What's Left (D5-Specific)

The Mock Results screen (`SessionRunner` in Practice.tsx) already shows session summary, but concept diagnosis after mock is available via `mockDiagnosis()` for future integration. The function is exported and tested — wiring it into the mock results UI is a polish task.

## Verification Checklist

- [x] Typecheck clean (0 errors)
- [x] 284/284 tests pass
- [x] Build clean (`npm run build:web`)
- [x] All concept intelligence is offline-first
- [x] UNKNOWN ≠ WEAK preserved in all UI text
- [x] No hardcoded concept lists
- [x] No new algorithms introduced
- [x] EXTEND > REFACTOR > REPLACE followed
- [x] Paywall enforcement on concept sessions
- [x] Family dedup inherited from D3.5
