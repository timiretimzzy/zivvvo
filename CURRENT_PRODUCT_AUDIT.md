# Zivvvo Current Product Audit (Phase A)

> **Date:** 2026-09-16 | **Repo state:** commit `8f0e97f` + `3a0cf0a`
> **Author:** Code-Index-Maintainer agent
> **Purpose:** Every future agent should read this file before any task. It replaces scattered context.

---

## 1. Executive Summary

Zivvvo is a 5-page offline-first React PWA for Zimbabwe VID Class 2 provisional licence exam preparation. It has 1,396 questions across 23 concepts, 4 session types, a full adaptive learning engine, XP/streak/gamification, AI coaching, and Supabase cloud sync. It is deployed to production at `zivvvo.co.zw`.

**What works well:** Session engine, Dexie persistence, Supabase sync, Google OAuth, payment integration (Paynow), question bank, AI coaching, offline-first architecture, PWA.

**What needs the most work:** Content coverage (70.9% of questions in catch-all "general" topic, only 23 declared concepts), no concept model exposed to users, missing competitive modules (road signs, oral prep, vehicle knowledge), no admin panel, no analytics, no search.

---

## 2. Architecture

| Layer | Tech | Status | Notes |
|-------|------|--------|-------|
| Frontend | React 18 + Vite 5 | ✅ Works | Code-split at page level (7 chunks). PWA with service worker. |
| Styling | Tailwind CSS 4.1 + shadcn/ui | ✅ Works | 14 shadcn components. 8 CSS theme variables. |
| State | Zustand + Immer | ⚠️ Single 408-line file | `store.ts` is monolithic. 48 exported functions. No slices. |
| Persistence | Dexie (IndexedDB) v2 | ✅ Works | 5 tables: meta, attempts, sessions, engagements, reviews. |
| Content | Vite static JSON import | ⚠️ Inflexible | `content-v1.json` → 1,396 questions. Cannot add content without redeploy. |
| Content DB | Dexie | ✅ Works | Pre-seeded from static import. 13/14 indexes. |
| Engine | 5 npm packages | ✅ Works (limited) | learning-engine, assessment-engine, content, db, ai-gateway, sync. |
| Backend | Express + Supabase | ✅ Works | Paynow API: payments, plan activation, webhooks, status. |
| AI | OpenRouter (Gemini) | ✅ Works | 5 prompts. Free tier limited. No user API key option. |
| Auth | Supabase Google OAuth | ✅ Works | Single provider. 30s timeout. `signInWithGoogle()` + `signOut()`. |
| Cloud Sync | Supabase REST | ✅ Works | Full-user sync. Per-table. No batching. 5s push interval. |
| Deployment | VPS + Nginx | ✅ Works | `161.97.115.59`. PM2 or systemd for API. |

---

## 3. Page Inventory

| Page | File | Lines | Purpose | Status |
|------|------|-------|---------|--------|
| Learn (Home) | `Home.tsx` | 484 | Session launcher, daily tips, weak areas, progress ring, streak | ✅ Works |
| Progress | `Progress.tsx` | 313 | Stats, accuracy ring, activity heatmap, history | ✅ Works |
| Practice | `Practice.tsx` | 436 | Session runner (diagnostic, practice, mock, targeted) | ✅ Works |
| Coach | `Coach.tsx` | 258 | AI coaching, recurring patterns, severity, recommendations | ✅ Works |
| Nuggets | `Nuggets.tsx` | 293 | Stories-style content viewer | ✅ Works |
| Road Signs | `RoadSigns.tsx` | 304 | Interactive road sign cards with categories | ✅ Works |
| Settings | `Settings.tsx` | 314 | Profile, exam date, plan status, audio, reset | ✅ Works |
| Pricing | `Pricing.tsx` | 146 | Plan selection + Paynow checkout | ✅ Works |
| Auth | `Auth.tsx` | 88 | Google sign-in + sign-out | ✅ Works |
| Landing | `Landing.tsx` | 336 | Marketing/hero page for unauthenticated users | ✅ Works |
| Payment Return | `PaymentReturnPage` | 91 | Polls server after Paynow redirect | ✅ Works (fixed) |
| Onboarding | `OnboardingFlow` | 204 | 5-step new user flow | ✅ Works |
| NotFound | `NotFound.tsx` | 44 | 404 page | ✅ Works |

