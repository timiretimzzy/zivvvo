# Zivvvo Overhaul Plan (Phase B)

> **Date:** 2026-09-16 | **Depends on:** CURRENT_PRODUCT_AUDIT.md
> **Author:** Code-Index-Maintainer agent
> **Rule:** EXTEND > REFACTOR > REPLACE. Preserve existing product. No dead code.
> **User directive:** "Do not hardcode anything that would make updating questions in the future hard."

---

## Priority Order

| Stream | Name | Priority | Effort | Why |
|--------|------|----------|--------|-----|
| WS1 | Content Architecture | P0 | Large | Foundation for everything — 70.9% of questions in catch-all "general" topic makes intelligence features useless |
| WS2 | Intelligence Exposure | P0 | Medium | Core differentiator — concept model exists in data but is invisible to users |
| WS3 | Competitive Gap Modules | P0 | Medium | ZimRoadWise has road signs + oral prep + vehicle knowledge — we don't |
| WS4 | Practice & Assessment | P1 | Medium | Same-concept recovery, dynamic mock, spaced repetition |
| WS5 | UX & Polish | P1 | Small | Dark mode, search, accessibility, offline indicator |
| WS6 | Backend & Infrastructure | P2 | Large | Admin panel, analytics, CI/CD — important but not blocking learning |

---

## WS1: Content Architecture

### WS1.1 — Reorganize Concept Model

**Problem:** 23 declared concepts, but 31.7% of questions have null concept and 27.7% are lumped into "other". Intelligence features (weakness detection, targeted sessions, concept progress) are useless when most questions lack meaningful concepts.

**Evidence:** `content-v1.json` has `concepts: ["accident","age","alcohol","cycles","distance","horn","insurance","junction","lights","lines","load","lplate","motorcycle","other","overtaking","parking","pedestrian","rail-crossing","road-markings","roadcraft","robot","speed","towing"]`. Only 23 strings. 31.7% null concept rate.

**Existing implementation:** `packages/content/src/data/content-v1.json` → `concepts` array (flat strings), questions have `concept` field referencing this array.

**Proposed change:** Expand concepts to ~40-50 meaningful categories aligned with VID syllabus. Re-map every question to a specific concept (no "other", no null). Group concepts into parent categories for dashboard display.

**Files affected:**
- `packages/content/src/data/content-v1.json` (concepts array + question remapping)
- `packages/content/src/content.ts` (concept loading, new `ConceptCategory` type)
- `packages/learning-engine/src/mastery.ts` (per-concept mastery uses concept field)

**Database impact:** None — concept is a string field in Dexie, no schema change.

