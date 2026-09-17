# D6: Personal Tutor Loop — Report

**Date:** 2026-09-17
**Status:** PASS
**Test count:** 313/313 (22 new D6 tests)
**Typecheck:** Clean
**Build:** Clean

---

## 1. Status

**PASS**

D6 implements the Personal Tutor Loop as a deterministic intelligence layer with an AI Coach foundation. Zivvvo now behaves like a personal driving-theory tutor rather than a question bank.

## 2. Existing Architecture Reused

| D3.5 API | Usage in D6 |
|----------|-------------|
| `getFamilyId()` | Family dedup in concept recovery sessions |
| `familyMap` | Concept session candidate filtering |

| D4 API | Usage in D6 |
|--------|-------------|
| `conceptMastery()` | Tutor context — concept mastery states |
| `detectConceptWeakness()` | Tutor context — weakness detection |
| `mistakeClusters()` | Tutor context — recent mistakes |
| `mockConceptDiagnosis()` | Mock → diagnose → teach → practise loop |
| `conceptRecoveryCandidates()` | Concept practice sessions |
| `conceptReadinessBreakdown()` | Readiness summary for coach |
| `ConceptMastery` | Type reused in ConceptSummary |
| `ConceptWeakness` | Type reused in tutor decisions |
| `MistakeCluster` | Type reused in mistake summaries |
| `ConceptDiagnosis` | Type reused in mock teaching |
| `ConceptReadiness` | Type reused in readiness summary |

| D5 API | Usage in D6 |
|--------|-------------|
| `concepts()` | Tutor context builder |
| `conceptWeaknesses()` | Tutor context builder |
| `conceptMistakes()` | Tutor context builder |
| `conceptReadiness()` | Tutor context builder |
| `mockDiagnosis()` | Mock teaching surface |
| `conceptSession()` | Practice launching |
| `recommendationReason()` | Recommendation summary |
| `ConceptTeachCard` | Reusable teaching component |

| D5.1 API | Usage in D6 |
|----------|-------------|
| Mock diagnosis section | Extended with "Learn" buttons |
| Concept breakdown | Extended with teaching surface |

## 3. Tutor Context

Created `apps/web/src/tutor/context.ts` — a deterministic learner context that assembles existing D4/D5 intelligence.

**Shape:**
```ts
TutorContext {
  learnerId?: string
  strongestConcepts: ConceptSummary[]
  weakestConcepts: ConceptSummary[]
  developingConcepts: ConceptSummary[]
  unknownConcepts: ConceptSummary[]
  recentMistakes: MistakeSummary[]
  readiness: ReadinessSummary | null
  currentRecommendation: RecommendationSummary | null
  evidence: EvidenceSummary
  hasEvidence: boolean
}
```

All fields are derived from existing D4/D5 APIs. No new intelligence algorithms.

## 4. Tutor Decisions

`getTutorDecision()` produces deterministic decisions:

| Decision | Condition | Action |
|----------|-----------|--------|
| `new-learner` | < 3 attempts | Start diagnostic |
| `weak-concept` | Concept needs attention | Teach and practice |
| `developing-concept` | Concept developing | Strengthen |
| `mistake-recovery` | Recent mistakes | Explain and practice |
| `all-clear` | All strong | Maintain |

**Key rule:** UNKNOWN ≠ WEAK. New learners receive "Let's build your foundation" — not "You're weak."

## 5. Teach-Before-Practice

Created `apps/web/src/tutor/ConceptTeachCard.tsx` — a reusable teaching surface.

**Structure:**
```
Concept name + status tag
Key rule (always visible)
Explanation (expandable)
Stats (correct/total, mastery)
Practice button
```

**Used from:**
- Coach page (weak/developing concepts)
- Mock Results (inline "Learn" button)
- Mistake Book (via MistakeCard)

**Variants:**
- Full card (Coach page)
- Compact card (developing concepts in Coach)
- Inline expandable (Mock Results)

