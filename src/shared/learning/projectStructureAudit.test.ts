import { describe, expect, it } from 'vitest';
import { auditProjectStructure } from './projectStructureAudit';

describe('project structure audit', () => {
  it('reports related-only targets without inventing edges or requiring one component', () => {
    const edges = [
      { source: 'a', target: 'b', relation: 'enables' as const },
      { source: 'c', target: 'd', relation: 'prerequisite' as const },
      { source: 'e', target: 'a', relation: 'related' as const },
    ];
    const before = JSON.stringify(edges);
    expect(auditProjectStructure(['a', 'b', 'c', 'd', 'e'], edges)).toMatchObject({
      projectTargetCount: 5, prerequisiteEdgeCount: 1, enablesEdgeCount: 1, relatedEdgeCount: 1,
      isolatedTargetIds: ['e'], degreeOneTargetIds: ['a', 'b', 'c', 'd'], componentCount: 3, componentSizes: [2, 2, 1],
    });
    expect(JSON.stringify(edges)).toBe(before);
  });
  it('only counts supplied visible projection facts; a shared course is not a relation', () => {
    expect(auditProjectStructure(['a', 'b'], [{ source: 'outside', target: 'a', relation: 'enables' }])).toMatchObject({ isolatedTargetIds: ['a', 'b'], componentSizes: [1, 1] });
    expect(auditProjectStructure(['a'], [{ source: 'outside', target: 'a', relation: 'enables' }], ['a', 'outside'])).toMatchObject({ isolatedTargetIds: [], componentSizes: [2] });
  });
});
