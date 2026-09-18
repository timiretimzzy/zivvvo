# D11.1: Production Deployment + Conversation Topic Hardening

**Date:** 2026-09-18
**Status:** PASS
**Previous:** D11 AI Tutor Real-World QA (`7cf3e3b`)

---

## Status

**D11.1 PRODUCTION + CONVERSATION HARDENING: PASS**

---

## Previous D11 State

- 668/668 tests PASS (D11 had 663, D11.1 adds 5 new regression tests)
- Typecheck PASS, Build PASS
- D9 invariants 22/22 PASS
- D10 invariants 29/29 PASS
- D11 retrieval 187/187 PASS
- D11 conversation 83/83 PASS (78 original + 5 new)
- AI Tutor = LIVE AI ONLY
- Mock fallback = NO
- Paywall intact, Security intact
- 1,396 questions unchanged
- **Production: NOT deployed (local verification only)**

---

## Conversation Detection Problem

### Root Cause

The original `detectConversationTopic()` joined the last 4 messages' text into a single string and ran `matchTopic()` on it:

```javascript
const recentTexts = conversationHistory.slice(-4).map((m) => m.text).join(" ");
return matchTopic(recentTexts);
```

This treated AI responses and user messages with equal weight. When an AI response mentioned keywords from an adjacent topic (e.g., "junctions" in a parking conversation, or "road rules" in an alcohol conversation), those keywords could overpower the user's actual topic.

### Example Failures

| Scenario | User Topic | AI Mentions | Result |
|----------|-----------|-------------|--------|
| Parking conversation | parking | "junctions" | junction-rules (wrong) |
| Alcohol conversation | alcohol-drugs | "road rules" | general-rules (wrong) |
| Road signs conversation | road-signs | "junctions" | junction-rules (wrong) |

---

## Weighting Solution

### Algorithm

Replaced the text-join approach with **per-message scoring with role-based weights**:

```
1. CURRENT USER MESSAGE: Scored independently via matchTopicWithScore()
   - Strong match (score >= 2): topic wins immediately (intentional switch)
   - Direct question with any match: topic wins (new topic request)
   - Follow-up ("what about", "how about"): falls through to step 2

2. WEIGHTED HISTORY: Each message scored independently, then combined:
   - User messages: weight 2
   - AI/tutor messages: weight 1
   - Topic with highest total weighted score wins

3. AI RESPONSES: Never dominant — only contribute weak context (weight 1)
```

### Follow-Up Detection

Context-dependent follow-ups ("what about at night?") are detected by prefix matching:
- `what about`, `how about`, `what if`
- These fall through to weighted history instead of overriding

This prevents single keywords like "night" from triggering night-driving when the user means "parking at night."

### New Function: `matchTopicWithScore()`

Returns both topic and confidence score:
- Score 0: no topic match
- Score 1: weak match (single keyword)
- Score 2+: strong match (phrase or multiple keywords)

Both server (`paynow-api.mjs`) and client (`content/src/index.ts`) have this function.

---

## Regression Tests

5 new tests in `d11-conversation-quality.test.ts`:

| Test | User | AI Mentions | Next User | Expected |
|------|------|-------------|-----------|----------|
| Parking resists junctions | "Where can I park?" | "junction" | "What about parking near there?" | parking |
| Road-signs resists junctions | "Tell me about regulatory signs." | "junctions" | "What other types are there?" | road-signs |
| Alcohol resists road rules | "Can I drink and drive?" | "road rules" | "What happens if I do?" | alcohol-drugs |
| Overtaking resists junctions | "Tell me about overtaking." | "junction" | "When is it safe?" | overtaking |
| Topic switch works | "Tell me about signs." | responds | "What is aquaplaning?" | general-rules |

All 5 tests PASS.

---

## Test Results

### Full Suite

| Metric | Previous (D11) | Current (D11.1) |
|--------|----------------|-----------------|
| Total tests | 663 | 668 |
| Test files | 33 | 33 |
| Pass rate | 100% | 100% |

