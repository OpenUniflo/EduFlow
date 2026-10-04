import { satisfiesTeachingPrerequisite } from '@/shared/learning/teachingPrerequisites';
import { useMemo, useRef, useState } from 'react';
import { Crosshair, Maximize2, Minus, Plus, Search, X } from 'lucide-react';
import type { KnowledgeGraph } from '@/features/knowledge/types';
import type { UserKnowledgeRecord } from '@/features/profile/types';
import type { CourseRuntimeData } from '../runtime/courseRuntime';
import { KnowledgeAtlasScene, type KnowledgeAtlasSceneHandle } from '@/features/knowledge/components/KnowledgeAtlasScene';
import { useDomainGovernance } from '@/features/knowledge/domain/domainStore';
import { resolveNodeDomain } from '@/features/knowledge/domain/domainResolution';
import { buildProjectCapabilityModel, projectCapabilityAtlas } from './projectCapability';
import { useRoutePlanning } from './useRoutePlanning';
import { RoutePlanningPanel } from './RoutePlanningPanel';
import { actionAlternatives, branchesForActions, EdgeActionPanel, useEdgeActions } from '@/features/actions/EdgeActionPanel';
import './projectCapability.css';

export function ProjectCapabilityView({ graph, runtime, knowledge, selectedId, onSelect, onRoute, authenticated = false, control, actionData }: {
  control: ReturnType<typeof useRoutePlanning>; actionData: ReturnType<typeof useEdgeActions>;
  graph: KnowledgeGraph; runtime: CourseRuntimeData; knowledge: UserKnowledgeRecord[]; authenticated?: boolean;
  selectedId: string | null; onSelect(id: string | null): void; onRoute(): void;
}) {
  const governance = useDomainGovernance();
  const scene = useRef<KnowledgeAtlasSceneHandle>(null);
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const result = useMemo(() => {
    try {
      const model = buildProjectCapabilityModel(graph, runtime, knowledge);
      return { model, projection: projectCapabilityAtlas(graph, model, governance, knowledge), error: null };
    } catch (error) { return { model: null, projection: null, error: error instanceof Error ? error.message : '能力依赖计算失败' }; }
  }, [graph, runtime, knowledge, governance]);
  const activeEdge = result.projection?.edges.find(edge => edge.id === edgeId);
  const alternatives = actionAlternatives(runtime.course.id, activeEdge, actionData, new Set(knowledge.filter(record => satisfiesTeachingPrerequisite(record.status)).map(record => record.nodeId)));
  const branches = branchesForActions(alternatives);
  const selected = result.projection?.nodes.find(node => node.id === selectedId);
  const matches = result.projection?.nodes.filter(node => `${node.title} ${node.id}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const title = (id: string) => graph.nodes.find(node => node.id === id)?.title ?? id;
  const roles = (node: NonNullable<typeof selected>) => [node.capabilityRoles?.current && '已具备', node.capabilityRoles?.course && '项目目标', node.capabilityRoles?.bridge && '中间能力', result.model?.disconnectedCourseKnowledgeIds.includes(node.id) && '暂无当前能力入口'].filter(Boolean).join(' · ');
  const choose = (id: string) => { setEdgeId(null); onSelect(id); if (control.editing) control.mark(id); };
  const draftMark = (id: string) => !control.editing ? '' : control.draft.includeNodeIds.includes(id) ? ' · 加入' : control.draft.excludeNodeIds.includes(id) ? ' · 排除' : '';
  const domain = selected ? resolveNodeDomain(selected.id, governance).domain : undefined;
  return <section className="project-capability" aria-label="项目能力模型">
    {result.error ? <div className="project-capability-info glass-v2" role="alert"><h2>能力依赖暂时无法展示</h2><p>{result.error}</p>{authenticated ? <RoutePlanningPanel control={control} title={title}/> : null}</div> : result.projection && result.model ? <>
      <KnowledgeAtlasScene ref={scene} nodes={result.projection.nodes} edges={result.projection.edges} variant="project" selectedId={selected?.id} onNodeClick={node => choose(node.id)} onBackgroundClick={() => { onSelect(null); setEdgeId(null); }} onEdgeClick={edge => { onSelect(null); setActionId(null); setEdgeId(edge.id); }} actionBranches={branches} onActionClick={setActionId} />
      {activeEdge ? <EdgeActionPanel alternatives={alternatives} title={`${title(activeEdge.source)} → ${title(activeEdge.target)}`} control={actionData} courseId={runtime.course.id} focusedId={actionId} onFocus={setActionId} onClose={() => setEdgeId(null)}/> : null}
      <div className="project-capability-toolbar">
        <div className="project-capability-search glass-v2">
          <button className="project-search-toggle" aria-label={searchOpen ? '收起能力搜索' : '搜索项目能力'} aria-expanded={searchOpen} onClick={() => setSearchOpen(open => !open)}>{searchOpen ? <X size={18}/> : <Search size={18}/>}</button>
          {searchOpen ? <><label>查找能力<input autoFocus aria-label="查找项目能力" placeholder="输入能力名称" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <div className="project-capability-results">{matches.map(node => <button key={node.id} disabled={control.editing && control.busy} data-node-id={node.id} onClick={() => { choose(node.id); if (!control.editing) { setSearchOpen(false); } }}><i style={{ background: node.color }} /><span>{node.title}<small>{roles(node)}{draftMark(node.id)}</small></span></button>)}{!matches.length ? <p>没有匹配的能力</p> : null}</div>
          </> : null}
        </div>
        {!control.editing && !selected ? <div className="project-capability-goal glass-v2" aria-label="项目目标与当前能力缺口">
          {runtime.course.targetOutcome ? <p><strong>项目目标</strong> {runtime.course.targetOutcome}</p> : null}
          <small>当前已具备 {result.model.currentKnowledgeIds.length} 项 · 待补中间能力 {result.model.bridgeKnowledgeIds.filter(id => !result.model!.currentKnowledgeIds.includes(id)).length} 项 · 待达成目标 {result.model.courseKnowledgeIds.filter(id => !result.model!.currentKnowledgeIds.includes(id)).length} 项</small>
          <small>仅显示当前通向目标的能力；已有能力变化后，已不再需要的前置会移出。点击能力查看橙色支撑光流；点击关系线比较行动方案。</small>
        </div> : null}
        {!control.editing && authenticated ? <RoutePlanningPanel control={control} title={title}/> : null}
      </div>
      {control.editing ? <aside className="project-capability-editor glass-v2" aria-label="调整学习路线工具"><RoutePlanningPanel control={control} title={title}/></aside> : null}
      <div className="project-capability-legend glass-v2" aria-label="能力图例"><span><i style={{ background: '#3b82f6' }}/>蓝 · 已具备</span><span><i style={{ background: '#22c55e' }}/>绿 · 未具备项目目标</span><span><i style={{ background: '#94a3b8' }}/>灰 · 未具备中间能力</span><span>行动：虚线候选 · 紫色已选 · 青色流动执行中 · 翠绿完成 · 淡灰不可用</span></div>
      {!result.projection.nodes.length ? <p className="project-capability-empty glass-v2" role="status">当前课程没有可展示的有效能力。</p> : null}
      <div className="project-capability-controls glass-v2"><button aria-label="放大能力模型" onClick={() => scene.current?.zoomBy(1.2)}><Plus size={18}/></button><button aria-label="缩小能力模型" onClick={() => scene.current?.zoomBy(.8)}><Minus size={18}/></button><button aria-label="适配能力模型" onClick={() => scene.current?.fit()}><Maximize2 size={18}/></button><button aria-label="聚焦所选能力" disabled={!selected} onClick={() => selected && scene.current?.focus(selected.id)}><Crosshair size={18}/></button></div>
      {selected ? <aside className="project-capability-detail glass-v2" aria-label="能力详情"><button className="atlas-panel-close" aria-label="关闭能力详情" onClick={() => onSelect(null)}><X size={17}/></button><span>{roles(selected)}{draftMark(selected.id)}</span><h2>{selected.title}</h2><p><i className="project-domain-dot" style={{ background: domain?.canonicalColor ?? '#94a3b8' }}/>{selected.domainTitle}</p><p>{selected.description}</p>
        {control.editing ? <div className="route-planning-actions"><button disabled={control.busy} aria-pressed={control.draft.includeNodeIds.includes(selected.id)} onClick={() => control.mark(selected.id, 'include')}>加入此能力</button><button disabled={control.busy} aria-pressed={control.draft.excludeNodeIds.includes(selected.id)} onClick={() => control.mark(selected.id, 'exclude')}>排除此能力</button></div> : null}
        <h3>前置关系</h3><ul>{graph.edges.filter(edge => edge.relation === 'prerequisite' && edge.target === selected.id).map(edge => <li key={edge.id}>{title(edge.source)} · {edge.strength === 'hard' ? '必须前置' : '推荐前置，可跳过'}</li>)}</ul>
        {graph.edges.some(edge => edge.relation === 'enables' && (edge.source === selected.id || edge.target === selected.id)) ? <><h3>能力支撑 · 非学习门槛</h3><ul>{graph.edges.filter(edge => edge.relation === 'enables' && (edge.source === selected.id || edge.target === selected.id)).map(edge => <li key={edge.id} title={edge.reason}>{title(edge.source)} → {title(edge.target)}</li>)}</ul></> : null}
        {selected.knowledge?.masteryCriteria.length ? <><h3>能力要求</h3><ul>{selected.knowledge.masteryCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></> : null}<p>候选能力不一定进入必要路线。下一步与学习内容是否可用，请查看课程路线。</p><button className="atlas-primary" onClick={onRoute}>查看课程路线</button></aside> : null}
    </> : null}
  </section>;
}