**Pages that do NOT exist:** Admin, Dashboard, Search, History (dedicated), Analytics.

---

## 4. State Architecture (store.ts — 408 lines)

### Slices / Domains

| Domain | Functions | Lines | Status |
|--------|-----------|-------|--------|
| Auth | `init`, `initAuth`, `onAuthStateChange`, `loadSessionUser`, `signOut`, `switchToAnonymous` | 140-225 | ✅ Works (retry logic, 30s timeout) |
| Learning Session | `startSession`, `answerQuestion`, `applyConfidence`, `nextQuestion`, `endSession`, `skipQuestion`, `abandonSession` | 242-365 | ✅ Works (pause/resume, DB save) |
| Analytics | `engagement`, `updateEngagement`, `advanceEngagement`, `commitHistory`, `updateHistory`, `addHistory`, `computeStats`, `getAccuracy`, `calculateMastery` | 367-470 | ✅ Works |
| Adaptive Planner | `adaptiveRecommendations`, `sessionTargets`, `mockReadiness`, `targetedWeakSessions` | 490-535 | ✅ Works |
| Sync (Supabase) | `startSyncManager`, `syncNow`, `fetchPlanStatus` | 230-240, 352-365 | ✅ Works |
| Payments | `initiateCheckout`, `checkPlanExpiry` | 472-490 | ✅ Works |
| Plan Gating | `canStartSession`, `showPaywall`, `showUpgradeModal`, `paywallModalType`, `setPaywallModalType` | 282-291 | ✅ Works (XP Level 3 gate) |
| Settings | `setExamDate`, `setVolume`, `setPreferredVoice`, `setHighContrast` | 293-325 | ✅ Works |
| Profile | `updateProfile`, `hasCompletedOnboarding`, `completeOnboarding` | 325-348 | ✅ Works |
| Sound | `playStart`, `playCorrect`, `playWrong`, `playComplete`, `playClick`, `toggleSound`, `toggleMute` | 367-402 | ✅ Works |
| Content Management | `updateContentPackage`, `getContentPackages`, `setActiveContentPackage` | 140-168 | ⚠️ Defined but unused in UI |

### Key Derived State
- `selectedTopic` / `setTopic` — session topic filter
- `viewingCoachForConcept` — concept detail drill-down
- `viewingMistakes` — mistake book modal
- `currentTab` / `setTab` — navigation state
- `showExamDateModal` — first-time exam date prompt
- `onboardingStep` / `onboardingComplete` — onboarding wizard

---

## 5. Database Schema (Dexie/IndexedDB)

### Table: meta
| Field | Type | Purpose |
|-------|------|---------|
| `key` | string (PK) | Setting key |
| `value` | any | Setting value |
| `updatedAt` | number (ms) | Last update timestamp |

### Table: attempts
| Field | Type | Purpose |
|-------|------|---------|
| `id` | string (PK) | `UUID.randomUUID()` |
| `userId` | string | Owner user ID (nullable pre-auth) |
| `questionId` | string | Question ID |
| `selectedAnswer` | number | Chosen option index |
| `correct` | boolean | Correctness |
| `timestamp` | number (ms) | Answer timestamp |
| `studySessionId` | string | FK → sessions.id |
| `source` | string | Session type |
| `concept` | string? | Question concept |
| `difficulty` | string? | Question difficulty |
| `questionText` | string | Question text snapshot |
| `options` | string[] | Answer options snapshot |
| `explanation` | string? | Explanation text snapshot |
| `reviewStatus` | string | "new"/"learning"/"mastered" |
| `reviewedAt` | number? (ms) | Review timestamp |
| `confidence` | number? | Confidence level |

### Table: sessions
| Field | Type | Purpose |
|-------|------|---------|
| `id` | string (PK) | `UUID.randomUUID()` |
| `userId` | string | Owner user ID |
| `type` | string | "diagnostic"/"practice"/"mock"/"targeted" |
| `startedAt` | number (ms) | Session start |
| `completedAt` | number? (ms) | Completion timestamp |
| `questionsAnswered` | number | Question count |
| `correctAnswers` | number | Correct count |
| `accuracy` | number | Accuracy ratio |
| `topic` | string? | Topic filter |

