# Zivvvo — Roadmap

> Phases and deliverables. Foundation is built; the offline-first product shell
> is the active stage.

## Where we are

The monorepo, the validated 1,249-question bank, and the adaptive engines
(learning/assessment/ai-gateway) are implemented and tested (214 Vitest tests);
the web app has the full adaptive loop working offline-first via IndexedDB, a
live cloud sync channel (Supabase, schema `zivvvo`), the Learn adaptive path,
and learner-state-aware Practice modes. Phase 1's
foundation is complete; the current stage is the **experience verticals**
(Learn validation, Practice modes, Mistake Book, Coach), with the
backend/sync wrap-up (auth + content-pack distribution remain; postgREST
exposure of `zivvvo` is an open environmental gate — ADR-022).

### Progress against Phase 1 deliverables

| Deliverable | Status |
|-------------|--------|
| Working mobile-first app shell (Vite + React + TS strict) | **Implemented** |
| TypeScript project architecture (packages/ features) | **Implemented** |
| Design system foundation (tokens + components) | **Implemented** (baseline) |
| Core navigation — 5 tabs, stubbed screens | **Implemented** |
| Offline storage foundation (Dexie schema + pack loader) | **Implemented** |
| Supabase connection architecture | **Implemented** (live project, isolated `zivvvo` schema + sync client) |
| Content domain models + seeded/real data | **Implemented** |
| Question domain models + attempt events | **Implemented** |
| Learning engine interfaces (`getNextBestActivity`) | **Implemented** (live) |
| AI provider abstraction | **Implemented** (mock provider) |
| Core question experience prototype | **Implemented** |
| First-time journey (Welcome → goal → timeline → confidence → Home) | **Implemented** (`onboarding.ts` + `OnboardingFlow.tsx`; goal/cadence/confidence persisted on the learner record, first activity personalised) |
| Documentation | **Implemented** (refreshed) |

## Vision-aligned build (working plan)

