/**
 * Conversation context resolution.
 *
 * Resolves pronouns, shorthand references, and follow-up questions
 * using recent conversation history.
 *
 * Priority ordering:
 *   1. Current learner message
 *   2. Recent learner messages
 *   3. Explicit topic/concept already established
 *   4. Previous tutor response
 *   5. Older conversation
 *
 * Old tutor text is context, NOT evidence of current intent.
 */

import type { ConversationMessage } from "./types.js";

/**
 * Detect if a message is a context-dependent follow-up
 * (references previous conversation without explicit topic).
 */
const FOLLOW_UP_PATTERNS = [
  /^(what about|how about|what if|what about that|how about that)\b/i,
  /^(and|or|but)\s+(what about|how about|why|when|where|which|if|the|those|these)\b/i,
  /^(and|or|but)\s+(regulatory|mandatory|warning|information|at night|in rain)\b/i,
  /^(why|how|when|where|which)\s*\??$/i,
  /^(explain|tell me more|go deeper|make it easier|give examples?)\b/i,
  /^(can i|could i|should i|do i|must i|would i)\s*$/i,
  /^(yes|no|right|correct|okay|ok)\s*\??$/i,
  /^(that|those|them|it|this|there)\s*\??$/i,
];

/**
 * Check if a message is a context-dependent follow-up.
 */
export function isFollowUp(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return FOLLOW_UP_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Resolve conversation references.
 *
 * When the learner says "that", "it", "the other one", or asks a follow-up,
 * this function determines what they're referring to based on recent messages.
 */
export function resolveReferences(
  currentMessage: string,
  conversationHistory: ConversationMessage[],
): {
  resolvedTopic: string | null;
  resolvedEntity: string | null;
  isContextual: boolean;
} {
  const trimmed = currentMessage.trim().toLowerCase();

  // If the message is long enough and contains topic keywords, it's likely self-contained
  if (currentMessage.length > 20 && !isFollowUp(currentMessage)) {
    return { resolvedTopic: null, resolvedEntity: null, isContextual: false };
  }

  // Look at recent messages for context
  const recent = conversationHistory.slice(-6);
  const recentUserMessages = recent
    .filter((m) => m.role === "user")
    .map((m) => m.text);
  const recentAiMessages = recent
    .filter((m) => m.role === "ai")
    .map((m) => m.text);

  // Determine if this is a contextual reference
  const isContextual =
    isFollowUp(currentMessage) ||
    /^(that|those|them|it|this|there|the other one|the first one|the second one|both|same thing)\b/i.test(trimmed) ||
    trimmed.length < 15;

  if (!isContextual) {
    return { resolvedTopic: null, resolvedEntity: null, isContextual: false };
  }

  // Try to extract topic from recent user messages (highest priority)
  let resolvedTopic = null;
  for (const msg of [...recentUserMessages].reverse()) {
    const lower = msg.toLowerCase();
    // Extract topic-bearing phrases
    const topicMatch = lower.match(
      /\b(signs?|road signs?|warning signs?|regulatory signs?|mandatory signs?|information signs?|junctions?|right of way|traffic lights?|robots?|speed|overtaking|parking|pedestrians?|cyclists?|markings?|lines?|lane|licen[cs]e|alcohol|drugs?|night driving|weather|rain|fog)\b/,
    );
    if (topicMatch) {
      resolvedTopic = topicMatch[0];
      break;
    }
  }

  // Extract entity from the most recent AI response (lower priority)
  let resolvedEntity = null;
  if (recentAiMessages.length > 0) {
    const lastAi = recentAiMessages[recentAiMessages.length - 1]!.toLowerCase();
    // Look for entity mentions in the AI's last response
    const entityMatch = lastAi.match(
      /\b(warning signs?|regulatory signs?|mandatory signs?|information signs?|stop signs?|give way|right of way|junctions?|roundabouts?|traffic lights?|robots?|speed limits?|overtaking|parking|pedestrians?|cyclists?|markings?|lane arrows?|seat belts?|brakes?|tyres?|headlights?)\b/,
    );
    if (entityMatch) {
      resolvedEntity = entityMatch[0];
    }
  }

  return { resolvedTopic, resolvedEntity, isContextual };
}

/**
 * Build a conversation block for the AI prompt.
 * Formats recent messages as a structured conversation.
 */
export function buildConversationBlock(history: ConversationMessage[]): string {
  if (!history || history.length === 0) return "";

  const recent = history.slice(-6);
  return recent
    .map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.text}`)
    .join("\n\n");
}

/**
 * Build topic hint from recent user messages.
 * Returns the combined text of the last N user messages for topic detection.
 */
export function buildTopicHint(history: ConversationMessage[], maxMessages = 4): string {
  const userMessages = history
    .slice(-maxMessages * 2)
    .filter((m) => m.role === "user")
    .map((m) => m.text);
  return userMessages.join(" ");
}

/**
 * Detect if the learner has switched topics from the conversation history.
 */
export function detectTopicSwitch(
  currentText: string,
  _history: ConversationMessage[],
  currentTopic: string | null,
  historyTopic: string | null,
): boolean {
  if (!historyTopic || !currentTopic) return false;
  if (historyTopic === currentTopic) return false;

  // If the current message is a follow-up, it's probably NOT a topic switch
  if (isFollowUp(currentText)) return false;

  // If the current message is short and contains the history topic, probably not a switch
  if (currentText.length < 20 && currentText.toLowerCase().includes(historyTopic.replace(/-/g, " "))) {
    return false;
  }

  return true;
}
