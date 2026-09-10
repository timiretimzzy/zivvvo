# Zivvvo

> Learning platform for examinations. Feel ready before you sit the test.

**Zivvvo** is a mobile-first, offline-capable, adaptive examination preparation
platform. It does not just present questions — it diagnoses a learner's
ability, reveals their weaknesses, recommends the next best thing to study,
repairs knowledge gaps, simulates the real examination, and tells the learner
how ready they are.

The first examination category is the **Zimbabwe VID provisional licence
test** (using a validated 1,249-question research bank). The architecture is
designed to be reusable for any examination.

## Repository layout

```
apps/web/                Mobile-first PWA (React + TypeScript + Vite + Tailwind)
packages/content/        Question/content models and the curated bank
packages/learning-engine/ Mastery, recommendations, readiness
packages/assessment-engine/ Attempts, scoring, sessions, diagnostic, readiness
packages/ai-gateway/     AI provider abstraction (mock provider wired)
supabase/                Backend (Postgres schema `zivvvo`, migrations) — live
docs/                    Product + engineering documentation (start here)
research/                Competitive analysis of the incumbent platform
tools/primaed/           PrimaEd research scrapers + answer-resolution pipeline
data/primaed/            Scraped primaEd driving content, images, answer key
```

## Status

- **Engines:** `@zivvvo/learning-engine`, `@zivvvo/assessment-engine`, and
  `@zivvvo/ai-gateway` are implemented and covered by 98 Vitest tests (incl. a
  blueprint-driven mock exam builder and pass/fail scoring).
- **Web app:** offline-first PWA — IndexedDB storage, seeded demo learners,
  five screens (Home, Learn, Practice, Progress, Coach), question images,
  readiness banner, mock exam mode. PWA manifest + icons + service-worker
  precaching of the shell and all question images; production build green
  (lazy supabase-js chunk).
- **Sync:** live Supabase backend in an isolated `zivvvo` schema (no-touch vs.
  the co-hosted EduStack product — `docs/supabase/no-touch-checklist.md`).
  FIFO push of pending attempts, idempotent upsert, RLS scoped to the device
  id; sync status card in Progress. Offline-only builds work with no env.
  Remote acceptance is pending the platform's postgREST schema exposure
  (ADR-022); "Download my data (JSON)" works entirely on-device today.
- **Content pack:** 1,249 questions (980 answered, 269 consciously skipped),
  19 concepts, 242 explanations, 446 image references (158 unique files),
  8 topics.
- **Research:** 2,119 question slots scraped; 327 testimonials; lessons are
  gated pending account re-enrollment (see `docs/DECISIONS.md` ADR-009).
- **Backend:** schema + client sync implemented; email auth and content-pack
  distribution are the next stage. See `docs/ROADMAP.md`.

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Product vision, promise, pillars, non-goals |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Domain architecture and rules |
| [docs/CONTENT_MODEL.md](docs/CONTENT_MODEL.md) | Question, topic and explanation models |
| [docs/LEARNING_ENGINE.md](docs/LEARNING_ENGINE.md) | Mastery, recommendations, readiness |
| [docs/ASSESSMENT_ENGINE.md](docs/ASSESSMENT_ENGINE.md) | Attempts, scoring, mocks |
| [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | AI-as-explainer, provider abstraction |
| [docs/OFFLINE_STRATEGY.md](docs/OFFLINE_STRATEGY.md) | Offline-first, IndexedDB, sync |
| [docs/DATABASE.md](docs/DATABASE.md) | Backend data model (Supabase/Postgres) |
| [docs/supabase/no-touch-checklist.md](docs/supabase/no-touch-checklist.md) | Shared-project isolation baseline |
| [docs/UX_PRINCIPLES.md](docs/UX_PRINCIPLES.md) | Product experience principles |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Visual language and components |
| [docs/ANALYTICS.md](docs/ANALYTICS.md) | Event tracking model |
| [docs/SECURITY.md](docs/SECURITY.md) | Secrets, RLS, key handling |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phases and Phase 1 deliverables |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log and rationale |

## Quick start

```bash
npm install
npm run dev:web       # Vite dev server for the app
npm test              # Vitest (engines + content pack + sync core, 196 tests)
npm run typecheck     # tsc --noEmit across packages and the app
npm run build:web     # copies images -> vite build -> emits dist/sw.js (PWA)
npm run build:content # regenerate the content pack (after data changes)
npm run copy:images   # refresh the served question images
npm run make:icons    # regenerate PWA icons
```

### Cloud sync (optional)

1. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (publishable key only).
2. Apply `supabase/migrations/001_init_zivvvo.sql` in the project's SQL Editor,
   then add the `zivvvo` schema under **Project Settings → API → Exposed
   schemas**.
3. Rebuild (`npm run build:web`) or run `npm run dev:web`. Without the env
   vars the app is purely offline — sync simply reports "Offline-only".

## Secrets

Credentials never live in the repository. Research scrapers read
`PRIMAED_USER` / `PRIMAED_PASS` from the environment or from
`data/primaed/.creds.txt` (gitignored). The web app reads
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from `apps/web/.env.local`
(gitignored); the publishable key is public by design, while the secret and
service-role keys stay server-side. See `docs/SECURITY.md` and
`docs/DECISIONS.md` (ADR-021).