## 6. Mistake Loop

```
Mistake detected
    ↓
MistakeCard shows concept + count
    ↓
"Show explanation" → key rule + T0 explanation
    ↓
"Practise [Concept]" → conceptSession()
    ↓
D3.5 family deduplication
    ↓
SessionRunner
```

**Implemented in:** `Coach.tsx` → `MistakeCard` component

## 7. Mock Loop

```
Mock completes
    ↓
Concept breakdown (existing D5.1)
    ↓
Weak/developing concepts show "Learn" + "Practice"
    ↓
"Learn" → inline key rule + explanation
    ↓
"Practice" → conceptSession()
    ↓
D3.5 family deduplication
    ↓
SessionRunner
```

**Extended in:** `Practice.tsx` mock results section

## 8. AI Coach

### Provider Abstraction

Extended `packages/ai-gateway/src/types.ts` with:

```ts
interface TutorProvider {
  explainConcept(req): Promise<ConceptExplainResponse>
  answerQuestion(req): Promise<ConceptExplainResponse>
  isAvailable(): boolean
}
```

**Context passed to AI:**
- Concept, topic, mastery state (from deterministic engine)
- Canonical explanation (T0 baseline)
- Key rule (derived from content)
- Recent mistake details (if any)

**Deterministic boundaries:**
- AI NEVER decides mastery, weakness, correctness, or question selection
- AI ONLY generates language
- Context is assembled by the deterministic engine

### Mock Provider

Created `packages/ai-gateway/src/tutor-mock.ts`:
- `MockTutorProvider` — returns canonical explanations
- Always available (deterministic, offline)
- No AI generation — uses T0 content as authoritative response

### Live AI Provider

**NOT IMPLEMENTED.** The architecture is ready for a live provider (e.g., Gemini via OpenRouter) but no LLM code exists in the repository. This is intentional per AI_ARCHITECTURE.md: T1/T2 features are "Experimental — not part of the first launch."

## 9. Offline-First AI Fallback

- `MockTutorProvider.isAvailable()` always returns `true`
- Deterministic tutor works without network
- All teaching content comes from T0 explanations (82% of questions have them)
- No broken experience when AI is unavailable
- No fake AI responses generated

## 10. Coach UX Integration

### Coach Page (rewritten)

**Before:** 42-line skeleton with topic-level weakness list.
**After:** Full personal tutor with:

1. **Decision card** — "Your next step" with primary action
2. **Weak concepts** — ConceptTeachCard with key rule + practice
3. **Developing concepts** — Compact ConceptTeachCard
4. **Mistake recovery** — MistakeCard with explanation + practice
5. **Topic signals** — Existing weakness list (kept as fallback)
6. **Evidence summary** — Questions tried, concepts covered, readiness

### Home Page

Existing concept-aware recommendation reason (D5) — unchanged.

### Practice Page

Existing concept-targeted sessions (D5) — unchanged.

### Mock Results

Extended with "Learn" buttons alongside "Practice" for weak/developing concepts. Inline teaching surface with key rule + explanation.

## 11. Personalized Language

Tutor decisions produce contextual messages:

| State | Message |
|-------|---------|
| New learner | "Let's build your foundation." |
| Weak (with evidence) | "You need more practice with Right of Way. You've got 3 of 7 right so far." |
| Weak (no evidence) | "You haven't practised Alcohol Rule yet. Let's learn the key rule." |
| Developing | "You're getting there with Speed Limits. Let's strengthen it." |
| All strong | "You're looking strong across the board." |

All claims backed by actual stored evidence. No fabricated statistics.

## 12. Testing

### New Tests (D6)

