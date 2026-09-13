import { describe, expect, it } from 'vitest';
import { assignmentEligibility } from './assignmentEligibility';
const ready = { published: true, coverageValid: true, knowledgeStatuses: ['learned'], hardDependencyStatuses: ['accepted'] };
describe('shared Assignment eligibility', () => {
  it.each(['not_started','started','needs_revision','not-started','in-progress'])('permits eligible %s start/continue', status => expect(assignmentEligibility({...ready,status}).canStart).toBe(true));
  it.each(['submitted','accepted','completed'])('keeps %s read-only', status => expect(assignmentEligibility({...ready,status})).toMatchObject({canStart:false,canSubmit:false,viewOnly:true}));
  it('requires a started or revision state for submit', () => {
    expect(assignmentEligibility(ready).canSubmit).toBe(false);
    for (const status of ['started','needs_revision']) expect(assignmentEligibility({...ready,status}).canSubmit).toBe(true);
  });
  it('requires instructional knowledge readiness, not mastery', () => {
    for (const status of [undefined,'learning','explore']) expect(assignmentEligibility({...ready,knowledgeStatuses:[status]}).canStart).toBe(false);
    for (const status of ['learned','practicing','mastered']) expect(assignmentEligibility({...ready,knowledgeStatuses:[status]}).canStart).toBe(true);
  });
  it.each(['submitted', 'completed'])('requires acceptance, not a %s report', report => expect(assignmentEligibility({...ready,hardDependencyStatuses:['accepted',report]}).canStart).toBe(false));
  it('rejects missing coverage and unpublished courses', () => {
    expect(assignmentEligibility({...ready,knowledgeStatuses:[]}).canStart).toBe(false);
    expect(assignmentEligibility({...ready,coverageValid:false}).canStart).toBe(false);
    expect(assignmentEligibility({...ready,published:false}).canStart).toBe(false);
  });
  it('maps actual state to task CTA', () => {
    expect([undefined,'started','needs_revision','submitted','accepted'].map(status => assignmentEligibility({...ready,status}).cta)).toEqual(['开始实训','继续实训','继续修改','查看提交','查看结果']);
  });
});
