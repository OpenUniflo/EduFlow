import { useEffect, useState } from "react";
import type { LearningProgress } from "./types";
import { practices } from "./data";

export const progressStorageKey = "knowledge-atlas-v2-progress";
export const progressEventName = "knowledge-atlas-v2-progress";

const initialProgress: LearningProgress = {
  version: 2,
  completedPracticeIds: [],
  recentMaterialPage: 1,
  updatedAt: new Date(0).toISOString()
};

export function readProgress(): LearningProgress {
  try {
    const raw = window.localStorage.getItem(progressStorageKey);
    if (!raw) return initialProgress;
    const parsed = JSON.parse(raw) as Partial<LearningProgress>;
    if (parsed.version !== 2) return initialProgress;
    return {
      version: 2,
      completedPracticeIds: Array.isArray(parsed.completedPracticeIds) ? parsed.completedPracticeIds : [],
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

export function markPracticeComplete(templateId: string) {
  const practice = practices.find((item) => item.templateId === templateId);
  if (!practice) return;
  const current = readProgress();
  if (current.completedPracticeIds.includes(practice.id)) return;
  writeProgress({
    ...current,
    completedPracticeIds: [...current.completedPracticeIds, practice.id],
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

