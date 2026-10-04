import { ActionRunHistory } from '@/features/actions/ActionRunHistory';
import { courseActionRecommendation } from './courseActionRecommendation';
import type { useEdgeActions } from '@/features/actions/EdgeActionPanel';
import { satisfiesTeachingPrerequisite } from '@/shared/learning/teachingPrerequisites';
import { useNavigate } from 'react-router-dom';
import { courseAssignmentEligibility } from '../assignmentExperience';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { z } from 'zod';
import { ArrowRight, Clock3 } from 'lucide-react';
import type { NavigationDecision } from '@/shared/learning/navigation';
import type { UserKnowledgeRecord } from '@/features/profile/types';
import type { CourseGraphData, CourseRuntimeData } from '../runtime/courseRuntime';
import type { CourseAssignment, UserCourseState } from '../types';
import { buildCourseNavigator, type NavigatorLearningContent } from './courseNavigatorProjection';
import { useRoutePlanning } from '../capability/useRoutePlanning';
import { CoursePathView } from './CoursePathView';

const navigationResponse = z.object({
  courseId: z.string(), path: z.array(z.object({ nodeId: z.string(), title: z.string(), state: z.enum(['skipped','learned','underway','eligible','blocked']), blockedBy: z.array(z.string()) })),
  nextAction: z.object({ kind: z.enum(['skip','remediation','review','practice','next']), resourceKind: z.enum(['micro','material','assignment','course']), nodeId: z.string().optional(), resourceId: z.string().optional(), reason: z.string(), reasonCode: z.string() }),
});

