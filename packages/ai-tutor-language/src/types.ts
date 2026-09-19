/**
 * Core types for the Zivvvo AI Tutor language understanding pipeline.
 */

export type Intent =
  | "definition"
  | "meaning"
  | "action"
  | "comparison"
  | "procedure"
  | "legality"
  | "why"
  | "when"
  | "where"
  | "which"
  | "scenario"
  | "troubleshooting"
  | "exam"
  | "revision"
  | "follow-up"
  | "clarification"
  | "general";

export interface Scenario {
  present: boolean;
  participants?: string[];
  conditions?: string[];
  actions?: string[];
  roadFeatures?: string[];
}

export interface Comparison {
  present: boolean;
  left?: string;
  right?: string;
}

export interface LearnerQueryUnderstanding {
  rawQuery: string;
  normalizedQuery: string;
  intent: Intent;
  topicId: string | null;
  topicConfidence: number;
  concepts: string[];
  entities: string[];
  expandedTerms: string[];
  referencedContext: string[];
  scenario: Scenario;
  comparison: Comparison;
  confidence: number;
  ambiguity: string[];
  isFollowUp: boolean;
}

export interface KnowledgeEntry {
  id: string;
  topicId: string;
  title: string;
  content: string;
  keywords: string[];
  aliases: string[];
  concepts: string[];
}

export interface RetrievedKnowledge {
  entry: KnowledgeEntry;
  score: number;
  reason: string;
}

export interface ConversationMessage {
  role: "user" | "ai";
  text: string;
}

export interface LanguageUnderstandingResult {
  understanding: LearnerQueryUnderstanding;
  knowledgeEntries: RetrievedKnowledge[];
  knowledgeBlock: string;
}

export type TopicId =
  | "road-signs"
  | "road-markings"
  | "junction-rules"
  | "traffic-lights"
  | "speed-limits"
  | "overtaking"
  | "parking"
  | "pedestrian-safety"
  | "vehicle-equipment"
  | "vehicle-classes"
  | "towing-loads"
  | "accident-procedures"
  | "alcohol-drugs"
  | "night-driving"
  | "general-rules";
