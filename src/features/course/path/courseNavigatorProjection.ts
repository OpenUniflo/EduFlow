import { orderRouteNodes, type CapabilityRelation } from '@/shared/learning/routePlanning';
import type { RoutePlanView } from '@/shared/learning/routeVersion';
import { executionRelations } from '@/shared/learning/routeExecution';
import type { NavigationDecision } from '@/shared/learning/navigation';
import type { UserKnowledgeRecord } from '@/features/profile/types';
import type { UserCourseState } from '../types';
import type { CourseGraphData, CourseRuntimeData } from '../runtime/courseRuntime';
import { buildCoursePath } from './coursePath';
import { courseAssignmentEligibility } from '../assignmentExperience';
import { satisfiesTeachingPrerequisite } from '@/shared/learning/teachingPrerequisites';

export type NavigatorLearningContent = { nodeId: string; pathId: string; estimatedMinutes?: number };
export type NavigatorState = 'completed' | 'current' | 'available' | 'locked';
export function buildCourseNavigator({ graph, runtime, knowledge, courseState, decision, routeView, supportEdges, learningContent = [] }: {
  supportEdges?: readonly CapabilityRelation[]; routeView?: RoutePlanView | null; graph: CourseGraphData; runtime: CourseRuntimeData; knowledge: UserKnowledgeRecord[];
  courseState?: UserCourseState; decision?: NavigationDecision | null; learningContent?: NavigatorLearningContent[];
}) {
  const validDecision = decision?.courseId === runtime.course.id ? decision : null;
  const fallback = buildCoursePath(graph, knowledge);
  const byId = new Map(fallback.map(item => [item.node.id, item]));
  const source: Array<{
    node: { id: string; title: string; chapterId?: string; status?: string };
    state: typeof fallback[number]['state']; blockedBy: string[];
    navigationState?: NavigationDecision['path'][number]['state']; bridge: boolean;
  }> = validDecision ? validDecision.path.map(item => {
    const local = byId.get(item.nodeId);
    return { node: local?.node ?? { id: item.nodeId, title: item.title },
      state: local?.state ?? 'available', navigationState: item.state, blockedBy: item.blockedBy, bridge: !local };
  }) : fallback.map(item => ({ ...item, navigationState: undefined, bridge: false }));
  const validRouteView = routeView?.activeVersion?.courseId === runtime.course.id ? routeView : null;
  const selectedRoute = validRouteView?.plan.valid ? validRouteView.plan.route : null;
  const rawRouteSource = selectedRoute ? selectedRoute.orderedNodeIds.flatMap(id => {
    const existing = source.find(item => item.node.id === id);
    return existing ? [existing] : [{ node: { id, title: validRouteView?.activeVersion?.snapshot.titles[id] ?? id }, state: 'available' as const, blockedBy: [], navigationState: undefined, bridge: !byId.has(id) }];
  }) : validRouteView && !validRouteView.plan.valid ? [] : source;
  const members = new Set(rawRouteSource.map(item => item.node.id));
  const relations: CapabilityRelation[] = selectedRoute ? executionRelations({...selectedRoute,executionSteps:validRouteView?.activeVersion?.snapshot.executionSteps}, supportEdges ?? validRouteView?.model?.supportEdges ?? []) : graph.knowledgeEdges
    .flatMap((edge): CapabilityRelation[] => edge.relation === 'prerequisite' ? [{ ...edge, relation: 'prerequisite' }] : edge.relation === 'enables' ? [{ ...edge, relation: 'enables' }] : [])
    .filter(edge => members.has(edge.source) && members.has(edge.target)).sort((a, b) => a.id.localeCompare(b.id));
  const fallbackRank = new Map(rawRouteSource.map((item, index) => [item.node.id, index]));
  const fallbackOrder = selectedRoute ? selectedRoute.orderedNodeIds : orderRouteNodes(members, relations.filter(edge => edge.relation === 'prerequisite'), (a, b) => fallbackRank.get(a)! - fallbackRank.get(b)!);
  const routeSource = fallbackOrder.flatMap(id => rawRouteSource.filter(item => item.node.id === id));
  const action = validDecision?.nextAction;
  const knowledgeById = new Map(knowledge.map(record => [record.nodeId, record]));
  const route = routeSource.map(item => {
    const completed = item.navigationState ? ['skipped', 'learned'].includes(item.navigationState) : ['completed', 'learned'].includes(item.state);
    const missing = selectedRoute?.prerequisiteEdges.filter(edge => edge.target === item.node.id && edge.strength === 'hard' && !satisfiesTeachingPrerequisite(knowledgeById.get(edge.source)?.status)) ?? [];
    const locked = selectedRoute ? !satisfiesTeachingPrerequisite(knowledgeById.get(item.node.id)?.status) && missing.length > 0 : item.navigationState ? item.navigationState === 'blocked' : item.state === 'blocked';
    const state: NavigatorState = action?.nodeId === item.node.id && !locked ? 'current' : completed ? 'completed' : locked ? 'locked' : 'available';
    const status = knowledgeById.get(item.node.id)?.status;
    return { ...item, blockedBy: selectedRoute ? missing.map(edge => routeSource.find(row => row.node.id === edge.source)?.node.title ?? edge.source) : item.blockedBy, state, acquired: satisfiesTeachingPrerequisite(status), mastered: status === 'mastered' };
  });
  const ranks = new Map(route.map((item, index) => [item.node.id, index]));
  const accepted = (id: string) => ['accepted', 'completed'].includes(courseState?.assignmentStates[id]?.status ?? '');
  const pendingPractices = runtime.assignments.flatMap(assignment => {
    if (accepted(assignment.id)) return [];
    const ids = runtime.assignmentCoverages.filter(c => c.assignmentId === assignment.id).map(c => c.nodeId);
    const status = courseState?.assignmentStates[assignment.id]?.status ?? 'not_started';
    const started = !['not_started', 'not-started'].includes(status);
    const eligibility = courseAssignmentEligibility(runtime, assignment.id, knowledge, courseState);
    const eligible = eligibility.knowledgeReady;
    // Once begun, a debt remains visible even if today's route/scope changes.
    if (!eligible && !started) return [];
    return [{ assignment, status, eligibility, ready: eligibility.canStart, rank: Math.max(-1, ...ids.map(id => ranks.get(id) ?? Number.MAX_SAFE_INTEGER)) }];
  }).sort((a, b) => a.rank - b.rank || a.assignment.order - b.assignment.order || a.assignment.id.localeCompare(b.assignment.id));
  const nextPractice = pendingPractices.find(item => item.ready) ?? null;
  const learning = action?.resourceKind === 'micro' ? learningContent.find(item => item.nodeId === action.nodeId && item.pathId === action.resourceId) : undefined;
  const current = route.find(item => item.node.id === action?.nodeId);
  const nextAction = learning && current && current.state !== 'locked' ? {
    title: current.node.title,
    reason: action?.reasonCode === 'criterion_insufficient' ? '你最近在这一能力检查中未通过，先补强相关内容。'
      : action?.reasonCode === 'resume_required_micro' ? '按当前课程顺序，继续上次未完成的学习。'
      : action?.reasonCode === 'begin_required_micro' ? '按当前课程顺序继续学习。' : action?.reason ?? '',
    estimatedMinutes: learning.estimatedMinutes && Number.isFinite(learning.estimatedMinutes) && learning.estimatedMinutes > 0 ? learning.estimatedMinutes : undefined,
    cta: '开始学习',
    action: { knowledgeId: learning.nodeId, pathId: learning.pathId },
  } : null;
  const complete = action?.reasonCode === 'course_route_complete' && source.length > 0 && source.every(item => item.navigationState === 'learned' || item.navigationState === 'skipped');
  const remainingPracticeCount = runtime.assignments.filter(item => !accepted(item.id)).length;
  const courseComplete = complete && remainingPracticeCount === 0;
  const emptyState = action?.reasonCode === 'course_route_empty' ? { title: '当前路线没有待达成项目目标', reason: '可以在项目能力模型中调整路线；已完成的学习和实训记录仍然保留。' } : courseComplete ? { title: '课程已完成', reason: '你已经完成当前课程的全部学习内容与实训。' }
    : complete ? { title: '当前学习内容已完成', reason: `你已经完成当前课程的学习内容。还有 ${remainingPracticeCount} 项实训待完成，可以从下方继续。` }
    : { title: action?.reasonCode === 'learning_content_unavailable' && current ? `下一步能力：${current.node.title}` : '当前没有可继续的学习内容', reason: `${action?.reasonCode === 'teaching_prerequisite_required' ? '请先完成前置内容，解锁后再继续这一部分。' : '路线按教学顺序保留这一能力，目前尚无可执行微学习。可返回项目能力模型检查关系上是否有可执行行动；未配置的关系暂不可执行。'}${pendingPractices.length ? `已有的 ${pendingPractices.length} 项实训仍保留在下方。` : ''}` };
  // Preserve navigation sequence; chapter headers mark transitions without reordering it.
  const sections: Array<{ id: string; title: string; bridge: boolean; items: typeof route }> = [];
  route.forEach(item => {
    const chapterId = item.node.chapterId ?? 'supplemental-prerequisites';
    let section = sections[sections.length - 1];
    if (!section || section.id !== chapterId) {
      section = { id: chapterId, bridge: item.bridge, title: item.bridge ? '补充前置能力' : graph.chapters.find(chapter => chapter.id === chapterId)?.title ?? '课程路线', items: [] };
      sections.push(section);
    }
    section.items.push(item);
  });
  const recentRecords = knowledge.flatMap(record => {
    const item = route.find(item => item.node.id === record.nodeId && item.acquired);
    const updatedAt = Date.parse(record.updatedAt ?? '');
    return item && Number.isFinite(updatedAt) ? [{ nodeId: record.nodeId, title: item.node.title, updatedAt }] : [];
  });
  const latestUpdate = Math.max(...recentRecords.map(item => item.updatedAt));
  const recentKnowledgeUpdates = recentRecords.filter(item => item.updatedAt === latestUpdate).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  return { courseId: runtime.course.id, route, relations, sections, recentKnowledgeUpdates, pendingPractices, nextPractice, nextAction, complete, courseComplete, emptyState };
}

export type CourseNavigatorModel = ReturnType<typeof buildCourseNavigator>;
