import { useEffect, useState } from "react";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import type { HomeNavSignals } from "@/features/home/homeMainline";

const EMPTY: HomeNavSignals = { hasLearningRecord: false, hasPracticeActivity: false, hasFirstSegmentComplete: false };

/**
 * Real learner signals for progressive navigation. Subscriptions are the same
 * durable projections the rest of Home reads, so an entrance appears after the
 * state that justifies it, without a second unlock store.
 */
export function readLearnerNavigationSignals(session: MockSession | null): HomeNavSignals {
  if (!session) return EMPTY;
  const records = applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId);
  const runtimes = applicationServices.courseRepository.listCourseRuntimes();
  const states = runtimes.flatMap((runtime) => {
    try { return [applicationServices.learningProgressRepository.getCourseState(session.userId, runtime.course.id)]; }
    catch { return []; }
  });
  const assignmentStatuses = states.flatMap((state) => Object.values(state.assignmentStates).map((entry) => entry?.status));
  const hasLearningRecord = records.some((record) => record.status !== "explore");
  const hasPracticeActivity = records.some((record) => record.status === "practicing")
    || assignmentStatuses.some((status) => Boolean(status) && status !== "not_started");
  const hasFirstSegmentComplete = assignmentStatuses.some((status) => status === "accepted" || status === "completed");
  return { hasLearningRecord, hasPracticeActivity, hasFirstSegmentComplete };
}

export function useLearnerNavigationSignals(session: MockSession | null): HomeNavSignals {
  const [signals, setSignals] = useState<HomeNavSignals>(() => readLearnerNavigationSignals(session));
  useEffect(() => {
    const update = () => setSignals(readLearnerNavigationSignals(session));
    update();
    const unsubscribers = [
      applicationServices.learningProgressRepository.subscribe(update),
      applicationServices.userKnowledgeRepository.subscribe(update)
    ];
    return () => { for (const unsubscribe of unsubscribers) unsubscribe(); };
  }, [session]);
  return signals;
}
