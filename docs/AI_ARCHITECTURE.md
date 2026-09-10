# Zivvvo — AI Architecture

> AI as an enhancement layer — never the source of truth.

## Why this exists

AI is a differentiator only if it is *safe*. In an examination-preparation
product the worst outcome is an AI confidently teaching a wrong answer. AI must
be strictly positioned as an **enhancement layer**: it explains, summarises,
and coaches — it never decides correctness.

## Hard Rules

1. **AI never determines answers.** Correctness comes from the canonical
   answer key and content model only.
2. **Explanations are first-authored, AI-enriched.** The baseline explanation
   exists in content and is correct on its own; AI makes it friendlier, not
   more correct.
3. **No internet requirement.** An offline learner must always be able to
   practise and learn; AI is additive, never blocking.
4. **No provider coupling.** All AI features go through a provider-agnostic
   interface; swapping or dropping Rocket/OpenAI/etc. changes configuration,
   not product logic.

## Provider Abstraction

```ts
interface AIProvider {
  name: string;
  explain<C>(req: ExplainRequest<C>): Promise<AIResult<C>>;
  coach(req: CoachRequest): Promise<AIResult<'coach'>>;
  isAvailable(): boolean;            // offline / quota / capability check
}

interface ExplainRequest<C extends ContentQuestion> {
  question: C;
  correctIndexes: number[];      // already known, NOT inferred by AI
  learnerChoice?: number[];
  confidence?: 'sure' | 'unsure' | 'guess';
  language?: string;
}
```

Transfer objects are provider-neutral; implementation adapters live in
`packages/ai-gateway`. The product owns prompts' goals; the provider owns
servers.

## Enhancement Tiers

| Tier | Feature | Dependency |
|------|---------|-----------|
| T0 | Author-written explanation + references (content data) | none — always works |
| T1 | Generative explanation plain-language variant | AI provider (best-effort, cached) |
| T2 | Coach dialogue / "what should I study?" narrative | AI provider (optional) |

The UI renders T0 instantly; T1/T2 stream in when a provider is available.

## Guardrails

- Every generated explanation is tied to the concept and canonical key;
  no free-form answer generation.
- Provider failures degrade to T0 silently — never a blocking spinner.
- Cache generated artefacts so identical requests are not recharged.

## Status

- Abstraction interface: **Implemented** (`packages/ai-gateway`: types +
  tested mock provider; no generative provider is wired yet).
- T1/T2 generative features: **Experimental** — not part of the first launch.

## Assumptions

- Leading provider APIs remain chat-completion-shaped (text in/text out);
  the adapter hides details.
- Cost: per-request caching and T0 fallback keep generative spend near zero
  in normal operation.

## Future

- On-device small models for T1 under strict latency/cost budgets.
- Multilingual T1 from the same content and goals.
- Spoken explanations for accessibility.