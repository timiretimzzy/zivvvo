/**
 * Zivvvo AI Tutor Language Understanding Pipeline
 *
 * This module provides the complete language understanding pipeline:
 *   1. Text normalization (typos, spelling, Zimbabwean terms)
 *   2. Intent detection
 *   3. Entity/concept extraction
 *   4. Semantic expansion (aliases, synonyms)
 *   5. Conversation context resolution
 *   6. Topic classification
 *   7. Knowledge base retrieval
 *
 * The pipeline transforms raw learner language into a structured
 * representation that the server can use for retrieval and prompt building.
 *
 * IMPORTANT: This is a language/teaching layer. It does NOT modify:
 *   - mastery, scoring, readiness, weakness, question selection,
 *     spaced repetition, assessment grading, or question family logic.
 *   Those remain with the deterministic Zivvvo engines.
 */

import { normalizeText } from "./normalize.js";
import { detectIntent, detectComparison, detectScenario } from "./intent.js";
import { extractEntities, entitiesToConcepts } from "./entities.js";
import { expandTerms, getTopicHintFromExpansions } from "./aliases.js";
import {
  resolveReferences,
  isFollowUp,
} from "./conversation.js";
import { classifyTopicWithConversation, classifyTopic } from "./topics.js";
import { retrieveKnowledge, buildKnowledgeBlock } from "./knowledge.js";
import type {
  LearnerQueryUnderstanding,
  ConversationMessage,
  LanguageUnderstandingResult,
} from "./types.js";

export type { LearnerQueryUnderstanding, ConversationMessage, LanguageUnderstandingResult };
export type { Intent, Scenario, Comparison, KnowledgeEntry, RetrievedKnowledge } from "./types.js";

// Re-export sub-modules for direct use
export { normalizeText, wordMatch } from "./normalize.js";
export { expandTerms, getTopicHintFromExpansions } from "./aliases.js";
export { detectIntent, detectComparison, detectScenario } from "./intent.js";
export { extractEntities, entitiesToConcepts } from "./entities.js";
export {
  resolveReferences,
  isFollowUp,
  buildConversationBlock,
  buildTopicHint,
  detectTopicSwitch,
} from "./conversation.js";
export { classifyTopic, classifyTopicWithConversation } from "./topics.js";
export { retrieveKnowledge, buildKnowledgeBlock } from "./knowledge.js";

/**
 * Run the full language understanding pipeline on a learner question.
 *
 * @param rawQuestion - The raw text the learner typed
 * @param conversationHistory - Recent conversation messages for context
 * @param learnerContextTopic - The topic from the deterministic learner state (if any)
 * @returns A complete language understanding result
 */