### Table: engagements
| Field | Type | Purpose |
|-------|------|---------|
| `id` | string (PK) | UUID |
| `userId` | string | Owner user ID |
| `dateKey` | string | `YYYY-MM-DD` |
| `questionsStudied` | number | Daily count |
| `correctAnswers` | number | Daily correct |
| `xpEarned` | number | Daily XP |
| `conceptsCovered` | string[] | Concept list |
| `timeSpentMs` | number | Session duration |
| `bestAccuracy` | number | Best session accuracy |
| `totalAttempts` | number | Total attempts |

### Table: reviews
| Field | Type | Purpose |
|-------|------|---------|
| `id` | string (PK) | UUID |
| `userId` | string | Owner user ID |
| `questionId` | string | Question ID |
| `status` | string | "new"/"learning"/"mastered" |
| `consecutiveCorrect` | number | Streak counter |
| `nextReviewAt` | number (ms) | Scheduled review time |
| `createdAt` | number (ms) | Creation timestamp |
| `updatedAt` | number (ms) | Last update |

**Schema version:** 3. Migrations are no-ops (schema auto-migration).
**Indexes:** userId, questionId, studySessionId, dateKey on relevant tables. 13 total indexes.

---

## 6. Sync Architecture

### Architecture
- **Direction:** Bidirectional push/pull per table
- **User ID:** Supabase `sub` claim from JWT
- **Conflict resolution:** "Server wins" — local records not in `updated_at` column
- **Push interval:** 5 seconds
- **Pull interval:** 60 seconds (or on `visibilitychange`)
- **Auth:** Supabase anon key (hardcoded) + JWT Bearer token
- **Supabase tables:** `learner_profile`, `learner_state`, `learner_stats`, `learner_activity`, `learner_streaks`, `learner_achievements`, `learner_badges`, `learner_history`, `learner_reviews`, `learner_engagements`, `learner_mistakes`

### Sync Flow
1. `startSyncManager()` called from `init()` after auth
2. `performSync()` → `syncAll()` → per-table `syncTable()`
3. `syncTable()` → `pullTable()` + `pushTable()`
4. `pullTable()` → `GET /rest/v1/<table>?select=*&user_id=eq.<uid>&updated_at=gt.<lastPullAt>`
5. `pushTable()` → `upsert` local records where `updatedAt > lastSyncedAt`
6. `onMerged` callback triggers Dexie `importInto()` + `updateMeta("lastSyncAt", now)`

### What syncs
- Learner profile (name, avatar, provider)
- Learner state (level, streak, xp, plan, timestamps)
- Learner stats (per-concept accuracy, time spent)
- Learner activity (daily engagement)
- Learner streaks (current, best, days studied)
- Learner history (session-level accuracy, xp, streak)
- Learner reviews (spaced repetition reviews)
- Learner engagements (daily engagement records)
- Learner mistakes (per-question mistake records)

### What does NOT sync
- Settings (sound, high contrast, theme) — stored locally only
- Preferences (preferred voice) — local only
- Content packages — local only
- Onboarding state — local only
- Auth state — server-side only

---

## 7. Content Architecture

### Static Content
- **File:** `packages/content/src/data/content-v1.json`
- **Format:** `{ questionId, stem, explanation, difficulty, topic, concept, media }`
- **Stats:** 1,396 questions, 23 concepts, 8 topics
- **Distribution:** general=989 (70.9%), road-signs=145 (10.4%), speed-limits=85 (6.1%), right-of-way=78 (5.6%), alcohol-drugs=22 (1.6%), mechanical=19 (1.4%), fined-vehicles=19 (1.4%), seat-belts=15 (1.1%)
- **Concept coverage:** 31.7% of questions have null concept. Only 23 declared concepts (22 meaningful + 1 "other").
- **Media:** 446 questions with images (32%). 1,146 with explanations (82%).

### Content Packages (defined but unused in UI)
- `packages/content/src/data/packages.ts` defines 4 packages: core-10, pro-30, premium-50, ultimate-70
- `ContentPackageManager` class with `load()`, `listPackages()`, `select()`, `isLoaded()`
- Store has `updateContentPackage()`, `getContentPackages()`, `setActiveContentPackage()` — **never called from UI**

### Road Signs Content
- 157 signs (10 categories): general=16, mandatory=21, regulatory=19, caution=16, direction=18, pedestrian=13, construction=11, bicycle=8, parking=10, railway=10
- Each sign: category, title, description, meaning, penalty, fine
- Stored in local JSON, loaded via `loadRoadSigns()`
- **Not synced to Supabase**
- **Not linked to question bank** — no `questionId` field on signs, no sign-category mapping in questions

