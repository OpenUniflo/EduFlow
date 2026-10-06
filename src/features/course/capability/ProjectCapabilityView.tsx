import { EduFlowAssistant } from '@/features/assistant/components/EduFlowAssistant';
import type { AssistantContext } from '@/features/assistant/assistantContext';
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
import { projectCapabilityGraph, projectRouteOverlay, projectVisibleNodeIds } from './projectRoutePresentation';
import { relationLabel } from '@/shared/learning/routePresentation';
import './projectCapability.css';

export function ProjectCapabilityView({ graph, runtime, knowledge, selectedId, onSelect, onRoute, authenticated = false, control, actionData, assistantIdentity, active = true }: {
  assistantIdentity?: Pick<AssistantContext, "userRole" | "capabilities">; active?: boolean;
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
  const structuralGraph = useMemo(() => projectCapabilityGraph(graph, result.model), [graph, result.model]);
  const currentRoute = control.view?.activeVersion?.snapshot ?? null;
  const previewRoute = useMemo(()=>control.preview?.valid ? {...control.preview.route,executionSteps:control.preview.execution?.steps} : null,[control.preview]);
  const overlay = useMemo(() => projectRouteOverlay(structuralGraph, currentRoute, previewRoute), [structuralGraph, currentRoute, previewRoute]);
  const visibleIds = useMemo(() => projectVisibleNodeIds(structuralGraph), [structuralGraph]);
  const visibleEdges = structuralGraph.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const action of actionData.actions) if (action.status === 'active' && action.edge_id) result.set(action.edge_id, (result.get(action.edge_id) ?? 0) + 1);
    return result;
  }, [actionData.actions]);
  const activeEdge = visibleEdges.find(edge => edge.id === edgeId);
  const alternatives = actionAlternatives(runtime.course.id, activeEdge, actionData, new Set(knowledge.filter(record => satisfiesTeachingPrerequisite(record.status)).map(record => record.nodeId)));
  const nodeAlternatives=selectedId && !graph.edges.some(edge=>edge.relation!=='related'&&edge.target===selectedId)?actionAlternatives(runtime.course.id,{nodeId:selectedId},actionData,new Set(knowledge.filter(record=>satisfiesTeachingPrerequisite(record.status)).map(record=>record.nodeId))):[];
  const branches = control.editing ? [] : branchesForActions(alternatives,control.view?.activeVersion?.snapshot.executionSteps?.filter(step=>step.edgeId===activeEdge?.id).map(step=>step.actionId));
  const displayedNodes = result.projection?.nodes.filter(node => visibleIds.has(node.id)) ?? [];
  const selected = displayedNodes.find(node => node.id === selectedId);
  const matches = result.projection?.nodes.filter(node => visibleIds.has(node.id) && `${node.title} ${node.id}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const title = (id: string) => graph.nodes.find(node => node.id === id)?.title ?? control.view?.activeVersion?.snapshot.titles[id] ?? id;
  const roles = (node: NonNullable<typeof selected>) => !(previewRoute??currentRoute)?.selectedNodeIds.includes(node.id) && !(control.editing && control.draft.includeNodeIds.includes(node.id)) ? '候选能力 · 未纳入当前路线' : [node.capabilityRoles?.current && '已具备', node.capabilityRoles?.course && '项目目标', node.capabilityRoles?.bridge && '中间能力', result.model?.disconnectedCourseKnowledgeIds.includes(node.id) && '暂无当前能力入口'].filter(Boolean).join(' · ');
  const choose = (id: string) => {setEdgeId(null);onSelect(id);};
  const draftMark = (id: string) => !control.editing ? '' : control.draft.includeNodeIds.includes(id) ? ' · 加入' : control.draft.excludeNodeIds.includes(id) ? ' · 排除' : '';
  const planningNode=selected?{id:selected.id,title:selected.title,description:selected.description,state:selected.capabilityRoles?.current?'已具备':'未具备',role:roles(selected),root:!graph.edges.some(edge=>edge.relation!=='related' && edge.target===selected.id)}:undefined;
  const domain = selected ? resolveNodeDomain(selected.id, governance).domain : undefined;
  const searchPanel = <div className="project-capability-search glass-v2">
          <button className="project-search-toggle" aria-label={searchOpen ? '收起能力搜索' : '搜索项目能力'} aria-expanded={searchOpen} onClick={() => setSearchOpen(open => !open)}>{searchOpen ? <X size={18}/> : <Search size={18}/>}</button>
          {searchOpen ? <><label>查找能力<input autoFocus aria-label="查找项目能力" placeholder="输入能力名称" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <div className="project-capability-results">{matches.map(node => <button key={node.id} data-node-id={node.id} onClick={() => { choose(node.id); if (!control.editing) { setSearchOpen(false); } }}><i style={{ background: node.color }} /><span>{node.title}<small>{roles(node)}{draftMark(node.id)}</small></span></button>)}{!matches.length ? <p>没有匹配的能力</p> : null}</div>
          </> : null}
        </div>;
  const routeLegend = <div className="project-route-legend glass-v2" role="status" aria-label="路线图层说明">
        {overlay.preview ? <><strong>路线预览 · 尚未采用</strong><span className="route-key-kept">保留</span><span className="route-key-added">新增</span><span className="route-key-removed">移除</span></> : <><strong>{control.view && !control.view.plan.valid ? '已采用路线 · 当前待重新确认' : '当前正式路线'}{control.view?.activeVersion ? ` V${control.view.activeVersion.versionNumber}` : ''}</strong><span>{overlay.nodes.length} 项能力 · {overlay.edges.length} 条真实关系</span></>}
        <small>普通线：真实关系 · 流光与箭头：执行方向</small>
      </div>;
  const focused = alternatives.find(item => item.action.id === actionId);
  return <section className="project-capability" aria-label="项目能力模型">
    {active && assistantIdentity ? <EduFlowAssistant className={control.editing?"project-planning-assistant":""} context={{ ...assistantIdentity, workspace: 'courses', experienceMode: 'learn', presentation: 'project-capability', courseId: runtime.course.id, routeVersionId: control.view?.activeVersion?.id, knowledgeId: !control.editing ? selected?.id : undefined, edgeId: !control.editing ? activeEdge?.id : undefined, actionId: !control.editing ? focused?.action.id : undefined }} contextLabel={control.editing ? '调整项目路线' : activeEdge ? `${title(activeEdge.source)} → ${title(activeEdge.target)}` : selected?.title ?? runtime.course.title} /> : null}
    {result.error ? <div className="project-capability-info glass-v2" role="alert"><h2>能力依赖暂时无法展示</h2><p>{result.error}</p>{authenticated ? <RoutePlanningPanel relations={structuralGraph.edges} control={control} title={title}/> : null}</div> : result.projection && result.model ? <>
      <KnowledgeAtlasScene ref={scene} nodes={result.projection.nodes} edges={result.projection.edges} variant="project" selectedId={selected?.id} selectedEdgeId={edgeId} draftNodeChanges={control.editing?{include:control.draft.includeNodeIds,exclude:control.draft.excludeNodeIds}:undefined} onNodeClick={node => choose(node.id)} onBackgroundClick={() => { onSelect(null); setEdgeId(null); }} onEdgeClick={edge => { onSelect(null); setActionId(null); setEdgeId(edge.id); }} actionBranches={branches} onActionClick={setActionId} visibleNodeIds={visibleIds} routeOverlay={overlay} edgeActionCounts={counts} />
      {activeEdge && !control.editing ? <EdgeActionPanel planningOnly onAdjust={control.begin} alternatives={alternatives} title={`${title(activeEdge.source)} → ${title(activeEdge.target)}`} control={actionData} courseId={runtime.course.id} focusedId={actionId} onFocus={setActionId} onClose={() => setEdgeId(null)}/> : null}
      <div className="project-capability-toolbar">
        {!control.editing ? searchPanel : null}
        {!control.editing && authenticated ? <RoutePlanningPanel relations={structuralGraph.edges} control={control} title={title}/> : null}
      </div>
      {!control.editing?<details className="project-overview glass-v2" aria-label="项目概览">
        <summary><strong>项目概览</strong><span>项目目标 · {control.view?.activeVersion ? `正式路线 V${control.view.activeVersion.versionNumber}` : '尚无正式路线'} · {visibleEdges.length} 条关系 / {visibleEdges.reduce((sum,edge)=>sum+(counts.get(edge.id)??0),0)} 个行动</span></summary>
        <div className="project-overview-body">
          <section><h3>项目目标</h3><p>{runtime.course.targetOutcome??runtime.course.description}</p></section>
          <section><h3>当前正式路线{control.view?.activeVersion?` V${control.view.activeVersion.versionNumber}`:''}</h3><p>{control.view?.activeVersion?.snapshot.valid?`${control.view.activeVersion.snapshot.orderedNodeIds.length} 项能力 · ${control.view.activeVersion.snapshot.executionSteps?.length??0} 个执行步骤`:'尚未采用可执行路线'}</p><p>正在执行 {actionData.runs.filter(run=>run.status==='in_progress').length} 项 · 历史完成 {actionData.runs.filter(run=>run.status==='completed').length} 次</p></section>
          <section><h3>关系与行动</h3><p>{visibleEdges.length} 条真实关系 · {visibleEdges.reduce((sum,edge)=>sum+(counts.get(edge.id)??0),0)} 个可选行动</p><details className="project-relations-list"><summary>查看全部关系与行动</summary>{visibleEdges.map(edge=><button className="atlas-secondary" key={edge.id} onClick={()=>{onSelect(null);setActionId(null);setEdgeId(edge.id);}}><span>{title(edge.source)} → {title(edge.target)}</span><small>{edge.relation==='prerequisite'?relationLabel(edge):'能力支撑'} · {counts.get(edge.id)??0} 个行动方案</small></button>)}</details></section>
        </div>
      </details>:null}
      {control.editing ? <RoutePlanningPanel relations={structuralGraph.edges} control={control} title={title} edgeId={edgeId} node={planningNode} search={searchPanel} onInspect={id=>{setEdgeId(id||null);onSelect(null);}} onInspectNode={id=>{setEdgeId(null);onSelect(id||null);}} onLocateIssue={issue=>{if(['action_required','action_unavailable','hard_edge_required','edge_not_in_route'].includes(issue.kind)&&issue.edgeId){setEdgeId(issue.edgeId);onSelect(null);const fact=visibleEdges.find(edge=>edge.id===issue.edgeId);if(fact)scene.current?.focus(fact.target);}else{const id=issue.nodeId??issue.sourceNodeId??issue.targetNodeId;if(id){setEdgeId(null);onSelect(id);scene.current?.focus(id);}}}}/> : null}
      {!control.editing && !activeEdge && !selected ? <details className="project-capability-legend glass-v2" aria-label="能力图例"><summary>能力与行动图例</summary><div><span><i style={{ background: '#3b82f6' }}/>蓝 · 已具备</span><span><i style={{ background: '#22c55e' }}/>绿 · 未具备项目目标</span><span><i style={{ background: '#94a3b8' }}/>灰 · 未具备中间能力</span><span>行动：虚线候选 · 紫色已选 · 青色流动执行中 · 翠绿完成 · 淡灰不可用</span></div></details> : null}
      {!result.projection.nodes.length ? <p className="project-capability-empty glass-v2" role="status">当前课程没有可展示的有效能力。</p> : null}
      {!control.editing ? routeLegend : null}
      <div className="project-capability-controls glass-v2"><button aria-label="放大能力模型" onClick={() => scene.current?.zoomBy(1.2)}><Plus size={18}/></button><button aria-label="缩小能力模型" onClick={() => scene.current?.zoomBy(.8)}><Minus size={18}/></button><button aria-label="适配能力模型" onClick={() => scene.current?.fit()}><Maximize2 size={18}/></button><button aria-label="聚焦所选能力" disabled={!selected} onClick={() => selected && scene.current?.focus(selected.id)}><Crosshair size={18}/></button></div>
      {selected && !control.editing && !activeEdge ? <aside className="project-capability-detail glass-v2" aria-label="能力详情"><button className="atlas-panel-close" aria-label="关闭能力详情" onClick={() => onSelect(null)}><X size={17}/></button><span>{roles(selected)}{draftMark(selected.id)}</span><h2>{selected.title}</h2><p><i className="project-domain-dot" style={{ background: domain?.canonicalColor ?? '#94a3b8' }}/>{selected.domainTitle}</p><p>{selected.description}</p>
        <h3>前置关系</h3><ul>{visibleEdges.filter(edge => edge.relation === 'prerequisite' && edge.target === selected.id).map(edge => <li key={edge.id}>{title(edge.source)} · {edge.strength === 'hard' ? '必须前置' : '推荐前置，可跳过'}</li>)}</ul>
        {visibleEdges.some(edge => edge.relation === 'enables' && (edge.source === selected.id || edge.target === selected.id)) ? <><h3>能力支撑 · 非学习门槛</h3><ul>{visibleEdges.filter(edge => edge.relation === 'enables' && (edge.source === selected.id || edge.target === selected.id)).map(edge => <li key={edge.id} title={edge.reason}>{title(edge.source)} → {title(edge.target)}</li>)}</ul></> : null}
        {selected.knowledge?.masteryCriteria.length ? <><h3>能力要求</h3><ul>{selected.knowledge.masteryCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></> : null}{nodeAlternatives.length?<EdgeActionPanel embedded title="根能力行动" alternatives={nodeAlternatives} control={actionData} courseId={runtime.course.id} focusedId={actionId} onFocus={setActionId} planningOnly onAdjust={control.begin}/>:null}<p>候选能力不一定进入必要路线。下一步与学习内容是否可用，请查看课程路线。</p><button className="atlas-primary" onClick={onRoute}>查看课程路线</button></aside> : null}
    </> : null}
  </section>;
}
