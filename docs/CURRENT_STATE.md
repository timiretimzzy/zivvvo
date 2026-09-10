# Zivvvo — Current State (truth)

_Last verified: 2026-09-10._

This file is the single source of truth for what exists today, what works,
what is broken, and what is planned. Read it before touching the codebase. If
anything below disagrees with a doc in `docs/`, **trust this file (and the
code)**; then fix the doc (see [Documentation reconciliation](#documentation-reconciliation)).

**How this was established:** direct read of every package's source and tests,
all five pages, the store, sync, PWA assets, the Supabase migration, and the
content generator; plus passing local gates (`npm run typecheck`, `npm test`,
`npm run build:web`) at the time of writing.

---

## 1. Verification gate

| Gate | Status |
| --- | --- |
| `npm run typecheck` | clean |
| `npm test` (vitest) | 196 tests, 21 files, all pass |
| `npm run build:web` | green; 158/158 images copied; sw.js precaches 170 URLs |
| PWA health | SW + manifest + icons present; `noindex` robots (intended pre-launch) |

---

## 2. Repository map

```
apps/web                 React 18 + Vite 5 + Tailwind 4 PWA (offline-first, IndexedDB)
  src/engine.ts          READ-ONLY domain facade: computed readiness/mastery/plan/activity
  src/store.ts           zustand store: learners, attempts, reviews, sessions, engagement, sync surface
  src/db.ts              Dexie schema v2 (write-through persistence)
  src/sync.ts            pure offline-first sync spine (testable, no network/IDB)
  src/sync-supabase.ts   live Supabase backend (lazy supabase-js import, zivvvo schema)
  src/pages/             Home, Learn, Practice, Progress, Coach  (tab bar; header; mute)
  src/OnboardingFlow.tsx 4-step onboarding (name, goal+date, timeline, confidence)
  src/ErrorBoundary.tsx  app-level crash boundary
  src/{sound,seed,onboarding,catalog}.ts
packages/assessment-engine  sessions, diagnostics, readiness, mock, scoring, difficulty, variants, summaries
packages/learning-engine    mastery, spaced, weakness, recommend, planner, engagement, config
packages/ai-gateway         types + mock provider only (no real generative provider)
packages/content             types, index, data/content-v1.json (production pack)
tools/zivvvo                build-content-pack.mjs (CSV -> JSON generator)
supabase/migrations/001_init_zivvvo.sql (isolated zivvvo schema; additive)
docs/                       vision/roadmap/engine/ux/decisions/docs (some stale — see §9)
```

---

## 3. Already implemented (production-capable core)

The learning loop compiles, persists, syncs (code-side), and is exercised by a
stress suite over the real content bank.

### 3.1 Content (source of truth, offline)
- 1249 questions; **980 answered** (single-option-mapped, ≥2 keys), **269
  skip/unanswered** rows carried for full-answer coverage later.
- 19 concepts, 8 content topics, 242 explanations (~19%, source-capped),
  446 `imageRef` (158 copied files), 2 practice mocks stored in manifest.
- Generator (`tools/zivvvo/build-content-pack.mjs`) is idempotent and now emits
  zero-key rows for non-answered questions (`isCorrect` never leaks).
- `content-v1.json` is committed and loaded by `packages/content`.

### 3.2 Learning engine (`packages/learning-engine`)
- `mastery.ts` — per-topic and per-concept mastery from attempt evidence
  (`computeStat`, `masteryBy`, status thresholds in `config.ts`).
- `recommend.ts` — `getNextBestActivity` with priority ladder
  (learning-path → weak-topic → recovery → mock → challenge → next-topic),
  returns activity + reason + duration guidance; no hardcoded picks.
- `planner.ts` — `buildPlan` (teach/reinforce/weak order by exam date) +
  `planCursor` ("today's plan").
- `spaced.ts` — spaced-repetition due-ness (`isDue`, `applyAnswer`).
- `weakness.ts` — `detectWeakness` per qid (early / long-unreviewed).
  `classifyPattern` exists but is **unused** (recurring/deteriorating never
  emitted — see §5).
- `engagement.ts` — streak/level/next-level-from (level-ups await).
- **Test coverage:** recommend, planner, mastery, spaced, weakness, engagement,
  config — all unit-tested.

### 3.3 Assessment engine (`packages/assessment-engine`)
- Sessions: diagnostic, smart, topic, weakness, review, quick, mistake-review,
  mock (fixed & dynamic), with topic weighting and `purpose` text.
- `readiness.ts` — two-band readiness (insufficient / ready) with gap context.
- Mock blueprint (`mock.ts`: `ZVID_MOCK_DEFAULT`) + `mockScore`/`mockReview`;
  flagged **experimental** per decision docs.
- `scoring.ts`, `difficulty.ts` (author/empirical/ramp), `variants.ts`
  (`composeVariant`/`baseQidOf` — same stem, shuffled options/asks), `summaries.ts`.
- **Test coverage:** sessions, readiness, mock, scoring, difficulty, variants,
  summaries, diagnostic — all unit-tested.

### 3.4 Web app
- **Onboarding** → Home loop: 4 steps; after finish the learner lands on Home
  with a science-based recommendation (baseline diagnostic if none exists).
- **Home** — readiness banner, next recommended activity (title, reason, time),
  "Do it now", today's plan via `planCursor`, quick time-pick, streak/level,
  exam-date editing, goal card. Uses only `engine.ts` outputs (no UI-side
  recommendation logic).
- **Practice** — session runner (answer → reveal → review), mode-appropriate
  flows, review recycle list, mock exam timer, sounds + vibration hooks.
- **Progress** — readiness breakdown, topic mastery, goal, sync status card,
  full JSON data export (`zivvvo-{learnerId}.json`).
- **Coach** — weakness evidence list with rank + reason labels (currently
  **read-only**; no actions — see §7).
- **Persistence & offline** — Dexie v2 write-through for attempts/reviews/
  sessions/learners/meta/engagements; PWA SW precaches everything.
- **Sync** — `SyncManager` pushes pending attempts via
  `SupabaseSyncBackend`. `sync-supabase.ts` targets the isolated `zivvvo`
  schema (client sets `db.schema`) and sends `x-device-id` for the RLS gate.
- **Reliability** — `ErrorBoundary` at app root; focus-visible rings on
  buttons/nav/onboarding; no-emulation flavor text.

### 3.5 AI gateway (`packages/ai-gateway`)
- Abstraction types + a tested **mock provider**. No generative provider wired.
  Correctly labelled future work in `docs/AI_ARCHITECTURE.md`.

---

## 4. Partially implemented

- **Diagnostic depth**: onboarding records goal/date/timeline/confidence but
  does **not** auto-launch the diagnostic; it appears as the recommended next
  activity on Home (loop works; fewer than the planned questions).
- **Multi-select**: store/engine support multi-correct answers; bank currently
  has zero multi-correct questions; the UI presented multi-select is latent.
- **Weakness signals**: only *early* / *long-unreviewed* are produced;
  *recurring* / *deteriorating* logic (`classifyPattern`) never runs.
- **Explanations**: 19% of answered questions carry one (source-capped).
- **Learn page**: a topic **browser** (mastery-ranked list), not yet the
  adaptive learning path — see §7.

---

## 5. Broken / not working right now

| Item | Detail | Status |
| --- | --- | --- |
| Remote PostgREST exposure of `zivvvo` | `GET /rest/v1/zivvvo/attempts` → 503 `PGRST002` (schema cache wedged after `alter role` + reload). `auth`/`storage` health OK → project fine, only `/rest/v1` affected. | Fix via Dashboard → API → Exposed schemas (add `zivvvo`); fallback `alter role authenticator reset pgrst.db_schemas;` then re-add. Client code already targets `zivvvo`. |
| "Recurring" / "Deteriorating" classification | dead code path; Coach labels unreachable | wire `classifyPattern` into the weakness pipeline when Coach actions land |
| Settings (rename / daily-goal change) | no page; `store.updateLearner` unused from UI (only exam date editable) | under productization |
| Content nits (non-blocking) | «double prohibition lines» ambiguity (T95Q2 ↔ t8q8, differing answers); «coach herbert» variant-phrased trio same answer | content backlog |
| `apps/web/public/images/manifest.json` | regenerated timestamp churn on every build; tracked | consider gitignoring |

---

## 6. Planned but NOT started (confirmed absent from code)

- Analytics instrumentation — `docs/ANALYTICS.md` defines events
  (`onboarding_started`, `session_completed`, `recommendation_generated`, …);
  **no tracking calls exist anywhere** in the app.
- Auth (email/password) — onboarding is purely local device + learner name.
  Migration has no users table; RLS is device-scoped, not user-scoped.
- Mistake Book as a page; Challenge/mixed modes; daily-goal-driven badges.
- Server-side content distribution (`content_pack` table placeholder only).
- Monorepo package split is real, but the repo lives in a single Vite root;
  there is no workspace tooling/CICD yet (no `.github/workflows`, no Turborepo).

---

## 7. Needs productization (in priority order)

1. **Learn tab → adaptive learning path** (roadmap S9). Current page is a topic
   browser. The engines already produce what a path needs (mastery, weakness,
   planner order, recommendation). Move the *ranking* into a domain helper and
   have the page render it. *(selected as the first vertical slice → §10)*
2. **Coach that acts** (S12) — weakness list has no buttons; no
   recurring/deteriorating wiring; no conversation surface.
3. **Practice challenges** (S10) — smart/weakness entry points exist via Home/
   Learn; dedicated challenge + mixed modes do not.
4. **Mistake Book** (S11) — variants + mistake-review sessions exist in the
   engine; there is no page and no auto-population from repeated failures.
5. **Settings** (rename, goal, daily minutes) — dead `updateLearner` path.
6. **Progress/readiness depth** (S6) — core exists; projection/forecast and
   shareable output (export JSON exists) are next.

---

## 8. Do not rebuild / guarding order

- **The learner loop.** It works and is load-proofed by the stress suite.
  Productize on top; do not restructure the packages.
- **Engines must stay the source of recommendation logic** — the UI consumes
  `engine.ts` only. No hardcoded recommendations, no UI-side read-around.
- **Content pack** is the offline source of truth; generator changes must keep
  stats (1249/980/269) stable or be a reviewed bump.
- **Supabase is additive-only** per `docs/supabase/no-touch-checklist.md`
  (EduStack shares the instance; `public` is untouched by Zivvvo).
- **AI stays behind `ai-gateway`** — nothing real proposed before a real
  provider; correctness is never AI's job.
- **No analytics** before the product surface that generates the events
  actually exists.

---

## 9. Documentation reconciliation

Verified against code on 2026-09-10. **Stale entries marked → fix.**

| Doc | State |
| --- | --- |
| `ROADMAP.md` | Mostly aligned; **S9 "Personalized learning path" is the active slice now**. Test-count lines stale. |
| `PRODUCT_VISION.md` | Aligned in spirit; §7/§62 read as aspiration, consistent with roadmap phases. |
| `UX_PRINCIPLES.md` | Aligned; design-system line in ROADMAP Phase 1 is satisfied by `ui.tsx`. |
| `LEARNING_ENGINE.md` | Aligned with implementations (mastery/spaced/weakness/recommend/planner/engagement). |
| `DECISIONS.md` | Aligned; ADR-017 mock-blueprint experimental marker matches code. |
| `ARCHITECTURE.md` | **STALE**: says application code / packages / offline / Supabase are "Planned (Phase 1)". All are implemented. Future list (OTA/BAZ onboarding, realtime coach edge, i18n, spoken explanations) remains future. |
| `README.md` | **STALE**: claims "98 Vitest tests" (ROADMAP says 110; actual today is 196). Slight feature underclaim; refresh. |
| `SECURITY.md` | **STALE**: states the project does not exist / is unmaintained. Must be rewritten for current state. |
| `PRODUCT.md` | Written pre-Phase-1 completion; reads as a pitch. Fine as product doc, not status. |
| `CONTENT_MODEL.md`, `DATABASE.md`, `OFFLINE_STRATEGY.md`, `ANALYTICS.md`, `AI_ARCHITECTURE.md` | Spec docs; statuses say planned where partially true (AI mock only; analytics zero). Acceptable with the caveats above. |
| `supabase/no-touch-checklist.md` | Accurate; follow it. |

---

## 10. First vertical slice (in motion)

**Learn tab → personalized adaptive learning path** (roadmap S9, priority P2).

Definition: Learn shows *"Your path"* — a single ordered, personalized to-do
list of topics derived from the learner's actual state, not from static rows.
Each entry shows status (**focus / fresh / maintained / strong**), why it's
there (grounded reason), evidence, and one action: "Focus this" → starts a
topic session for that content topic.

- Domain: new pure helper `learnPath(...)` in the app layer that derives the
  order from `masteryBy`, `detectWeakness`, planner/`isDue`, and the same
  signals `getNextBestActivity` uses — so Home's "next" and Learn's "focus"
  agree by construction. No recommendation logic in JSX.
- UI: Learn.tsx renders the path, a "Why these first?" note grounded in the
  entry reasons, and preserves the existing topic-session start.
- Tests: unit tests over varied synthetic learners (fresh / weak / mixed /
  exam-date-scheduled) asserting: order differs by state, focus matches the
  state-derived leader, status labels are consistent, no hardcoded ordering.
- Gates: `npm run typecheck`, `npm test`, `npm run build:web`.
- Docs: mark S9 in progress here and in `ROADMAP.md`.