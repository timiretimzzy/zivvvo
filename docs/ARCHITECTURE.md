# Zivvvo — Architecture

> Engineering architecture for a learning platform for examinations.

## Purpose — why this architecture exists

Learner products are ruined by architecture that treats every exam type as a
bespoke build. Zivvvo must support examinations (provisional licence today,
others in the future) with one engine, one set of models, and one learner
experience. The architecture exists so that adding a new examination never
means writing a new product.

## Design Philosophy

1. **Everything is data.** The question bank, explanations, topics, mastery
   state, and attempt history are all data — structured, versioned,
   transportable.
2. **Engine over rules.** Learning logic (what to show next, how ready you are)
   is a deterministic engine with well-defined interfaces, not imperative
   special-cases scattered through the UI.
3. **Mobile environment is hostile.** Flaky networks, small screens, signal
   loss in public transport. Everything must work offline and be resilient.
4. **Providers are swappable.** Artificial intelligence and backend services
   sit behind interfaces. The product owns its logic, providers own their
   servers.
5. **Domain separation.** Business logic lives in domains, not components.
   Pages render; domains decide.

## Core Product Domains

| Domain | Responsibility |
|--------|----------------|
| **Content** | The exam, its topics, questions, options, explanations, and how they are organised |
| **Assessment** | Recording attempts, scoring, readiness/confidence signals | 
| **Learning** | Mastery state, and what the learner should do next (the "adaptive" core) |
| **Gamification** | Motivation and feedback layer — never punishment (no lives/deaths) |
| **AI** | An optional enhancement layer — explanation and coaching, never source of truth |

The engine connects them:

```
        ┌────────────────────────────────────────────┐
        │                  UI / PWA (React)          │
        └──────────────┬─────────────────────────────┘
                       │ (calls use-cases, never SQL/business logic inline)
        ┌──────────────▼─────────────────────────────┐
        │            APPLICATION LAYER               │
        │  features/, hooks, services                │
        └──────┬──────────┬──────────┬───────────────┘
               │          │          │
   ┌───────────▼───┐ ┌────▼─────┐ ┌──▼────────────────┐
   │ Learning       │ │ Content  │ │ Assessment       │
   │ Engine domain  │ │ domain   │ │ domain           │
   └───────┬────────┘ └────┬─────┘ └────┬─────────────┘
           └───────────────┼────────────┘
                           │
        ┌──────────────────▼──────────────────┐
        │ DATA LAYER (portability)            │
        │ IndexedDB (offline-first, source    │
        │ of truth on device) ──sync──▶ Supabase│
        └─────────────────────────────────────┘
```

## Layers (bottom-up)

- **Data:** Dexie/IndexedDB is the on-device source of truth; Supabase/Postgres
  is the backend for accounts, sync, and backups. Business logic must not
  assume which backend is in use — a data-portability interface separates them.
- **Domains:** stateless, testable modules (`packages/content`,
  `packages/learning-engine`, `packages/assessment-engine`,
  `packages/ai-gateway`).
- **Application:** React features, hooks, and service wrappers that orchestrate
  domains.
- **Presentation:** mobile-first UI with a design system (`DESIGN_SYSTEM.md`).

## Key Interfaces (Phase 1)

See `LEARNING_ENGINE.md`, `ASSESSMENT_ENGINE.md`, `AI_ARCHITECTURE.md` for
signatures. Phase 1 ships interfaces and mock implementations, not just design
documents, so that the question experience can be built and tested immediately.

## Constraints

- **TypeScript strict** everywhere.
- **Small, focused modules**; avoid premature abstraction.
- **Minimal dependencies**; each dependency must earn its place.
- **No hardcoded provisional-licence specifics** in the engine; all exam data
  arrives via the content model.
- **AI never decides answers**; explanations come from the content model. AI is
  only an enhancement layer (see `AI_ARCHITECTURE.md`).

## Status

- Architecture document & domain boundaries: **Implemented** (this document is
  the agreement).
- Monorepo layout (`apps/`, `packages/`, `docs/`, data & tools pipelines):
  **Implemented**.
- Application code, packages, offline data layer, Supabase backend:
  **Implemented** — React app (`apps/web`) on the monorepo packages,
  Dexie offline-first persistence with the sync spine, and the isolated
  Supabase `zivvvo` schema (migration `001`). See `CURRENT_STATE.md` for the
  verified inventory.

## Assumptions

- A single learner profile per device is sufficient early on; multi-profile is
  a later concern.
- Offline-first performance barriers apply: list/question renders must not
  block on network.
- Postgres is the right relational backing store; if that changes, only the
  data layer changes.

## Future

- Otala/BAZ exam categories illustrate how fast a new category is onboarded.
- Real-time coach choreography may move into an edge/streaming layer.
- Multi-language and spoken explanations are additive layers, not core
  rewrites.