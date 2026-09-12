import { describe, expect, it } from 'vitest';
import { estimateCriterionState, type CriterionEvidence } from '../../src/shared/learning/criterionState';
const criterion = { criterionId: 'criterion', version: 1 };
const evidence = (...outcomes: CriterionEvidence['outcome'][]): CriterionEvidence[] => outcomes.map((outcome, index) => ({
  ...criterion, id: `e-${index}`, sequence: index + 1, outcome, sourceKind: 'test-observation', sourceId: `source-${index}`,
}));
describe('criterion-state-v1', () => {
  it('does not infer failure from absence, another criterion or an old version', () => {
    for (const facts of [[], [{ ...evidence('incorrect')[0], version: 2 }], [{ ...evidence('incorrect')[0], criterionId: 'other' }]]) {
      expect(estimateCriterionState(criterion, facts)).toMatchObject({ attainment: 'unknown', stability: 'unknown', confidence: 'low', evidenceCount: 0 });
    }
  });
  it('single PASS is developing, not stable or achieved', () => {
    expect(estimateCriterionState(criterion, evidence('correct'))).toMatchObject({ attainment: 'developing', stability: 'unknown', confidence: 'low' });
  });
  it('derives failures, recovery and repeated real success without lowering progression', () => {
    expect(estimateCriterionState(criterion, evidence('incorrect'))).toMatchObject({ attainment: 'insufficient', stability: 'unknown' });
    expect(estimateCriterionState(criterion, evidence('incorrect', 'correct'))).toMatchObject({ attainment: 'developing', stability: 'improving' });
    expect(estimateCriterionState(criterion, evidence('incorrect', 'correct', 'correct', 'correct'))).toMatchObject({ attainment: 'achieved', stability: 'stable', confidence: 'medium' });
    expect(estimateCriterionState(criterion, evidence('correct', 'correct', 'correct', 'incorrect'))).toMatchObject({ attainment: 'insufficient', stability: 'unstable' });
  });
  it('deduplicates facts and bounds explanatory lineage without assuming independence or retention', () => {
    const facts = evidence('incorrect', 'correct', 'incorrect', 'correct', 'correct', 'correct');
    const state = estimateCriterionState(criterion, [...facts, ...facts].reverse());
    expect(state).toEqual(estimateCriterionState(criterion, facts));
    expect(state).toMatchObject({ evidenceCount: 6, evidenceIds: ['e-1', 'e-2', 'e-3', 'e-4', 'e-5'], confidence: 'high', independence: 'unknown', transfer: 'unknown', retention: 'unknown' });
  });
});
