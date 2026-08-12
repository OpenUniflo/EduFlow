import type { UserAssignmentState, UserCourseState, UserMaterialState } from "@/features/course/types";
import type { LearningProgressRepository } from "./LearningProgressRepository";
import { apiRequest } from "@/shared/api/apiClient";

const now = () => new Date().toISOString();

export class ApiLearningProgressRepository implements LearningProgressRepository {
  private readonly states = new Map<string, UserCourseState>();
  private readonly listeners = new Set<() => void>();
  private pending: Promise<unknown> = Promise.resolve();

  hydrate(userId: string, courseIds: string[], states: UserCourseState[]) {
    this.states.clear();
    courseIds.forEach((courseId) => this.states.set(courseId, structuredClone(states.find((state) => state.courseId === courseId) ?? {
      userId, courseId, assignmentStates: {}, materialStates: {}, updatedAt: now()
    })));
    this.emit();
  }

  getCourseState(userId: string, courseId: string) {
    const existing = this.states.get(courseId);
    if (existing) return existing;
    const initial: UserCourseState = { userId, courseId, assignmentStates: {}, materialStates: {}, updatedAt: now() };
    this.states.set(courseId, initial);
    return initial;
  }

  updateAssignmentState(userId: string, courseId: string, assignmentId: string, assignment: UserAssignmentState) {
    const current = this.getCourseState(userId, courseId);
    this.persist({ ...current, assignmentStates: { ...current.assignmentStates, [assignmentId]: { ...assignment, assignmentId } }, updatedAt: now() });
  }

  updateMaterialState(userId: string, courseId: string, materialId: string, update: Partial<UserMaterialState>) {
    const current = this.getCourseState(userId, courseId);
    const previous = current.materialStates[materialId] ?? { materialId, updatedAt: now() };
    this.persist({ ...current, materialStates: { ...current.materialStates, [materialId]: { ...previous, ...update, materialId, updatedAt: update.updatedAt ?? now() } }, updatedAt: now() });
  }

  updateMaterialReadingState(userId: string, courseId: string, lessonId: string, materialId: string, update: Partial<UserMaterialState>) {
    const current = this.getCourseState(userId, courseId);
    const previous = current.materialStates[materialId] ?? { materialId, updatedAt: now() };
    this.persist({ ...current, recentLessonId: lessonId, materialStates: { ...current.materialStates, [materialId]: { ...previous, ...update, materialId, updatedAt: update.updatedAt ?? now() } }, updatedAt: now() });
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  flush() {
    return this.pending;
  }

  private persist(state: UserCourseState) {
    this.states.set(state.courseId, structuredClone(state));
    this.pending = this.pending.then(() => apiRequest("/api/progress", { method: "PUT", body: JSON.stringify(state) }));
    this.emit();
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}