### Breakdown

| Test Suite | Count | Status |
|------------|-------|--------|
| D9 Strict Live AI | 22/22 | PASS |
| D10 AI Tutor Intelligence | 29/29 | PASS |
| D11 Retrieval | 187/187 | PASS |
| D11 Conversation Quality | 78/78 | PASS |
| D11.1 Conversation Hardening | 5/5 | PASS |
| D11 Content Integrity | 5/5 | PASS |
| D11 Paywall & Security | 4/4 | PASS |
| Other tests | 338/338 | PASS |

---

## Typecheck + Build

| Check | Result |
|-------|--------|
| TypeScript | PASS — clean, no errors |
| Production build | PASS — 151 modules, 1,512 KB JS, 27 KB CSS |

---

## Production Deployment

| Check | Result |
|-------|--------|
| Commit | `7cf3e3b` D11 + D11.1 |
| Git push to main | PASS |
| Server git pull | PASS (fast-forward from dec62f6) |
| Server build | PASS |
| PM2 restart | PASS (zivvvo-server pid 3882613) |
| Production frontend | 200 OK — https://www.zivvvo.co.zw |
| Production API | 200 OK — /api/health {"ok":true} |
| Server code verified | `detectConversationTopic` + `matchTopicWithScore` present |

---

## Live AI Verification

Production server confirmed running D11.1 code:
- `detectConversationTopic()` at line 186 with per-message scoring
- `matchTopicWithScore()` at line 82 returning `{topic, score}`
- Follow-up detection heuristic active
- User-message priority active

---

## Paywall + Security

| Check | Result |
|-------|--------|
| AI Tutor requires paid entitlement | PASS |
| Coach requires paid entitlement | PASS |
| Mock Exam requires paid entitlement | PASS |
| Authentication enforced | PASS |
| OpenRouter key server-side only | PASS |
| No unauthenticated AI endpoints | PASS |
| No mock fallback in AI Tutor | PASS |

---

## Content Integrity

| Item | Changed |
|------|---------|
| Questions | 0 |
| Answers | 0 |
| Explanations | 0 |
| Images | 0 |
| Families | 0 |
| Topics | 0 |
| Concepts | 0 |
| Total | 1,396 questions UNCHANGED |

---

## Known Limitations

1. **Follow-up detection is prefix-based.** Phrases like "what about the circular ones" correctly use history (parking context), but unusual phrasings might not match the heuristic. The fallback (weighted history) handles this gracefully.

2. **Conversation history window is 6 messages.** Very long conversations only consider the last 6 messages. This is sufficient for typical tutoring sessions.

3. **AI response weight is always 1.** Even highly relevant AI responses (e.g., explaining a concept in detail) only contribute weak context. This is intentional — AI should never override user intent.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/content/src/index.ts` | Added `findRelevantTopicWithScore()`, updated `findRelevantTopic()` to delegate |
| `server/paynow-api.mjs` | Added `matchTopicWithScore()`, rewrote `detectConversationTopic()` with per-message scoring + follow-up detection |
| `apps/web/src/d11-conversation-quality.test.ts` | Moved helper to module scope, updated to use weighted scoring, added 5 D11.1 regression tests |

---

## Final Status

```
D11.1 PRODUCTION + CONVERSATION HARDENING: PASS

Conversation detection: HARDENED
User-message weighting: PER-MESSAGE (user=2x, AI=1x)
Follow-up detection: ACTIVE
Retrieval: 187/187 PASS
Conversation: 83/83 PASS (78 + 5 new)
D9: 22/22 PASS
D10: 29/29 PASS
Total tests: 668/668
Typecheck: PASS
Build: PASS
Production: DEPLOYED (commit 7cf3e3b)
AI source: LIVE ONLY
Mock fallback: NO
Paywall: INTACT
Security: INTACT
Content integrity: 1,396 questions UNCHANGED

AI Tutor = LIVE AI ONLY
Mock fallback in AI Tutor = NO
Production deployed = YES
```
