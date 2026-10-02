import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { HistoricalRoute, RouteConflicts, RoutePlanningPanel } from './RoutePlanningPanel';
import type { RouteVersion } from '@/shared/learning/routeVersion';
import type { useRoutePlanning } from './useRoutePlanning';
const version: RouteVersion = { id: 'v1', routeId: 'r', userId: 'u', courseId: 'c', versionNumber: 1, source: 'initial', parentVersionId: null, restoredFromVersionId: null, createdAt: '2026-10-02T00:00:00Z', structureFingerprint: 's', constraints: { includeNodeIds: [], excludeNodeIds: [] }, snapshot: { valid: true, conflicts: [], titles: { A: '当时的能力标题' }, selectedNodeIds: ['A'], orderedNodeIds: ['A'], prerequisiteEdges: [], effectiveTargetNodeIds: ['A'], currentKnowledgeIds: [], bridgeKnowledgeIds: [] } };
describe('V2 route UI authority and historical meaning', () => {
  it('history renders saved titles and distinguishes viewing from restore-as-new', () => {
    const html = renderToStaticMarkup(<HistoricalRoute version={version} disabled={false} restore={vi.fn()}/>);
    expect(html).toContain('当时的能力标题'); expect(html).toContain('查看 V1'); expect(html).toContain('恢复 V1，生成新版本'); expect(html).toContain('已完成的学习不会回退');
  });
  it('invalid initial history is not displayed as an empty completed route', () => {
    const html = renderToStaticMarkup(<HistoricalRoute version={{ ...version, snapshot: { ...version.snapshot, valid: false, orderedNodeIds: [], selectedNodeIds: [], conflicts: [{ kind: 'unavailable_hard_prerequisite', nodeId: 'M', rootNodeId: 'A', rootKind: 'target', constraint: 'knowledge_graph' }] } }} disabled={false} restore={vi.fn()}/>);
    expect(html).toContain('当时默认约束不可满足'); expect(html).toContain('M 是必须前置，但当前不可用');
  });
  it('renders structured backend root and excluded support without frontend inference', () => {
    const html = renderToStaticMarkup(<RouteConflicts title={id => `知识${id}`} conflicts={[{ kind: 'excluded_hard_prerequisite', rootNodeId: 'T', rootKind: 'target', nodeId: 'A', constraint: 'exclude' }]}/>);
    expect(html).toContain('目标当前不可达：知识T'); expect(html).toContain('知识A 是必须前置，但被当前路线排除');
  });
  it('ordinary view hides Include/Exclude editor even when constraints are persisted', () => {
    const c = { view: { activeVersion: { ...version, constraints: { includeNodeIds: ['A'], excludeNodeIds: ['B'] } }, plan: { valid: true, route: version.snapshot } }, busy: false, editing: false, preview: null, history: null } as unknown as ReturnType<typeof useRoutePlanning>;
    const html = renderToStaticMarkup(<RoutePlanningPanel control={c} title={id => id}/>);
    expect(html).toContain('当前路线 V1'); expect(html).not.toContain('选择加入'); expect(html).not.toContain('选择排除');
  });
  it('same structural graph does not depend on draft, preview or route version, and no role rings remain', () => {
    const scene = readFileSync('src/features/knowledge/components/KnowledgeAtlasScene.tsx', 'utf8');
    expect(scene).not.toContain('roleRings');
    expect(scene).toContain('atlasStructureKey(nodes, edges, variant)');
    expect(scene).toContain('variant !== "project"');
  });
});
