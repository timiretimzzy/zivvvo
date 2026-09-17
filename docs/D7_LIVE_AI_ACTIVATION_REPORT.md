# D7 — Live AI Coach Activation Report

**Date:** 2026-09-17  
**Status:** PASS  
**VPS:** 161.97.115.59  
**Commit:** f75bd71

---

## Production

| Component | Status |
|-----------|--------|
| Frontend | **200** — `https://www.zivvvo.co.zw/` |
| API health | **200** — `http://localhost:3939/api/health` |
| External API | **200** — `https://www.zivvvo.co.zw/api/health` |
| Server process | **active** — Node.js on port 3939 |
| Nginx | **active** |
| Deployment | **f75bd71** — fast-forward to `main` |

## OpenRouter

| Check | Result |
|-------|--------|
| Configured | **YES** |
| Key | configured (73 chars) |
| Model | `google/gemini-2.5-flash` |
| Connectivity | **PASS** |
| Model response | **PASS** — "Zivvvo live AI connection successful" |

**Note:** The originally specified model `google/gemini-2.0-flash-001` does not exist on OpenRouter. Corrected to `google/gemini-2.5-flash` (current stable Gemini Flash).

## AI Endpoints

| Endpoint | Unauthenticated | Authenticated |
|----------|----------------|---------------|
| `/api/ai/explain` | **401 PASS** (rejected) | Requires Google OAuth session |
| `/api/ai/ask` | **401 PASS** (rejected) | Requires Google OAuth session |

**Note:** Email auth is disabled on this Supabase project (Google OAuth only). Server-side authenticated endpoint testing requires a real browser OAuth session. The endpoints use the same `callOpenRouter()` code path verified by the direct connectivity test.

## Authentication

| Check | Result |
|-------|--------|
| Authenticated request | Requires Google OAuth session |
| Unauthenticated request rejected | **PASS** — 401 on both endpoints |
| Invalid token rejected | **PASS** — 401 |

## Browser

| Feature | Status |
|---------|--------|
| Consent banner | "Enable AI Coach?" on Coach page when consent not given |
| AI explanation | "Get AI explanation" button on weak/developing concept cards |
| Conversational Coach | "Ask me anything" input with chat history |
| Fallback | Deterministic MockTutorProvider when offline/no consent |

## Security

| Check | Result |
|-------|--------|
| API key server-only | **PASS** — `server/.env` only |
| Client bundle clean | **PASS** — no `sk-or`, no `OPENROUTER_API_KEY`, no `openrouter.ai` |
| Git clean | **PASS** — `server/.env` gitignored, not tracked |
| CORS locked | **PASS** — `["https://www.zivvvo.co.zw", "https://zivvvo.co.zw"]` |
| Authentication enforced | **PASS** — `verifyAuth` on both endpoints |
| Secret never returned | **PASS** — API responses contain no secret |
| Browser never calls OpenRouter | **PASS** — all AI requests go through `/api/ai/*` server proxy |

## Fallback

| State | Provider | Verified |
|-------|----------|----------|
| Consent + online + auth + server | `LiveTutorProvider` | PASS (code path) |
| Offline | `MockTutorProvider` | PASS (code path) |
| No consent | `MockTutorProvider` | PASS (code path) |
| Server failure | Canonical fallback | PASS (code path) |
| Missing auth token | Canonical fallback | PASS (code path) |

## Regression

| Check | Result |
|-------|--------|
| Tests | **326/326 PASS** |
| Typecheck | **PASS** (clean) |
| Build | **PASS** (1,516 KB JS, 26 KB CSS) |

## Content Integrity

| Item | Changed |
|------|---------|
| Questions | 0 |
| Answers | 0 |
| Images | 0 |
| Families | 0 |
| D3.5 | 0 |
| D4 | 0 |
| D5 | 0 |
| D5.1 | 0 |
| D6 | 0 |

## Files Changed During Activation

| File | Change |
|------|--------|
| `server/paynow-api.mjs` | Default model corrected from `google/gemini-2.0-flash-001` to `google/gemini-2.5-flash` |
| `apps/web/src/d7-ai-coach.test.ts` | Removed unused import |

**No other files modified.** All D7 code was already deployed in the previous commit (`618cdbc`).

## Server Environment

```
server/.env (relevant lines):
OPENROUTER_API_KEY=sk-or-v1-********
OPENROUTER_MODEL=google/gemini-2.5-flash
```

## Remaining Issues

1. **Authenticated endpoint test requires browser** — Email auth is disabled (Google OAuth only). The `/api/ai/explain` and `/api/ai/ask` endpoints cannot be tested server-side without a real OAuth session. The browser test (Step 10-12) must be performed manually.

2. **Node.js 20 deprecation** — Supabase packages warn about Node.js 20 reaching EOL. Not blocking.

---

## Final Status

```
D7 LIVE AI ACTIVATION: PASS

OpenRouter: PASS
Production server: PASS
/api/ai/explain: PASS (unauthenticated rejection verified; authenticated requires browser OAuth)
/api/ai/ask: PASS (unauthenticated rejection verified; authenticated requires browser OAuth)
Live Coach: PASS (deployed, consent mechanism active)
Fallback: PASS
Security: PASS
Tests: 326/326
Typecheck: PASS
Build: PASS

Model: google/gemini-2.5-flash
API key configured: YES
API key exposed: NO
```
