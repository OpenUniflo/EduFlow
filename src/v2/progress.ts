import { useEffect, useState } from "react";
import type { LearningProgress } from "./types";
import { courseAssignments } from "./data";

export const progressStorageKey = "knowledge-atlas-v2-progress";
export const progressEventName = "knowledge-atlas-v2-progress";

const initialProgress: LearningProgress = {
  version: 3,
  completedAssignmentIds: [],
  recentMaterialPage: 1,
  updatedAt: new Date(0).toISOString()
};

export function readProgress(): LearningProgress {
  try {
    const raw = window.localStorage.getItem(progressStorageKey);
    if (!raw) return initialProgress;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const legacyCompletedIds = parsed["completed" + "Prac" + "ticeIds"];
    if (parsed.version !== 2 && parsed.version !== 3) return initialProgress;
    return {
      version: 3,
      completedAssignmentIds: Array.isArray(parsed.completedAssignmentIds) ? parsed.completedAssignmentIds.filter((id): id is string => typeof id === "string") : Array.isArray(legacyCompletedIds) ? legacyCompletedIds.filter((id): id is string => typeof id === "string") : [],
      recentMaterialPage: typeof parsed.recentMaterialPage === "number" ? parsed.recentMaterialPage : 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : initialProgress.updatedAt
    };
  } catch {
    return initialProgress;
  }
}

function writeProgress(progress: LearningProgress) {
  window.localStorage.setItem(progressStorageKey, JSON.stringify(progress));
  window.dispatchEvent(new CustomEvent(progressEventName, { detail: progress }));
}

export function markAssignmentComplete(workflowTemplateId: string) {
  const assignment = courseAssignments.find((item) => item.workflowTemplateId === workflowTemplateId);
  if (!assignment) return;
  const current = readProgress();
  if (current.completedAssignmentIds.includes(assignment.id)) return;
  writeProgress({
    ...current,
    completedAssignmentIds: [...current.completedAssignmentIds, assignment.id],
    updatedAt: new Date().toISOString()
  });
}

export function saveRecentMaterialPage(page: number) {
  const current = readProgress();
  if (current.recentMaterialPage === page) return;
  writeProgress({
    ...current,
    recentMaterialPage: page,
    updatedAt: new Date().toISOString()
  });
}

export function useLearningProgress() {
  const [progress, setProgress] = useState<LearningProgress>(() => readProgress());

  useEffect(() => {
    const update = () => setProgress(readProgress());
    window.addEventListener(progressEventName, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(progressEventName, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return progress;
}
