/**
 * D6: Personal Tutor Loop — public API
 */
export {
  buildTutorContext,
  getTutorDecision,
  getConceptTeaching,
  formatMistakeForTeaching,
  formatMockDiagnosisForTeaching,
  buildRecommendation,
  type TutorContext,
  type TutorDecision,
  type ConceptSummary,
  type MistakeSummary,
  type ReadinessSummary,
  type RecommendationSummary,
  type EvidenceSummary,
} from "./context";

export { default as ConceptTeachCard } from "./ConceptTeachCard";
