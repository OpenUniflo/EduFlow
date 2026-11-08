import { useEffect, useMemo, useState } from "react";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import { isCourseVisibleToViewer } from "@/features/course/runtime/courseVisibility";
import { useDomainGovernance } from "@/features/knowledge/domain/domainStore";
import { globalKnowledgeAccess, userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { buildArchiveModel, type ArchiveModel } from "./atlasModel";

/**
 * The Archive page's graph/model loading path, shared with the Home knowledge
 * panel so both read the same user-visible graph and learner state.
 */
export function useArchiveModelData(session: MockSession | null, refreshToken = 0) {
  const governance = useDomainGovernance();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const unsubscribers = [
      applicationServices.userKnowledgeRepository.subscribe(() => setRevision((value) => value + 1)),
      applicationServices.learningProgressRepository.subscribe(() => setRevision((value) => value + 1)),
      applicationServices.microLearningRepository.subscribe(() => setRevision((value) => value + 1))
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);
  const runtimes = useMemo(() => {
    try {
      return applicationServices.courseRepository.listCourseRuntimes().filter((runtime) => isCourseVisibleToViewer(runtime.course, session?.userId));
    } catch {
      return [];
    }
  }, [revision, refreshToken, session?.userId]);
  const courseStates = useMemo(() => {
    if (!session) return new Map();
    return new Map(runtimes.map((runtime) => [runtime.course.id, applicationServices.learningProgressRepository.getCourseState(session.userId, runtime.course.id)]));
  }, [refreshToken, revision, runtimes, session]);
  const graph = useMemo(() => session
    ? applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId))
    : applicationServices.knowledgeRepository.getVisibleGraph(globalKnowledgeAccess), [refreshToken, revision, session]);
  const records = useMemo(() => session ? applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId) : [], [refreshToken, revision, session]);
  const built = useMemo(() => {
    try {
      return { model: buildArchiveModel({ graph, governance, runtimes, records, courseStates }) };
    } catch (error) {
      return { model: null, error };
    }
  }, [courseStates, governance, graph, records, runtimes]);
  return { governance, revision, runtimes, courseStates, graph, records, model: built.model as ArchiveModel | null, error: built.error };
}