Driven by `PRODUCT_VISION.md`. Engine first — the defensible asset is the
system that learns how each student learns (§"My Strongest Product
Recommendation": *Build the learning engine first*). Each step lands with
Vitest tests, typecheck and a green build.

**Engine (the defensible core)**

| Step | Vision | Status |
|------|--------|--------|
| S1 Readiness v2 — weighted (mastery 30 / recent 20 / mock 20 / consistency 10 / confidence 10 / speed 10), five vision bands, perceived-vs-actual delta | §19 | **Implemented** (`computeReadiness`, renormalised for evidence) |
| S2 Difficulty system — author difficulty + empirical difficulty, "let's make it harder" ramp | §49 | **Implemented** (`difficulty.ts`: empirical tier, ramp, tier-restricted smart sessions) |
| S3 Mistake review variants — original → variant → harder, never the same question | §17 | **Implemented** (`variants.ts` rotate/swap/original + `buildMistakeReviewSession`) |
| S4 Mock engine v2 — Standard / Personalized / Nightmare modes + post-mock review breakdown | §21–22 | **Implemented** (`buildDynamicMock` + `mockReview`/`topicWeights`) |
| S5 Study planner — date-backed adaptive plan, daily task for Home | §51 | **Implemented** (`buildPlan`/`planCursor` in learning-engine) |
| S6 Recommendation v2 — time-pressure, consistency, mock cadence in priorities | §50 | **Implemented** (`DEFAULT_PRIORITIES_V2` + exam-approaching/mock-cadence/consistency-lapse, `estimatedMinutes` everywhere) |

**Engagement & experience**

| Step | Vision | Status |
|------|--------|--------|
| S7 Engagement engine — XP, streak + freeze, daily-goal presets, levels (pure reducers, persisted) | §24–26 | **Implemented** (`engagement.ts`: XP incl. hard/perfect/goal bonuses, freeze-capped streaks, triangular levels) |
| S8 Home v2 — greeting, readiness %, next step + START, today strip, "how much time" picker | §6, 23 | **Implemented** (engagements persisted in Dexie, v2 priorities + planner cursor live, quick-set exam date, engagement chips) |
| S9 Learn tab — adaptive vertical path with unlocks | §7, 62 | **In progress** — the active vertical slice (see `CURRENT_STATE.md` §10); path ranking derives from the learner loop, unlocks after path behaviour lands |
| S10 Practice challenges — Daily / Speed Run / Survival / Weakness / Redemption | §29 | **In progress** — learner-state-aware modes landed (Weakness focus / Review due / Mistake review / Smart): Practice tab now offers grounded entries per learner state; challenge-only modes (Daily / Speed Run / Survival / Redemption) remain planned |
| S11 Mistake Book — grouped mistakes with Fix/Review | §17 | Planned |
| S12 Coach that acts — contextual reactions, "I have 5 minutes", mock-provider AI | §13–16, 40 | Planned |

**Sellable & release-ready**

| Step | Vision | Status |
|------|--------|--------|
| S13 Sync/auth hardening — auth swap, exposure gate, E2E verify | §42–46 | Planned |
| S14 Monetization seams — free/premium flags after value | §58–60 | Planned |
| S15 Polish — motion, sound+mute, a11y, PWA install, analytics | §54–57 | Planned |

## Phase 1 — Product Foundation (current)

**Goal:** a working mobile-first application shell plus the foundation that
makes every later feature additive. Success = a user can experience
*Welcome → goal → timeline → confidence → Home → Learning Path → question →
feedback → progress* end-to-end.

Deliverables:

1. **Working mobile-first application shell** — Vite + React + TS (strict),
   runnable on device in the browser.
2. **TypeScript project architecture** — the layer and domain layout from
   `ARCHITECTURE.md`, wired as packages/features, not scrap-piles.
3. **Design system foundation** — tokens + core components per
   `DESIGN_SYSTEM.md` (badge, card, question card, tab bar, progress ring…).
4. **Core navigation** — the 5 tabs (`UX_PRINCIPLES.md`), stubbed screens.
5. **Offline storage foundation** — Dexie/IndexedDB schema + content pack
   loader (first category pack).
6. **Supabase connection architecture** — client config + data-portability
   interface; no live project required (Experimental).
7. **Content domain models + mock data** — typed models, seeded mock data,
   real content imported from `data/primaed` where ready.
8. **Question domain models + attempt events** — `AttemptEvent` as the spine.
9. **Learning engine interfaces** — `getNextBestActivity` (feature-complete
   interface, mock implementation).
10. **AI provider abstraction** — `packages/ai-gateway` + mock provider.
11. **Core question experience prototype** — the heart: stem, options,
    submit, feedback, explanation, offline-correct.
12. **Documentation** — being written now (entire `docs/`).

**Do not scope-creep Phase 1:** no payments, no real AI, no social, no elaborate
reward systems.

## Phase 2 — First Examination Category (ZVID provisional licence)

- Import + verify the 1,249-question bank through the real models. **Done**
  (980 answered / 269 consciously skipped; see `DECISIONS.md` ADR-012).
- Blueprint-driven Mock mode; readiness model live. **In progress** — engine
  (`buildMockSession`, pass/fail) + UI exist; blueprint is Experimental.
- Offline pack distribution for the category (images + explanations). **In
  progress** — image pipeline + SW precache done; backend pack delivery
  (`zivvvo.content_pack`) pending.
- Cloud event sync. **In progress** — anomalous: live `zivvvo` schema + sync
  client are implemented; postgREST exposure of the schema awaits the "Exposed
  schemas" dashboard setting; analytics aggregation still needs the auth stage.
- Analytics instrumentation (shared `AttemptEvent`). **Planned** — event spine
  exists and syncs; off-device analytics needs the auth/aggregation stage.

## Phase 3 — Adaptive engine live

- Real mastery + spaced-repetition behind the stable learning interface.
- Recovery flow ("confident but wrong" → next focus).
- Coach narrative (AI T2 experimental).

## Phase 4 — Expand

- Second examination categories (professional/other systems) via pure content
  onboarding.
- Multi-language and accessibility hardening.
- Pay-per-exam delivery and class/group features.

## Principles that govern the roadmap

- **One engine, many exams** — never a new product per exam.
- **No AI as truth** — AI features land only after T0 content is in place.
- **Offline constantly re-verified** on every release.
- Readiness beats engagement engineering at every decision point.