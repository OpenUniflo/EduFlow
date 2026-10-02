import { useMemo, useRef, useState } from 'react';
import { Crosshair, Maximize2, Minus, Plus, X } from 'lucide-react';
import type { KnowledgeGraph } from '@/features/knowledge/types';
import type { UserKnowledgeRecord } from '@/features/profile/types';
import type { CourseRuntimeData } from '../runtime/courseRuntime';
import { KnowledgeAtlasScene, type KnowledgeAtlasSceneHandle } from '@/features/knowledge/components/KnowledgeAtlasScene';
import { useDomainGovernance } from '@/features/knowledge/domain/domainStore';
import { resolveNodeDomain } from '@/features/knowledge/domain/domainResolution';
import { buildProjectCapabilityModel, projectCapabilityAtlas } from './projectCapability';
import { useRoutePlanning } from './useRoutePlanning';
import { RoutePlanningPanel } from './RoutePlanningPanel';
import './projectCapability.css';

export function ProjectCapabilityView({ graph, runtime, knowledge, selectedId, onSelect, onRoute, authenticated = false }: {
  graph: KnowledgeGraph; runtime: CourseRuntimeData; knowledge: UserKnowledgeRecord[]; authenticated?: boolean;
  selectedId: string | null; onSelect(id: string | null): void; onRoute(): void;
}) {
  const governance = useDomainGovernance();
  const scene = useRef<KnowledgeAtlasSceneHandle>(null);
  const [query, setQuery] = useState('');
  const knowledgeKey = JSON.stringify(knowledge.map(record => [record.nodeId, record.status]).sort());
  const control = useRoutePlanning(runtime.course.id, authenticated, knowledgeKey);
  const result = useMemo(() => {
    try {
      const model = buildProjectCapabilityModel(graph, runtime, knowledge);
      return { model, projection: projectCapabilityAtlas(graph, model, governance, knowledge), error: null };
    } catch (error) { return { model: null, projection: null, error: error instanceof Error ? error.message : '能力依赖计算失败' }; }
  }, [graph, runtime, knowledge, governance]);
  const selected = result.projection?.nodes.find(node => node.id === selectedId);
  const matches = result.projection?.nodes.filter(node => `${node.title} ${node.id}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const title = (id: string) => graph.nodes.find(node => node.id === id)?.title ?? id;
  const roles = (node: NonNullable<typeof selected>) => [node.capabilityRoles?.current && '已具备', node.capabilityRoles?.course && '项目目标', node.capabilityRoles?.bridge && '中间能力', result.model?.disconnectedCourseKnowledgeIds.includes(node.id) && '当前不可达'].filter(Boolean).join(' · ');
  const choose = (id: string) => { onSelect(id); if (control.editing) control.mark(id); };
  const draftMark = (id: string) => !control.editing ? '' : control.draft.includeNodeIds.includes(id) ? ' · 加入' : control.draft.excludeNodeIds.includes(id) ? ' · 排除' : '';
  const domain = selected ? resolveNodeDomain(selected.id, governance).domain : undefined;
  return <section className="project-capability" aria-label="项目能力模型">
    {result.error ? <div className="project-capability-info glass-v2" role="alert"><h2>能力依赖暂时无法展示</h2><p>{result.error}</p>{authenticated ? <RoutePlanningPanel control={control} title={title}/> : null}</div> : result.projection && result.model ? <>
      <KnowledgeAtlasScene ref={scene} nodes={result.projection.nodes} edges={result.projection.edges} variant="project" selectedId={selected?.id} onNodeClick={node => choose(node.id)} onBackgroundClick={() => onSelect(null)} />
      <aside className="project-capability-info glass-v2"><h2>从当前能力到项目目标</h2><p>必须前置全部满足后即可学习；推荐前置可以跳过。</p>
        <div className="project-capability-legend"><span><i style={{ background: '#3b82f6' }}/>蓝 · 已具备 {result.model.currentKnowledgeIds.length}</span><span><i style={{ background: '#22c55e' }}/>绿 · 未具备项目目标</span><span><i style={{ background: '#94a3b8' }}/>灰 · 未具备中间能力</span></div>
        {result.model.disconnectedCourseKnowledgeIds.length ? <p>{result.model.disconnectedCourseKnowledgeIds.length} 个项目目标当前不可达，仍保留在模型中。</p> : null}
        {!result.projection.nodes.length ? <p role="status">当前课程没有可展示的有效能力。</p> : null}
        <button className="atlas-primary" onClick={onRoute}>进入课程路线</button>
        {authenticated ? <RoutePlanningPanel control={control} title={title}/> : <p>登录并进入已发布课程后，可以规划自己的路线。</p>}
        <label>查找能力<input aria-label="查找项目能力" placeholder="输入能力名称" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="project-capability-results">{matches.map(node => <button key={node.id} disabled={control.editing && control.busy} data-node-id={node.id} onClick={() => { choose(node.id); if (!control.editing) scene.current?.focus(node.id); }}><i style={{ background: node.color }} /><span>{node.title}<small>{roles(node)}{draftMark(node.id)}</small></span></button>)}</div>
      </aside>
      <div className="project-capability-controls glass-v2"><button aria-label="放大能力模型" onClick={() => scene.current?.zoomBy(1.2)}><Plus size={18}/></button><button aria-label="缩小能力模型" onClick={() => scene.current?.zoomBy(.8)}><Minus size={18}/></button><button aria-label="适配能力模型" onClick={() => scene.current?.fit()}><Maximize2 size={18}/></button><button aria-label="聚焦所选能力" disabled={!selected} onClick={() => selected && scene.current?.focus(selected.id)}><Crosshair size={18}/></button></div>
      {selected ? <aside className="project-capability-detail glass-v2" aria-label="能力详情"><button className="atlas-panel-close" aria-label="关闭能力详情" onClick={() => onSelect(null)}><X size={17}/></button><span>{roles(selected)}{draftMark(selected.id)}</span><h2>{selected.title}</h2><p><i className="project-domain-dot" style={{ background: domain?.canonicalColor ?? '#94a3b8' }}/>{selected.domainTitle}</p><p>{selected.description}</p>
        {control.editing ? <div className="route-planning-actions"><button disabled={control.busy} aria-pressed={control.draft.includeNodeIds.includes(selected.id)} onClick={() => control.mark(selected.id, 'include')}>加入此能力</button><button disabled={control.busy} aria-pressed={control.draft.excludeNodeIds.includes(selected.id)} onClick={() => control.mark(selected.id, 'exclude')}>排除此能力</button></div> : null}
        <h3>前置关系</h3><ul>{graph.edges.filter(edge => edge.relation === 'prerequisite' && edge.target === selected.id).map(edge => <li key={edge.id}>{title(edge.source)} · {edge.strength === 'hard' ? '必须前置' : '推荐前置，可跳过'}</li>)}</ul>
        {selected.knowledge?.masteryCriteria.length ? <><h3>能力要求</h3><ul>{selected.knowledge.masteryCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></> : null}<p>候选能力不一定进入必要路线。下一步与学习内容是否可用，请查看课程路线。</p><button className="atlas-primary" onClick={onRoute}>查看课程路线</button></aside> : null}
    </> : null}
  </section>;
}
