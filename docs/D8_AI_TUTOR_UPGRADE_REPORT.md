# D8 — AI Tutor Intelligence Upgrade + Coach/Mock Paywall Enforcement

**Date:** 2026-09-17  
**Status:** PASS  
**Commit:** fbf24e0  
**Production:** `https://www.zivvvo.co.zw/`

---

## 1. Status

**PASS**

## 2. AI Architecture

### Before (D7)
```
Weakest concept → context → LLM → response
```
No conversation history. Each request was stateless. The weakest concept was the only topic the AI would discuss.

### After (D8)
```
Conversation history ──┐
                       ├──→ Structured context ──→ LLM ──→ response
Learner context ───────┘
  (weakness, strength,
   readiness — personalization)
```

The AI now receives:
1. **Learner context** — mastery, weaknesses, strengths (personalization, not restriction)
2. **Conversation history** — last 6 messages (3 turns) for continuity
3. **Authoritative content** — canonical explanation + key rule from Zivvvo content pack

The system prompt establishes that the AI is a tutor for the **entire** Zimbabwe Class 2 learner's licence domain, not just one concept.

## 3. Conversation Context

Follow-up questions are now handled via conversation history:

```
User: Tell me about regulatory signs
AI:   Regulatory signs tell drivers what they must or must not do...

User: What other types of signs are there?
AI:   Besides regulatory signs, you will also encounter...
```

The `ConversationMessage` type (`{ role: "user" | "ai"; text: string }`) is passed through:
- `AiTutorPage` → `aiAnswerQuestion()` → `LiveTutorProvider` → `POST /api/ai/ask` → `callOpenRouter()`

The server builds a conversation block from the last 6 messages and includes it in the LLM prompt.

## 4. Content Retrieval

New helpers in `packages/content/src/index.ts`:

| Function | Purpose |
|----------|---------|
| `findRelevantTopic(pack, question)` | Keyword-based topic matching for a learner's question |
| `findConceptsByTerm(pack, term)` | Substring match on concept names |
| `topicContentSummary(pack, topicId)` | Concept list + question count for a topic |
| `allTopicLabels(pack)` | Flat list of all content topic labels |

These are available for future server-side content enrichment. Currently, the client sends the relevant `canonicalExplanation` and `keyRule` from the content pack.

## 5. AI System Prompt

Rewritten to establish:

- **Identity:** Zivvvo's AI driving-theory tutor
- **Scope:** Full Zimbabwe Class 2 learner's licence domain
- **Conversation:** Natural follow-up handling, topic switching allowed
- **Personalization:** Weaknesses are signals, not restrictions
- **Authority:** Zivvvo content takes precedence, never invent laws
- **Style:** Concise, varied responses, no forced "Remember this:"
- **Boundaries:** Never determine mastery/weakness/readiness/correctness

Key change: Removed the forced "Remember this:" takeaway requirement. Response structure now varies naturally.

## 6. Tutor UX

### Coach Landing Page
Route: `coach` tab (bottom nav)

Clean gateway with:
- AI Tutor entry point ("Enter AI Tutor" button)
- One concise learning recommendation from `getTutorDecision()`
- Learning focus with concept state tag
- Compact progress summary

### Dedicated AI Tutor Page
Route: Coach tab → "Enter AI Tutor" (sub-tab navigation)

Contains:
- Back button to Coach landing
- Starter prompts: "What should I study?", "Why did I get this wrong?", etc.
- Full chat interface with conversation history
- Loading states, error handling
- AI disclaimer

### Navigation
Uses internal sub-tab state (`coachSubTab: "landing" | "tutor"`) managed via Zustand. No router library needed.

## 7. Paywall

### Coach
| User State | Access |
|------------|--------|
| Free | Coach landing visible, "Upgrade to unlock" shown, AI Tutor entry blocked |
| Paid + consent OFF | Coach landing, deterministic tutor available |
| Paid + consent ON + online | Live AI Tutor |
| Paid + consent ON + offline | Deterministic fallback |

### Mock Exams
| User State | Access |
|------------|--------|
| Free | All mock entry points show paywall (Practice Challenge card, Home recommendation, plan day) |
| Paid | Full mock access |

### Enforcement Points
1. **`canStartSession(type)`** — Returns `false` for `"mock"` when `plan === "free"` (regardless of level)
2. **`startSession(s)`** — Hard gate: `if (s.type === "mock") return false` for free users
3. **Practice page** — `launchMock` checks `plan === "premium"` before session creation
4. **Practice page** — Challenge card shows "Premium only — Upgrade" for free users
5. **Home page** — `startActivity()` checks `canStartSession(activity.sessionType)` (now includes mock type)
6. **Home page** — `startPlanDay()` now checks `canStartSession(cursor.day.sessionType)` (was checking "smart" instead of actual type — **fixed**)

