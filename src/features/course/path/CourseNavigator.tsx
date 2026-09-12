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
import { CoursePathView } from './CoursePathView';

const navigationResponse = z.object({
  courseId: z.string(), path: z.array(z.object({ nodeId: z.string(), title: z.string(), state: z.enum(['skipped','learned','underway','eligible','blocked']), blockedBy: z.array(z.string()) })),
  nextAction: z.object({ kind: z.enum(['skip','remediation','review','practice','next']), resourceKind: z.enum(['micro','material','assignment','course']), nodeId: z.string().optional(), resourceId: z.string().optional(), reason: z.string(), reasonCode: z.string() }),
});

export function CourseNavigator({ graph, runtime, knowledge, courseState, authenticated, loadNavigation, onSelect, onAction, onSignIn, learningContent }: {
  graph: CourseGraphData; runtime: CourseRuntimeData; knowledge: UserKnowledgeRecord[]; courseState?: UserCourseState;
  authenticated: boolean; loadNavigation(courseId: string): Promise<NavigationDecision>;
  onSelect(id: string): void; onAction(action: NonNullable<ReturnType<typeof buildCourseNavigator>['nextAction']>): void;
  onSignIn(): void; learningContent: NavigatorLearningContent[];
}) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [result, setResult] = useState<{ decision?: NavigationDecision; error?: string; loading: boolean }>({ loading: authenticated });
  const [retry, setRetry] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<CourseAssignment | null>(null);
  useEffect(() => { if (detail) dialogRef.current?.showModal(); }, [detail]);
  const detailEligibility = detail ? courseAssignmentEligibility(runtime, detail.id, knowledge, courseState) : null;
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
  }, [authenticated, runtime.course.id, courseState, loadNavigation, retry]);
  const model = useMemo(() => buildCourseNavigator({ graph, runtime, knowledge, courseState, decision: result.decision, learningContent }), [graph, runtime, knowledge, courseState, result.decision, learningContent]);
  const action = model.nextAction;
  const minutes = action?.estimatedMinutes;
  const next = model.nextPractice;
  function practiceRow(item: typeof model.pendingPractices[number]) {
    return <button className="navigator-practice-row" key={item.assignment.id} onClick={() => setDetail(item.assignment)}><strong>{item.assignment.title}</strong><small>{item.status === 'submitted' ? '已提交 · 等待审核' : !item.ready ? '等待前置实训完成' : item.status === 'needs_revision' ? '需要修改' : '待完成'} · 查看任务</small></button>;
  }
  return <div className="course-navigator"><div className="navigator-columns">
    <aside className="navigator-queue" aria-label="课程行动队列">
      <motion.section className="navigator-next" key={action?.action.pathId ?? result.error ?? 'empty'} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .2 }} aria-label="下一步" aria-live="polite">
        <span className="atlas-kicker">下一步</span>
        {!authenticated ? <><h2>登录后继续你的路线</h2><p>为你保留学习进度与实训待办。</p><button className="atlas-primary" onClick={onSignIn}>登录开始学习 <ArrowRight size={16} /></button></> : result.loading ? <p role="status">正在安排下一步…</p> : result.error ? <><p role="alert">{result.error}</p><button className="atlas-secondary" onClick={() => setRetry(value => value + 1)}>重试</button></> : action ? <><h2>{action.title}</h2><p>{action.reason}</p>{minutes ? <small><Clock3 size={12} /> {minutes} 分钟</small> : null}<button className="atlas-primary" onClick={() => onAction(action)}>{action.cta} <ArrowRight size={16} /></button></> : <><h2>{model.emptyState.title}</h2><p>{model.emptyState.reason}</p></>}
      </motion.section>
      <section className="navigator-backlog" aria-label="实训待办"><h2>实训待办 <span>· {authenticated ? model.pendingPractices.length : '—'}</span></h2>
        {!authenticated ? <p>登录后查看你的实训待办。</p> : !model.pendingPractices.length ? <p>{model.courseComplete ? '实训全部完成 ✓' : '暂无实训待办。达到学习条件后，相关任务会出现在这里。'}</p> : <>
          {next ? <div className="navigator-next-practice"><small>下一项实训</small><button onClick={() => setDetail(next.assignment)}><strong>{next.assignment.title}</strong><span>{next.assignment.description}</span>{next.assignment.estimatedMinutes ? <small>{next.assignment.estimatedMinutes} 分钟 · 查看任务</small> : <small>查看任务</small>}</button></div> : <p>待办已保留，等待审核或前置条件满足。</p>}
          {model.pendingPractices.filter(item => item !== next).slice(0, 3).map(practiceRow)}
          {model.pendingPractices.filter(item => item !== next).length > 3 ? <details><summary>查看全部 {model.pendingPractices.length} 项</summary>{model.pendingPractices.filter(item => item !== next).slice(3).map(practiceRow)}</details> : null}
        </>}
      </section>
    </aside>
    <CoursePathView model={model} onSelect={onSelect} />
    </div>
    {detail ? <dialog ref={dialogRef} className="navigator-practice-detail" aria-label={detail.title} onClose={() => setDetail(null)}><button autoFocus className="atlas-secondary" onClick={() => setDetail(null)}>关闭任务详情</button><h2>{detail.title}</h2><p>{detail.description}</p><h3>任务要求</h3><ul>{detail.requirements.map((text, index) => <li key={index}>{text}</li>)}</ul><h3>交付成果</h3><p>{detail.expectedOutput}</p><h3>验收标准</h3><ul>{detail.acceptanceCriteria.map((text, index) => <li key={index}>{text}</li>)}</ul><p>任务记录已保留；下一步学习安排以行动队列为准。</p>{detailEligibility?.reason && !detailEligibility.viewOnly ? <p role="status">{detailEligibility.reason}</p> : null}<button className="atlas-secondary" disabled={!detailEligibility?.canStart && !detailEligibility?.viewOnly} onClick={() => navigate(`/courses/${encodeURIComponent(runtime.course.id)}/assignments/${encodeURIComponent(detail.id)}`)}>{detailEligibility?.cta}</button></dialog> : null}
  </div>;
}
