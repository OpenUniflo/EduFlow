/** Design attributes describe the criterion, never an overall learner score. */
export type MasteryCriterion = {
  id: string; knowledgeId: string; knowledgeRevisionId: string; title: string; description: string;
  cognitiveLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  criterionType: 'conceptual' | 'procedural'; required: boolean;
  displayOrder: number; status: 'active' | 'archived'; version: number;
};
export type CriterionReference = { criterionId: string; version: number };
/** A source adapter supplies observations; the estimator does not depend on Micro. */
export type CriterionEvidence = CriterionReference & {
  id: string; sequence: number; outcome: 'correct' | 'incorrect';
  sourceKind: string; sourceId: string;
};
export const CRITERION_ESTIMATOR_VERSION = 'criterion-state-v1' as const;
export type LearnerCriterionState = CriterionReference & {
  estimatorVersion: typeof CRITERION_ESTIMATOR_VERSION;
  attainment: 'unknown' | 'insufficient' | 'developing' | 'achieved';
  stability: 'unknown' | 'unstable' | 'improving' | 'stable';
  /** Evidence support, not psychological confidence or probability of success. */
  confidence: 'low' | 'medium' | 'high';
  independence: 'unknown'; transfer: 'unknown'; retention: 'unknown';
  evidenceCount: number; evidenceIds: string[]; throughSequence: number;
};

/** Latest five observations bound the judgment and its explanatory lineage. */
export function estimateCriterionState(criterion: CriterionReference, evidence: readonly CriterionEvidence[]): LearnerCriterionState {
  const matching = [...new Map(evidence.filter(item => item.criterionId === criterion.criterionId && item.version === criterion.version)
    .map(item => [item.id, item])).values()].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  const recent = matching.slice(-5);
  const last = recent[recent.length - 1];
  const lastThree = recent.slice(-3);
  const allCorrect = lastThree.length === 3 && lastThree.every(item => item.outcome === 'correct');
  const mixed = recent.some(item => item.outcome === 'correct') && recent.some(item => item.outcome === 'incorrect');
  return {
    ...criterion, estimatorVersion: CRITERION_ESTIMATOR_VERSION,
    attainment: !last ? 'unknown' : allCorrect ? 'achieved' : last.outcome === 'incorrect' ? 'insufficient' : 'developing',
    stability: recent.length < 2 ? 'unknown' : allCorrect ? 'stable' : mixed && last?.outcome === 'correct' ? 'improving' : 'unstable',
    confidence: recent.length >= 5 ? 'high' : recent.length >= 3 ? 'medium' : 'low',
    independence: 'unknown', transfer: 'unknown', retention: 'unknown',
    evidenceCount: matching.length, evidenceIds: recent.map(item => item.id), throughSequence: last?.sequence ?? 0,
  };
}
