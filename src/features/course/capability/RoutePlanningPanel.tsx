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
export function RoutePlanningPanel({ control: c, title,relations }: { control: ReturnType<typeof useRoutePlanning>; title(id: string): string;relations?:readonly KnowledgeEdge[] }) {
  const active = c.view?.activeVersion;
  const currentIds = new Set(c.view?.plan.valid ? c.view.plan.route.selectedNodeIds : []);
  const previewIds = new Set(c.preview?.valid ? c.preview.route.selectedNodeIds : []);
  const catalog=c.proposal?.execution?.options??c.view?.execution?.options??[];
  const edgeIds=[...new Set(catalog.map(option=>option.edgeId))];
  const proposedRoute=c.proposal?.valid?c.proposal.route:c.view?.plan.valid?c.view.plan.route:null;
  const facts=[...(relations??[]),...(proposedRoute?.prerequisiteEdges??[]).map(edge=>({...edge,relation:'prerequisite' as const})),...(c.view?.model?.supportEdges??[])];
  if (!c.editing) return <div className="project-route-entry">
    <button className="atlas-primary" disabled={c.busy || !active} onClick={c.begin}>调整学习路线</button>
    {c.view && (!c.view.plan.valid || !c.view.execution?.complete) ? <p role="status">当前正式路线需要调整，请完成每条关系的行动选择后采用。</p> : null}
    {c.error ? <p role="alert">{c.error}<button disabled={c.busy} onClick={c.reload}>重试读取路线</button></p> : null}
  </div>;
  return <section className="route-planning" aria-label="个人路线规划">
    <div className="route-version-label">{active ? `当前路线 V${active.versionNumber}` : c.busy ? '正在读取路线…' : '个人课程路线'}</div>
    {c.error ? <p role="alert">{c.error}</p> : null}
    <div className="route-planning-actions"><button disabled={c.busy} onClick={c.reload}>重新载入当前路线</button><button disabled={c.busy} onClick={c.showHistory}>版本历史</button></div>
    {c.view?.structureChanged ? <p>课程或知识结构已有变化，当前执行已重新校验；历史快照保持不变。</p> : null}
    {c.view && !c.view.plan.valid ? <RouteConflicts conflicts={c.view.plan.conflicts} title={title}/> : null}
    {c.view?.plan.valid && !c.view.plan.route.effectiveTargetNodeIds.length ? <p role="status">当前路线没有待达成项目目标。</p> : null}
    <>
      <h3>调整学习路线</h3><p>选择工具，再点击图中能力或搜索结果；草稿尚未采用。</p>
      <div className="route-planning-actions"><button aria-pressed={c.tool === 'include'} onClick={() => c.setTool('include')}>选择加入</button><button aria-pressed={c.tool === 'exclude'} onClick={() => c.setTool('exclude')}>选择排除</button></div>
      <p>已选择：加入 {c.draft.includeNodeIds.length} / 排除 {c.draft.excludeNodeIds.length}</p>
      <div className="route-planning-actions"><button disabled={c.busy} onClick={c.clear}>清空修改</button><button disabled={c.busy} onClick={c.replan}>重新规划路线</button><button disabled={c.busy} onClick={c.cancel}>退出调整</button></div>
      {edgeIds.length ? <section className="route-action-choices" aria-label="路线关系与行动选择"><h3>为每条关系选择行动</h3><p>推荐是草稿。未来步骤可先规划，启动时仍会检查能力与资源。</p>{edgeIds.map(edgeId=>{
        const edge=facts.find(edge=>edge.id===edgeId);
        const selected=c.selectedEdgeIds?.includes(edgeId)??true;
        const hard=edge?.relation==='prerequisite' && edge.strength==='hard';
        const current=active?.snapshot.executionSteps?.find(step=>step.edgeId===edgeId);
        const choices=catalog.filter(option=>option.edgeId===edgeId);
        const chosen=c.actionChoices.find(choice=>choice.edgeId===edgeId)?.actionId;
        return <fieldset key={edgeId} data-planning-edge={edgeId}><legend>{edge?`${title(edge.source)} → ${title(edge.target)}`:edgeId}</legend>
          <label><input type="checkbox" checked={selected} disabled={c.busy || hard && selected} onChange={event=>c.chooseEdge(edgeId,event.target.checked)}/>{hard?'必要前置 · 必须保留':'纳入执行路线'}</label>
          {current?<small>当前：{catalog.find(option=>option.actionId===current.actionId)?.title??current.actionId}</small>:null}
          {choices.map((option,index)=><label className="route-action-choice" key={option.actionId}><input type="radio" name={`route-action-${edgeId}`} checked={chosen===option.actionId} disabled={c.busy || !selected || !option.planningAvailable} onChange={()=>c.chooseAction(edgeId,option.actionId)}/><span><strong>{option.title}{index===0 && option.planningAvailable?' · 推荐':''}</strong><small>{option.type==='micro_learning'?'微学习':'实践任务'} · {option.estimatedMinutes} 分钟 · {option.availableNow?'当前可执行':option.planningAvailable?'可规划 · 等待能力或前置任务':'执行资源不可用'}</small>{!option.availableNow && option.reasons.length?<small>{option.reasons.join('；')}</small>:null}</span></label>)}
        </fieldset>;
      })}</section>:<p>重新规划后可查看每条真实关系的行动方案。</p>}
      {c.preview ? <section aria-label="路线预览"><h3>路线 Preview</h3><p>当前采用的路线尚未变化。</p>{c.preview.valid ? <>
        <p>新路线 {previewIds.size} 个能力；新增 {[...previewIds].filter(id => !currentIds.has(id)).length}，移除 {[...currentIds].filter(id => !previewIds.has(id)).length}。</p>
        <details open><summary>预览执行顺序与已选行动</summary><ol>{c.preview.execution?.steps.map(step=><li key={step.edgeId}>{catalog.find(option=>option.actionId===step.actionId)?.title??step.actionId}<small>{title(step.sourceNodeId)} → {title(step.targetNodeId)}{active?.snapshot.executionSteps?.find(old=>old.edgeId===step.edgeId)?.actionId!==step.actionId?' · 行动变更':' · 保留'}</small></li>)}</ol></details>
        {c.preview.execution?.issues.map((issue,index)=><p role="alert" key={index}>{issue.reason}</p>)}
        {[...currentIds].some(id => !previewIds.has(id)) ? <p>移除：{[...currentIds].filter(id => !previewIds.has(id)).map(title).join('、')}</p> : null}
        {!c.preview.route.effectiveTargetNodeIds.length ? <p>当前路线没有待达成项目目标。</p> : null}
      </> : <RouteConflicts conflicts={c.preview.conflicts} title={title}/>}
        <div className="route-planning-actions"><button disabled={c.busy} onClick={c.continueEditing}>继续调整</button><button disabled={c.busy || !c.preview.valid || !c.preview.execution?.complete} onClick={c.adopt}>采用新路线</button></div>
      </section> : null}
    </>
    {c.history ? <section className="route-history" aria-label="路线版本历史"><h3>版本历史</h3><button onClick={c.closeHistory}>关闭历史</button>{c.history.map(version => <button className="route-history-row" key={version.id} onClick={() => c.setHistorical(version)}>查看 V{version.versionNumber}{version.id === active?.id ? ' · 当前' : ''}<small>{version.source === 'initial' ? '初始路线' : version.source === 'restore' ? '历史恢复' : '路线调整'} · {new Date(version.createdAt).toLocaleString()}</small></button>)}{c.historical ? <HistoricalRoute version={c.historical} disabled={c.busy || !active} restore={() => c.restore(c.historical!.id)}/> : null}</section> : null}
  </section>;
}
