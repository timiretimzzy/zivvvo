# D9 — Strict Live AI Mode + AI Tutor Reliability

**Date:** 2026-09-17  
**Status:** PASS  
**Commit:** 203cc32  
**Production:** `https://www.zivvvo.co.zw/`

---

## Status

**PASS**

## AI Source Behavior

| State | Behavior |
|-------|----------|
| Live AI success | `source: "generated"`, `available: true` → AI response displayed |
| Live AI failure | `source: "canonical"`, `available: false`, `reason: <type>` → explicit error |
| Offline | `reason: "offline"` → "You're offline..." |
| No consent | `reason: "unauthorized"` → "Please sign in again..." |
| No token | `reason: "unauthorized"` → "Please sign in again..." |
| 401 | `reason: "unauthorized"` → "Please sign in again..." |
| 403 | `reason: "forbidden"` → "Your plan doesn't include the AI Tutor..." |
| 429 | `reason: "rate-limited"` → "You've reached the AI Tutor limit..." |
| 500 | `reason: "server-error"` → "The AI Tutor is temporarily unavailable..." |
| Timeout | `reason: "timeout"` → "The AI Tutor took too long..." |
| Invalid response | `reason: "invalid-response"` → "The AI Tutor returned an invalid response..." |
| Not configured | `reason: "not-configured"` → "The AI Tutor is not configured..." |

## Mock Provider

| Location | MockTutorProvider Used? |
|----------|----------------------|
| `AiTutor.tsx` (AI Tutor page) | **NEVER** — uses `aiAnswerQuestionStrict()` |
| `Coach.tsx` concept explanations | Yes — `aiExplainConcept()` falls back to mock (preserved) |
| `ai-provider.ts` `aiAnswerQuestion()` | Yes — backward compat for Coach (preserved) |
| `ai-provider.ts` `aiAnswerQuestionStrict()` | **NEVER** — live only |
| `MockTutorProvider` class | Preserved for deterministic tutoring outside AI Tutor |

## Failure States

| Code | Type | User Message |
|------|------|-------------|
| — | offline | "You're offline, so the live AI Tutor can't respond." |
| — | not-configured | "The AI Tutor is not configured right now." |
| 401 | unauthorized | "Please sign in again to use the AI Tutor." |
| 403 | forbidden | "Your plan doesn't include the AI Tutor." |
| 429 | rate-limited | "You've reached the AI Tutor limit for now." |
| 500 | server-error | "The AI Tutor is temporarily unavailable." |
| timeout | timeout | "The AI Tutor took too long to respond." |
| empty | invalid-response | "The AI Tutor returned an invalid response." |

## UI

### Live State
```
AI Tutor  ● Live AI
```

### Offline State
```
AI Tutor  ○ Offline

AI Tutor unavailable
You're offline, so the live AI Tutor can't respond.
Reconnect to the internet and try again.

[Try again]
```

### Input disabled when offline
The text input and Send button are disabled when `isLive` is false.

### Conversation history preserved
Failed requests do not erase previous conversation messages.

## Architecture

```
                    ZIVVVO
                       |
          ┌────────────┴────────────┐
          |                         |
  Deterministic Tutor          AI Tutor
          |                         |
  Always available            Live AI only
  Offline                     Online required
  Canonical content           LLM language
  D4/D6 intelligence          Conversation
  Cannot hallucinate          Can explain naturally
  MockTutorProvider OK        MockTutorProvider NEVER
```

## Files Changed

| File | Change |
|------|--------|
| `packages/ai-gateway/src/types.ts` | Added `AIAvailability` type, `reason` field to `ConceptExplainResponse` |
| `packages/ai-gateway/src/tutor-live.ts` | Structured error reasons (offline, unauthorized, forbidden, rate-limited, server-error, timeout, invalid-response) |
| `apps/web/src/ai-provider.ts` | Added `aiAnswerQuestionStrict()`, `getLiveAIStatus()` |
| `apps/web/src/pages/AiTutor.tsx` | Strict mode, live indicator, explicit failure states, disabled input when offline |
| `apps/web/src/d9-strict-live-ai.test.ts` | 22 new D9 tests |

## Testing

| Category | Tests |
|----------|-------|
| D5 Intelligence | 33 |
| D6 Tutor | 22 |
| D7 AI Coach | 13 |
| D8 AI Tutor Upgrade | 21 |
| D9 Strict Live AI | 22 |
| Other | 258 |
| **Total** | **369** |

**All 369 tests pass.**

### D9 Test Coverage
- Live success → `source: "generated"`
- Live failure → no mock fallback
- Offline → explicit offline failure
- No consent → explicit unauthorized
- No auth token → explicit unauthorized
- Server unavailable → structured error
- Provider marked unavailable → `not-configured`
- Canonical response → treated as failure in strict mode
- MockTutorProvider exists → AI Tutor never uses it
- Source truth invariant
- Mock provider preserved for deterministic tutor

### Typecheck
**PASS** — clean

### Build
**PASS** — 151 modules, 1,512 KB JS, 27 KB CSS

## Content Integrity

| Item | Changed |
|------|---------|
| Questions | 0 |
| Answers | 0 |
| Images | 0 |
| Families | 0 |

## Production

| Check | Result |
|-------|--------|
| Deployment | `203cc32` fast-forward to `main` |
| Frontend | **200** — `https://www.zivvvo.co.zw/` |
| API health | **200** — `http://localhost:3939/api/health` |
| External API | **200** — `https://www.zivvvo.co.zw/api/health` |
| Server process | **active** |
| Nginx | **active** |

---

## Final Status

```
D9 STRICT LIVE AI: PASS

Live AI success: PASS
Mock AI removed from AI Tutor: PASS
Source transparency: PASS
Offline failure: PASS
Provider failure: PASS
Authentication handling: PASS
Entitlement handling: PASS
Rate-limit handling: PASS
Timeout handling: PASS

Coach paywall: PASS
Mock paywall: PASS
Family deduplication: PASS

Tests: 369/369
Typecheck: PASS
Build: PASS
Production: PASS

AI source: LIVE ONLY
Mock fallback in AI Tutor: NO
```
