import { useEffect, useMemo, useState } from "react";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import type { NavigationDecision } from "@/shared/learning/navigation";
import { buildHomeCourseProjection, type HomeCourseProjection } from "./courseLearnerProjection";

/** One read-only Course projection for a panel hosted outside Home. */
export function useCourseProjection(session: MockSession, courseId: string | null): {
  runtime: ReturnType<typeof applicationServices.courseRepository.getCourse> | null;
  projection: HomeCourseProjection | null;
  decision: NavigationDecision | null;
} {
  const [revision, setRevision] = useState(0);
  const [decision, setDecision] = useState<NavigationDecision | null>(null);
  useEffect(() => {
    const unsubscribe = [
      applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1)),
      applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1)),
      applicationServices.microLearningRepository.subscribe(() => setRevision((value) => value + 1))
    ];
    return () => { for (const item of unsubscribe) item(); };
  }, []);
  const runtime = courseId ? applicationServices.courseRepository.getCourse(courseId) : null;
  const records = useMemo(() => applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId), [revision, session.userId]);
  const courseState = courseId ? applicationServices.learningProgressRepository.getCourseState(session.userId, courseId) : undefined;
  const graphTitles = useMemo(() => new Map(applicationServices.knowledgeRepository.getVisibleGraph({ visibleScopes: ["global", "tenant", "user"], userId: session.userId }).nodes.map((node) => [node.id, node.title])), [revision, session.userId]);
  useEffect(() => {
    if (!courseId) { setDecision(null); return; }
    let live = true;
    void applicationServices.learnerStateService.getNavigation(courseId).then((value) => { if (live) setDecision(value); }).catch(() => { if (live) setDecision(null); });
    return () => { live = false; };
  }, [courseId, revision]);
  const projection = useMemo(() => {
    if (!runtime || !courseState) return null;
    return buildHomeCourseProjection({
      runtime,
      records,
      courseState,
      ...(decision ? { decision } : {}),
      microFor: (nodeId) => {
        const path = applicationServices.microLearningRepository.getPath(nodeId, { courseId: runtime.course.id, mode: "learn" });
        return path ? { pathId: path.id, title: path.title, estimatedMinutes: path.estimatedMinutes } : undefined;
      },
      titleFor: (nodeId) => graphTitles.get(nodeId)
    });
  }, [courseState, decision, graphTitles, records, runtime]);
  return { runtime, projection, decision };
}
