import { demoUserCourseStateSeed } from "../demo/user/demoUserCourseState.seed";
import type { UserAssignmentState, UserCourseState, UserMaterialState } from "../types";
import type { LearningProgressRepository } from "./LearningProgressRepository";

const PREFIX = "eduflow:v2:user-course";

export function learningProgressStorageKey(userId: string, courseId: string) {
  return `${PREFIX}:${encodeURIComponent(userId)}:${encodeURIComponent(courseId)}`;
}

export class LocalStorageLearningProgressRepository implements LearningProgressRepository {
  private readonly listeners = new Set<() => void>();
  private readonly cache = new Map<string, UserCourseState>();

  getCourseState(userId: string, courseId: string): UserCourseState {
    const key = learningProgressStorageKey(userId, courseId);
    const cached = this.cache.get(key);
    if (cached) return cached;
    if (typeof window === "undefined") return demoUserCourseStateSeed(userId, courseId);
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as UserCourseState;
        this.cache.set(key, parsed);
        return parsed;
      }
    } catch {
      // Invalid local demo state falls back to the registered seed.
    }
    const seeded = demoUserCourseStateSeed(userId, courseId);
    this.cache.set(key, seeded);
    return seeded;
  }

  private save(state: UserCourseState) {
    this.cache.set(learningProgressStorageKey(state.userId, state.courseId), state);
    if (typeof window !== "undefined") window.localStorage.setItem(learningProgressStorageKey(state.userId, state.courseId), JSON.stringify(state));
    this.listeners.forEach((listener) => listener());
  }

  updateAssignmentState(userId: string, courseId: string, assignmentId: string, state: UserAssignmentState) {
    const current = this.getCourseState(userId, courseId);
    this.save({ ...current, assignmentStates: { ...current.assignmentStates, [assignmentId]: { ...state, assignmentId } }, updatedAt: new Date().toISOString() });
  }

  updateMaterialState(userId: string, courseId: string, materialId: string, state: Partial<UserMaterialState>) {
    const current = this.getCourseState(userId, courseId);
    const previous = current.materialStates[materialId] ?? { materialId, updatedAt: new Date().toISOString() };
    this.save({ ...current, materialStates: { ...current.materialStates, [materialId]: { ...previous, ...state, materialId, updatedAt: state.updatedAt ?? new Date().toISOString() } }, updatedAt: new Date().toISOString() });
  }

  updateMaterialReadingState(userId: string, courseId: string, lessonId: string, materialId: string, state: Partial<UserMaterialState>) {
    const current = this.getCourseState(userId, courseId);
    const now = new Date().toISOString();
    const previous = current.materialStates[materialId] ?? { materialId, updatedAt: now };
    this.save({
      ...current,
      recentLessonId: lessonId,
      materialStates: {
        ...current.materialStates,
        [materialId]: { ...previous, ...state, materialId, updatedAt: state.updatedAt ?? now }
      },
      updatedAt: now
    });
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
}