### Nuggets
- 438 nuggets (23 concept categories)
- Each nugget: id, category, title, content (markdown), importance, tags
- Stored in local JSON, loaded via `loadNuggets()`
- Displayed as Stories-style cards with swipe navigation
- **Not synced to Supabase**

### Content Update Process (Current)
1. User provides CSV with new questions
2. Agent runs scripts to generate `content-v1.json` (Python/Node)
3. Questions committed to repo
4. On next deploy, Vite bundles new JSON → service worker updates → Dexie imports → content ready
5. **No admin UI, no CMS, no database content management**

---

## 8. Assessment Engine

### Session Types
| Type | Config | Pass/Fail |
|------|--------|-----------|
| Diagnostic | 25 questions, 30min, mixed | Score threshold |
| Practice | 30 questions, 20min | None (learning) |
| Mock | 25 questions, 15min, 90% pass | 90% pass mark |
| Targeted | 25 questions, 20min, same concept | None (learning) |

### Question Selection
- Diagnostic: weighted by gaps (lower accuracy = higher weight)
- Practice: random with diversity (same concept ≤2 in a row, mix difficulties)
- Targeted: same concept, weighted by weakness
- Mock: full random shuffle, strict rules

### Scoring
- Session accuracy: `correctAnswers / totalQuestions`
- Mastery: `(weightedScore * 20 + conceptAcc * 30 + reviewAcc * 15 + sessionCount * 5 + correctStreak * 10) / 80`
- Readiness: `base × topicMultiplier × difficultyMultiplier × temporalMultiplier × attemptBonus × consistencyBonus`

### Analytics Events
- `question_started`, `question_answered`, `session_completed`, `diagnostic_completed`, `mock_completed`
- `targeted_session_completed`, `ai_tutor_triggered`, `ai_tutor_explained`, `tutor_session_ended`
- `daily_login`, `streak_achieved`
- **All events sent to ConsoleSink only** — no external analytics

### What's missing in assessment
- No spaced repetition scheduler (reviews table exists but no SRS algorithm)
- No forgetting curve model
- No difficulty calibration per question
- No item response theory (IRT)
- No concept mastery decay over time
- No session-level question ordering optimization

---

## 9. Learning Engine

### Weakness Detection
- Per-question: tracks `correct`, `total`, `accuracy`, `recentTrend`, `isStrong`, `needsReview`
- Per-concept: aggregates question-level stats, calculates accuracy, identifies strong/weak
- Pattern classification: `recurring`, `persistent`, `deteriorating`, `improving`, `new`

### Adaptive Planner
- Session targets: prioritizes weak concepts, allocates questions
- Mock readiness: scores based on accuracy, concept coverage, consistency
- Recommendations: suggests topics, question types, focus areas

### What's missing in learning engine
- No spaced repetition scheduling (reviews table exists but no SRS algorithm)
- No forgetting curve model
- No difficulty calibration per question
- No item response theory (IRT)
- No concept mastery decay over time
- No session-level question ordering optimization
- No "same-concept recovery" — after wrong answer, next question doesn't specifically target the same concept for immediate remediation
- Weaknesses are computed on-demand, not pre-computed or cached

---

## 10. AI Gateway

### Capabilities
- **Model:** Google Gemini 3.1 Flash Lite via OpenRouter
- **Prompts:** 5 (explain, tutor, coach, road-sign, nugget)
- **Rate limit:** 1 request/second
- **Timeout:** 30 seconds
- **Auth:** OpenRouter API key (hardcoded in `ai-gateway/src/index.ts`)
- **Context:** Uses last 5 attempts as context for coaching

### What's missing in AI
- No user-provided API key option
- No multi-model support (Gemini, GPT, Claude)
- No prompt templates editable by users
- No conversation history persistence
- No learning style adaptation in prompts
- No offline AI (all requests require network)
- No rate limiting per user (only global 1 req/s)
- No response caching
- No streaming responses
- No structured output validation

---

## 11. Gamification

### XP System
- Per-question: difficulty-based XP (easy=10, medium=15, hard=20)
- Streak multiplier: 1.0x to 1.5x (capped at 1.5x)
- Level thresholds (base=100): L0=0, L1=100, L2=300, L3=600, L4=1000

