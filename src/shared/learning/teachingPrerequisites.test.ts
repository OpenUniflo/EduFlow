import { expect, it } from 'vitest';
import { hasUnmetHardPrerequisite, satisfiesTeachingPrerequisite } from './teachingPrerequisites';
it('shares the existing learned/practicing/mastered readiness boundary', () => {
  expect(['learning', 'learned', 'practicing', 'mastered', undefined].map(satisfiesTeachingPrerequisite)).toEqual([false, true, true, true, false]);
});
it('only unmet hard parents gate Micro; acquired targets stay reviewable', () => {
  const edges = [{ source: 'A', target: 'B', strength: 'hard' }, { source: 'C', target: 'B', strength: 'soft' }];
  expect(hasUnmetHardPrerequisite('B', new Set(), edges)).toBe(true);
  expect(hasUnmetHardPrerequisite('B', new Set(['A']), edges)).toBe(false);
  expect(hasUnmetHardPrerequisite('B', new Set(['B']), edges)).toBe(false);
  expect(hasUnmetHardPrerequisite('C', new Set(), edges)).toBe(false);
});
