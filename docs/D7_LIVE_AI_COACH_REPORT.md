# D7 — Live AI Coach Integration

**Date:** 2026-09-17  
**Status:** Complete  
**Tests:** 326 passing (313 existing + 13 new)  
**Typecheck:** Clean  
**Build:** Clean  
**Deploy:** Live at `https://www.zivvvo.co.zw/`

## Summary

D7 introduces live AI-powered tutoring behind the existing `TutorProvider` abstraction. The deterministic engine remains the authority for mastery, weakness, readiness, and question selection. AI is the **language layer** — explain, simplify, rephrase, answer questions.

## Architecture

```
Browser SPA                    Server (Express)              OpenRouter API
apps/web/                      server/paynow-api.mjs
     |                              |
     |-- ai-provider.ts             |-- POST /api/ai/explain (auth required)
     |   (consent + cache +         |-- POST /api/ai/ask (auth required)
     |    provider selection)        |
     |-- LiveTutorProvider -------->|-- callOpenRouter() ----> openrouter.ai
     |   (same-origin fetch)        |
     |-- MockTutorProvider          |
     |   (offline fallback)         |
     v                              v
  IndexedDB (Dexie)            Supabase DB
```

## Key Files

| File | Purpose |
|------|---------|
| `server/paynow-api.mjs` | AI endpoints: `/api/ai/explain`, `/api/ai/ask`, rate limiting, OpenRouter proxy |
| `packages/ai-gateway/src/tutor-live.ts` | `LiveTutorProvider` — calls server AI proxy |
| `packages/ai-gateway/src/tutor-mock.ts` | `MockTutorProvider` — deterministic fallback (unchanged) |
| `apps/web/src/ai-provider.ts` | Provider selection, consent, caching, auth token wiring |
| `apps/web/src/pages/Coach.tsx` | AI-enhanced Coach page: consent banner, AI explanations, conversational input |
| `apps/web/src/tutor/ConceptTeachCard.tsx` | Added `children` prop for AI enhancement slot |
| `apps/web/src/ui.tsx` | Added `type` prop to Button for form submission |
| `apps/web/src/d7-ai-coach.test.ts` | 13 tests: consent, provider selection, caching, live provider |

## Security Model

1. **API key never in client bundle** — stored in `OPENROUTER_API_KEY` env var on server only
2. **Auth required** — both `/api/ai/explain` and `/api/ai/ask` require valid Supabase JWT
3. **CORS locked** — server only accepts requests from `zivvvo.co.zw`
4. **Content boundary** — system prompt enforces: no inventing Zimbabwe laws, no contradicting canonical answers, concise phone-friendly output, exam-focused only
5. **AI must NOT determine**: mastery, weakness, correctness, readiness, question selection, family dedup, scores
6. **AI may**: explain, simplify, rephrase, answer learner questions, provide examples, teach concepts

## Provider Selection Logic

```
consent=true AND online AND server responds → LiveTutorProvider
otherwise → MockTutorProvider (deterministic, always available)
```

The `LiveTutorProvider` degrades gracefully:
- No consent → mock provider (never even instantiated)
- Offline → mock provider
- Server error → mock fallback
- Auth token missing → returns canonical fallback
- Response invalid → canonical fallback

## Consent Mechanism

- Explicit opt-in banner on Coach page: "Enable AI Coach?"
- Toggle in Settings page: "AI Coach" section
- Persisted in `localStorage` as `zivvvo_ai_consent`
- Can be turned off at any time
- When disabled, all explanations use deterministic canonical content

## Caching

- Deterministic concept explanations cached in `localStorage` under `zivvvo_ai_explain_cache`
- Cache key: `concept::state`
- TTL: 24 hours
- Max 50 entries (LRU eviction)
- Only "generated" (AI) explanations cached; "canonical" responses use existing deterministic path

## Rate Limiting

**Server-side:**
- 10 AI requests per IP per minute
- 20-second timeout per request
- Cleanup every 5 minutes

**Client-side:**
- Question length limit: 500 characters
- Loading states prevent duplicate submissions
- Error states with retry prompts

## Conversational Coach UX

The Coach page now includes:

1. **AI Consent Banner** — shown when consent not yet given
2. **AI-Enhanced Concept Cards** — "Get AI explanation" button on weak/developing concepts
3. **Mistake Recovery with AI** — auto-fetches AI explanation when showing mistake teaching
4. **"Ask me anything" input** — conversational Q&A about driving rules, context-aware (uses weakest concept from tutor context)
5. **Chat history** — lightweight in-memory conversation (user/AI turns, loading states, error handling)

## Response Validation

- Server validates request shape before calling LLM
- Client validates response shape: must have `text` (string), `source`, `available`
- Invalid/empty responses fall back to canonical content
- AI disclaimer shown: "Responses are AI-generated. Always verify against official study material."

## LLM Configuration

- **Provider:** OpenRouter (via `OPENROUTER_API_KEY` env var)
- **Default model:** `google/gemini-2.0-flash-001` (configurable via `OPENROUTER_MODEL`)
- **Temperature:** 0.7
- **Max tokens:** 500
- **Timeout:** 15 seconds server-side, 20 seconds client-side

## Test Coverage

13 new tests in `d7-ai-coach.test.ts`:
- Consent: default, enable, disable, persistence
- Provider selection: no consent → mock, consent+online → live
- Cache: returns valid response from provider
- LiveTutorProvider: no consent → fallback, no auth → fallback, offline → fallback, server down → fallback, without consent at request time → fallback

## Content Integrity

- Canonical explanations (author-written T0) always preserved as fallback
- AI-generated explanations clearly labeled with source indicator
- System prompt explicitly forbids inventing Zimbabwe driving laws
- When material is insufficient, AI instructed to say: "I don't have enough verified information to answer that reliably"
- AI must not contradict canonical explanation from content pack

## Environment Variables

**Server (`server/.env`):**
```
OPENROUTER_API_KEY=sk-or-...     # Required for live AI (optional — mock works without)
OPENROUTER_MODEL=google/gemini-2.0-flash-001  # Optional, defaults shown
```

**Client (no changes):**
- Uses existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- No new client-side env vars needed

## What Was NOT Changed

- Deterministic engine (mastery, weakness, readiness, scoring) — untouched
- Family dedup logic — untouched  
- Question selection algorithms — untouched
- Mock exam scoring — untouched
- Existing offline-first behavior — preserved
- All 313 pre-existing tests — still passing