**Offline impact:** Content reseed required (user's local DB gets new concept mapping on next content load).

**Risk:** Medium — remapping 1,396 questions requires validation. Incorrect mapping breaks weakness detection.

**Acceptance criteria:**
- [ ] Every question has a non-null, non-"other" concept
- [ ] Concepts are grouped into parent categories (e.g., "Roadcraft" → {speed, overtaking, lane, roundabouts, ...})
- [ ] `concepts` array in content JSON expanded to 40-50 entries
- [ ] No question loses its `topicId` during remapping
- [ ] All 218 tests still pass after content update

---

### WS1.2 — Rebuild Topic Taxonomy

**Problem:** 8 topics with 70.9% in "general" — not useful for filtering, reporting, or session selection.

**Evidence:** Topics in `content-v1.json`: vehicle-classes(13), carriageway-lines(30), junction-rules(60), general(990), alcohol-and-driving(22), fines-and-penalties(19), vehicle-maintenance(19), seat-belts(15). "general" has 990 questions — 70.9%.

**Existing implementation:** `topics` array in content JSON with `id`, `label`, `kind`, `count`. Questions reference via `topicId`.

**Proposed change:** Split "general" into meaningful sub-topics. Target 15-20 topics. Each topic should have ≤100 questions for balanced practice.

**Files affected:**
- `packages/content/src/data/content-v1.json` (topics array + question remapping)
- `apps/web/src/pages/Home.tsx` (topic display in session launchers)
- `apps/web/src/pages/Practice.tsx` (topic filter in practice sessions)
- `apps/web/src/catalog.ts` (topic catalog)

**Database impact:** None — topicId is a string field.

**Offline impact:** Content reseed required.

**Risk:** Medium — same as WS1.1. Questions must be correctly re-mapped.

**Acceptance criteria:**
- [ ] "general" topic eliminated or reduced to <50 questions
- [ ] 15-20 meaningful topics with 20-100 questions each
- [ ] Topic labels are human-readable and exam-relevant
- [ ] Topic counts in content JSON match actual question distribution
- [ ] Home page session launchers show new topics correctly

---

### WS1.3 — Source-Link All Questions to Content Modules

**Problem:** Questions, road signs, oral questions, and vehicle knowledge exist in silos. No cross-referencing. A user studying "road signs" topic doesn't get linked to the road sign library.

**Evidence:** Road signs stored in `apps/web/src/data/road-signs.json` (157 signs). Questions in `content-v1.json` (1,396). No `questionId` on signs, no sign-category mapping in questions.

**Existing implementation:** Separate data files, no linkage.

**Proposed change:** Add `relatedQuestionIds` field to road signs. Add `relatedSignId` field to sign-related questions. Add `sourceModule` field to questions indicating which module they originate from.

**Files affected:**
- `apps/web/src/data/road-signs.json` (add `relatedQuestionIds`)
- `packages/content/src/data/content-v1.json` (add `relatedSignId` to sign questions)
- `apps/web/src/pages/RoadSigns.tsx` (show related questions)
- `apps/web/src/pages/Practice.tsx` (show source module badge)

**Database impact:** None — new fields are optional/string.

**Offline impact:** Content reseed required. Sign-question links computed at build time.

**Risk:** Low — additive fields, no breaking changes.

**Acceptance criteria:**
- [ ] Road signs with matching questions have `relatedQuestionIds` populated
- [ ] Sign-related questions have `relatedSignId` pointing to the sign
- [ ] RoadSigns.tsx shows "N practice questions" link on each sign
- [ ] Practice.tsx shows source module badge (e.g., "From Road Signs library")

---

### WS1.4 — Add Oral Exam Questions

**Problem:** ZimRoadWise has 45 oral questions. Zivvvo has zero. Oral questions are part of the VID exam.

**Evidence:** No oral questions in `content-v1.json`. No oral question data anywhere in codebase.

**Existing implementation:** None.

**Proposed change:** Create `packages/content/src/data/oral-questions.json` with 45+ oral questions. Add oral question section to Practice page. Add oral question data to content JSON.

**Files affected:**
- `packages/content/src/data/oral-questions.json` (new file)
- `packages/content/src/data/content-v1.json` (add oral questions to questions array)
- `apps/web/src/pages/Practice.tsx` (oral question session type)
- `apps/web/src/engine.ts` (oral question session builder)

**Database impact:** None — oral questions use same question schema.

**Offline impact:** Oral questions bundled in content JSON, available offline.

**Risk:** Low — additive content, no breaking changes.

**Acceptance criteria:**
- [ ] 45+ oral questions with correct answers and explanations
- [ ] Oral questions have `topicId: "oral-exam"` and meaningful concepts
- [ ] Practice page has "Oral Prep" session type
- [ ] Oral sessions use same session runner as other types
- [ ] Oral questions appear in weakness detection and targeted sessions

---

## WS2: Intelligence Exposure

### WS2.1 — Concept Progress Dashboard

**Problem:** Concept model exists in data but is invisible to users. Users can't see which concepts they're strong/weak in.

**Evidence:** `content-v1.json` has `concept` field on questions. `packages/learning-engine/src/mastery.ts` computes per-concept mastery. But no UI displays this.

**Existing implementation:** `computeMastery()` in learning-engine returns per-concept accuracy. `weaknesses()` in `engine.ts` computes weakness signals. But only used internally for session planning.

**Proposed change:** Add "Concept Progress" section to Progress page showing per-concept accuracy, mastery level, and trend. Color-code by strength (green/yellow/red).

**Files affected:**
- `apps/web/src/pages/Progress.tsx` (add concept progress section)
- `apps/web/src/engine.ts` (expose concept mastery data)
- `packages/learning-engine/src/mastery.ts` (ensure mastery computation is accessible)

**Database impact:** None — data already computed from attempts.

**Offline impact:** None — all data from local Dexie.

**Risk:** Low — display only, no logic changes.

**Acceptance criteria:**
- [ ] Progress page shows all concepts with accuracy percentages
- [ ] Color-coded: green (>80%), yellow (50-80%), red (<50%)
- [ ] Shows attempt count per concept
- [ ] Shows mastery level (new/learning/mastered)
- [ ] Sortable by accuracy (weakest first)
- [ ] Responsive on mobile

---

### WS2.2 — Adaptive Home Screen (Weak-Concept-First)

**Problem:** Home screen shows generic "Start Practice" without prioritizing weak areas. `adaptiveRecommendations()` exists in store but isn't prominently displayed.

**Evidence:** `Home.tsx` line ~100 shows `nextActivity()` recommendation but it's not the primary CTA. Weak areas section exists but is below the fold.

**Existing implementation:** `nextActivity()` in `engine.ts` returns recommended activity. `weaknesses()` returns weakness signals. Home page has a "Weak Areas" section but it's not the primary focus.

**Proposed change:** Make weak-concept-first practice the primary CTA on Home. Show top 3 weak concepts as quick-start buttons. De-emphasize generic "Start Practice".

**Files affected:**
- `apps/web/src/pages/Home.tsx` (reorder layout, promote weak-concept buttons)
- `apps/web/src/engine.ts` (ensure `weaknesses()` returns sorted by severity)

**Database impact:** None.

**Offline impact:** None.

**Risk:** Low — layout change only.

**Acceptance criteria:**
- [ ] Top 3 weak concepts shown as primary CTAs on Home
- [ ] Each CTA shows concept name + accuracy + "Practice Now" button
- [ ] Generic "Start Practice" moved below weak-concept section
- [ ] If no weak concepts, show "All Clear! Try a Mock Exam" instead
- [ ] Weak concepts sorted by severity (recurring > deteriorating > early)

---

### WS2.3 — Concept-Based Session Selection

**Problem:** Users can only choose session type (diagnostic/practice/mock/targeted) but not which concepts to practice.

**Evidence:** `Practice.tsx` session launcher has type selector but no concept filter. `sessionFor()` in `engine.ts` accepts topic but not concept filter.

**Existing implementation:** `sessionFor(type, topic, config)` — topic filter exists but concept filter doesn't.

**Proposed change:** Add concept multi-select to practice session launcher. Allow users to practice specific concepts. Persist last-used concept selection.

**Files affected:**
- `apps/web/src/pages/Practice.tsx` (add concept selector UI)
- `apps/web/src/engine.ts` (add concept filter to session builders)
- `apps/web/src/store.ts` (persist last concept selection in meta)

**Database impact:** Add `lastConceptSelection` to meta table.

**Offline impact:** None.

**Risk:** Low — additive feature.

**Acceptance criteria:**
- [ ] Practice session launcher shows concept multi-select
- [ ] Concepts grouped by parent category
- [ ] Selecting concepts filters question pool
- [ ] Last-used selection persisted in meta table
- [ ] "Select All" / "Clear" buttons for convenience
- [ ] Concept count shown (e.g., "12 questions match")

---

### WS2.4 — Targeted Sessions (Same-Concept Recovery)

**Problem:** After getting a question wrong, the next question in the session doesn't specifically target the same concept for immediate remediation.

**Evidence:** `nextQuestion()` in `practice.ts` picks next question from remaining pool without concept-weighting. `weaknessSession()` in `engine.ts` targets weak concepts but doesn't do same-question recovery.

**Existing implementation:** `weaknessSession()` creates sessions targeting weak concepts. But within a session, wrong answers don't trigger same-concept follow-up.

**Proposed change:** After a wrong answer, inject a same-concept question within the next 3 questions. Track "recovery attempts" separately.

**Files affected:**
- `packages/assessment-engine/src/practice.ts` (modify `nextQuestion()` to inject same-concept questions)
- `packages/assessment-engine/src/types.ts` (add `recoveryAttempts` to session state)
- `apps/web/src/pages/Practice.tsx` (show "Recovery" badge on injected questions)

**Database impact:** None — recovery tracking is session-level, not persisted.

**Offline impact:** None.

**Risk:** Medium — changes session flow logic. Must not break existing session behavior.

**Acceptance criteria:**
- [ ] After wrong answer, next question targets same concept (within 3 questions)
- [ ] Recovery question marked with "Recovery" badge
- [ ] If no same-concept questions available, fallback to normal selection
- [ ] Recovery attempts tracked in session summary
- [ ] Existing session behavior unchanged for correct answers

---

### WS2.5 — Mistake Book with Concept Grouping

**Problem:** Mistake book exists but questions aren't grouped by concept. Users can't see patterns in their mistakes.

**Evidence:** `Practice.tsx` has `viewingMistakes` state. `mistakeReviewSession()` in `engine.ts` creates sessions from wrong answers. But no concept grouping in the UI.

**Existing implementation:** Mistakes stored in `db.reviews` with `questionId`. `mistakeReviewSession()` picks random wrong answers.

**Proposed change:** Group mistakes by concept in the Mistake Book UI. Show concept-level summary (e.g., "Overtaking: 5 mistakes, 40% accuracy"). Allow concept-filtered review.

**Files affected:**
- `apps/web/src/pages/Practice.tsx` (add concept grouping to mistake book UI)
- `apps/web/src/engine.ts` (add `mistakesByConcept()` helper)

**Database impact:** None — data already exists.

**Offline impact:** None.

**Risk:** Low — UI enhancement.

**Acceptance criteria:**
- [ ] Mistake Book shows concepts as expandable groups
- [ ] Each group shows mistake count + accuracy
- [ ] "Review This Concept" button per group
- [ ] "Review All" button at top
- [ ] Empty state: "No mistakes yet! Keep practicing."

---

### WS2.6 — Readiness Explanation

**Problem:** Mock readiness score is shown but users don't understand *why* their score is what it is.

**Evidence:** `computeReadiness()` in assessment-engine returns a score. Home page shows readiness ring. But no explanation of what factors contribute.

**Existing implementation:** `computeReadiness()` uses accuracy, concept coverage, consistency, difficulty, time. Returns score + band (Not Ready / Approaching / Ready).

**Proposed change:** Add readiness breakdown showing contributing factors: "Your accuracy is 75% (good), but you've only covered 60% of concepts (needs work)".

**Files affected:**
- `packages/assessment-engine/src/readiness.ts` (return factor breakdown)
- `apps/web/src/pages/Home.tsx` (show readiness breakdown)

**Database impact:** None.

**Offline impact:** None.

**Risk:** Low — display enhancement.

**Acceptance criteria:**
- [ ] Readiness section shows 4-5 contributing factors
- [ ] Each factor shows current value + target
- [ ] Factors: accuracy, concept coverage, consistency, difficulty exposure, session count
- [ ] Color-coded per factor (green/yellow/red)
- [ ] "Improve This" links to relevant practice

---

### WS2.7 — Post-Mock Diagnosis

**Problem:** After mock exam, users see pass/fail but don't get diagnosis of which concepts caused failure.

**Evidence:** `mockSession()` in `engine.ts` returns session with accuracy. `mockScore()` in assessment-engine computes score. But no post-mock breakdown.

**Existing implementation:** Mock exam ends, shows score + pass/fail. No concept-level breakdown.

**Proposed change:** After mock, show concept-level performance: "You got 8/10 on Speed questions but 3/7 on Overtaking". Link to targeted practice for weak concepts.

**Files affected:**
- `apps/web/src/pages/Practice.tsx` (add post-mock diagnosis view)
- `apps/web/src/engine.ts` (add `mockDiagnosis()` helper)

**Database impact:** None — data from session attempts.

**Offline impact:** None.

**Risk:** Low — display enhancement.

**Acceptance criteria:**
- [ ] After mock, show concept breakdown table
- [ ] Table shows: concept, questions attempted, correct, accuracy, status
- [ ] Red highlights for concepts below 70% accuracy
- [ ] "Practice Weak Concepts" button links to targeted session
- [ ] "Retry Mock" button at bottom
- [ ] Works for both pass and fail outcomes

---

## WS3: Competitive Gap Modules

### WS3.1 — Road Signs Library with Question Linkage

**Problem:** Zivvvo has road sign questions but no standalone road sign library. ZimRoadWise has 157 signs with images, categories, and meanings.

**Evidence:** `apps/web/src/data/road-signs.json` exists (157 signs). `apps/web/src/pages/RoadSigns.tsx` exists (304 lines). But signs aren't linked to questions.

**Existing implementation:** RoadSigns.tsx shows signs as cards with category filter. Each sign shows title, description, meaning, penalty. But no question linkage.

**Proposed change:** Add "Related Questions" section to each road sign. Add "Study This Sign" button that creates a targeted session with related questions. Add sign images (currently text-only).

**Files affected:**
- `apps/web/src/data/road-signs.json` (add `relatedQuestionIds`, `imageUrl`)
- `apps/web/src/pages/RoadSigns.tsx` (add question linkage UI, image display)
- `apps/web/src/engine.ts` (add `signSession()` builder)

**Database impact:** None.

**Offline impact:** Sign images need to be bundled or cached.

**Risk:** Low — additive feature.

**Acceptance criteria:**
- [ ] Each road sign shows "N related questions" link
- [ ] Clicking "Study This Sign" creates targeted session with related questions
- [ ] Sign images displayed (placeholder if real images unavailable)
- [ ] Category filter works (10 categories)
- [ ] Search within signs works
- [ ] Responsive on mobile

---

### WS3.2 — Vehicle Knowledge Module

**Problem:** ZimRoadWise has Vehicle Knowledge 360°. Zivvvo has no vehicle knowledge content.

**Evidence:** No vehicle knowledge data in codebase. `mechanical` topic has only 19 questions.

**Existing implementation:** None.

**Proposed change:** Create vehicle knowledge module with: vehicle components, maintenance basics, instrument panel, common faults. Add to Practice as session type.

**Files affected:**
- `packages/content/src/data/vehicle-knowledge.json` (new file)
- `apps/web/src/pages/Practice.tsx` (add vehicle knowledge session type)
- `apps/web/src/engine.ts` (add `vehicleKnowledgeSession()` builder)

**Database impact:** None — uses existing question schema.

**Offline impact:** Content bundled in JSON.

**Risk:** Low — additive content.

**Acceptance criteria:**
- [ ] 30+ vehicle knowledge questions covering components, maintenance, instruments
- [ ] Questions have `topicId: "vehicle-knowledge"` and meaningful concepts
- [ ] Practice page has "Vehicle Knowledge" session type
- [ ] Vehicle knowledge sessions use same session runner
- [ ] Questions appear in weakness detection

---

## WS4: Practice & Assessment

### WS4.1 — Dynamic Mock Configuration

**Problem:** Mock exam is fixed at 25 questions, 15 minutes, 90% pass. Users can't customize.

**Evidence:** `ZVID_MOCK_DEFAULT` in `assessment-engine/src/mock.ts` hardcodes config. `mockSession()` in `engine.ts` uses default config.

**Existing implementation:** `ZVID_MOCK_DEFAULT = { totalQuestions: 25, minutes: 15, passMark: 0.9 }`. No UI to change.

**Proposed change:** Add mock configuration modal: question count (10/25/50), time limit (10/15/30/45 min), topic filter, concept filter. Save last-used config.

**Files affected:**
- `apps/web/src/pages/Practice.tsx` (add mock config modal)
- `apps/web/src/engine.ts` (accept custom config in `mockSession()`)
- `apps/web/src/store.ts` (persist mock config in meta)

**Database impact:** Add `mockConfig` to meta table.

**Offline impact:** None.

**Risk:** Low — additive feature.

**Acceptance criteria:**
- [ ] Mock launcher shows "Configure" button
- [ ] Config modal: question count, time limit, topic filter, concept filter
- [ ] Defaults match current values (25 questions, 15 min)
- [ ] Last-used config persisted
- [ ] Custom config creates session with specified parameters
- [ ] Pass mark remains 90% (not configurable)

---

### WS4.2 — Spaced Repetition: EXISTS AND WORKS (D0 finding)

**Status:** The D0 audit confirmed that SRS already exists and works in `packages/learning-engine/src/spaced.ts`.

**Existing implementation:**
- `applyAnswer(previous, learnerId, answer, cfg, clock)` — full SRS scheduler
- Stage progression: 0 → 1 → 3 → 7 → 14 → 30 days (configurable via `reviewScheduleDays`)
- Confidence-based: "sure" advances stage, "unsure"/"guess" holds at current stage
- Incorrect answers reset to stage 0 with lapse counting
- `isDue(state, now)` — checks if review is due
- `ReviewState` type with `qid`, `learnerId`, `stage`, `last`, `next`, `lapseCount`

**Classification:** EXISTS AND WORKS

**Do NOT create a second SRS implementation.** This work item is cancelled.

**Potential improvement (future):** The current SRS does not decay mastery over time (a question mastered 60 days ago is treated the same as one mastered yesterday). This is a valid enhancement but is NOT the same as implementing a new SRS scheduler. If needed, add a `masteryDecay()` function that reduces mastery scores for questions not reviewed within their SRS interval.

---

### WS4.3 — Session-Level Question Ordering Optimization

**Problem:** Questions within a session are ordered randomly or by weakness. No optimization for learning efficiency.

**Evidence:** `nextQuestion()` in `practice.ts` picks from remaining pool. `quickSession()` uses random. `weaknessSession()` uses weakness-weighted random.

**Existing implementation:** Simple random/weighted selection. No optimization.

**Proposed change:** Order questions by: (1) same-concept clustering (2-3 questions per concept in a row), (2) difficulty gradient (easy→medium→hard), (3) interleaving (mix concepts after clustering).

**Files affected:**
- `packages/assessment-engine/src/practice.ts` (optimize `nextQuestion()`)
- `packages/assessment-engine/src/config.ts` (add ordering config)

**Database impact:** None.

**Offline impact:** None.

**Risk:** Low — session behavior enhancement.

**Acceptance criteria:**
- [ ] Sessions cluster same-concept questions (2-3 in a row)
- [ ] Difficulty increases within clusters
- [ ] Concepts interleaved between clusters
- [ ] Session summary shows concept distribution
- [ ] Existing session types not broken

---

## WS5: UX & Polish

### WS5.1 — Dark Mode

**Problem:** Zivvvo only has light mode + high contrast. ZimRoadWise has full dark theme.

**Evidence:** CSS variables in `index.css` only define light theme. `high-contrast` class in App.tsx adds borders but not dark colors.

**Existing implementation:** 8 CSS variables (`--color-bg`, `--color-text`, etc.) in light theme. `high-contrast` class overrides some.

**Proposed change:** Add dark mode theme. Toggle in Settings. Respect `prefers-color-scheme`. Store preference in meta table.

**Files affected:**
- `apps/web/src/index.css` (add dark theme variables)
- `apps/web/src/App.tsx` (add `dark` class toggle)
- `apps/web/src/pages/Settings.tsx` (add theme toggle)
- `apps/web/src/store.ts` (persist theme preference)

**Database impact:** Add `theme` to meta table.

**Offline impact:** None.

**Risk:** Low — CSS-only change + toggle.

**Acceptance criteria:**
- [ ] Dark mode toggle in Settings (Light/Dark/System)
- [ ] Respects `prefers-color-scheme` when set to "System"
- [ ] All components readable in dark mode
- [ ] No contrast issues (WCAG AA)
- [ ] Preference persisted across sessions
- [ ] Transition animation (200ms)

---

### WS5.2 — Search Questions

**Problem:** No way to search questions by keyword. Users can't find specific content.

**Evidence:** No search feature anywhere in codebase.

**Existing implementation:** None.

**Proposed change:** Add global search accessible from header. Search across question stems, explanations, and concepts. Show results with accuracy indicator.

**Files affected:**
- `apps/web/src/components/Search.tsx` (new component)
- `apps/web/src/App.tsx` (add search icon in header)
- `apps/web/src/engine.ts` (add `searchQuestions()` helper)

**Database impact:** None — search against in-memory content.

**Offline impact:** Works offline (content is local).

**Risk:** Low — additive feature.

**Acceptance criteria:**
- [ ] Search icon in header opens search modal
- [ ] Real-time search as user types (debounced 300ms)
- [ ] Results show: question stem, topic, concept, accuracy
- [ ] Click result opens question in practice mode
- [ ] Empty state: "No questions found"
- [ ] Works offline

---

### WS5.3 — Offline Indicator

**Problem:** Users don't know when they're offline. Sync fails silently.

**Evidence:** No offline detection UI. `syncManager` retries but user isn't informed.

**Existing implementation:** `SyncManager` in `sync.ts` handles network errors. But no UI feedback.

**Proposed change:** Add offline banner at top of screen when network is unavailable. Show sync status (synced/syncing/offline).

**Files affected:**
- `apps/web/src/App.tsx` (add offline banner)
- `apps/web/src/sync-supabase.ts` (expose sync status)

**Database impact:** None.

**Offline impact:** Core feature — shows when offline.

**Risk:** Low — display only.

**Acceptance criteria:**
- [ ] Offline banner appears when `navigator.onLine === false`
- [ ] Banner shows "You're offline — changes will sync when reconnected"
- [ ] Banner disappears when back online
- [ ] Sync indicator shows: synced (green), syncing (yellow), offline (red)
- [ ] No false positives (only show when actually offline)

---

## WS6: Backend & Infrastructure

### WS6.1 — Admin Panel for Content Management

**Problem:** No way to manage content without code changes. Every question update requires agent + deploy.

**Evidence:** No admin pages, no admin API endpoints. Comment in store.ts mentions "admin whitelist" but never implemented.

**Existing implementation:** None.

**Proposed change:** Create minimal admin panel: question browser, concept editor, topic manager. Protected by admin role. API endpoints for CRUD.

**Files affected:**
- `apps/web/src/pages/Admin.tsx` (new page)
- `apps/web/src/App.tsx` (add admin route)
- `server/paynow-api.mjs` (add admin API endpoints)
- `supabase/migrations/005_admin.sql` (admin role table)

**Database impact:** New `admin_users` table. Content tables may need CRUD endpoints.

**Offline impact:** Admin features require network.

**Risk:** High — new attack surface, needs security review.

**Acceptance criteria:**
- [ ] Admin page accessible only to admin users
- [ ] Question browser with search/filter
- [ ] Concept editor (add/edit/delete)
- [ ] Topic manager (add/edit/delete)
- [ ] Changes propagate to content JSON
- [ ] Audit log for changes

---

### WS6.2 — Analytics Integration

**Problem:** No external analytics. Can't track user behavior, feature usage, or conversion.

**Evidence:** `ConsoleSink` only. No Google Analytics, PostHog, or similar.

**Existing implementation:** `track()` function in assessment-engine with sink pattern. `ConsoleSink` logs to console.

**Proposed change:** Add PostHog or Plausible analytics. Track: session completions, feature usage, payment conversions, retention.

**Files affected:**
- `packages/assessment-engine/src/events.ts` (add analytics sink)
- `apps/web/src/App.tsx` (initialize analytics)
- `apps/web/src/pages/Pricing.tsx` (track conversion events)

**Database impact:** None.

**Offline impact:** Analytics buffered offline, sent when online.

**Risk:** Low — additive, no breaking changes.

**Acceptance criteria:**
- [ ] Analytics provider initialized on app load
- [ ] Session events tracked (start, complete, abandon)
- [ ] Payment events tracked (initiate, complete, fail)
- [ ] Feature usage tracked (search, road signs, oral prep)
- [ ] No PII tracked (only anonymous events)
- [ ] Opt-out option in Settings

---

### WS6.3 — CI/CD Pipeline

**Problem:** No automated testing or deployment. Manual process is error-prone.

**Evidence:** Deploy is manual: build → push → SSH → pull → build → reload nginx.

**Existing implementation:** None.

**Proposed change:** GitHub Actions pipeline: on push to main → lint → typecheck → test → build → deploy.

**Files affected:**
- `.github/workflows/deploy.yml` (new file)
- `package.json` (add CI scripts)

**Database impact:** None.

**Offline impact:** None.

**Risk:** Low — additive, no breaking changes.

**Acceptance criteria:**
- [ ] Pipeline runs on push to main
- [ ] Steps: install → lint → typecheck → test → build → deploy
- [ ] Deploy only on main branch
- [ ] Slack/email notification on failure
- [ ] Rollback capability

---

## Implementation Order

| Phase | Streams | Deliverable |
|-------|---------|-------------|
| Phase C | Baseline | Build + lint + typecheck + tests pass |
| Phase D | WS1.1 + WS1.2 | Content reorganized (concepts + topics) |
| Phase E | WS2.1 + WS2.2 + WS2.3 | Intelligence exposed (concept progress, adaptive home, concept selection) |
| Phase F | WS3.1 + WS3.2 + WS1.4 | Competitive gaps filled (road signs, vehicle knowledge, oral questions) |
| Phase G | WS4.1 + WS4.3 | Practice enhanced (dynamic mock, question ordering) |
| Phase H | WS5.1 + WS5.2 + WS5.3 | UX polished (dark mode, search, offline indicator) |
| Phase I | WS6.1 + WS6.2 + WS6.3 | Infrastructure (admin, analytics, CI/CD) |

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Content reorganization breaks questions | High | Validate every question has valid topicId + concept before deploy |
| SRS algorithm causes review flood | Medium | Start with conservative intervals, monitor review counts |
| Dark mode contrast issues | Medium | Test all components, use WCAG AA contrast checker |
| Admin panel security | High | Require admin role, rate limit, audit log |
| Offline indicator false positives | Low | Use `navigator.onLine` + actual network check |

---

*This plan is the single source of truth for the overhaul. Update it after every major change.*