export function CourseNavigator({ graph, runtime, knowledge, courseState, authenticated, loadNavigation, onSelect, onSignIn, onInspectCapabilities, learningContent, resolveLearningContent, showPolicy = false, actionControl, routeControl }: {
  actionControl: ReturnType<typeof useEdgeActions>;
  routeControl: ReturnType<typeof useRoutePlanning>;
  graph: CourseGraphData; runtime: CourseRuntimeData; knowledge: UserKnowledgeRecord[]; courseState?: UserCourseState;
  showPolicy?: boolean; authenticated: boolean; loadNavigation(courseId: string): Promise<NavigationDecision>;
  onSelect(id: string, edgeId?: string): void;
  onSignIn(): void; onInspectCapabilities?(nodeId?: string): void; learningContent: NavigatorLearningContent[];
  resolveLearningContent?(nodeId: string, pathId: string): NavigatorLearningContent | undefined;
}) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [result, setResult] = useState<{ decision?: NavigationDecision; error?: string; loading: boolean }>({ loading: authenticated });
  const [retry, setRetry] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<CourseAssignment | null>(null);
  useEffect(() => { if (detail) dialogRef.current?.showModal(); }, [detail]);
  const detailEligibility = detail ? courseAssignmentEligibility(runtime, detail.id, knowledge, courseState) : null;
  const knowledgeKey = JSON.stringify(knowledge.map(item => [item.nodeId, item.status, item.updatedAt]).sort(([a], [b]) => String(a).localeCompare(String(b))));
  // The hydrated course snapshot changes after Micro / Assignment completion.
  useEffect(() => {
    if (!authenticated) { setResult({ loading: false }); return; }
    let active = true; setResult({ loading: true });
    void loadNavigation(runtime.course.id).then(decision => {
      if (!navigationResponse.safeParse(decision).success || decision.courseId !== runtime.course.id) throw new Error('Invalid course navigation response');
      if (active) setResult({ decision, loading: false });
    }).catch(error => {
      console.error('Course navigation unavailable', error);
      if (active) setResult({ loading: false, error: '暂时无法加载下一步，请重试。' });
    });
    return () => { active = false; };
  }, [authenticated, runtime.course.id, courseState, knowledgeKey, loadNavigation, retry]);
  const model = useMemo(() => {
    const selected = result.decision?.nextAction;
    const exact = selected?.resourceKind === 'micro' && selected.nodeId && selected.resourceId
      ? resolveLearningContent?.(selected.nodeId, selected.resourceId) : undefined;
    return buildCourseNavigator({ graph, runtime, knowledge, courseState, decision: result.decision, routeView: routeControl.view, learningContent: exact ? [...learningContent, exact] : learningContent });
  }, [graph, runtime, knowledge, courseState, result.decision, routeControl.view, learningContent, resolveLearningContent]);
  const recommendation = courseActionRecommendation(runtime.course.id, model.relations, actionControl, new Set(knowledge.filter(record => satisfiesTeachingPrerequisite(record.status)).map(record => record.nodeId)));
  const next = model.nextPractice;
  const routeAcquired = model.route.length > 0 && model.route.every(item => item.acquired);
  const hasConfiguredActions = actionControl.actions.some(action => model.relations.some(edge => edge.id === action.edge_id));
  const emptyTitle = routeAcquired ? '当前路线能力已具备' : hasConfiguredActions ? '当前没有可执行行动' : '当前关系尚未配置可执行行动';
  const emptyReason = routeAcquired ? '你可以查看执行记录，或主动选择再次实践。' : hasConfiguredActions ? '可在节点详情查看执行条件；完成行动后仍需依据证据判断能力。' : '可查看节点中的已有学习内容。历史记录仍保留。';
  function practiceRow(item: typeof model.pendingPractices[number]) {
    return <button className="navigator-practice-row" key={item.assignment.id} onClick={() => setDetail(item.assignment)}><strong>{item.assignment.title}</strong><small>{item.status === 'submitted' ? '已提交 · 等待审核' : !item.ready ? '等待前置实训完成' : item.status === 'needs_revision' ? '需要修改' : '待完成'} · 查看任务</small></button>;
  }
  return <div className="course-navigator"><div className="navigator-columns">
    <aside className="navigator-queue" aria-label="课程行动队列">
      <motion.section className="navigator-next" key={recommendation.kind} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .2 }} aria-label="推荐下一步" aria-live="polite">
        <span className="atlas-kicker">推荐下一步</span>
        {showPolicy && result.decision?.recommendationPolicy ? <small>当前推荐策略 · {result.decision.recommendationPolicy === 'fixed' ? 'Fixed' : 'Rule'}</small> : null}
        {!authenticated ? <><h2>登录后继续你的路线</h2><p>为你保留学习进度与实训待办。</p><button className="atlas-primary" onClick={onSignIn}>登录开始学习 <ArrowRight size={16} /></button></> : actionControl.loading || routeControl.busy ? <p role="status">正在读取路线与行动…</p> : recommendation.kind === 'active' ? <><h2>{recommendation.run.execution_snapshot.action.title}</h2><p>{recommendation.outsideRoute ? '这项行动已不在当前路线中，执行记录仍保留。' : '继续你已选择的实施方式。'}</p><button className="atlas-primary" disabled={actionControl.busy} onClick={() => void actionControl.start(recommendation.run)}>继续当前行动 <ArrowRight size={16}/></button></> : recommendation.kind === 'candidate' ? <><h2>{recommendation.recommended.action.title}</h2><p>从已有起点推进下一项能力，按当前执行条件与成本推荐。</p><small><Clock3 size={12}/> {recommendation.recommended.action.estimated_minutes} 分钟</small><button className="atlas-primary" onClick={() => onSelect(recommendation.recommended.edge.source, recommendation.recommended.edge.id)}>{recommendation.alternatives.length > 1 ? '选择实施方式' : '开始实施'} <ArrowRight size={16}/></button></> : <><h2>{emptyTitle}</h2><p>{emptyReason}</p>{onInspectCapabilities ? <button className="atlas-secondary" onClick={() => onInspectCapabilities()}>查看能力关系</button> : null}</>}
        {actionControl.error ? <p role="alert">{actionControl.error}</p> : null}{result.error ? <p role="status">学习进度暂时未同步。<button className="atlas-secondary" onClick={() => setRetry(value => value + 1)}>重试同步</button></p> : null}
      </motion.section>
      <section className="navigator-backlog" aria-label="实训待办"><h2>实训待办 <span>· {authenticated ? model.pendingPractices.length : '—'}</span></h2>
        {!authenticated ? <p>登录后查看你的实训待办。</p> : !model.pendingPractices.length ? <p>{model.courseComplete ? '实训全部完成 ✓' : '暂无实训待办。达到学习条件后，相关任务会出现在这里。'}</p> : <>
          {next ? <div className="navigator-next-practice"><small>下一项实训</small><button onClick={() => setDetail(next.assignment)}><strong>{next.assignment.title}</strong><span>{next.assignment.description}</span>{next.assignment.estimatedMinutes ? <small>{next.assignment.estimatedMinutes} 分钟 · 查看任务</small> : <small>查看任务</small>}</button></div> : <p>待办已保留，等待审核或前置条件满足。</p>}
          {model.pendingPractices.filter(item => item !== next).slice(0, 3).map(practiceRow)}
          {model.pendingPractices.filter(item => item !== next).length > 3 ? <details><summary>查看全部 {model.pendingPractices.length} 项</summary>{model.pendingPractices.filter(item => item !== next).slice(3).map(practiceRow)}</details> : null}
        </>}
      </section>
      <ActionRunHistory runs={actionControl.runs} control={actionControl} courseId={runtime.course.id} acquiredIds={new Set(knowledge.filter(record => satisfiesTeachingPrerequisite(record.status)).map(record => record.nodeId))} title={id => graph.knowledgeNodes.find(node => node.id === id)?.title ?? routeControl.view?.activeVersion?.snapshot.titles[id] ?? id} visibleEdgeIds={new Set(model.relations.map(edge => edge.id))}/>
    </aside>
    {authenticated && (!routeControl.view || routeControl.view.activeVersion?.courseId !== runtime.course.id) ? <p role={routeControl.error ? "alert" : "status"}>{routeControl.error || "正在加载正式个人路线…"}</p> : <CoursePathView model={model} targetOutcome={runtime.course.targetOutcome} onInspectCapabilities={onInspectCapabilities} onSelect={onSelect} />}
    </div>
    {detail ? <dialog ref={dialogRef} className="navigator-practice-detail" aria-label={detail.title} onClose={() => setDetail(null)}><button autoFocus className="atlas-secondary" onClick={() => setDetail(null)}>关闭任务详情</button><h2>{detail.title}</h2><p>{detail.description}</p><h3>任务要求</h3><ul>{detail.requirements.map((text, index) => <li key={index}>{text}</li>)}</ul><h3>交付成果</h3><p>{detail.expectedOutput}</p><h3>验收标准</h3><ul>{detail.acceptanceCriteria.map((text, index) => <li key={index}>{text}</li>)}</ul><p>任务记录已保留；下一步学习安排以行动队列为准。</p>{detailEligibility?.reason && !detailEligibility.viewOnly ? <p role="status">{detailEligibility.reason}</p> : null}<button className="atlas-secondary" disabled={!detailEligibility?.canStart && !detailEligibility?.viewOnly} onClick={() => navigate(`/courses/${encodeURIComponent(runtime.course.id)}/assignments/${encodeURIComponent(detail.id)}`)}>{detailEligibility?.cta}</button></dialog> : null}
  </div>;
}
