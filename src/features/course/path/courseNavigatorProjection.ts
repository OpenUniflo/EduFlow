import type { NavigationDecision } from '@/shared/learning/navigation';
import type { UserKnowledgeRecord } from '@/features/profile/types';
import type { UserCourseState } from '../types';
import type { CourseGraphData, CourseRuntimeData } from '../runtime/courseRuntime';
import { buildCoursePath } from './coursePath';
import { satisfiesTeachingPrerequisite } from '@/shared/learning/teachingPrerequisites';

export type NavigatorLearningContent = { nodeId: string; pathId: string; estimatedMinutes?: number };
export type NavigatorState = 'completed' | 'current' | 'available' | 'locked';
export function pathX(index: number) { return 50 + Math.round(18 * Math.sin(index * Math.PI / 2)); }
export function buildCourseNavigator({ graph, runtime, knowledge, courseState, decision, learningContent = [] }: {
  graph: CourseGraphData; runtime: CourseRuntimeData; knowledge: UserKnowledgeRecord[];
  courseState?: UserCourseState; decision?: NavigationDecision | null; learningContent?: NavigatorLearningContent[];
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
  const learning = action?.resourceKind === 'micro' ? learningContent.find(item => item.nodeId === action.nodeId && item.pathId === action.resourceId) : undefined;
  const current = route.find(item => item.node.id === action?.nodeId);
  const nextAction = learning && current && current.state !== 'locked' ? {
    title: current.node.title,
    reason: action?.reasonCode === 'resume_required_micro' ? '继续上次未完成的学习。' : '你已经完成前置内容，可以继续这一部分。',
    estimatedMinutes: learning.estimatedMinutes && Number.isFinite(learning.estimatedMinutes) && learning.estimatedMinutes > 0 ? learning.estimatedMinutes : undefined,
    cta: '开始学习',
    action: { knowledgeId: learning.nodeId, pathId: learning.pathId },
  } : null;
  const complete = action?.reasonCode === 'course_route_complete' && source.length > 0 && source.every(item => item.navigationState === 'learned' || item.navigationState === 'skipped');
  const remainingPracticeCount = runtime.assignments.filter(item => !accepted(item.id)).length;
  const courseComplete = complete && remainingPracticeCount === 0;
  const emptyState = courseComplete ? { title: '课程已完成', reason: '你已经完成当前课程的全部学习内容与实训。' }
    : complete ? { title: '当前学习内容已完成', reason: `你已经完成当前课程的学习内容。还有 ${remainingPracticeCount} 项实训待完成，可以从下方继续。` }
    : { title: '当前没有可继续的学习内容', reason: `${action?.reasonCode === 'teaching_prerequisite_required' ? '请先完成前置内容，解锁后再继续这一部分。' : '这一学习节点尚未准备可执行学习内容。'}${pendingPractices.length ? `已有的 ${pendingPractices.length} 项实训仍保留在下方。` : ''}` };
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
  return { route, sections, pendingPractices, nextPractice, nextAction, complete, courseComplete, emptyState };
}

export type CourseNavigatorModel = ReturnType<typeof buildCourseNavigator>;
