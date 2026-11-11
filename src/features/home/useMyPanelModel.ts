import { useEffect, useMemo, useState } from "react";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { buildCourseGraphData } from "@/features/course/runtime/courseRuntime";
import { buildCourseNavigator } from "@/features/course/path/courseNavigatorProjection";
import { resolveHomeNextStep } from "@/features/course/path/mainlineNext";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { buildMyCourses, buildMyTaskRows, isMyCourseInProgress, type MyCourseNextStep, type MyCourseOverview, type MyTaskOverview } from "./myPanelProjection";

/** Read-only My overview. Ordering and task selection live in pure projections. */
export function useMyPanelModel(session: MockSession): {
  courses: MyCourseOverview[];
  tasks: MyTaskOverview[];
  recent: ReturnType<typeof applicationServices.userKnowledgeRepository.getUserKnowledge>;
  titles: ReadonlyMap<string, string>;
} {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const unsubscribers = [
      applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1)),
      applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1)),
      applicationServices.microLearningRepository.subscribe(() => setRevision((value) => value + 1))
    ];
    return () => { for (const unsubscribe of unsubscribers) unsubscribe(); };
  }, []);

  const runtimes = useMemo(() => applicationServices.courseRepository.listCourseRuntimes(), [revision]);
  const records = useMemo(() => applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId), [revision, session.userId]);
  const visibleGraph = useMemo(() => applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId)), [revision, session.userId]);
  const courseEntries = useMemo(() => runtimes.map((runtime) => ({
    runtime,
    state: applicationServices.learningProgressRepository.getCourseState(session.userId, runtime.course.id)
  })), [runtimes, revision, session.userId]);
  const learningCourses = useMemo(
    () => courseEntries.filter(({ runtime, state }) => isMyCourseInProgress(runtime, state, records)),
    [courseEntries, records]
  );
  const courseIds = useMemo(() => learningCourses.map(({ runtime }) => runtime.course.id), [learningCourses]);
  const courseIdsKey = courseIds.join("\u0000");
  const [decisions, setDecisions] = useState<ReadonlyMap<string, NavigationDecision | null>>(() => new Map());

  useEffect(() => {
    if (!courseIds.length) { setDecisions(new Map()); return; }
    let live = true;
    void Promise.all(courseIds.map(async (courseId) => {
      const decision = await applicationServices.learnerStateService.getNavigation(courseId).catch(() => null);
      return [courseId, decision] as const;
    })).then((entries) => { if (live) setDecisions(new Map(entries)); });
    return () => { live = false; };
  }, [courseIdsKey, revision]);

  const titles = useMemo(() => {
    const map = new Map(visibleGraph.nodes.map((node) => [node.id, node.title]));
    for (const record of records) {
      const path = runtimes.map((runtime) => applicationServices.microLearningRepository.getPath(record.nodeId, { courseId: runtime.course.id, mode: "learn" })).find(Boolean)
        ?? applicationServices.microLearningRepository.getPath(record.nodeId, { mode: "learn" });
      if (path) map.set(record.nodeId, path.title);
    }
    return map;
  }, [records, runtimes, visibleGraph]);

  const routing = useMemo(() => {
    const nextStepByCourse = new Map<string, MyCourseNextStep>();
    const nextAssignmentByCourse = new Map<string, string>();
    for (const { runtime, state } of learningCourses) {
      const courseId = runtime.course.id;
      const decision = decisions.get(courseId) ?? null;
      const validDecision = decision?.courseId === courseId ? decision : null;
      if (validDecision) {
        const action = validDecision.nextAction;
        const micro = action.resourceKind === "micro" && action.nodeId
          ? applicationServices.microLearningRepository.getPath(action.nodeId, {
              courseId,
              mode: "learn",
              ...(action.resourceId ? { pathId: action.resourceId } : {})
            })
          : undefined;
        const step = resolveHomeNextStep({
          decision: validDecision,
          runtime,
          ...(micro ? { microTitle: micro.title, microMinutes: micro.estimatedMinutes } : {})
        });
        if (step) {
          const title = step.kind === "material"
            ? runtime.materials.find((material) => material.id === action.resourceId)?.title ?? step.title
            : step.title;
          nextStepByCourse.set(courseId, { kind: step.kind === "practice" ? "assignment" : step.kind, title });
        }
      }
      try {
        const navigator = buildCourseNavigator({
          graph: buildCourseGraphData(runtime, state, visibleGraph, records),
          runtime,
          knowledge: records,
          courseState: state,
          ...(validDecision ? { decision: validDecision } : {})
        });
        if (navigator.nextPractice) {
          nextAssignmentByCourse.set(courseId, navigator.nextPractice.assignment.id);
          if (!nextStepByCourse.has(courseId)) {
            nextStepByCourse.set(courseId, { kind: "assignment", title: navigator.nextPractice.assignment.title });
          }
        }
      } catch {
        // An incomplete Course route must not take the whole My panel down.
      }
    }
    return { nextStepByCourse, nextAssignmentByCourse };
  }, [decisions, learningCourses, records, visibleGraph]);

  const courses = useMemo(() => buildMyCourses({
    courses: learningCourses,
    records,
    nextStepByCourse: routing.nextStepByCourse
  }), [learningCourses, records, routing.nextStepByCourse]);

  const draftAssignmentKeys = useMemo(() => {
    const keys = new Set<string>();
    if (typeof window === "undefined") return keys;
    try {
      for (const runtime of runtimes) {
        for (const assignment of runtime.assignments) {
          const storageKey = `eduflow.practice-draft:${session.userId}:${runtime.course.id}:${assignment.id}`;
          if (window.sessionStorage.getItem(storageKey) || window.localStorage.getItem(storageKey)) {
            keys.add(`${runtime.course.id}:${assignment.id}`);
          }
        }
      }
    } catch {
      // A blocked storage API only hides draft-only tasks; durable states still show.
    }
    return keys;
  }, [runtimes, session.userId]);

  const tasks = useMemo(() => buildMyTaskRows({
    courses: learningCourses.map(({ runtime, state }) => ({
      runtime,
      state,
      nextAssignmentId: routing.nextAssignmentByCourse.get(runtime.course.id) ?? null
    })),
    draftAssignmentKeys
  }), [draftAssignmentKeys, learningCourses, routing.nextAssignmentByCourse]);

  const recent = useMemo(() => [...records]
    .filter((record) => record.status !== "explore")
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")), [records]);

  return { courses, tasks, recent, titles };
}
