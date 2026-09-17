/**
 * D6: Mock Tutor Provider — deterministic offline fallback.
 *
 * Returns the canonical explanation from the deterministic context.
 * No AI generation — used when AI is unavailable or offline.
 */
import type { TutorProvider, ConceptExplainRequest, ConceptExplainResponse } from "./types";

export class MockTutorProvider implements TutorProvider {
  readonly id = "mock-tutor-v0";

  async explainConcept(req: ConceptExplainRequest): Promise<ConceptExplainResponse> {
    const { context } = req;

    // Use the canonical explanation as the authoritative response
    if (context.canonicalExplanation) {
      return {
        text: context.canonicalExplanation,
        source: "canonical",
        available: true,
      };
    }

    // Fall back to key rule
    if (context.keyRule) {
      return {
        text: context.keyRule,
        source: "canonical",
        available: true,
      };
    }

    // No authoritative content available
    return {
      text: `Practice ${context.conceptLabel} questions to build up teaching content for this concept.`,
      source: "canonical",
      available: true,
    };
  }

  async answerQuestion(req: ConceptExplainRequest): Promise<ConceptExplainResponse> {
    const { context, learnerQuestion } = req;

    // If there's a canonical explanation, use it
    if (context.canonicalExplanation) {
      return {
        text: context.canonicalExplanation,
        source: "canonical",
        available: true,
      };
    }

    // If the learner asked a specific question, acknowledge it
    if (learnerQuestion) {
      return {
        text: `I don't have enough verified information to answer that reliably. Try the ${context.conceptLabel} practice questions to learn more.`,
        source: "canonical",
        available: true,
      };
    }

    return {
      text: context.keyRule ?? `Complete some ${context.conceptLabel} questions to unlock teaching content.`,
      source: "canonical",
      available: true,
    };
  }

  isAvailable(): boolean {
    // Mock provider is always available (deterministic, offline)
    return true;
  }
}

export const mockTutor: TutorProvider = new MockTutorProvider();
