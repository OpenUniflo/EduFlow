import type { LearnerCriterionState } from './criterionState.js';
import type { NavigationNextAction, NavigationPlan } from './navigation.js';

/** Resource identity, not a UI page or a generated-content promise. */
export type LearningAction = {
  id: string; kind: 'micro' | 'assignment' | 'course' | 'material';
  courseId: string; knowledgeId?: string; criterionIds: string[]; resourceId: string;
};
export type CandidateAction = LearningAction & { navigationAction: NavigationNextAction };
export type RecommendationPolicyKey = 'fixed' | 'rule_v1';
export type RecommendationContext = { baseline: NavigationPlan; states: readonly LearnerCriterionState[] };
export type RecommendationSelection = { selectedAction: CandidateAction | null; reasonCode: string; reason: string };
export interface RecommendationPolicy {
  key: RecommendationPolicyKey; version: string;
  recommend(context: RecommendationContext, candidates: readonly CandidateAction[]): RecommendationSelection;
}
/** Intentionally unsupported until a separately validated model implementation exists. */
export interface ModelPolicy {
  key: 'model'; status: 'unsupported';
  recommend?: RecommendationPolicy['recommend'];
}
