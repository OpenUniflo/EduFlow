import { describe, expect, it } from 'vitest';
import { isArtifactPracticeExecutor } from './practiceBoundary';
describe('artifact Practice boundary', () => {
  it('rejects Trace, Quiz and workflow route executors', () => {
    for (const type of ['trace','quiz','single_choice','multiple_choice','workflow']) expect(isArtifactPracticeExecutor({experience:{type}})).toBe(false);
  });
  it('keeps text, file and instruction artifacts', () => {
    for (const type of ['answer','code']) expect(isArtifactPracticeExecutor({mode:'instruction',experience:{type}})).toBe(true);
    expect(isArtifactPracticeExecutor({mode:'instruction'})).toBe(true);
    expect(isArtifactPracticeExecutor(null)).toBe(false);
  });
});
