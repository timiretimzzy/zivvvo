# Zivvvo — Product Inventory

_Generated 2026-09-14. Complete state of the project for handoff to a third-party AI agent._

---

## Table of contents

1. [Project identity](#1-project-identity)
2. [Original vision vs what we have](#2-original-vision-vs-what-we-have)
3. [Architecture overview](#3-architecture-overview)
4. [Complete file inventory](#4-complete-file-inventory)
5. [Feature inventory — every feature, its status, and where it lives](#5-feature-inventory--every-feature-its-status-and-where-it-lives)
6. [QA history — what we found and fixed](#6-qa-history--what-we-found-and-fixed)
7. [Known bugs and broken things](#7-known-bugs-and-broken-things)
8. [Partially implemented features](#8-partially-implemented-features)
9. [Not started](#9-not-started)
10. [Content inventory](#10-content-inventory)
11. [Product quality assessment](#11-product-quality-assessment)
12. [Technical stack and dependencies](#12-technical-stack-and-dependencies)
13. [Deployment state](#13-deployment-state)
14. [Supabase backend](#14-supabase-backend)
15. [Freemium strategy (designed, not yet coded)](#15-freemium-strategy-designed-not-yet-coded)
16. [Files of record](#16-files-of-record)
17. [Git history summary](#17-git-history-summary)
18. [What a new agent needs to know](#18-what-a-new-agent-needs-to-know)

---

## 1. Project identity

| Field | Value |
|-------|-------|
| **Name** | Zivvvo |
| **URL** | `https://www.zivvvo.co.zw/` |
| **Repo** | `https://github.com/timiretimzzy/zivvvo.git` (branch: `main`) |
| **Server** | `161.97.115.59` (root SSH, password `2512`) |
| **Supabase** | `https://uvmgmbwnsdebtkwldfaa.supabase.co` (project: `zivvvo`, schema: `zivvvo`) |
| **What it is** | Offline-first adaptive exam prep PWA for the Zimbabwe VID Class 2 provisional licence test |
| **Target user** | Zimbabwean learners preparing for the VID provisional driving licence theory exam |
| **Core thesis** | An exam-prep app should be a personal tutor — know what you're weak on, what's due for review, and how close you are to readiness, and act on that at every screen |

---

## 2. Original vision vs what we have

### What we set out to build

1. Diagnose a learner's ability
2. Reveal weaknesses
3. Recommend the next best thing to study
4. Repair knowledge gaps
5. Simulate the real examination
6. Tell the learner how ready they are
7. Work offline-first
8. Sync across devices when online

### What we have right now

| Vision goal | Status | Notes |
|-------------|--------|-------|
| Diagnose ability | Done | `buildDiagnostic` — 15-25 questions, auto-selects by weakness |
| Reveal weaknesses | Done | Coach page + `detectWeakness` in learning engine |
| Recommend next best | Done | `getNextBestActivity` with priority ladder |
| Repair knowledge gaps | Done | Adaptive sessions, spaced repetition, mistake review |
| Simulate exam | Done | Mock exam: 50 questions, 90min timer, pass mark 78% |
| Readiness score | Done | `computeReadiness` — band + percentage + note |
| Offline-first | Done | Dexie/IndexedDB + service worker precache |
| Cross-device sync | Done | Supabase + user-based cloud sync |

**All 8 original goals are implemented and working.**

---

## 3. Architecture overview

```
Zivvvo/
├── apps/web/          ← React PWA (Vite 5 + Tailwind 4 + Zustand + Dexie)
│   ├── src/
│   │   ├── pages/     ← 7 screens: Home, Learn, Practice, Progress, Coach, Settings, Nuggets
│   │   ├── store.ts   ← Central Zustand state (383 lines)
│   │   ├── App.tsx    ← Auth gate, tab routing, header/nav (279 lines)
│   │   ├── auth.ts    ← Google OAuth via Supabase (128 lines)
│   │   ├── engine.ts  ← Engine integration layer (211 lines)
│   │   ├── db.ts      ← Dexie/IndexedDB schema (83 lines)
│   │   ├── sync*.ts   ← Sync core + Supabase backend (394 lines)
│   │   └── ...        ← 20 source files, 7 pages, 7 test files
│   └── public/        ← PWA manifest, icons, 158 question images, privacy.html
│
├── packages/
│   ├── assessment-engine/  ← Session building, grading, scoring, readiness (20 files)
│   ├── learning-engine/    ← Mastery, spaced repetition, engagement, planner (14 files)
│   ├── content/            ← 1,249-question bank + types (4 files)
│   └── ai-gateway/         ← Mock AI layer (4 files)
│
├── supabase/migrations/    ← 3 SQL migrations
├── tools/zivvvo/           ← Build, deploy, image, and icon scripts
├── docs/                   ← 17 architecture/design docs
└── data/primaed/           ← Source research data (gitignored)
```

**Monorepo:** npm workspaces (`apps/*`, `packages/*`)
**Total source files:** ~74 (20 app source + 7 pages + 7 app tests + 40 package files)

---

## 4. Complete file inventory

### apps/web/src/ — Application source

| File | Lines | Purpose |
|------|-------|---------|
| `App.tsx` | 279 | Root component — auth gate, tab routing, header, nav, sync indicator |
| `main.tsx` | 35 | Entry point — calls init(), splash hide, SW registration |
| `store.ts` | 383 | Zustand store — all app state, init, session, engagement, cloud sync |
| `auth.ts` | 128 | Google OAuth — initAuth, signInWithGoogle, onAuthStateChange |
| `db.ts` | 83 | Dexie schema v2 — attempts, reviews, sessions, learners, meta, engagements |
| `engine.ts` | 211 | Engine integration — learnerState, nextActivity, session builders |
| `sync.ts` | 213 | Sync core — types, SyncManager, device ID, row mapping |
| `sync-supabase.ts` | 181 | Supabase backend — push/pull, learner state sync, clearCloudData |
| `sound.ts` | 90 | Sound effects — all tones, mute toggle, vibrate |
| `catalog.ts` | 30 | Content catalog wrapper |
| `learnPath.ts` | 146 | Adaptive learn path builder |
| `onboarding.ts` | 64 | Onboarding config — goals, timelines, confidence bands |
| `OnboardingFlow.tsx` | 200 | 4-step wizard — goal, timeline, confidence, name |
| `nuggets.ts` | 45 | Nuggets (explanation snippets) with read tracking |
| `seed.ts` | 120 | Demo data seeding |
| `ui.tsx` | 180 | Shared UI — Card, Button, Meter, Tag, QuestionMedia |
| `ErrorBoundary.tsx` | 30 | React error boundary with reload |
| `content-security.ts` | 60 | Option shuffling, fingerprinting (defined, not called) |
| `index.css` | 60 | Tailwind theme — dark slate palette |
| `vite-env.d.ts` | 10 | Vite type declarations |

### apps/web/src/pages/ — Screens

| File | Lines | Purpose |
|------|-------|---------|
| `Home.tsx` | 272 | Dashboard — greeting, readiness, next activity, plan, stats, quick start |
| `Learn.tsx` | 180 | Topic list — mastery, focus buttons, smart session launch |
| `Practice.tsx` | 531 | Session runner — quiz, timer, confidence, review, mode toggle |
| `Progress.tsx` | 200 | Readiness, topic mastery, goal display, export, sync info |
| `Coach.tsx` | 120 | Weakness analysis — signals, reasons, targeted sessions |
| `Settings.tsx` | 150 | Name, exam date, daily goal, sound, data export, reset |
| `Nuggets.tsx` | 80 | Explanation snippets browser with read tracking |

### apps/web/src/ — Test files

| File | Tests | Purpose |
|------|-------|---------|
| `sync.test.ts` | 17 | Sync manager, row mapping, merge logic |
| `sound.test.ts` | 4 | Sound name validation |
| `onboarding.test.ts` | 12 | Days-until-exam, goal labels, nudge logic |
| `learnPath.test.ts` | 10 | Path building, ordering, status mapping |
| `practiceModes.test.ts` | 10 | Quick/smart/review/mock session builders |
| `smoke.test.ts` | 8 | Engine smoke tests |
| `stress.test.ts` | 8 | Full-year learner journeys over production bank |

### packages/assessment-engine/src/ — Assessment engine (20 files)

| File | Purpose |
|------|---------|
| `types.ts` | Core types — AttemptEvent, LearningSession, Confidence, LearningMode |
| `scoring.ts` | Score calculation, mastery, band classification |
| `sessions.ts` | Session builders — quick, smart, weakness, review, mock |
| `summaries.ts` | `buildSessionSummary` — accuracy, improvement, still reviewing, strengthened |
| `readiness.ts` | `computeReadiness` — overall readiness score + band + note |
| `diagnostic.ts` | `buildDiagnostic` — adaptive diagnostic with confidence-weighted selection |
| `difficulty.ts` | Question difficulty classification |
| `variants.ts` | Question variant generation (concept pairs) |
| `mock.ts` | Mock exam config, grading, pass mark (78%) |
| `events.ts` | Event type definitions |
| `random.ts` | Seeded PRNG |
| `index.ts` | Public API exports |
| `test/fixtures.ts` | Test data helpers |

### packages/learning-engine/src/ — Learning engine (14 files)

| File | Purpose |
|------|---------|
| `config.ts` | `defaultConfig` — thresholds, weights, evidence requirements |
| `mastery.ts` | `masteryBy` — per-topic mastery calculation |
| `spaced.ts` | Spaced repetition — interval calculation, `isDue`, `ReviewState` |
| `recommend.ts` | `getNextBestActivity` — priority ladder (diagnostic > due > weakness > plan > smart) |
| `planner.ts` | `buildPlan` — day-by-day study plan to exam date |
| `weakness.ts` | `detectWeakness` — long-unreviewed, recurring-weakness, low-mastery signals |
| `engagement.ts` | `reduceEngagement` — XP, levels, streaks, freezes, daily goals |
| `index.ts` | Public API exports |

### packages/content/src/ — Question bank (4 files)

| File | Purpose |
|------|---------|
| `types.ts` | Question, Topic, ContentPack types |
| `index.ts` | Pack loader |
| `content.test.ts` | Content integrity tests |
| `data/content-v1.json` | 1,249 questions, 8 topics, 19 concepts |

### packages/ai-gateway/src/ — AI layer (4 files)

| File | Purpose |
|------|---------|
| `types.ts` | AI gateway types |
| `mock.ts` | Mock AI responses (no real API calls) |
| `mock.test.ts` | Mock tests |
| `index.ts` | Exports |

---

## 5. Feature inventory — every feature, its status, and where it lives

### Core user journey (all working end-to-end)

| Feature | Status | Files |
|---------|--------|-------|
| Google OAuth sign-in | Working | `auth.ts`, `App.tsx` (LoginScreen) |
| Session persistence across refresh | Working | `auth.ts` (initAuth + cachedUser + onAuthStateChange) |
| Auth state change detection | Working | `auth.ts` (listeners), `App.tsx` (onAuthStateChange) |
| Onboarding (4-step wizard) | Working | `OnboardingFlow.tsx`, `onboarding.ts` |
| Goal selection (ZVID provisional) | Working | `onboarding.ts` (EXAM_GOALS) |
| Timeline selection (relaxed/focused/intense) | Working | `onboarding.ts` (TIMELINES) |
| Confidence self-assessment | Working | `onboarding.ts` (CONFIDENCE_BANDS) |
| Learner creation + IndexedDB persist | Working | `store.ts` (completeOnboarding), `db.ts` |
| Cloud push on onboarding | Working | `store.ts` (pushToCloud), `sync-supabase.ts` |

### Learning engine

| Feature | Status | Files |
|---------|--------|-------|
| Mastery calculation per topic | Working | `learning-engine/mastery.ts` |
| Spaced repetition scheduling | Working | `learning-engine/spaced.ts` |
| `isDue` check for review scheduling | Working | `learning-engine/spaced.ts` |
| Weakness detection (3 signals) | Working | `learning-engine/weakness.ts` |
| Next best activity recommendation | Working | `learning-engine/recommend.ts` |
| Priority ladder (diagnostic → due → weakness → plan → smart) | Working | `learning-engine/recommend.ts` |
| Day-by-day study plan | Working | `learning-engine/planner.ts` |
| XP, levels, streaks, freezes | Working | `learning-engine/engagement.ts` |
| Daily goal tracking | Working | `learning-engine/engagement.ts` |
| Level-up sound on level increase | Working | `store.ts` (advanceEngagement) |

### Assessment engine

| Feature | Status | Files |
|---------|--------|-------|
| Diagnostic session (adaptive) | Working | `assessment-engine/diagnostic.ts` |
| Quick session (time-based) | Working | `assessment-engine/sessions.ts` |
| Smart session (adaptive, topic-targeted) | Working | `assessment-engine/sessions.ts` |
| Weakness session (focused on one topic) | Working | `assessment-engine/sessions.ts` |
| Review session (spaced repetition) | Working | `assessment-engine/sessions.ts` |
| Mistake review session (variants) | Working | `assessment-engine/sessions.ts` |
| Mock exam (50 questions, 90min, 78% pass) | Working | `assessment-engine/mock.ts` |
| Question grading | Working | `assessment-engine/scoring.ts` |
| Session summary (accuracy, improvement, topics) | Working | `assessment-engine/summaries.ts` |
| Readiness score + band + note | Working | `assessment-engine/readiness.ts` |

### Screens

| Screen | Status | Files |
|--------|--------|-------|
| Home (dashboard) | Working | `pages/Home.tsx` |
| Learn (adaptive topic list) | Working | `pages/Learn.tsx` |
| Practice (session runner + mode toggle) | Working | `pages/Practice.tsx` |
| Progress (readiness, mastery, export) | Working | `pages/Progress.tsx` |
| Coach (weakness analysis) | Working | `pages/Coach.tsx` |
| Settings (name, date, goal, sound, reset) | Working | `pages/Settings.tsx` |
| Nuggets/Read (explanation browser) | Working | `pages/Nuggets.tsx` |

### Practice session features

| Feature | Status | Notes |
|---------|--------|-------|
| Question display with image | Working | `QuestionMedia` renders imageRef |
| Multi-select option UI | Working | Single-select (click replaces) |
| Check answer (grade + sound) | Working | `checkingRef` double-click guard |
| Correct/wrong sound + vibration | Working | `play("correct")` / `play("wrong")` |
| Explanation display (non-mock) | Working | Post-answer "Why" card |
| Confidence selector (sure/unsure/guess) | Working | Post-answer confidence grid |
| Skip question | Working | Records as "guess" with empty selection |
| Progress bar | Working | Meter shows `index/total` |
| Mock timer (countdown) | Working | 90-minute countdown, auto-finish at 0 |
| Session complete summary | Working | Score, accuracy, pass/fail, topic breakdown |
| Review answers after session | Working | `ReviewList` component |
| "Back home" after session | Working | `setTab("home")` |
| Empty session fallback | Working | "No questions" message + back button |
| Error state display | Working | Red banner on recordAnswer failure |

### Sync

| Feature | Status | Files |
|---------|--------|-------|
| Offline-first (IndexedDB primary) | Working | `db.ts`, service worker |
| Push pending attempts to Supabase | Working | `sync-supabase.ts` (SupabaseSyncBackend.push) |
| Pull remote attempts | Working | `sync-supabase.ts` (SupabaseSyncBackend.pull) |
| Merge remote rows (dedup by attempt_id) | Working | `sync-supabase.ts` (mergeRemote) |
| Mark synced after push | Working | `sync.ts` (markSynced) |
| User-based cloud sync (full state) | Working | `sync-supabase.ts` (pushLearnerState/pullLearnerState) |
| Cloud restore on sign-in | Working | `store.ts` (init), `sync-supabase.ts` (restoreFromCloud) |
| User switch detection | Working | `store.ts` (init — clears old user's IndexedDB) |
| Clear cloud data on reset | Working | `sync-supabase.ts` (clearCloudData) |
| Sync indicator in header | Working | `App.tsx` (SyncIndicator) |
| Auto-sync on session complete | Working | `store.ts` (completeSession → pushToCloud + sync) |
| Auto-sync on app load | Working | `store.ts` (init → syncManager.sync) |
| Auto-sync on reconnect | Working | `App.tsx` (online event listener) |

### Sound

| Feature | Status | Notes |
|---------|--------|-------|
| Sound effects (select, correct, wrong, pass, fail, start, levelUp) | Working | `sound.ts` |
| Mute toggle | Working | `App.tsx` header button |
| Level-up sound on level increase | Working | `store.ts` (advanceEngagement) |
| Vibration patterns | Working | `sound.ts` (vibrate) |

### Auth + multi-user

| Feature | Status | Files |
|---------|--------|-------|
| Google OAuth sign-in | Working | `auth.ts` |
| Session persistence (auto-refresh) | Working | `auth.ts` (persistSession, autoRefreshToken) |
| Sign-out (clear all IndexedDB + state) | Working | `store.ts` (signOut) |
| User switch detection | Working | `store.ts` (init — currentSupabaseUserId tracking) |
| Data isolation per user | Working | `sync-supabase.ts` (RLS: auth.uid()::text = user_id) |
| Confirmation dialog on sign-out | Working | `App.tsx` (handleSignOut) |

### PWA + offline

| Feature | Status | Files |
|---------|--------|-------|
| Service worker (cache-first) | Working | Generated by `build-precache.mjs` |
| PWA manifest (standalone, portrait) | Working | `public/manifest.webmanifest` |
| Splash screen (0.8s) | Working | `index.html` + `main.tsx` |
| noscript fallback | Working | `index.html` (full HTML fallback for crawlers) |
| App icons (192px + 512px) | Working | Generated by `make-icons.mjs` |

### Data export

| Feature | Status | Files |
|---------|--------|-------|
| Export attempts as JSON | Working | `pages/Progress.tsx` |
| Download data button | Working | `pages/Progress.tsx` |

---

## 6. QA history — what we found and fixed

### QA Round 1 (commit `ac3bd92` — 15 fixes)

| # | Issue | Fix |
|---|-------|-----|
| 1 | `completeSession()` didn't set `diagnosticCompleted: true` | Added check for `s.type === "diagnostic"` |
| 2 | `init()` had race condition — set `ready` before `initAuth()` finished | Moved `initAuth()` to top of `init()` |
| 3 | `completeSession()` didn't update `sessions` array in Zustand | Added `sessions: state.sessions.map(...)` |
| 4 | Settings `handleSave` didn't dispatch engagement event on minute change | Added `advanceEngagement({ type: "set-goal", minutes })` |
| 5 | `openSettings` reset tab to home | Changed to toggle `showSettings` only |
| 6 | Sign-out said "data will be lost" | Changed to "data is saved to the cloud" |
| 7 | Sign-out preserved learner data | Now sets `learners: []` |
| 8 | `onAuthStateChange` didn't re-init when user changed | Added `init(user.id)` call |
| 9 | `finish()` in Practice had stale closure for `attempts` | Changed to `useApp.getState().attempts` |
| 10 | `init()` errors caused permanent "Loading..." | Added try/catch with fallback |
| 11 | `levelUp` sound never played | Added before/after level comparison in `advanceEngagement` |
| 12 | Freeze display was confusing ("manual freeze available") | Changed to "auto-used if you miss a day" |
| 13 | `minutesToday` used `createdAt` (wrong for cross-day sessions) | Changed to `completedAt` |
| 14 | Onboarding had no error handling on submit | Added `error`/`submitting` state, try/catch, error banner |
| 15 | `resetDemo` didn't clear cloud data | Added `clearCloudData()` call |

### QA Round 2 (commit `e30c653` — multi-user isolation)

| Issue | Fix |
|-------|-----|
| User switch didn't clear old user's IndexedDB | Added `userSwitched` detection in `init()`, clears all 5 tables |
| `signOut` didn't clear IndexedDB | Now clears all 5 tables + meta |

### QA Round 3 (commit `e47b883` — init + sessions)

| Issue | Fix |
|-------|-----|
| `initAuth()` set `initialized = true` on failure | Changed to only set on success (allows retry) |
| Sessions state went stale after completion | `completeSession` now maps sessions array |
| `activeSession` set to null before reading session attempts | Captured `s` before `set()` |

### QA Round 4 (Home date picker — latest fix)

| Issue | Fix |
|-------|-----|
| `dateInput` in Home used `toISOString().slice(0,10)` (UTC) | Changed to local date components (getFullYear/getMonth/getDate) |

---

## 7. Known bugs and broken things

### Non-blocking (acceptable for launch)

| # | Issue | Severity | File | Notes |
|---|-------|----------|------|-------|
| 1 | `content-security.ts` exports unused functions | Low | `content-security.ts` | `secureQuestion`, `shuffleOptions`, `userFingerprint` defined but never called |
| 2 | `Tab` type includes unreachable `"settings"` | Low | `store.ts:30` | Dead union member |
| 3 | Nuggets read state is localStorage-only | Low | `nuggets.ts` | Not synced to cloud, lost on device switch |
| 4 | No loading state on "Download my data" button | Low | `Progress.tsx:177` | Multiple rapid clicks trigger multiple downloads |
| 5 | No session history list in Progress page | Low | `Progress.tsx` | Shows mastery/readiness but no scrollable session history |
| 6 | No back button during active session | Low | `Practice.tsx` | Must complete or use browser back to abandon |
| 7 | `checkingRef` double-click guard is ref-based, not state | Low | `Practice.tsx:79` | Works but not idiomatic React |
| 8 | `images.rar` and `images.zip` in public/ | Low | `public/` | Archive files committed to repo |

### Blocking for Google OAuth verification

| Issue | Status | Notes |
|-------|--------|-------|
| Google consent screen shows "uvmgmbwnsdebtkwldfaa.supabase.co" | Stuck | User needs to complete branding page then PUBLISH APP |
| Privacy policy link works | Done | `/privacy.html` live |
| Landing page exists | Done | `/` with features + logo |

---

## 8. Partially implemented features

| Feature | What exists | What's missing |
|---------|-------------|----------------|
| Content security (option shuffling) | `shuffleOptions()` exported from `content-security.ts` | Not wired into any session builder |
| Content security (user fingerprinting) | `userFingerprint()` exported | Not used anywhere |
| Content security (watermark) | `secureQuestion()` exported | Not used anywhere |
| AI explanations (real) | `ai-gateway/mock.ts` with mock responses | No real AI API integration |
| Payment/subscription | Nothing built | Entire freemium system needs implementation |
| Push notifications | Nothing built | PWA notification API not used |
| Analytics | `docs/ANALYTICS.md` exists | No tracking code in app |
| Multiple exam types | `EXAM_GOALS` has "Full Licence" (disabled) | Only ZVID provisional enabled |

---

## 9. Not started

| Item | Priority | Notes |
|------|----------|-------|
| Freemium/paywall system | High | Next major feature — daily limits, feature gating, upgrade flow |
| Payment integration (Stripe/Paynow) | High | Depends on freemium design |
| Real AI explanations | Medium | Currently using pre-written explanations from content bank |
| Push notifications | Medium | Spaced repetition reminders, streak nudges |
| Session history in Progress | Low | Scrollable list of past sessions |
| Nuggets cloud sync | Low | Read state lost on device switch |
| Analytics/tracking | Low | User behavior insights |
| Multiple exam types | Low | Full licence, other countries |
| App store listing | Low | Google Play / Apple App Store PWA wrapping |
| Code splitting (bundle size) | Low | Single 1.1MB bundle, could lazy-load pages |

---

## 10. Content inventory

| Metric | Count |
|--------|-------|
| Total questions | 1,249 |
| With explanations | 989 (79%) |
| With images | 446 (36%) reference images |
| Unique image files | 158 (.webp format) |
| Topics | 8 |
| Concepts | 19 |
| Question types | `single` (all current questions) |
| Difficulty levels | `standard`, `hard` |
| Status values | `answered`, `skipped` |

### Topic breakdown

| Topic ID | Label | Question count |
|----------|-------|----------------|
| `general` | General | 865 |
| `regulations` | Regulations & Precautions | 214 |
| `road-signs` | Road Signs | 77 |
| `junction-rules` | Junction Rules | 58 |
| `carriageway-lines` | Carriageway Lines | 15 |
| `traffic-lights` | Traffic Lights | 10 |
| `vehicle-classes` | Vehicle Classes & Licences | 8 |
| `confusing-pair` | The Confusing Pair | 2 |

### Concept list

`accident`, `age`, `alcohol`, `cycles`, `distance`, `horn`, `insurance`, `lights`, `lines`, `load`, `lplate`, `other`, `overtaking`, `parking`, `pedestrian`, `roadcraft`, `robot`, `speed`, `towing`

---

## 11. Product quality assessment

### Dimension scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Core functionality | 9/10 | Quiz, engine, sync all work end-to-end |
| Error handling | 8/10 | All critical paths have try/catch + user feedback |
| Auth & multi-user | 9/10 | User switch, cloud restore, sign-out isolation |
| Offline support | 9/10 | Full PWA with service worker |
| UX polish | 7/10 | Clean but no back-in-session, no session history |
| Code quality | 8/10 | Type-safe, tested, well-structured |
| Content quality | 9/10 | 1,249 questions, 158 images, 989 explanations |

### Test suite

| Metric | Value |
|--------|-------|
| Total test files | 23 |
| Total tests | 217 |
| All passing | Yes |
| Test framework | Vitest 2.1.9 |
| Coverage areas | Sync, sound, onboarding, learnPath, practice modes, stress (full-year journeys), smoke, scoring, readiness, diagnostic, difficulty, variants, mock, mastery, spaced repetition, weakness, planner, engagement, content integrity |

### Build status

| Check | Status |
|-------|--------|
| `npm test` (217 tests) | Passing |
| `npx tsc --noEmit` (typecheck) | Clean |
| `npm run build:web` | Succeeds (12.64s) |
| Bundle size | 1,122 KB JS (230 KB gzipped) |
| CSS size | 21 KB (4.8 KB gzipped) |

---

## 12. Technical stack and dependencies

### Core

| Library | Version | Purpose |
|---------|---------|---------|
| React | 18.3.1 | UI framework |
| Vite | 5.4.11 | Build tool + dev server |
| Tailwind CSS | 4.1.4 | Styling (CSS-first config) |
| TypeScript | 5.6.3 | Type safety (strict mode) |
| Zustand | 4.5.5 | State management |
| Dexie | 4.0.8 | IndexedDB wrapper |
| Supabase JS | 2.116.0 | Backend client |

### Internal packages

| Package | Purpose |
|---------|---------|
| `@zivvvo/assessment-engine` | Session building, grading, readiness scoring |
| `@zivvvo/learning-engine` | Mastery, spaced repetition, engagement, planning |
| `@zivvvo/content` | Question bank loader |
| `@zivvvo/ai-gateway` | AI mock (no real API) |

### Dev dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| Vitest | 2.1.9 | Test runner |
| @vitejs/plugin-react | 4.3.3 | React fast refresh |
| @tailwindcss/vite | 4.1.4 | Tailwind CSS Vite integration |

---

## 13. Deployment state

| Component | Status | Details |
|-----------|--------|---------|
| **Primary hosting** | Vercel | Auto-deploys from Git, configured via `vercel.json` |
| **Secondary hosting** | VPS `161.97.115.59` | Nginx serves `dist/`, deployed via SSH (`deploy.py` / `deploy.ps1`) |
| **Domain** | `zivvvo.co.zw` | Points to VPS |
| **Build pipeline** | `copy-images.mjs` → `vite build` → `build-precache.mjs` | Generates `sw.js` |
| **Service worker** | Generated at build time | Cache-first, SPA navigation fallback |
| **CI/CD** | Vercel only | No GitHub Actions |
| **SSL** | On Vercel | Not confirmed on VPS |

### Deploy scripts

| File | Purpose |
|------|---------|
| `tools/zivvvo/deploy.py` | SSH deploy via Python (pipes password via stdin) |
| `tools/zivvvo/deploy.ps1` | SSH deploy via PowerShell |
| `tools/zivvvo/plink.exe` | PuTTY SSH client binary |

### Environment variables

| Variable | Set in | Value |
|----------|--------|-------|
| `VITE_SUPABASE_URL` | `.env.production` | `https://uvmgmbwnsdebtkwldfaa.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `.env.production` | `sb_publishable_IWqvC0r1ORVof_obWJl2Hw_hvRe2dw7` |

---

## 14. Supabase backend

### Project

| Field | Value |
|-------|-------|
| Project ID | `uvmgmbwnsdebtkwldfaa` |
| URL | `https://uvmgmbwnsdebtkwldfaa.supabase.co` |
| Schema | `zivvvo` (isolated) |

### Tables

| Table | Purpose | RLS |
|-------|---------|-----|
| `zivvvo.attempts` | Per-question answer records | `user_id = auth.uid()::text` |
| `zivvvo.learners` | Legacy learner records | `user_id = auth.uid()::text` |
| `zivvvo.learner_state` | Full learner profile + reviews + engagement (JSONB) | `user_id = auth.uid()::text` |
| `zivvvo.user_sessions` | Session tracking | `user_id = auth.uid()::text` |
| `zivvvo.sync_watermark` | Sync watermark | Device-scoped |
| `zivvvo.content_pack` | Content pack (unused) | Public read |

### Migrations

| File | Purpose |
|------|---------|
| `001_init_zivvvo.sql` | Creates schema, tables, RLS, device-scoped policies |
| `002_expose_zivvvo_schema.sql` | Re-exposes schema to PostgREST |
| `003_user_sync.sql` | Adds user-based RLS, `learner_state` table, `user_sessions` |

---

## 15. Freemium strategy (designed, not yet coded)

### Free tier (generous enough to hook)

| Feature | Limit | Why |
|---------|-------|-----|
| Diagnostic test | 1x | Shows readiness % — the hook |
| Smart sessions | 2/day | Enough to feel the adaptive engine |
| Quick sessions | 2/day | Sample time-based practice |
| Read mode (Nuggets) | Unlimited | Full content access, builds trust |
| Progress dashboard | Basic | Shows readiness + mastery |
| XP & streaks | Yes | Gamification, no gate |

### Pro tier (what you pay for)

| Feature | Why it's worth paying |
|---------|-----------------------|
| Unlimited sessions | No daily cap |
| Weakness targeting | "Focus on this topic" |
| Mistake review | Learn from errors |
| Spaced repetition | Due reviews at the right time |
| Learning path planner | Day-by-day plan to exam |
| Mock exams (unlimited) | Full 50-question simulation |
| Export data | PDF/share progress |
| Unlimited diagnostic | Retake to track improvement |

### Conversion trigger

```
Diagnostic (FREE) → "You're at 42% readiness"
    → "You need ~14 more sessions to reach 80%"
    → [UNLOCK YOUR FULL STUDY PLAN →]  ← Pro paywall
```

### Pricing (Zimbabwe context)

| Plan | Price |
|------|-------|
| Monthly | $3 USD/month |
| Yearly | $15 USD/year (~$1.25/month) |
| Exam sprint (30 days) | $5 USD one-time |

### Technical requirements

1. Add `plan: "free" | "pro"` to `StoredLearner` type
2. Add `plan` column to `learner_state` Supabase table
3. Create `gate.ts` — canStartSession, canMock, canWeakness, etc.
4. Create `Paywall.tsx` — upgrade modal
5. Create `Upgrade.tsx` — plan display + checkout
6. Gate features in Practice, Home, Coach pages
7. Daily session counter (resets at midnight)
8. Stripe checkout or manual toggle

---

## 16. Files of record

| File | Purpose |
|------|---------|
| `PRODUCT_INVENTORY.md` | This document — complete project state |
| `README.md` | Project overview + quick start |
| `Project_Report.md` | Original second-opinion review (701 lines) |
| `docs/ARCHITECTURE.md` | System architecture |
| `docs/PRODUCT.md` | Product spec |
| `docs/PRODUCT_VISION.md` | Product vision |
| `docs/ROADMAP.md` | Development roadmap |
| `docs/UX_PRINCIPLES.md` | UX design principles |
| `docs/DESIGN_SYSTEM.md` | Design system |
| `docs/DATABASE.md` | Database schema |
| `docs/OFFLINE_STRATEGY.md` | Offline-first approach |
| `docs/SECURITY.md` | Security model |
| `docs/DECISIONS.md` | Architecture decisions |
| `docs/CONTENT_MODEL.md` | Content data model |
| `docs/LEARNING_ENGINE.md` | Learning engine docs |
| `docs/ASSESSMENT_ENGINE.md` | Assessment engine docs |
| `docs/AI_ARCHITECTURE.md` | AI layer docs |
| `docs/ANALYTICS.md` | Analytics plan |
| `docs/CURRENT_STATE.md` | Current state snapshot |
| `docs/supabase/no-touch-checklist.md` | Supabase deployment checklist |

---

## 17. Git history summary

### Development phases (from git log)

| Phase | Commits | What happened |
|-------|---------|---------------|
| **Reaction Speed Roulette** | `ce5d6e3`–`7e2824c` | Original project — reaction speed game with leaderboard (archived) |
| **Zivvvo foundation** | `c69d55e`–`52e107d` | Initial commit, interactive sound, QA hardening, stress suite |
| **Adaptive engine** | `7db3c81`–`7db3c81` | Learn adaptive path, doc reconciliation |
| **PWA + auth** | `37e7040`–`a751b6d` | Schema exposure, Practice rewrite, Nuggets, asset security, Google auth, Settings |
| **Vercel deployment** | `3006b22`–`0ea156b` | Vercel config, build fixes, production env |
| **Google sign-in fixes** | `691f39b`–`18c3878` | Auth debugging, session detection, splash timing |
| **Cloud sync** | `308721e`–`e30c653` | Image replacement, full user-based sync, noscript, multi-user isolation |
| **QA polish** | `ac3bd92`–`ac3bd92` | 15 QA fixes — diagnostic flag, init race, sessions state, settings engagement, sign-out UX |
| **Latest fix** | (uncommitted) | Home date picker UTC → local time |

### Latest commits

```
ac3bd92 fix: 15 QA fixes — product polish before premium launch
e30c653 fix: multi-user isolation — detect user switch and clear stale data
e47b883 fix: diagnostic flag, init race condition, sessions state, settings engagement, sign-out UX
c94ebce fix: noscript fallback for Google OAuth verification crawler
3078326 feat: full user-based cloud sync — learner profile, reviews, engagement
308721e images: replace all 158 question images with clean versions
```

---

## 18. What a new agent needs to know

### Critical context

1. **This is a monorepo.** `apps/web` is the PWA. `packages/` are internal libraries. Never modify `packages/` without understanding the downstream effects on `apps/web`.

2. **PowerShell is the shell.** `&&` doesn't work. Use `; if ($?)` for chained commands. Use `workdir` parameter instead of `cd`.

3. **All 217 tests must pass.** Run `npm test` from the root. Typecheck with `npx tsc --noEmit` from `apps/web`.

4. **Build command:** `npm run build:web` from the root (runs copy-images, vite build, build-precache).

5. **Deploy:** Push to `main` on GitHub. Vercel auto-deploys. For VPS: `python tools/zivvvo/deploy.py`.

6. **The store is the source of truth.** All state flows through `store.ts` (Zustand). Components read via `useApp(selector)`. Actions are methods on the store.

7. **Engine packages are pure functions.** They have no side effects, no network calls, no DOM access. They take data in and return results. Safe to test and modify.

8. **Content is static.** `content-v1.json` is the source of truth for questions. It's built from scraped research data by `build-content-pack.mjs`. Never hand-edit it.

9. **Sync is user-based, not device-based.** Each Supabase user has their own `learner_state` row. RLS ensures `auth.uid()::text = user_id`.

10. **The freemium system doesn't exist yet.** It's designed (see section 15) but not coded. The next agent should implement it.

### Common gotchas

- **`completeSession()` reads `get().attempts` after `set({ activeSession: null })`.** The `s` variable is captured before the set — this is correct but looks wrong.
- **`initAuth()` only sets `initialized = true` on success.** Network failures allow retry. Don't change this.
- **`dailyGoalRewardedDay` is a module-level variable.** It persists across HMR but resets on page load. This is intentional.
- **The service worker is generated, not checked in.** It's created by `build-precache.mjs` after the Vite build.
- **Images are in `public/images/` (158 files).** The `copy-images.mjs` script copies them from `data/primaed/images/`. The server sometimes warns "0/158 referenced images present" but the images are actually there from git.
