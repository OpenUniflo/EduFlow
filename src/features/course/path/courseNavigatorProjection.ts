import type { NavigationDecision } from '@/shared/learning/navigation';
import type { UserKnowledgeRecord } from '@/features/profile/types';
import type { CourseAssignment, UserCourseState } from '../types';
import type { CourseGraphData, CourseRuntimeData } from '../runtime/courseRuntime';
import { buildCoursePath } from './coursePath';
import { satisfiesTeachingPrerequisite } from '@/shared/learning/teachingPrerequisites';

export type NavigatorState = 'completed' | 'current' | 'available' | 'locked';
export function pathX(index: number) { return 50 + Math.round(18 * Math.sin(index * Math.PI / 2)); }
export function buildCourseNavigator({ graph, runtime, knowledge, courseState, decision }: {
  graph: CourseGraphData; runtime: CourseRuntimeData; knowledge: UserKnowledgeRecord[];
  courseState?: UserCourseState; decision?: NavigationDecision | null;
}) {
  const validDecision = decision?.courseId === runtime.course.id ? decision : null;
  const fallback = buildCoursePath(graph, knowledge);
  const byId = new Map(fallback.map(item => [item.node.id, item]));
  const source = validDecision ? validDecision.path.flatMap(item => {
    const local = byId.get(item.nodeId);
    return local ? [{ ...local, navigationState: item.state, blockedBy: item.blockedBy }] : [];
  }) : fallback.map(item => ({ ...item, navigationState: undefined }));
  const action = validDecision?.nextAction;
  const route = source.map(item => {
    const completed = item.navigationState ? ['skipped', 'learned'].includes(item.navigationState) : ['completed', 'learned'].includes(item.state);
    const locked = item.navigationState ? item.navigationState === 'blocked' : item.state === 'blocked';
    const state: NavigatorState = action?.nodeId === item.node.id && !locked ? 'current' : completed ? 'completed' : locked ? 'locked' : 'available';
    return { ...item, state, mastered: item.navigationState === 'skipped' || item.node.status === 'completed' };
  });
  const ranks = new Map(route.map((item, index) => [item.node.id, index]));
  const statuses = new Map(knowledge.map(item => [item.nodeId, item.status]));
  const accepted = (id: string) => ['accepted', 'completed'].includes(courseState?.assignmentStates[id]?.status ?? '');
  const pendingPractices = runtime.assignments.flatMap(assignment => {
    if (accepted(assignment.id)) return [];
    const ids = runtime.assignmentCoverages.filter(c => c.assignmentId === assignment.id).map(c => c.nodeId);
    const status = courseState?.assignmentStates[assignment.id]?.status ?? 'not_started';
    const started = !['not_started', 'not-started'].includes(status);
    const eligible = ids.length > 0 && ids.every(id => ranks.has(id) && satisfiesTeachingPrerequisite(statuses.get(id)));
    // Once begun, a debt remains visible even if today's route/scope changes.
    if (!eligible && !started) return [];
    const dependenciesReady = runtime.assignmentDependencies.filter(d => d.targetAssignmentId === assignment.id).every(d => accepted(d.sourceAssignmentId));
    return [{ assignment, status, ready: eligible && dependenciesReady && status !== 'submitted', rank: Math.max(-1, ...ids.map(id => ranks.get(id) ?? Number.MAX_SAFE_INTEGER)) }];
  }).sort((a, b) => a.rank - b.rank || a.assignment.order - b.assignment.order || a.assignment.id.localeCompare(b.assignment.id));
  const nextPractice = pendingPractices.find(item => item.ready) ?? null;
  const assignment = action?.resourceKind === 'assignment' ? runtime.assignments.find(item => item.id === action.resourceId) : undefined;
  const executablePractice = assignment && pendingPractices.some(item => item.assignment.id === assignment.id && item.ready) && canExecutePractice(assignment);
  const nextAction = action && action.resourceKind !== 'course' && (action.resourceKind !== 'assignment' || executablePractice) ? {
    ...action,
    reason: action.reasonCode === 'begin_required_micro' ? '从这一小节开始，逐步理解新的知识。' : action.reasonCode === 'resume_required_micro' ? '接着上次的进度，完成这一节微学习。' : action.reasonCode === 'material_learning_available' ? '先阅读这份相关材料，继续理解当前知识。' : action.reason,
    title: assignment?.title ?? route.find(item => item.node.id === action.nodeId)?.node.title ?? '',
    label: action.resourceKind === 'micro' ? '微学习' : action.resourceKind === 'material' ? '学习材料' : '实训',
    cta: action.resourceKind === 'micro' ? '开始学习' : action.resourceKind === 'material' ? '阅读材料' : '开始实训',
  } : null;
  // Preserve navigation sequence; chapter headers mark transitions without reordering it.
  const sections: Array<{ id: string; title: string; items: typeof route }> = [];
  route.forEach(item => {
    const chapterId = item.node.chapterId;
    let section = sections[sections.length - 1];
    if (!section || section.id !== chapterId) {
      section = { id: chapterId, title: graph.chapters.find(chapter => chapter.id === chapterId)?.title ?? '课程路线', items: [] };
      sections.push(section);
    }
    section.items.push(item);
  });
  return { route, sections, pendingPractices, nextPractice, nextAction, complete: action?.reasonCode === 'course_route_complete', notice: action?.reason ?? null };
}

export function canExecutePractice(assignment: CourseAssignment) {
  return assignment.mode !== 'workflow' && assignment.experience?.type !== 'workflow';
}
export type CourseNavigatorModel = ReturnType<typeof buildCourseNavigator>;
