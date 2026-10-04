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
import { projectStructuralGraph, projectRouteOverlay } from './projectRoutePresentation';
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
  const [draftNotice, setDraftNotice] = useState('');
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [goalExpanded, setGoalExpanded] = useState(false);
  const structuralGraph = useMemo(() => projectStructuralGraph(graph, runtime.curriculumCoverages.map(coverage => coverage.nodeId)), [graph, runtime]);
  const result = useMemo(() => {
    try {
      const model = buildProjectCapabilityModel(graph, runtime, knowledge);
      return { model, projection: projectCapabilityAtlas(graph, model, governance, knowledge, structuralGraph), error: null };
    } catch (error) { return { model: null, projection: null, error: error instanceof Error ? error.message : '能力依赖计算失败' }; }
  }, [graph, runtime, knowledge, governance, structuralGraph]);
  const currentRoute = control.view?.plan.valid ? control.view.plan.route : control.view?.activeVersion?.snapshot.valid ? control.view.activeVersion.snapshot : null;
  const previewRoute = useMemo(()=>control.preview?.valid ? {...control.preview.route,executionSteps:control.preview.execution?.steps} : null,[control.preview]);
  const overlay = useMemo(() => projectRouteOverlay(structuralGraph, currentRoute, previewRoute), [structuralGraph, currentRoute, previewRoute]);
  const visibleIds = useMemo(() => new Set([...(result.model?.orderedNodeIds ?? []), ...overlay.nodes.map(node => node.id)]), [result.model, overlay]);
  const visibleEdges = structuralGraph.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const action of actionData.actions) if (action.status === 'active') result.set(action.edge_id, (result.get(action.edge_id) ?? 0) + 1);
    return result;
  }, [actionData.actions]);
  const activeEdge = visibleEdges.find(edge => edge.id === edgeId);
  const alternatives = actionAlternatives(runtime.course.id, activeEdge, actionData, new Set(knowledge.filter(record => satisfiesTeachingPrerequisite(record.status)).map(record => record.nodeId)));
  const branches = control.editing ? [] : branchesForActions(alternatives,control.view?.activeVersion?.snapshot.executionSteps?.find(step=>step.edgeId===activeEdge?.id)?.actionId);
  const displayedNodes = result.projection?.nodes.filter(node => visibleIds.has(node.id)) ?? [];
  const selected = displayedNodes.find(node => node.id === selectedId);
  const matches = result.projection?.nodes.filter(node => visibleIds.has(node.id) && `${node.title} ${node.id}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const title = (id: string) => graph.nodes.find(node => node.id === id)?.title ?? id;
  const roles = (node: NonNullable<typeof selected>) => [node.capabilityRoles?.current && '已具备', node.capabilityRoles?.course && '项目目标', node.capabilityRoles?.bridge && '中间能力', result.model?.disconnectedCourseKnowledgeIds.includes(node.id) && '暂无当前能力入口'].filter(Boolean).join(' · ');
  const canInclude = (id: string) => Boolean(result.model?.orderedNodeIds.includes(id) || knowledge.some(record => record.nodeId === id && satisfiesTeachingPrerequisite(record.status)) || control.draft.includeNodeIds.includes(id));
  const choose = (id: string) => {
    setEdgeId(null); setDraftNotice('');
    if (control.editing) {
      onSelect(null);
      if (control.tool === 'include' && !canInclude(id)) { setDraftNotice(`${title(id)} 是路线前置上下文，当前不支持单独加入；它仍会随目标的必要前置保留。`); return; }
      control.mark(id);
    } else onSelect(id);
  };
  const draftMark = (id: string) => !control.editing ? '' : control.draft.includeNodeIds.includes(id) ? ' · 加入' : control.draft.excludeNodeIds.includes(id) ? ' · 排除' : '';
  const domain = selected ? resolveNodeDomain(selected.id, governance).domain : undefined;
  const searchPanel = <div className="project-capability-search glass-v2">
          <button className="project-search-toggle" aria-label={searchOpen ? '收起能力搜索' : '搜索项目能力'} aria-expanded={searchOpen} onClick={() => setSearchOpen(open => !open)}>{searchOpen ? <X size={18}/> : <Search size={18}/>}</button>
          {searchOpen ? <><label>查找能力<input autoFocus aria-label="查找项目能力" placeholder="输入能力名称" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <div className="project-capability-results">{matches.map(node => <button key={node.id} disabled={control.editing && (control.busy || control.tool === 'include' && !canInclude(node.id))} title={control.editing && control.tool === 'include' && !canInclude(node.id) ? '路线前置上下文，当前不支持单独加入' : undefined} data-node-id={node.id} onClick={() => { choose(node.id); if (!control.editing) { setSearchOpen(false); } }}><i style={{ background: node.color }} /><span>{node.title}<small>{roles(node)}{draftMark(node.id)}</small></span></button>)}{!matches.length ? <p>没有匹配的能力</p> : null}</div>
          </> : null}
        </div>;
  const routeLegend = <div className="project-route-legend glass-v2" role="status" aria-label="路线图层说明">
        {overlay.preview ? <><strong>路线预览 · 尚未采用</strong><span className="route-key-kept">保留</span><span className="route-key-added">新增</span><span className="route-key-removed">移除</span></> : <><strong>{control.view && !control.view.plan.valid ? '已采用路线 · 当前待重新确认' : '当前正式路线'}{control.view?.activeVersion ? ` V${control.view.activeVersion.versionNumber}` : ''}</strong><span>{overlay.nodes.length} 项能力 · {overlay.edges.length} 条真实关系</span></>}
        <small>普通线：真实关系 · 流光与箭头：执行方向</small>
      </div>;
  const focused = alternatives.find(item => item.action.id === actionId);
  return <section className="project-capability" aria-label="项目能力模型">
    {active && assistantIdentity ? <EduFlowAssistant context={{ ...assistantIdentity, workspace: 'courses', experienceMode: 'learn', presentation: 'project-capability', courseId: runtime.course.id, routeVersionId: control.view?.activeVersion?.id, knowledgeId: !control.editing ? selected?.id : undefined, edgeId: !control.editing ? activeEdge?.id : undefined, actionId: !control.editing ? focused?.action.id : undefined }} contextLabel={control.editing ? '调整项目路线' : activeEdge ? `${title(activeEdge.source)} → ${title(activeEdge.target)}` : selected?.title ?? runtime.course.title} /> : null}
    {result.error ? <div className="project-capability-info glass-v2" role="alert"><h2>能力依赖暂时无法展示</h2><p>{result.error}</p>{authenticated ? <RoutePlanningPanel relations={structuralGraph.edges} control={control} title={title}/> : null}</div> : result.projection && result.model ? <>
      <KnowledgeAtlasScene ref={scene} nodes={result.projection.nodes} edges={result.projection.edges} variant="project" selectedId={selected?.id} onNodeClick={node => choose(node.id)} onBackgroundClick={() => { onSelect(null); setEdgeId(null); }} onEdgeClick={edge => { if (control.editing) return; onSelect(null); setActionId(null); setEdgeId(edge.id); }} actionBranches={branches} onActionClick={setActionId} visibleNodeIds={visibleIds} routeOverlay={overlay} edgeActionCounts={counts} />
      {activeEdge && !control.editing ? <EdgeActionPanel planningOnly onAdjust={control.begin} alternatives={alternatives} title={`${title(activeEdge.source)} → ${title(activeEdge.target)}`} control={actionData} courseId={runtime.course.id} focusedId={actionId} onFocus={setActionId} onClose={() => setEdgeId(null)}/> : null}
      <div className="project-capability-toolbar">
        {control.editing ? <button className="atlas-secondary project-editor-toggle" aria-expanded={!editorCollapsed} aria-controls="project-route-editor" onClick={() => setEditorCollapsed(value => !value)}>{editorCollapsed ? '展开规划面板' : '查看路线图'}</button> : null}
        {!control.editing ? searchPanel : null}
        {!control.editing && !selected && !activeEdge ? <div className={`project-capability-goal glass-v2${goalExpanded ? ' expanded' : ''}`} aria-label="项目目标与当前能力缺口">
          <button className="project-goal-toggle" aria-expanded={goalExpanded} onClick={() => setGoalExpanded(value => !value)}>项目目标与能力缺口</button>
          {runtime.course.targetOutcome ? <p><strong>项目目标</strong> {runtime.course.targetOutcome}</p> : null}
          <small>当前显示：已具备 {displayedNodes.filter(node => node.capabilityRoles?.current).length} 项 · 待补中间能力 {displayedNodes.filter(node => node.capabilityRoles?.bridge && !node.capabilityRoles.current).length} 项 · 待达成目标 {displayedNodes.filter(node => node.capabilityRoles?.course && !node.capabilityRoles.current).length} 项</small>
          <small>显示当前候选能力与正式路线；预览只改变标记，不移动能力。点击关系线或展开关系列表比较行动方案。</small>
        </div> : null}
        {!control.editing && authenticated ? <RoutePlanningPanel relations={structuralGraph.edges} control={control} title={title}/> : null}
      </div>
      {(!control.editing || editorCollapsed) && !activeEdge && !selected ? routeLegend : null}
      {!control.editing && !selected && !activeEdge ? <details className="project-relations-list glass-v2"><summary>查看项目关系与行动 · {visibleEdges.length}</summary>{visibleEdges.map(edge => <button className="atlas-secondary" key={edge.id} onClick={() => { onSelect(null); setActionId(null); setEdgeId(edge.id); }}><span>{title(edge.source)} → {title(edge.target)}</span><small>{edge.relation === 'prerequisite' ? relationLabel(edge) : '能力支撑'} · {counts.get(edge.id) ?? 0} 个行动方案</small></button>)}{!visibleEdges.length ? <p>当前展示范围没有能力关系。</p> : null}</details> : null}
      {control.editing ? <aside id="project-route-editor" hidden={editorCollapsed} className="project-capability-editor glass-v2" aria-label="调整学习路线工具">{routeLegend}{searchPanel}{draftNotice ? <p role="status">{draftNotice}</p> : null}<RoutePlanningPanel relations={structuralGraph.edges} control={control} title={title}/></aside> : null}
      {!activeEdge && !selected ? <details className="project-capability-legend glass-v2" aria-label="能力图例"><summary>能力与行动图例</summary><div><span><i style={{ background: '#3b82f6' }}/>蓝 · 已具备</span><span><i style={{ background: '#22c55e' }}/>绿 · 未具备项目目标</span><span><i style={{ background: '#94a3b8' }}/>灰 · 未具备中间能力</span><span>行动：虚线候选 · 紫色已选 · 青色流动执行中 · 翠绿完成 · 淡灰不可用</span></div></details> : null}
      {!result.projection.nodes.length ? <p className="project-capability-empty glass-v2" role="status">当前课程没有可展示的有效能力。</p> : null}
      <div className="project-capability-controls glass-v2"><button aria-label="放大能力模型" onClick={() => scene.current?.zoomBy(1.2)}><Plus size={18}/></button><button aria-label="缩小能力模型" onClick={() => scene.current?.zoomBy(.8)}><Minus size={18}/></button><button aria-label="适配能力模型" onClick={() => scene.current?.fit()}><Maximize2 size={18}/></button><button aria-label="聚焦所选能力" disabled={!selected} onClick={() => selected && scene.current?.focus(selected.id)}><Crosshair size={18}/></button></div>
      {selected && !control.editing && !activeEdge ? <aside className="project-capability-detail glass-v2" aria-label="能力详情"><button className="atlas-panel-close" aria-label="关闭能力详情" onClick={() => onSelect(null)}><X size={17}/></button><span>{roles(selected)}{draftMark(selected.id)}</span><h2>{selected.title}</h2><p><i className="project-domain-dot" style={{ background: domain?.canonicalColor ?? '#94a3b8' }}/>{selected.domainTitle}</p><p>{selected.description}</p>
        <h3>前置关系</h3><ul>{visibleEdges.filter(edge => edge.relation === 'prerequisite' && edge.target === selected.id).map(edge => <li key={edge.id}>{title(edge.source)} · {edge.strength === 'hard' ? '必须前置' : '推荐前置，可跳过'}</li>)}</ul>
        {visibleEdges.some(edge => edge.relation === 'enables' && (edge.source === selected.id || edge.target === selected.id)) ? <><h3>能力支撑 · 非学习门槛</h3><ul>{visibleEdges.filter(edge => edge.relation === 'enables' && (edge.source === selected.id || edge.target === selected.id)).map(edge => <li key={edge.id} title={edge.reason}>{title(edge.source)} → {title(edge.target)}</li>)}</ul></> : null}
        {selected.knowledge?.masteryCriteria.length ? <><h3>能力要求</h3><ul>{selected.knowledge.masteryCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></> : null}<p>候选能力不一定进入必要路线。下一步与学习内容是否可用，请查看课程路线。</p><button className="atlas-primary" onClick={onRoute}>查看课程路线</button></aside> : null}
    </> : null}
  </section>;
}