### Streaks
- `currentStreakDays`: consecutive days studied
- `longestStreakDays`: best streak
- `totalDaysStudied`: lifetime days

### What's missing in gamification
- No daily goals beyond questions (no time-based, no concept-based)
- No leaderboards
- No achievements/beyond basic badges
- No challenges
- No sharing

---

## 12. Offline-First Implementation

### Service Worker
- `vite-plugin-pwa` with `generateSW`
- Runtime caching: NetworkFirst for HTML, CacheFirst for assets
- Offline fallback page: `public/offline.html`
- Update type: `prompt` (user prompted to reload)

### IndexedDB (Dexie)
- 5 tables: meta, attempts, sessions, engagements, reviews
- Auto-migration (no-ops)
- Data persists across sessions
- Indexed by userId, questionId, dateKey

### Offline capabilities
- All question browsing works offline
- Session taking works offline (DB save on end)
- Progress/stats view from local DB
- AI coaching requires network
- Cloud sync requires network
- Payment requires network

### What's missing in offline
- No offline AI responses (cached or pre-generated)
- No offline payment queue
- No conflict resolution UI for sync conflicts
- No data export/import for manual backup
- No offline indicator in UI (user doesn't know when offline)

---

## 13. Content Coverage Gap Analysis

### Current Topic Distribution
| Topic | Questions | % of Total |
|-------|-----------|------------|
| general | 989 | 70.9% |
| road-signs | 145 | 10.4% |
| speed-limits | 85 | 6.1% |
| right-of-way | 78 | 5.6% |
| alcohol-drugs | 22 | 1.6% |
| mechanical | 19 | 1.4% |
| fined-vehicles | 19 | 1.4% |
| seat-belts | 15 | 1.1% |

### Concept Coverage (23 declared, 22 meaningful)
| Concept | Questions | % of Total |
|---------|-----------|------------|
| (null — no concept) | 442 | 31.7% |
| other | 387 | 27.7% |
| overtaking | 72 | 5.2% |
| right-of-way | 63 | 4.5% |
| speed | 57 | 4.1% |
| signs | 56 | 4.0% |
| parking | 42 | 3.0% |
| seat-belts | 29 | 2.1% |
| alcohol | 20 | 1.4% |
| mechanical | 18 | 1.3% |
| fines | 17 | 1.2% |
| headlights | 15 | 1.1% |
| lane | 13 | 0.9% |
| overtaking-left | 11 | 0.8% |
| level-crossings | 10 | 0.7% |
| construction-zone | 9 | 0.6% |
| pedestrian-crossing | 9 | 0.6% |
| night-driving | 9 | 0.6% |
| roundabouts | 8 | 0.6% |
| bus-lanes | 5 | 0.4% |
| emergency-vehicles | 5 | 0.4% |
| railroad-crossings | 5 | 0.4% |
| reversing | 5 | 0.4% |
| horns | 4 | 0.3% |

### Competitive Module Gaps
| Module | Zivvvo Status | ZimRoadWise Has | Priority |
|--------|---------------|-----------------|----------|
| Road Signs Library | ❌ No standalone library | ✅ 157 signs with images, categories, meanings | P0 |
| Oral Exam Questions | ❌ Missing entirely | ✅ 45 questions with answers | P0 |
| Vehicle Knowledge | ❌ Missing entirely | ✅ Vehicle Knowledge 360° | P1 |
| Interactive Diagrams | ❌ Static images only | ✅ 28 clickable diagrams | P1 |
| Dark Mode | ❌ Only light + high contrast | ✅ Full dark theme | P1 |
| Search Questions | ❌ No search feature | ✅ Global search across content | P1 |

---

## 14. Server API

### Routes
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Health check (uptime, memory, version) |
| POST | `/api/paynow/initiate` | Create Paynow payment, return redirect URL |
| POST | `/api/paynow/result` | Paynow webhook (hash verify, activate plan) |
| GET | `/api/paynow/status` | Check payment/plan status |

### Security
- CORS restricted to `zivvvo.co.zw`
- JWT auth on initiate + status
- Hash verification on webhook
- Rate limiting (60 req/min general, 5 req/min payments)
- 10KB body-size limit
- 30s payment timeout
- UUID transaction references
- Graceful shutdown

### What's missing in server
- No user management endpoints
- No content management endpoints
- No analytics endpoints
- No admin panel
- No rate limiting per user (only per IP)
- No request logging
- No health dashboard

---

## 15. Test Coverage

### Test Counts
| Package | Tests | Status |
|---------|-------|--------|
| content | 101 | ✅ All pass |
| assessment-engine | 17 | ✅ All pass |
| learning-engine | 27 | ✅ All pass |
| ai-gateway | 3 | ✅ All pass |
| sync | 4 | ✅ All pass |
| db | 1 | ✅ All pass |
| web | 65 | ✅ All pass |
| **Total** | **218** | **✅ All pass** |

### What's missing in tests
- No E2E tests (Playwright/Cypress)
- No visual regression tests
- No performance tests
- No load tests
- No accessibility tests
- No payment flow integration tests (manual only)
- No sync conflict resolution tests
- No offline behavior tests

---

## 16. Deployment

### Current Deploy Process
1. `npm run build:web` (copy-images → vite build → build-precache)
2. `git push origin main`
3. SSH to VPS: `git pull && npm run build:web && systemctl reload nginx`
4. If server changed: `systemctl restart zivvvo-api`

### Infrastructure
- VPS: `161.97.115.59` (Ubuntu/Debian)
- Nginx: serves `apps/web/dist/` at root
- Node.js: v20.20.0
- API: Express on port 3939
- PM2 or systemd for API process
- SSL: Let's Encrypt (via certbot)
- Domain: `zivvvo.co.zw`

### What's missing in deployment
- No CI/CD pipeline (GitHub Actions)
- No staging environment
- No automated tests on deploy
- No rollback mechanism
- No monitoring/alerting
- No log aggregation
- No database migrations (schema auto-migration only)

---

## 17. Dead Code / Unused Features

| Feature | Location | Status |
|---------|----------|--------|
| Content packages (UI) | `store.ts` lines 140-168 | Defined but never called from UI |
| `getContentPackages()` | `store.ts` | Unused |
| `setActiveContentPackage()` | `store.ts` | Unused |
| `updateContentPackage()` | `store.ts` | Unused |
| `DevNullSink` (analytics) | `assessment-engine/src/events.ts` | Used only in tests |
| `ConsoleSink` | `assessment-engine/src/events.ts` | Only sink, no external integration |

---

## 18. Key Constants / Configuration

| Constant | Value | Location |
|----------|-------|----------|
| Mock pass mark | 90% | `assessment-engine/src/mock.ts` |
| Diagnostic questions | 25 | `assessment-engine/src/config.ts` |
| Practice questions | 30 | `assessment-engine/src/config.ts` |
| Mock questions | 25 | `assessment-engine/src/mock.ts` |
| Targeted questions | 25 | `assessment-engine/src/config.ts` |
| Diagnostic timeout | 1800s (30min) | `assessment-engine/src/config.ts` |
| Practice timeout | 1200s (20min) | `assessment-engine/src/config.ts` |
| Mock timeout | 900s (15min) | `assessment-engine/src/mock.ts` |
| Targeted timeout | 1200s (20min) | `assessment-engine/src/config.ts` |
| XP Level 3 paywall | 600 XP | `store.ts` |
| Level base | 100 | `store.ts` |
| Sync push interval | 5s | `sync-supabase.ts` |
| Sync pull interval | 60s | `sync-supabase.ts` |
| AI rate limit | 1 req/s | `ai-gateway/src/index.ts` |
| AI timeout | 30s | `ai-gateway/src/index.ts` |
| Payment timeout | 30s | `paynow-api.mjs` |
| Monthly plan | $2 | `paynow-api.mjs` |
| 6-month plan | $8 | `paynow-api.mjs` |
| Yearly plan | $12 | `paynow-api.mjs` |
| Test plan | $0.10 | `paynow-api.mjs` (non-production only) |

---

## 19. Overhaul Entry Checklist

Before any overhaul task, confirm:

- [ ] Read this audit file
- [ ] Read `OVERHAUL_PLAN.md` (Phase B output)
- [ ] Run baseline: `npm run build:web && npx turbo run test --filter=./apps/web`
- [ ] Check `PRODUCT_INVENTORY.md` for agent handoff context
- [ ] Check `CHANGELOG.md` for recent changes
- [ ] Verify no conflicting agents are editing the same files
- [ ] After changes: `npm run build:web`, `npx turbo run test --filter=./apps/web`, manual smoke test

---

*This document is the single source of truth for Zivvvo's current state. Update it after every major change.*
