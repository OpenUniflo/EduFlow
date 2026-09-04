import type { CourseRuntimeData } from "@/features/course/runtime/courseRuntime";
import type { UserCourseState } from "@/features/course/types";
import type { MicroLearningPath, MicroLearningRepository, MicroPathProgress } from "@/features/learning/micro/microLearning";
import { resolveKnowledgeMaterialEntries, type KnowledgeMaterialEntry } from "@/features/material/materialNavigation";

export type KnowledgeMaterialResource = KnowledgeMaterialEntry & { courseId: string; courseTitle: string; chapterTitle?: string; lessonTitle?: string };
export type KnowledgeAssignmentResource = { courseId: string; courseTitle: string; assignmentId: string; title: string; status: string };
export type KnowledgeMicroResource = { available: boolean; path: MicroLearningPath | null; source: "course" | "global" | "none"; progressStatus: MicroPathProgress["status"] };
export type StandaloneKnowledgeLearningContext = { kind: "standalone"; id: "standalone"; title: "独立学习"; isActive: false; micro: KnowledgeMicroResource; materials: []; assignments: [] };
export type CourseKnowledgeLearningContext = { kind: "course"; id: string; courseId: string; courseTitle: string; courseType: "standard" | "personal"; updatedAt?: string; sourceGoal?: string; isActive: boolean; chapterTitle?: string; lessonTitle?: string; micro: KnowledgeMicroResource; materials: KnowledgeMaterialResource[]; assignments: KnowledgeAssignmentResource[] };
export type KnowledgeLearningContext = StandaloneKnowledgeLearningContext | CourseKnowledgeLearningContext;
export type KnowledgeLearningResources = { knowledgeId: string; standalone: StandaloneKnowledgeLearningContext; courseContexts: CourseKnowledgeLearningContext[] };

const assignmentPriority: Record<string, number> = { needs_revision: 0, started: 1, "in-progress": 1, submitted: 2, not_started: 3, "not-started": 3, accepted: 4, completed: 4 };

function micro(repository: MicroLearningRepository, knowledgeId: string, courseId?: string): KnowledgeMicroResource {
  const path = repository.getPath(knowledgeId, { courseId, mode: "learn" });
  return { available: Boolean(path), path, source: path?.scope ?? "none", progressStatus: path ? (repository.getPathProgress(path.id)?.status ?? "not_started") : "not_started" };
}

export function projectKnowledgeLearningResources(input: { knowledgeId: string; runtimes: CourseRuntimeData[]; courseStates: UserCourseState[]; microRepository: MicroLearningRepository }): KnowledgeLearningResources {
  const stateByCourse = new Map(input.courseStates.map((state) => [state.courseId, state]));
  const relevant = input.runtimes.filter((runtime) => runtime.course.lifecycle === "published" && runtime.curriculumCoverages.some((coverage) => coverage.nodeId === input.knowledgeId)).sort((left, right) => left.course.title.localeCompare(right.course.title) || left.course.id.localeCompare(right.course.id));
  const courseContexts = relevant.map<CourseKnowledgeLearningContext>((runtime) => {
    const state = stateByCourse.get(runtime.course.id);
    const coverage = [...runtime.curriculumCoverages].filter((item) => item.nodeId === input.knowledgeId).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))[0];
    const lesson = coverage ? runtime.lessons.find((item) => item.id === coverage.lessonId) : undefined;
    const chapter = lesson ? runtime.chapters.find((item) => item.id === lesson.chapterId) : undefined;
    const materials = resolveKnowledgeMaterialEntries(runtime, input.knowledgeId).map((entry) => ({ ...entry, courseId: runtime.course.id, courseTitle: runtime.course.title, lessonTitle: runtime.lessons.find((item) => item.id === entry.lessonId)?.title, chapterTitle: runtime.chapters.find((item) => item.id === runtime.lessons.find((lessonItem) => lessonItem.id === entry.lessonId)?.chapterId)?.title }));
    const assignments = runtime.assignmentCoverages.filter((item) => item.nodeId === input.knowledgeId).flatMap((item) => {
      const assignment = runtime.assignments.find((candidate) => candidate.id === item.assignmentId);
      return assignment ? [{ courseId: runtime.course.id, courseTitle: runtime.course.title, assignmentId: assignment.id, title: assignment.title, status: state?.assignmentStates[assignment.id]?.status ?? "not_started", order: assignment.order }] : [];
    }).sort((left, right) => (assignmentPriority[left.status] ?? 99) - (assignmentPriority[right.status] ?? 99) || left.order - right.order || left.assignmentId.localeCompare(right.assignmentId)).map(({ order: _order, ...assignment }) => assignment);
    return { kind: "course", id: runtime.course.id, courseId: runtime.course.id, courseTitle: runtime.course.title, courseType: runtime.course.courseType ?? "standard", updatedAt: runtime.course.updatedAt, sourceGoal: runtime.course.targetOutcome, isActive: state?.isActive === true, chapterTitle: chapter?.title, lessonTitle: lesson?.title, micro: micro(input.microRepository, input.knowledgeId, runtime.course.id), materials, assignments };
  });
  return { knowledgeId: input.knowledgeId, standalone: { kind: "standalone", id: "standalone", title: "独立学习", isActive: false, micro: micro(input.microRepository, input.knowledgeId), materials: [], assignments: [] }, courseContexts };
}

export function defaultKnowledgeContextId(resources: KnowledgeLearningResources, explicitCourseId?: string) {
  if (explicitCourseId && resources.courseContexts.some((context) => context.courseId === explicitCourseId)) return explicitCourseId;
  const active = resources.courseContexts.filter((context) => context.isActive);
  return active.length === 1 ? active[0].courseId : "standalone";
}

export function resolveKnowledgeLearningContext(resources: KnowledgeLearningResources, contextId: string): KnowledgeLearningContext {
  return resources.courseContexts.find((context) => context.courseId === contextId) ?? resources.standalone;
}