| Describe block | Tests | Coverage |
|----------------|-------|----------|
| `buildTutorContext()` | 7 | New learner, evidence, weak, strong, unknown, mistakes, evidence summary |
| `getTutorDecision()` | 5 | New learner, sparse evidence, weak, developing, UNKNOWN ≠ WEAK |
| `getConceptTeaching()` | 3 | Teaching info, explanation, sampleStems |
| `formatMistakeForTeaching()` | 1 | Mistake formatting |
| `formatMockDiagnosisForTeaching()` | 2 | Mock diagnosis formatting, empty input |
| `mock tutor provider` | 4 | Availability, explainConcept, answerQuestion, deterministic context |
| **Total** | **22** | |

### Test Results

```
Test Files  27 passed (27)
     Tests  313 passed (313)
  Duration  33.80s
```

- 291 existing tests: all pass (no regressions)
- 22 new D6 tests: all pass

## 13. Content Integrity

| Check | Result |
|-------|--------|
| Questions changed | 0 |
| Answers changed | 0 |
| Images changed | 0 |
| Families changed | 0 |

## 14. Files Changed

| File | Purpose |
|------|---------|
| `apps/web/src/tutor/context.ts` | Deterministic tutor context + decisions + teaching helpers |
| `apps/web/src/tutor/ConceptTeachCard.tsx` | Reusable teaching component |
| `apps/web/src/tutor/index.ts` | Public API exports |
| `apps/web/src/tutor/tutor.test.ts` | 22 D6 tests |
| `apps/web/src/pages/Coach.tsx` | Rewritten — full personal tutor UI |
| `apps/web/src/pages/Practice.tsx` | Extended mock results with "Learn" buttons |
| `packages/ai-gateway/src/types.ts` | Extended with TutorProvider interface |
| `packages/ai-gateway/src/tutor-mock.ts` | Mock tutor provider |
| `packages/ai-gateway/src/index.ts` | Updated exports |
| `docs/D6_PERSONAL_TUTOR_REPORT.md` | This report |

**Net new code:** ~650 lines (tutor layer + tests + UI updates)

## 15. Known Limitations

1. **No live AI provider.** The TutorProvider abstraction is ready but no LLM is wired. The mock provider returns canonical explanations. A live provider (e.g., Gemini via OpenRouter) can be added without changing app logic.

2. **Explanation coverage varies.** 82% of questions have T0 explanations. `sign-recognition` has only 16% coverage (38/234). Concepts without explanations show "Answer a few questions to build up teaching content."

3. **Coach page complexity.** The rewritten Coach page has more logic than the 42-line original. It's still under 300 lines and uses existing components.

4. **Teaching surface is text-only.** No images, diagrams, or multimedia in the teaching cards. This is consistent with the existing Zivvvo design language.

5. **No spaced repetition for teaching.** Teaching content is shown on-demand, not scheduled. The existing SRS system handles question review.

## 16. Next Recommended Phase

**D7: Live AI Provider Integration**

The architecture is ready. The next phase would:
1. Add a real LLM provider (Gemini via OpenRouter) implementing `TutorProvider`
2. Wire it behind consent and network detection
3. Add caching for generated explanations (T1)
4. Add coach dialogue (T2) — "What should I study?" narrative
5. Keep the mock provider as offline fallback

This is explicitly optional per AI_ARCHITECTURE.md: "T1/T2 generative features: Experimental — not part of the first launch."

## 17. Success Criteria

| Criterion | Status |
|-----------|--------|
| Learner answers questions | ✅ Existing flow |
| System builds evidence | ✅ Existing D4 |
| Concept intelligence identifies state | ✅ D4/D5 |
| Tutor explains what needs attention | ✅ D6 coach decisions |
| Learner learns the rule | ✅ ConceptTeachCard + key rule |
| Learner practises targeted questions | ✅ conceptSession() |
| D3.5 prevents family repetition | ✅ Inherited |
| System updates evidence | ✅ Existing flow |
| Learner returns later | ✅ Tutor recommends next action |
| Zivvvo behaves like a personal tutor | ✅ Coach page + teaching surface |
