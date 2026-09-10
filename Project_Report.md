# Zivvvo — Project Report

_Generated 2026-09-10. For second-opinion review._

This document is a complete accounting of the Zivvvo project: what it is, what
we set out to do, what we built, what we found, what we fixed, what remains
broken, and what we still need to do. It is written for someone who has never
seen the codebase and needs to form an independent technical opinion.

---

## Table of contents

1. [What is Zivvvo?](#1-what-is-zivvvo)
2. [What we wanted to build](#2-what-we-wanted-to-build)
3. [What we built (architecture)](#3-what-we-built-architecture)
4. [What we have right now (concrete inventory)](#4-what-we-have-right-now-concrete-inventory)
5. [What works end-to-end](#5-what-works-end-to-end)
6. [QA pass — what we found and fixed](#6-qa-pass--what-we-found-and-fixed)
7. [What is broken or stuck](#7-what-is-broken-or-stuck)
8. [What is partially implemented](#8-what-is-partially-implemented)
9. [What we have not started](#9-what-we-have-not-started)
10. [The first vertical slice (Learn adaptive path)](#10-the-first-vertical-slice-learn-adaptive-path)
11. [Test suite and quality gates](#11-test-suite-and-quality-gates)
12. [Known content issues](#12-known-content-issues)
13. [Technical debt and design decisions](#13-technical-debt-and-decisions)
14. [What still needs to be done (full backlog)](#14-what-still-needs-to-be-done-full-backlog)
15. [Guardrails — what not to change](#15-guardrails--what-not-to-change)
16. [Supabase / backend state](#16-supabase--backend-state)
17. [Files of record](#17-files-of-record)
18. [Questions for the reviewer](#18-questions-for-the-reviewer)

---

## 1. What is Zivvvo?

Zivvvo is an offline-first, adaptive learner app for the Zimbabwe Class 2
learner's licence theory exam. It is a Progressive Web App (PWA) built with
React 18, Vite 5, Tailwind CSS 4, and Zustand. Data lives in the browser
(IndexedDB via Dexie) and optionally syncs to a Supabase backend.

The product's central thesis is that an exam-preparation app should be a
personal tutor — it should know what you are weak on, what you have not
practised, what is due for review, and how close you are to exam readiness,
and it should act on that knowledge at every screen.

---

## 2. What we wanted to build

### 2.1 Product vision

A single-device tutor app with:

- A **personalized onboarding** that shapes the learner's journey.
- A **Home screen** that knows the learner's state and recommends the single
  next-best activity with a grounded reason.
- A **Learn screen** that shows a personalized adaptive learning path (not a
  static topic list), ordered by the learner's actual weaknesses and gaps.
- A **Practice screen** that runs sessions (smart, weakness, mock, review,
  mistake-review, quick) using a real question bank.
- A **Coach** that acts — not just shows a list, but offers contextual
  reactions and buttons to start targeted sessions.
- A **Mistake Book** that groups repeated mistakes and offers targeted fixes.
- A **Progress/Readiness screen** with readiness breakdown and exam projection.
- A **Settings page** for rename, daily goal, and date management.
- **Cloud sync** with anonymous device-scoped RLS (no auth required initially).
- **Analytics instrumentation** to measure the learning loop.
- An **AI gateway** for future generative explanations (behind a mock provider
  today, never owning correctness).

### 2.2 Priorities (from the brief)

| Priority | Area | Status today |
| --- | --- | --- |
| P0 | Repository & doc truth | Done (this report + CURRENT_STATE.md) |
| P1 | Core learner loop | Done (stress-tested, all engines working) |
| P2 | Learn experience | **In progress** (first slice landed) |
| P3 | Practice | Partially (runner works; challenge modes absent) |
| P4 | Mistake Book | Not started (engine support exists) |
| P5 | Coach | Not started (read-only list exists) |
| P6 | Progress/readiness depth | Partially (core exists; projection absent) |
| P7 | Auth / sync hardening | Not started (code works; schema exposure stuck) |
| P8 | Monetization seams | Not started |
| P9 | Polish | Partially (focus rings, ErrorBoundary done) |

---

## 3. What we built (architecture)

### 3.1 Monorepo layout

```
Zivvvo/
  apps/web/                  React PWA (the app)
  packages/assessment-engine Sessions, diagnostics, readiness, scoring, variants, difficulty, mock
  packages/learning-engine   Mastery, spaced repetition, weakness, recommend, planner, engagement, config
  packages/ai-gateway        Abstraction types + tested mock provider
  packages/content           Content pack types + data/content-v1.json (production pack)
  tools/zivvvo/              Content pack generator (CSV → JSON), image copier, precache builder, seed data
  supabase/migrations/       001_init_zivvvo.sql (isolated zivvvo schema, additive to EduStack)
  docs/                      Vision, roadmap, engine specs, UX principles, decisions, analytics spec
```

The app lives in a single Vite root with workspaces. There is no Turborepo or
CICD pipeline yet (no `.github/workflows`).

### 3.2 Layering

The project enforces a strict layering rule: **engines decide, UI consumes**.

- `engine.ts` in `apps/web/src/` is a read-only facade over the learning and
  assessment engines. It exposes `nextActivity()`, `topicMastery()`,
  `weaknesses()`, `learnerState()`, `sessionFor()`, `smartTopicSession()`,
  `quickSession()`, `mockSession()`, `planDaySession()`, `lastMockAt()`.
- The React pages consume only `engine.ts` outputs. There is no
  recommendation logic, no mastery calculation, no weakness detection in any
  `.tsx` file.
- The new `learnPath.ts` module follows this same rule: it is a pure function
  that calls engine-layer functions and returns a result the UI renders.

### 3.3 Offline-first persistence

All data writes go through Dexie (IndexedDB) in a write-through pattern:
attempt → `db.attempts.put()` → sync queue → push to Supabase.

The `SyncManager` (pure, testable) tracks pending attempts (syncedAt === null),
pushes them via a `SyncBackend` interface, and marks them synced on success.
`SupabaseSyncBackend` implements the real HTTP path with lazy `supabase-js`
import (the library is only fetched when sync is triggered, keeping the main
bundle small).

### 3.4 Supabase schema

A single migration (`001_init_zivvvo.sql`) creates an isolated `zivvvo`
schema with:
- `zivvvo.attempts` (append-only attempt journal)
- `zivvvo.learners` (device anchor rows)
- `zivvvo.sync_watermark` (per-device idempotence aid)
- `zivvvo.content_pack` (placeholder for server distribution)
- `zivvvo.request_device_id()` function (reads `x-device-id` from request headers)
- RLS policies scoped to the owning device (insert/select/update gated on device_id)
- `grant` statements for `anon`, `authenticated`, `service_role`

The schema is additive-only: it never touches the `public` schema or any other
pre-existing object in the shared Supabase instance (EduStack product).

---

## 4. What we have right now (concrete inventory)

### 4.1 Content

| Metric | Value |
| --- | --- |
| Total questions | 1,249 |
| Answered (≥ 2 keyed options) | 980 |
| Skip / unanswered | 269 |
| Content topics | 8 |
| Concepts | 19 |
| Explanations | 242 (~19%, source-capped) |
| Image references | 446 (158 unique files) |
| Practice mocks | 2 (in content manifest) |

The content is the source of truth. Questions are single-option-mapped from
CSV, with `isCorrect` hidden from non-answered rows (generator fix in this
session). The content pack is committed as `content-v1.json` and loaded by
`packages/content`.

### 4.2 Engines

**Learning engine** — all unit-tested:

| Module | What it does |
| --- | --- |
| `mastery.ts` | Smoothed accuracy with prior, recent-weighted; per-topic and per-concept |
| `recommend.ts` | `getNextBestActivity` — priority ladder returning activity + reason + duration |
| `planner.ts` | `buildPlan` (teach/reinforce/weak order by exam date) + `planCursor` |
| `spaced.ts` | Spaced-repetition due-ness (`isDue`, `applyAnswer`) |
| `weakness.ts` | `detectWeakness` (early / long-unreviewed); `classifyPattern` (unused) |
| `engagement.ts` | XP, streak + freeze, daily-goal, triangular levels |
| `config.ts` | All tunable thresholds in one place |

**Assessment engine** — all unit-tested:

| Module | What it does |
| --- | --- |
| `sessions.ts` | Builds all session types: diagnostic, smart, topic, weakness, review, quick, mistake-review, mock (fixed + dynamic) |
| `readiness.ts` | Two-band readiness (insufficient / ready) with gap context |
| `mock.ts` | `ZVID_MOCK_DEFAULT`, `mockScore`, `mockReview` (experimental) |
| `scoring.ts` | `gradeQuestion` |
| `difficulty.ts` | Author difficulty, empirical difficulty, ramp |
| `variants.ts` | `composeVariant`, `baseQidOf`, `variantSeed` |
| `summaries.ts` | `buildSessionSummary` |

### 4.3 Web app

| Screen | What it does |
| --- | --- |
| **Onboarding** | 4 steps: name → goal + exam date → timeline → confidence → finish |
| **Home** | Readiness banner, next activity (title + reason + time + "Do it now"), today's plan, quick time-pick, streak/level, exam-date editing |
| **Learn** | **Adaptive path** (just landed) — ordered by mastery/weakness/signal, each entry shows status + reason + action |
| **Practice** | Session runner (answer → reveal → review), mode flows, review recycle list, mock exam timer, sounds |
| **Progress** | Readiness breakdown, topic mastery bars, goal, sync status, JSON data export |
| **Coach** | Weakness evidence list with rank + reason labels (**read-only**) |

**Infrastructure:**
- Zustand store with full learner lifecycle (init → onboard → session → mastery → new rec)
- Dexie v2 (write-through persistence, schema v2 with engagements table)
- PWA: service worker precaching 170 URLs, manifest, icons, `noindex` robots
- Sound hooks (correct/wrong/goal/levelup) + vibration
- ErrorBoundary at app root
- Focus-visible rings on all interactive elements

### 4.4 AI gateway

Types + tested mock provider only. No generative provider is wired. Correctly
futurized in `docs/AI_ARCHITECTURE.md`. The mock returns static explanation
text; the abstraction hides the provider.

---

## 5. What works end-to-end

The following user journeys are fully functional and load-proofed:

1. **First-time user**: onboarding (name → goal → timeline → confidence) → Home
   shows "Take your diagnostic" → Practice runs diagnostic → Home recomputes
   readiness → recommends next activity based on actual performance.

2. **Returning user with evidence**: Home recommends the single best next step
   (weakness recovery, smart practice on unpractised material, review of due
   cards, mock exam, etc.) with a grounded reason.

3. **Learn path**: personalized topic order derived from the learner's state;
   "Focus this" starts a targeted topic session.

4. **Mock exam**: timer, 30-question exam, score + pass/fail, review breakdown
   by topic, recommended recovery paths.

5. **Practice session**: answer → reveal explanation + image → review list →
   spaced repetition scheduling → session summary → return to Home.

6. **Stress test**: three synthetic learner profiles (grinder, casual, sprint)
   run over 120–365 simulated days using the real 1,249-question bank. All
   engine invariants hold (readiness band correctness, session builder safety,
   planner + cursor monotonicity, recommendation coverage, no NaN in mastery,
   no invalid qids, variant composition, diagnostic stratification).

7. **Data persistence**: IndexedDB write-through across page reloads; full JSON
   export from Progress.

---

## 6. QA pass — what we found and fixed

This session included a comprehensive QA pass across content, engines, UI flow,
stress, and documentation.

### 6.1 Content generator fix

**Root cause**: `tools/zivvvo/build-content-pack.mjs` line 226 demoted
single-option CSV rows to `"skip"` status but kept the `correctIndexes` and
`isCorrect` marks in the output JSON. This meant some "skip" questions
erroneously carried key data and `isCorrect: true`, which violated the
invariant that only answered questions have keys.

**Fix**: Added a `finalKeys` variable that sets keys to `[]` for non-answered
rows, ensuring `isCorrect` is never leaked to skip questions.

**Verification**: Tightened `content.test.ts` to assert:
- `answered` ⟺ keyed AND ≥ 2 options
- Non-answered rows carry zero keys and no `isCorrect`
- No duplicate `qid` in the pack
- All topics and concepts from metadata are represented

**Stats preserved**: 1,249 questions, 980 answered, 269 skip, 242 explanations,
446 imageRefs, 158 images.

### 6.2 Stress suite

**New file**: `apps/web/src/stress.test.ts` (8 tests).

| Test | What it proves |
| --- | --- |
| Grinder 365d | 8,760 minutes of sessions, every engine invariant holds |
| Casual 365d | Mixed pacing, same invariant guarantees |
| Sprint 120d | Dense 60d bursts, planner + recommendation always returns |
| Full bank engine coverage | Every question in the 1,249-question bank feeds through readiness, mastery, recommendation |
| Variant composition | `composeVariant` always returns a well-formed variant |
| Diagnostic stratification | Diagnostic spreads questions across content topics |
| Mock construction | `ZVID_MOCK_DEFAULT` builds without errors |
| Weakness NaN-free | No NaN in mastery after any attempt pattern |
| Planner + cursor | Cursor advances monotonically, never skips days |
| Recommender blast | Every attempt pattern produces a valid next activity |

### 6.3 UI/flow QA

A subagent audit of all five pages found **zero P1 issues**.

**P2 findings:**
| ID | Finding | Status |
| --- | --- | --- |
| P2-1 | No Settings page (rename/daily-goal change is dead code) | Acknowledged; roadmap item |
| P2-2 | No ErrorBoundary | **Fixed** — `ErrorBoundary.tsx` added, wrapped around `<App>` |
| P2-3 | Weakness classification never returns "recurring"/"deteriorating" | Acknowledged; `classifyPattern` exists but is unused |
| P2-4 | Multi-select UI prevents multi-correct answers | Latent (0 multi-correct in bank) |
| P2-5 | "blueprinted" copy in planner | **Fixed** → "A full practice mock exam under exam conditions." |

**P3 / polish findings addressed:**
- `practice` button changed to `Practise` (British English)
- Practice stem only shows the `<p>` block when `q.stem` exists (not for stemless questions)
- Focus-visible rings added to: Button (`ui.tsx`), nav tabs + mute button (`App.tsx`), onboarding inputs (`OnboardingFlow.tsx`)

### 6.4 Stress test fixes

Two initial failures were fixed:
- `planner.test.ts`: `today` parameter was passed as day-of-epoch number instead
  of milliseconds — fixed to `today * 86_400_000`
- `stress.test.ts`: smart-topic sessions aren't pure topic sessions when pool < size —
  they add reinforcement from other topics, so single-topic ratio assertion was
  adjusted from `=== 1` to `>= 0.7`

### 6.5 Content nits (not fixed — logged)

| Nit | Detail |
| --- | --- |
| Double prohibition lines | T95Q2 image → "Can not be crossed at anytime"; t8q8 → "Overtaking... prohibited" — same stem, different answers, 6 members across 2 images |
| "Coach herbert" variant | 3 members, same answer concept, different text phrasing |

These are content-authoring inconsistencies, not code bugs. Not blocking.

---

## 7. What is broken or stuck

### 7.1 PostgREST schema exposure (PGRST002)

**Symptom**: `GET /rest/v1/zivvvo/attempts` returns `503` with
`PGRST002: Could not query the database for the schema cache. Retrying.`

**Root cause**: The raw `alter role authenticator set pgrst.db_schemas` +
`notify pgrst, 'reload schema'` left PostgREST's schema cache in a wedged
retry loop. Auth (200) and Storage (200) health are fine — the project is
healthy, only the `/rest/v1` gateway is stuck.

**Code fix applied**: `sync-supabase.ts` now sets `db: { schema: "zivvvo" }`
on the Supabase client — without this, the client defaulted to `public.attempts`
and sync could never work regardless of schema exposure.

**Remote fix still needed**: Dashboard → Project Settings → API → Exposed
schemas → add `zivvvo`. If still stuck, run `alter role authenticator reset
pgrst.db_schemas;` in SQL Editor first, then re-add via Dashboard.

**Impact**: Cloud sync is non-functional until this is resolved. The app works
fully offline without it.

### 7.2 Recurring / deteriorating classification

`classifyPattern()` in `packages/learning-engine/src/weakness.ts` implements
the logic to detect recurring misses and deteriorating performance, but it is
never called from any production code path. The Coach page has `KIND_LABEL`
entries for "recurring" and "deteriorating" that will never be matched.

**Impact**: Two of the four weakness kinds described in the product vision are
unreachable. The Coach shows only "early" and "long-unreviewed" weaknesses.

### 7.3 Settings dead code

`store.updateLearner()` exists and can update `name`, `goal`, and
`dailyMinutes`. The only UI consumer is `Home.tsx` for exam-date editing. There
is no Settings page, and rename/daily-goal-change are unreachable.

### 7.4 Manifest timestamp churn

`apps/web/public/images/manifest.json` is a build artifact (tracks which
images exist) but is committed to git. Every `build:web` run updates its
`generatedAt` timestamp, creating a diff on every build. Should be gitignored.

---

## 8. What is partially implemented

| Area | Engine support | UI support | Gap |
| --- | --- | --- | --- |
| Diagnostic | `buildDiagnostic`, `diagnosticProfile` | Not auto-launched; recommended on Home | Fewer questions than planned; no post-diagnostic deep profile display |
| Multi-select | Store and session builders support it | Latent UI (0 multi-correct questions in bank) | Need multi-correct questions in content first |
| Explanations | 19% of answered questions carry one | Shown in Practice reveal step | Source-capped; many questions still lack explanations |
| Mistake-review sessions | `buildMistakeReviewSession` exists | No page, no auto-population | Variants + session builders work; need a Mistake Book page |
| Learn adaptive path | `learnPath.ts` (new) | `Learn.tsx` rewritten | Just landed; may need iteration based on real learner feedback |

---

## 9. What we have not started

| Area | Detail |
| --- | --- |
| **Analytics** | `docs/ANALYTICS.md` defines 15+ events; zero tracking calls exist in the app |
| **Auth** | No user accounts; onboarding is purely local device + learner name; RLS is device-scoped |
| **Settings page** | Rename, daily goal, exam date — no dedicated UI |
| **Mistake Book page** | Engine support exists; no page or auto-population |
| **Coach actions** | Read-only weakness list; no buttons, no conversation surface |
| **Challenge modes** | Daily / Speed Run / Survival / Mixed not implemented |
| **Readiness projection** | Core readiness exists; exam-date-based forecast absent |
| **CICD** | No GitHub Actions, no Turborepo, no deployment pipeline |
| **Monetization** | No free/premium flags or feature gating |
| **AI explanations** | Mock provider only; no real generative provider |
| **Server-side content** | `content_pack` table is a placeholder; no server distribution |
| **i18n / Shona** | No multilingual support |

---

## 10. The first vertical slice (Learn adaptive path)

### 10.1 What landed

A new domain module `apps/web/src/learnPath.ts` and a rewritten `Learn.tsx`
page.

**`learnPath(state, now?)`** is a pure function that:
1. Computes mastery for every content topic using `masteryBy` (same config as
   the rest of the engine).
2. Calls `getNextBestActivity` to determine the engine's recommended target.
3. Classifies each topic as **focus** (weak), **fresh** (insufficient
   evidence), **maintained** (developing), or **strong** (above threshold).
4. Uses `detectWeakness` to provide grounded reasons (stale, low accuracy,
   etc.).
5. Sorts: focus first (worst mastery), then fresh (pack order), then
   maintained, then strong.
6. Returns `{ entries, focusTopicId, why }`.

**`Learn.tsx`** renders the path as cards, each showing:
- Topic label + status chip (tone-coded)
- Mastery meter + evidence count
- Grounded reason (derived from the learner's actual state)
- "Focus this" primary button on the leader; ghost buttons on the rest
- A "Why these first?" italic subtitle explaining the ordering principle

### 10.2 Design invariants

- The path order is **entirely state-derived**. Two learners with different
  attempt patterns get different paths. No hardcoded topic order.
- The `focusTopicId` matches `getNextBestActivity().targetTopicId` when the
  engine recommends a topic, ensuring Home and Learn agree.
- No recommendation logic lives in JSX. The page is a pure renderer.
- Empty state (no attempts) shows all topics as "fresh" in pack order.

### 10.3 Tests (7 tests, all passing)

| Test | What it proves |
| --- | --- |
| Empty state → all fresh in pack order | No hardcoded order for new learners |
| Weak topic ranks first as focus | State-derived ordering works |
| Strong topic below weak and fresh | Status hierarchy is correct |
| Two weak topics → worst mastery first | Sorting within status groups |
| Reasons reflect actual state | Grounded, not generic |
| Long-unreviewed → stale reason | `detectWeakness` integration |
| Leader matches engine recommendation | Home-Learn consistency |

---

## 11. Test suite and quality gates

### 11.1 Current numbers

| Gate | Status |
| --- | --- |
| `npm run typecheck` | Clean (zero errors) |
| `npm test` (vitest) | **203 tests, 22 files, all passing** |
| `npm run build:web` | Green (158/158 images, sw.js 170 URLs, version `c3ae2280a159`) |

### 11.2 Test file inventory

| File | Tests | Covers |
| --- | --- | --- |
| `mock.test.ts` | 15 | Mock blueprint, score, review |
| `smoke.test.ts` | 12 | Full user journeys through the store |
| `readiness.test.ts` | 10 | Readiness v2 bands and edge cases |
| `recommend.test.ts` | 13 | Priority ladder, all activity kinds |
| `variants.test.ts` | 11 | Variant composition, deduplication |
| `sessions.test.ts` | 12 | All session builders |
| `difficulty.test.ts` | 17 | Author, empirical, ramp |
| `engagement.test.ts` | 14 | XP, streak, levels, daily goal |
| `learnPath.test.ts` | 7 | Learn adaptive path ordering |
| `sync.test.ts` | 7 | SyncManager pure logic |
| `summaries.test.ts` | 5 | Session summaries |
| `planner.test.ts` | 9 | Plan building and cursor |
| `weakness.test.ts` | 8 | Weakness detection and classification |
| `mastery.test.ts` | 7 | Mastery computation and thresholds |
| `spaced.test.ts` | 7 | Spaced repetition scheduling |
| `onboarding.test.ts` | 12 | Onboarding state machine |
| `diagnostic.test.ts` | 4 | Diagnostic session building |
| `content.test.ts` | 6 | Content pack invariants |
| `mock.test.ts` (ai-gateway) | 7 | AI mock provider |
| `scoring.test.ts` | 8 | Answer grading |
| `sound.test.ts` | 4 | Sound state machine |
| `stress.test.ts` | 8 | Full-year learner journeys over real bank |

### 11.3 Known test limitations

- No jsdom or component tests — UI is untested except for store-level smoke
  tests. No DOM rendering tests exist for any page.
- `stress.test.ts` takes ~15 seconds (full-year simulation over 1,249
  questions). Acceptable for CI but slow for rapid iteration.
- No E2E tests (Playwright, Cypress, etc.).

---

## 12. Known content issues

| ID | Issue | Severity |
| --- | --- | --- |
| C-1 | "Double prohibition lines" ambiguity — T95Q2 image ("Can not be crossed at anytime") vs t8q8 text ("Overtaking... prohibited") — same stem, different answers, 2 images | Low (content backlog) |
| C-2 | "Coach herbert gave you the permission to proceed?" — 3 members with variant phrasing, same answer concept | Low (content backlog) |
| C-3 | Explanation coverage at ~19% — source-capped, many questions lack explanations | Medium (quality gap) |
| C-4 | 269 skip/unanswered questions — no exercises for these yet | Medium (coverage gap) |

---

## 13. Technical debt and design decisions

### 13.1 Decisions in force (from ADRs in `docs/DECISIONS.md`)

| ADR | Decision | Status |
| --- | --- | --- |
| ADR-001 | No auth initially; device-scoped RLS | Implemented |
| ADR-002 | Content pack as offline source of truth | Implemented |
| ADR-003 | Zustand for client state | Implemented |
| ADR-004 | Dexie for IndexedDB | Implemented |
| ADR-005 | Single-device learner profile | Implemented (multi-profile is future) |
| ADR-006 | UI consumes `engine.ts` only | Enforced; Learn path follows this |
| ADR-007 | No hardcoded recommendations | Enforced |
| ADR-017 | Mock blueprint is experimental | Flagged in code and docs |

### 13.2 Open debts

| Debt | Detail |
| --- | --- |
| `classifyPattern` unused | `weakness.ts` has full recurring/deteriorating logic that never runs |
| `updateLearner` dead code | Zustand action exists but no UI calls it (except exam date) |
| Manifest tracked in git | `apps/web/public/images/manifest.json` churns on every build |
| No CICD | No GitHub Actions; manual push only |
| No component tests | Zero jsdom/rendering tests for any React component |
| Chunk size warning | Build produces 797KB JS chunk (content pack is large); no code-splitting |
| `store.ts` type size | Large zustand store with many actions; consider splitting |
| Tailwind v4 CJS warning | `The CJS build of Vite's Node API is deprecated` — appears on every test run |
| Old empty CWD | `C:\Users\TIMIRE\Downloads\reaction-speed-roulette` locks tools' default working directory; must pass explicit Zivvvo path for glob/grep |

---

## 14. What still needs to be done (full backlog)

### 14.1 Immediate (next sprint)

| Item | Priority | Detail |
| --- | --- | --- |
| Fix PostgREST schema exposure | P0 blocker | Dashboard step; code is ready |
| Coach that acts (S12) | P1 | Wire `classifyPattern`, add action buttons, conversation surface |
| Mistake Book page (S11) | P2 | Auto-populate from repeated failures, use `buildMistakeReviewSession` |
| Settings page | P2 | Rename, daily goal, exam date; `updateLearner` already wired |
| Challenge modes (S10) | P3 | Daily / Speed Run / Survival / Mixed |

### 14.2 Medium-term

| Item | Detail |
| --- | --- |
| Readiness projection | Exam-date-based forecast; shareable output |
| Explanation coverage | Source more explanations (target 80%+) |
| Multi-correct questions | Add multi-correct content to exercise the existing UI |
| Analytics instrumentation | Wire the events in `docs/ANALYTICS.md` |
| CICD pipeline | GitHub Actions for build + deploy |
| Component tests | Add jsdom tests for critical pages |
| Code splitting | Dynamic import for the content pack (797KB → lazy) |

### 14.3 Long-term

| Item | Detail |
| --- | --- |
| Auth (email/password) | Real user accounts; user-scoped RLS |
| AI explanations | Wire a real generative provider behind `ai-gateway` |
| i18n / Shona support | Multilingual UI |
| Spoken explanations | Audio content |
| Monetization | Free/premium feature gating |
| Server-side content distribution | Use `content_pack` table for OTA updates |
| Multi-device sync | Beyond single-device RLS |

---

## 15. Guardrails — what not to change

1. **Do not rebuild the learner loop.** It works and is stress-tested. Productize on top.
2. **Do not put recommendation logic in the UI.** Engines decide; UI consumes.
3. **Do not touch the `public` schema in Supabase.** Zivvvo is additive-only.
4. **Do not let AI own correctness.** AI is an enhancement layer behind `ai-gateway`.
5. **Do not change the content pack stats** (1,249/980/269) without a reviewed bump.
6. **Do not commit analytics before the product surface that generates events exists.**
7. **Do not add dependencies without justification.** Each must earn its place.

---

## 16. Supabase / backend state

| Component | Status |
| --- | --- |
| Supabase project | Live: `uvmgmbwnsdebtkwldfaa` (EduStack, eu-west-2) |
| Migration | `001_init_zivvvo.sql` — isolated `zivvvo` schema, RLS, grants |
| PostgREST exposure | **Stuck** (PGRST002) — needs Dashboard fix |
| Client code | Fixed (targets `zivvvo` schema, sends `x-device-id`) |
| Auth health | 200 ✓ |
| Storage health | 200 ✓ |
| REST health | 503 ✗ (schema cache wedged) |
| CLI | Installed v2.116.0; not logged in (no access token) |
| `.env.local` | Configured with publishable key |
| GitHub Actions secrets | Set (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) |
| Workflows | None (no `.github/workflows` yet) |

---

## 17. Files of record

### 17.1 New files (this session)

| File | Purpose |
| --- | --- |
| `apps/web/src/learnPath.ts` | Domain module: adaptive learning path derivation |
| `apps/web/src/learnPath.test.ts` | 7 tests for the Learn path |
| `apps/web/src/ErrorBoundary.tsx` | App-level crash boundary |
| `apps/web/src/stress.test.ts` | 8 full-year stress tests |
| `docs/CURRENT_STATE.md` | Single source of truth for project state |
| `Project_Report.md` | This file |

### 17.2 Modified files (this session)

| File | Change |
| --- | --- |
| `apps/web/src/pages/Learn.tsx` | Rewritten: topic browser → adaptive path |
| `apps/web/src/App.tsx` | ErrorBoundary wrap, nav/mute focus rings |
| `apps/web/src/OnboardingFlow.tsx` | Input focus-visible rings |
| `apps/web/src/pages/Practice.tsx` | Conditional stem `<p>`, "Practise" spelling |
| `apps/web/src/ui.tsx` | Button focus-visible ring |
| `apps/web/src/sync-supabase.ts` | `db: { schema: "zivvvo" }` fix, type widening |
| `packages/content/src/content.test.ts` | Tightened invariants |
| `packages/content/src/data/content-v1.json` | Regenerated (1-line diff) |
| `packages/learning-engine/src/planner.ts` | Mock copy fix |
| `tools/zivvvo/build-content-pack.mjs` | FinalKeys hygiene fix |
| `docs/ROADMAP.md` | S9 status → "In progress" |
| `docs/ARCHITECTURE.md` | Status → "Implemented" |
| `docs/README.md` | Test count 98 → 203 |
| `docs/SECURITY.md` | Status update (project exists) |
| `docs/AI_ARCHITECTURE.md` | Status → "Implemented" |

### 17.3 Git state

| Field | Value |
| --- | --- |
| Remote | `https://github.com/timiretimzzy/zivvvo.git` |
| Branch | `main` |
| HEAD | `7db3c81` |
| Commits this session | `52e107d` (QA hardening), `7db3c81` (Learn slice + docs) |
| Untracked | `manifest.json` (build artifact, should be gitignored) |

---

## 18. Questions for the reviewer

1. **Layering**: Is the separation between engines (packages) and UI (apps/web)
   clean enough? Should `learnPath.ts` live in `packages/learning-engine`
   instead of `apps/web/src/`?

2. **Content coverage**: With 269 unanswered questions and 19% explanation
   coverage, is the content bank ready for real users, or should content work
   be prioritized over UI features?

3. **PostgREST**: The schema cache is wedged at PGRST002 after `alter role` +
   `notify pgrst`. Is the Dashboard Exposed Schemas path the right fix, or is
   there a cleaner migration approach for hosted Supabase?

4. **Auth**: The brief says P7 (auth/sync hardening). Given that device-scoped
   RLS works without auth, should we add real auth now (email/password) or
   defer until the product surface is larger?

5. **Analytics timing**: Should analytics instrumentation start now (to measure
   the learning loop from day one) or wait until the product surface stabilizes?

6. **Stress test speed**: The stress suite takes ~15s. Should it be split into
   a fast subset for日常 iteration and a slow subset for CI only?

7. **Content pack size**: The JS bundle is 797KB (mostly the content pack). Is
   code-splitting the content pack (lazy load) worth the complexity now, or
   should we defer until it becomes a user-visible performance issue?

8. **Coach priority**: The brief puts Coach at P5. Given that the weakness list
   is read-only and `classifyPattern` is dead code, should Coach be promoted
   to P2 (right after Learn) to close the "see but can't act" gap?

9. **Monorepo tooling**: No Turborepo, no CICD. Is the current single-Vite-root
   approach sustainable, or should we invest in workspace tooling now?

10. **Mistake Book**: The engines already support mistake-review sessions and
    variants. How much UI work is needed to make this feel like a real feature
    vs. a thin page over existing engine calls?