export function understandQuestion(
  rawQuestion: string,
  conversationHistory: ConversationMessage[] = [],
  learnerContextTopic: string | null = null,
): LanguageUnderstandingResult {
  // Step 1: Normalize text
  const normalizedQuery = normalizeText(rawQuestion);

  // Step 2: Detect intent
  const intent = detectIntent(normalizedQuery);

  // Step 3: Extract entities and concepts
  const entities = extractEntities(normalizedQuery);
  const entityConcepts = entitiesToConcepts(entities);

  // Step 4: Semantic expansion
  const expandedTerms = expandTerms(normalizedQuery);

  // Step 5: Conversation context resolution
  const references = resolveReferences(rawQuestion, conversationHistory);

  // Step 6: Topic classification (combines current message + conversation)
  const allConversationHistory = conversationHistory.map((m) => ({
    role: m.role,
    text: m.text,
  }));

  const directClassification = classifyTopic(normalizedQuery);
  const conversationClassification = classifyTopicWithConversation(
    normalizedQuery,
    allConversationHistory,
  );
  const expansionTopicHint = getTopicHintFromExpansions(expandedTerms);

  const topicCandidates = new Map<string, number>();

  if (directClassification.topic) {
    topicCandidates.set(
      directClassification.topic,
      (topicCandidates.get(directClassification.topic) ?? 0) + directClassification.score,
    );
  }
  if (conversationClassification.topic) {
    topicCandidates.set(
      conversationClassification.topic,
      (topicCandidates.get(conversationClassification.topic) ?? 0) + conversationClassification.score * 1.5,
    );
  }
  if (expansionTopicHint) {
    topicCandidates.set(
      expansionTopicHint,
      (topicCandidates.get(expansionTopicHint) ?? 0) + 2,
    );
  }
  if (references.resolvedTopic) {
    const resolved = classifyTopic(references.resolvedTopic);
    if (resolved.topic) {
      topicCandidates.set(
        resolved.topic,
        (topicCandidates.get(resolved.topic) ?? 0) + resolved.score,
      );
    }
  }
  if (learnerContextTopic) {
    topicCandidates.set(
      learnerContextTopic,
      (topicCandidates.get(learnerContextTopic) ?? 0) + 1,
    );
  }

  // Pick the best topic
  let topicId: string | null = null;
  let topicConfidence = 0;
  for (const [topic, score] of topicCandidates) {
    if (score > topicConfidence || (score === topicConfidence && topic !== "general-rules")) {
      topicConfidence = score;
      topicId = topic;
    }
  }

  // Normalize confidence to 0-1 range
  const maxPossibleScore = 15;
  const normalizedConfidence = Math.min(topicConfidence / maxPossibleScore, 1);

  // Step 7: Collect all concepts
  const allConcepts = new Set<string>(entityConcepts);
  for (const term of expandedTerms) {
    if (term.topicHint) allConcepts.add(term.topicHint);
  }

  // Step 8: Detect scenario and comparison
  const scenario = detectScenario(normalizedQuery);
  const comparisonResult = detectComparison(normalizedQuery);

  // Step 9: Build the understanding result
  const understanding: LearnerQueryUnderstanding = {
    rawQuery: rawQuestion,
    normalizedQuery,
    intent,
    topicId,
    topicConfidence: normalizedConfidence,
    concepts: [...allConcepts],
    entities: entities.map((e) => e.canonical),
    expandedTerms: expandedTerms.map((e) => e.canonical),
    referencedContext: [
      references.resolvedTopic,
      references.resolvedEntity,
    ].filter(Boolean) as string[],
    scenario,
    comparison: comparisonResult ? { present: true, left: comparisonResult.left, right: comparisonResult.right } : { present: false },
    confidence: normalizedConfidence,
    ambiguity: topicCandidates.size > 1
      ? [...topicCandidates.keys()].filter((t) => t !== topicId)
      : [],
    isFollowUp: isFollowUp(rawQuestion),
  };

  // Step 10: Retrieve knowledge
  const knowledgeResults = retrieveKnowledge(
    normalizedQuery,
    topicId,
    expandedTerms.map((e) => e.canonical),
  );

  // Step 11: Build knowledge block
  const knowledgeBlock = buildKnowledgeBlock(knowledgeResults);

  return {
    understanding,
    knowledgeEntries: knowledgeResults,
    knowledgeBlock,
  };
}

/**
 * Format the language understanding result into a prompt section.
 */
export function formatUnderstandingForPrompt(result: LanguageUnderstandingResult): string {
  const { understanding, knowledgeBlock } = result;
  const sections: string[] = [];

  sections.push("<language_understanding>");
  sections.push(`Intent: ${understanding.intent}`);
  if (understanding.topicId) {
    sections.push(`Detected topic: ${understanding.topicId}`);
  }
  if (understanding.entities.length > 0) {
    sections.push(`Entities: ${understanding.entities.join(", ")}`);
  }
  if (understanding.scenario.present) {
    const s = understanding.scenario;
    if (s.participants) sections.push(`Participants: ${s.participants.join(", ")}`);
    if (s.conditions) sections.push(`Conditions: ${s.conditions.join(", ")}`);
    if (s.roadFeatures) sections.push(`Road features: ${s.roadFeatures.join(", ")}`);
  }
  if (understanding.comparison.present) {
    const c = understanding.comparison;
    sections.push(`Comparison: ${c.left} vs ${c.right}`);
  }
  if (understanding.isFollowUp) {
    sections.push("This is a follow-up to the previous conversation.");
  }
  if (understanding.ambiguity.length > 0) {
    sections.push(`Possible alternative topics: ${understanding.ambiguity.join(", ")}`);
  }
  sections.push("</language_understanding>");

  if (knowledgeBlock) {
    sections.push("<driving_knowledge>");
    sections.push(knowledgeBlock);
    sections.push("</driving_knowledge>");
  }

  return sections.join("\n\n");
}