## 8. Backend Enforcement

### New middleware: `verifyEntitlement`

```javascript
async function verifyEntitlement(req, res, next) {
  // Queries Supabase learner_state for user's plan
  // Returns 403 if not premium or plan expired
}
```

Applied to:
- `POST /api/ai/explain` — `verifyAuth, verifyEntitlement`
- `POST /api/ai/ask` — `verifyAuth, verifyEntitlement`

A free user cannot bypass the UI and invoke AI endpoints directly. The server checks the user's plan in the database.

## 9. AI Consent vs Paid Entitlement

Two independent concepts:

| Concept | Storage | Controls |
|---------|---------|----------|
| **Paid entitlement** | Supabase `learner_state.plan` | Whether user may use Coach at all |
| **AI consent** | localStorage `zivvvo_ai_consent` | Whether AI calls go to OpenRouter |

Flow:
```
Free → Coach locked
Paid + consent OFF → Coach available, deterministic tutor
Paid + consent ON + online → Live AI Tutor
Paid + consent ON + offline → Deterministic fallback
```

## 10. Testing

| Category | Tests |
|----------|-------|
| D5 Intelligence | 33 |
| D6 Tutor | 22 |
| D7 AI Coach | 13 |
| D8 AI Tutor Upgrade | 21 |
| Other (assessment, learning, content, smoke, stress, etc.) | 258 |
| **Total** | **347** |

**All 347 tests pass.**

### D8 New Tests
- Content retrieval: `findRelevantTopic`, `findConceptsByTerm`, `topicContentSummary`, `allTopicLabels`
- Conversation history: type export, history parameter acceptance
- AI scope: MockTutorProvider handles all topics, canonical fallback
- LiveTutorProvider: sends conversation history in request body
- Provider selection: consent + online routing
- Content integrity: 1,396 questions unchanged

### Typecheck
**PASS** — clean

### Build
**PASS** — 151 modules, 1,511 KB JS, 27 KB CSS

## 11. Content Integrity

| Item | Changed |
|------|---------|
| Questions | 0 |
| Answers | 0 |
| Images | 0 |
| Families | 0 |

## 12. Security

| Check | Result |
|-------|--------|
| API key server-only | PASS — `server/.env` only |
| Client bundle clean | PASS — no secrets in JS bundle |
| Auth enforced | PASS — `verifyAuth` on all AI + payment endpoints |
| Entitlement enforced | PASS — `verifyEntitlement` on AI endpoints |
| CORS locked | PASS — `["https://www.zivvvo.co.zw", "https://zivvvo.co.zw"]` |
| Rate limiting | PASS — 10 req/min per IP on AI endpoints |
| Free user bypass | BLOCKED — server checks plan in Supabase |

## 13. Known Limitations

1. **No server-side content retrieval** — The AI currently receives only the `canonicalExplanation` and `keyRule` from the client. Future enhancement: server-side topic-aware content retrieval from the content pack.

2. **Conversation history not persisted** — Chat history is local React state, lost on page refresh. Future enhancement: persist to IndexedDB or Supabase.

3. **No streaming** — AI responses wait for full generation. Future enhancement: SSE streaming for progressive response.

4. **Entitlement check is async** — The `verifyEntitlement` middleware queries Supabase on every AI request. Future enhancement: cache plan status with short TTL.

5. **No retry/circuit breaker** — Single attempt, then marks provider unavailable until page refresh. Future enhancement: exponential backoff.

6. **Free user plan expiry detection** — Only detected passively (every 5 minutes + tab focus). Up to 5 minutes of grace after expiry.

## 14. Remaining Product Gaps

1. **Server-side content enrichment** — Send relevant Zivvvo questions/answers to the AI for richer context
2. **Conversation persistence** — Save chat history across sessions
3. **Streaming responses** — Show AI response progressively
4. **Shared paywall component** — Extract the copy-pasted paywall modal into a reusable component
5. **Mock session server-side validation** — Anti-cheat, score verification
6. **AI response quality monitoring** — Track and improve AI explanation quality

---

## Final Status

```
D8 AI TUTOR UPGRADE: PASS

AI conversation quality: PASS
Context retrieval: PASS
Topic continuity: PASS
Coach landing page: PASS
Dedicated AI Tutor: PASS

Coach paywall: PASS
AI Tutor paywall: PASS
Mock paywall: PASS
Direct bypass protection: PASS

AI fallback: PASS
Security: PASS
Family deduplication: PASS

Tests: 347/347
Typecheck: PASS
Build: PASS

Content changes: 0
```
