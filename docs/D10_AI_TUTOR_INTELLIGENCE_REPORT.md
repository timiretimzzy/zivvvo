# D10: AI Tutor Intelligence + Zimbabwe Content Grounding

**Date:** 2026-09-17  
**Status:** Deployed  
**Previous:** D9 Strict Live AI (`203cc32`)

---

## Summary

D10 upgrades the AI Tutor from a flat-text context system to a grounded, structured, conversation-aware tutor. The server now loads the Zivvvo content pack at startup and retrieves relevant authoritative material before calling the LLM. The system prompt is rewritten with stronger grounding rules, topic switching detection, and follow-up pattern recognition. The client sends richer context including recent mistakes and topic hints.

---

## What Changed

### 1. Server-Side Content Retrieval (`server/paynow-api.mjs`)

**Content pack loaded at startup:**
- `content-v1.json` loaded via `fs.readFileSync` at server boot
- Pre-indexed by topic and concept for O(1) retrieval
- `matchTopic(text)` — scores text against topic keywords, returns best match
- `retrieveForQuestion(question, history)` — topic keyword matching → returns topic label, concepts, up to 3 example questions with explanations and correct answers
- `retrieveForConcept(concept)` — returns up to 2 reference questions with explanations
- `detectConversationTopic(history)` — infers current topic from recent conversation messages

### 2. Structured Context Format (`server/paynow-api.mjs`)

Both `/api/ai/explain` and `/api/ai/ask` now send structured XML-like blocks to the LLM:

```
<conversation_context>...</conversation_context>
<learner_context>...</learner_context>
<retrieved_content>...</retrieved_content>
<current_question>...</current_question>
```

- `conversation_context` — last 6 messages formatted as Learner/Tutor turns
- `learner_context` — concept, topic, mastery, evidence, canonical explanation, recent mistakes
- `retrieved_content` — topic overview, concept list, example questions with correct answers and explanations from Zivvvo content pack
- `current_question` — the learner's question, with topic switch annotation when detected

### 3. Stronger System Prompt

Rewritten with explicit sections:
- **Grounding Rules** — always ground in `<retrieved_content>`, never contradict correct answers, never invent laws
- **Conversation Rules** — natural follow-ups, topic switching, learner context is personalization not restriction
- **Topic Switching** — detect and acknowledge topic changes, use new topic's retrieved content
- **Intelligence Boundaries** — unchanged D9 invariants (no mastery/scoring/selection)
- **Teaching Style** — varied response structure, phone-friendly, Zimbabwe-specific
- **Response Format** — plain text, under 200 words, simple language

### 4. Topic Keyword Map Fixes (`packages/content/src/index.ts`)

Fixed pre-existing bugs in `TOPIC_KEYWORDS`:
- `"traffic-signals"` → `"traffic-lights"` (matched actual topic ID)
- Removed invalid keys: `"right-of-way"`, `"defensive-driving"`, `"road-cells"`, `"licence-requirements"`, `"driving-rules"`
- Merged relevant keywords into correct topic entries
- All 15 topic IDs now have valid keyword entries
- Enriched keywords for better matching (added "robot", "yield", "cyclist", "first aid", etc.)

### 5. Client-Side Updates

**`apps/web/src/pages/AiTutor.tsx`:**
- Sends `topicHint` derived from last 4 user messages
- Sends `recentMistake` from `ctx.recentMistakes[0]` when available
- No changes to strict AI flow, error handling, or UI

**`packages/ai-gateway/src/types.ts`:**
- Added `topicHint?: string` to `ConceptExplainRequest` (backward compatible)

**`packages/ai-gateway/src/tutor-live.ts`:**
- Passes `topicHint` in the `/api/ai/ask` request body

### 6. Tests (`apps/web/src/d10-ai-tutor-intelligence.test.ts`)

29 tests across 6 test suites:
- **Content Retrieval Quality** (15 tests) — topic matching, question retrieval, concept search, content pack integrity
- **Structured Context** (2 tests) — `topicHint` field on `ConceptExplainRequest`, backward compatibility
- **Conversation-Aware Context** (2 tests) — history passthrough, topic detection from messages
- **Topic Switching** (2 tests) — topic change detection, same-topic continuation
- **Regression: D9 Invariants** (5 tests) — never returns mock, structured errors, offline handling
- **Content Pack Integrity** (3 tests) — required fields, valid topic IDs, explanation quality

---

## Preserved Invariants

| Invariant | Status |
|-----------|--------|
| `aiAnswerQuestionStrict()` never falls back to MockTutorProvider | ✅ Preserved |
| `getLiveAIStatus()` never returns mock | ✅ Preserved |
| No intelligence in AI — no mastery/scoring/question selection | ✅ Preserved |
| Deterministic systems remain authoritative | ✅ Preserved |
| Content pack (1,396 questions) not modified | ✅ Preserved |
| All 398 tests passing | ✅ Verified |
| Typecheck clean | ✅ Verified |
| Build clean | ✅ Verified |

---

## File Changes

| File | Change |
|------|--------|
| `server/paynow-api.mjs` | Content pack loading, retrieval functions, structured context, stronger prompt |
| `packages/content/src/index.ts` | Fixed TOPIC_KEYWORDS map (invalid keys, duplicate entries) |
| `packages/ai-gateway/src/types.ts` | Added `topicHint` to `ConceptExplainRequest` |
| `packages/ai-gateway/src/tutor-live.ts` | Pass `topicHint` in ask request body |
| `apps/web/src/pages/AiTutor.tsx` | Send `topicHint` and `recentMistake` |
| `apps/web/src/d10-ai-tutor-intelligence.test.ts` | 29 new tests |

---

## How It Works (End-to-End)

1. Learner types: "What do the yellow signs mean?"
2. **Client** sends: question + conversation history + topicHint + recentMistake to `/api/ai/ask`
3. **Server** runs `retrieveForQuestion("What do the yellow signs mean?", history)`:
   - `matchTopic()` matches keywords: "sign", "warning" → topic = `"road-signs"`
   - Loads 3 example questions from `road-signs` topic with explanations + correct answers
4. **Server** builds structured prompt:
   ```
   <conversation_context>
   Learner: What are signs?
   Tutor: Road signs include regulatory, warning, and informational signs.
   </conversation_context>
   
   <learner_context>
   Concept: Sign Meaning
   Topic: Road Signs
   Learner state: developing
   Mastery: 30%
   </learner_context>
   
   <retrieved_content>
   Topic overview: Road Signs & Signals: covers 4 concept areas with 292 practice questions in Zivvvo.
   Concepts covered: sign-meaning, sign-recognition, sign-action
   Relevant Zivvvo study material:
     Q: Which statement is true about warning signs?
     Correct answer: Warning signs are triangular and warn of hazards ahead
     Explanation: Warning signs alert drivers to potential hazards...
   </retrieved_content>
   
   <current_question>
   Learner question: What do the yellow signs mean?
   </current_question>
   ```
5. **LLM** responds grounded in the retrieved material, confirming the correct answer and explaining
6. **Server** returns response, **client** displays it in the chat

---

## Deployment

```bash
# Commit and push
git add -A
git commit -m "D10: AI Tutor Intelligence + Zimbabwe Content Grounding"
git push origin main

# Deploy to VPS
ssh root@161.97.115.59 "cd /var/www/zivvvo && git pull origin main && pm2 restart zivvvo-server"

# Verify
curl -s https://www.zivvvo.co.zw/api/health
```
