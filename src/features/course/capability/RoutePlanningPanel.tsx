import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { KnowledgeEdge } from '@/features/knowledge/types';
import type { RouteConflict } from '@/shared/learning/routePlanning';
import type { RouteVersion } from '@/shared/learning/routeVersion';
import type { useRoutePlanning } from './useRoutePlanning';
export function RouteConflicts({ conflicts, title }: { conflicts: RouteConflict[]; title(id: string): string }) {
  return <div className="route-conflicts" role="alert">{conflicts.map((conflict, index) => <p key={index}>
    <strong>{conflict.rootNodeId ? `${conflict.rootKind === 'include' ? '无法加入' : '目标当前不可达'}：${title(conflict.rootNodeId)}` : '知识前置关系存在循环'}</strong><br/>
    {conflict.kind === 'include_exclude' ? '同一能力不能同时加入和排除。' : conflict.kind === 'include_outside_model' ? '该能力不在当前项目能力模型中。' : conflict.kind === 'excluded_hard_prerequisite' ? `${title(conflict.nodeId!)} 是必须前置，但被当前路线排除。` : conflict.kind === 'unavailable_hard_prerequisite' ? `${title(conflict.nodeId!)} 是必须前置，但当前不可用。` : '请修正真实前置关系后再规划。'}
  </p>)}</div>;
}
export function HistoricalRoute({ version, restore, disabled }: { version: RouteVersion; restore(): void; disabled: boolean }) {
  return <section className="route-history-snapshot" aria-label={`查看 V${version.versionNumber} 快照`}>
    <h3>查看 V{version.versionNumber} · 历史快照</h3>
    <p>{version.snapshot.valid ? `当时路线：${version.snapshot.orderedNodeIds.length} 个能力，${version.snapshot.effectiveTargetNodeIds.length} 个有效目标。` : '当时默认约束不可满足，此快照没有可执行路线。'}</p>
    {!version.snapshot.valid ? <RouteConflicts conflicts={version.snapshot.conflicts} title={id => version.snapshot.titles[id] ?? id}/> : null}
    <ol>{version.snapshot.orderedNodeIds.map(id => <li key={id}>{version.snapshot.titles[id] ?? id}</li>)}</ol>
    {version.snapshot.executionSteps===undefined?<p>此历史版本尚未记录行动选择。</p>:<ol>{version.snapshot.executionSteps.map(step=><li key={step.edgeId}>{version.snapshot.titles[step.sourceNodeId]??step.sourceNodeId} → {version.snapshot.titles[step.targetNodeId]??step.targetNodeId}<small>已选行动引用：{step.actionId}</small></li>)}</ol>}
    <details><summary>当时规划约束与前置关系</summary><p>加入：{version.constraints.includeNodeIds.map(id => version.snapshot.titles[id] ?? id).join('、') || '无'}</p><p>排除：{version.constraints.excludeNodeIds.map(id => version.snapshot.titles[id] ?? id).join('、') || '无'}</p><ul>{version.snapshot.prerequisiteEdges.map(edge => <li key={edge.id}>{version.snapshot.titles[edge.source] ?? edge.source} → {version.snapshot.titles[edge.target] ?? edge.target} · {edge.strength === 'hard' ? '必须前置' : '推荐前置'}</li>)}</ul></details>
    <p>恢复会重新校验原行动与当下关系；行动失效或旧关系不再属于可规划范围时，需要重新调整。成功恢复生成新版本；已完成的学习不会回退，历史保持不变。</p><button disabled={disabled} onClick={restore}>恢复 V{version.versionNumber}，生成新版本</button>
  </section>;
}
function PlanningDialog({ label, close, children }: { label: string; close(): void; children: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if(previous?.isConnected)previous.focus(); };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="route-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={dialog} className="route-modal glass-v2" role="dialog" aria-modal="true" aria-label={label} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      if (event.key !== 'Tab') return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]') ?? [])];
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    }}>{children}</div>
  </div>, document.body);
}
export function RoutePlanningPanel({ control: c, title, relations = [], edgeId, onInspect, search }: {
  control: ReturnType<typeof useRoutePlanning>; title(id: string): string; relations?: readonly KnowledgeEdge[];
  edgeId?: string | null; onInspect?(id: string): void; search?: ReactNode;
}) {
  const active=c.view?.activeVersion;
  const catalog=c.proposal?.execution?.options??c.view?.execution?.options??[];
  const edge=relations.find(fact=>fact.id===edgeId);
  const options=catalog.filter(option=>option.edgeId===edgeId);
  const current=active?.snapshot.executionSteps?.find(step=>step.edgeId===edgeId);
  const chosen=c.actionChoices?.find(choice=>choice.edgeId===edgeId)?.actionId;
  const selected=edgeId ? c.selectedEdgeIds?.includes(edgeId)??true : false;
  const hard=edge?.relation==='prerequisite' && edge.strength==='hard';
  const oldSteps=active?.snapshot.executionSteps??[];
  const nextSteps=c.preview?.execution?.steps??[];
  const added=nextSteps.filter(step=>!oldSteps.some(old=>old.edgeId===step.edgeId)).length;
  const removed=oldSteps.filter(old=>!nextSteps.some(step=>step.edgeId===old.edgeId)).length;
  const changed=nextSteps.filter(step=>oldSteps.some(old=>old.edgeId===step.edgeId&&old.actionId!==step.actionId)).length;
  const unresolved=[...new Set(c.preview?.execution?.issues.map(issue=>issue.edgeId).filter(Boolean)??[])];
  const overlays=<>
    {c.dismissPending ? <PlanningDialog label="放弃路线调整确认" close={c.keepEditing}><h2>你有尚未采用的路线调整</h2><p>继续调整可以保留草稿；放弃后正式路线保持不变。</p><div className="route-planning-actions"><button className="atlas-primary" onClick={c.keepEditing}>继续调整</button><button className="atlas-secondary" onClick={c.discardDraft}>放弃调整</button></div></PlanningDialog> : null}
    {c.history ? <PlanningDialog label="路线版本历史" close={c.closeHistory}><header><h2>版本历史</h2><button className="atlas-secondary" onClick={c.closeHistory} aria-label="关闭版本历史">×</button></header>{c.error?<p role="alert">{c.error}</p>:null}<div className="route-history">{c.history.map(version=><button className="route-history-row atlas-secondary" key={version.id} onClick={()=>c.setHistorical(version)}>查看 V{version.versionNumber}{version.id===active?.id?' · 当前':''}<small>{new Date(version.createdAt).toLocaleString()}</small></button>)}{c.historical?<HistoricalRoute version={c.historical} disabled={c.busy||!active} restore={()=>c.restore(c.historical!.id)}/>:null}</div></PlanningDialog> : null}
  </>;
  if(!c.editing) return <>{overlays}<div className="project-route-entry"><button className="atlas-primary" disabled={c.busy||!active} onClick={c.begin}>调整学习路线</button><button className="atlas-secondary" disabled={c.busy||!active} onClick={c.showHistory}>版本历史</button>{c.view&&(!c.view.plan.valid||!c.view.execution?.complete)?<p role="status">当前正式路线需要调整，请完成行动选择后采用。</p>:null}{c.error?<p role="alert">{c.error}<button onClick={c.reload}>重新读取</button></p>:null}</div></>;
  return <>{overlays}<section className="route-planning" aria-label="个人路线规划">
    <header className="route-planning-header glass-v2"><button className="atlas-secondary" aria-label="退出路线调整" disabled={c.busy} onClick={c.cancel}>×</button><div><strong>调整学习路线</strong><small>当前 V{active?.versionNumber??'…'} → {c.preview?'预览':'草稿'} · 尚未采用</small></div><div className="route-header-actions"><button disabled={c.busy} onClick={c.showHistory}>历史版本</button><button disabled={c.busy} onClick={c.reload}>重新载入</button></div></header>
    <div className="route-structure-tools glass-v2" aria-label="路线结构工具"><button aria-pressed={c.tool==='include'} onClick={()=>c.setTool('include')}>＋ 加入能力</button><button aria-pressed={c.tool==='exclude'} onClick={()=>c.setTool('exclude')}>− 排除能力</button>{search}</div>
    {edge ? <aside className="route-edge-inspector glass-v2" aria-label="当前关系行动选择" key={edge.id}><header><span>当前关系</span><button aria-label="关闭关系检查" onClick={()=>onInspect?.('')}>×</button></header><h3>{title(edge.source)} → {title(edge.target)}</h3><p>{edge.reason}</p><label><input type="checkbox" checked={selected} disabled={c.busy||hard&&selected} onChange={event=>c.chooseEdge(edge.id,event.target.checked)}/>{hard?'必要前置 · 必须保留':'纳入执行路线'}</label><p>当前行动：{catalog.find(option=>option.actionId===current?.actionId)?.title??'未选择'}</p><fieldset data-planning-edge={edge.id}><legend>选择这条关系的行动</legend>{options.map((option,index)=><label className="route-action-choice" key={option.actionId}><input type="radio" name={`route-action-${edge.id}`} checked={chosen===option.actionId} disabled={c.busy||!selected||!option.planningAvailable} onChange={()=>c.chooseAction(edge.id,option.actionId)}/><span><strong>{option.title}{index===0&&option.planningAvailable?' · 推荐':''}</strong><small>{option.type==='micro_learning'?'微学习':'成果实践'} · {option.estimatedMinutes} 分钟 · 规划成本 {option.weight}</small><small>{option.availableNow?'当前可执行':option.planningAvailable?'可规划，等待必要能力':'资源不可用'}</small>{option.reasons.length?<small>{option.reasons.join('；')}</small>:null}</span></label>)}{!options.length?<p>重新规划后查看此关系的可用行动。</p>:null}</fieldset><button className="atlas-primary" disabled={c.busy} onClick={c.replan}>预览此项调整</button></aside>:<p className="route-planning-hint glass-v2">点击图中能力调整范围，点击关系选择行动。</p>}
    <footer className="route-bottom-bar glass-v2" aria-label="路线调整操作区"><div role="status"><strong>{c.stale?'需要重新计算路线':c.preview?`Preview：＋${added} / −${removed} / ${changed} 个行动变化`:`已修改 ${c.changeCount??0} 项`}</strong>{c.error?<p role="alert">{c.error}</p>:null}{c.view&&!c.view.plan.valid&&!c.preview?<RouteConflicts conflicts={c.view.plan.conflicts} title={title}/>:null}{c.preview&&!c.preview.valid?<RouteConflicts conflicts={c.preview.conflicts} title={title}/>:null}{unresolved.length?<p>{unresolved.length} 条关系还需要选择行动 <button onClick={()=>onInspect?.(unresolved[0])}>定位下一条</button></p>:null}{c.preview?.execution?.issues.filter(issue=>!issue.edgeId).map((issue,index)=><p key={index}>{issue.reason}</p>)}</div><div className="route-planning-actions">{c.preview&&!c.stale?<><button disabled={c.busy} onClick={c.continueEditing}>继续调整</button><button className="atlas-primary" disabled={c.busy||!c.preview.valid||!c.preview.execution?.complete} onClick={c.adopt}>采用新路线</button></>:<><button disabled={c.busy} onClick={c.cancel}>取消</button><button className="atlas-primary" disabled={c.busy} onClick={c.replan}>{c.stale?'重新计算':'预览调整结果'}</button></>}</div></footer>
  </section></>;
}
