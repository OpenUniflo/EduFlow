import type { UserAssignmentState, UserCourseState, UserMaterialState } from "@/features/course/types";
import type { LearningProgressRepository } from "./LearningProgressRepository";
import { apiRequest } from "@/shared/api/apiClient";
import { RecoverableWriteQueue } from "@/shared/api/RecoverableWriteQueue";

const now = () => new Date().toISOString();

export class ApiLearningProgressRepository implements LearningProgressRepository {
  private readonly states = new Map<string, UserCourseState>();
  private readonly listeners = new Set<() => void>();
  private readonly writes = new RecoverableWriteQueue();

  hydrate(userId: string, courseIds: string[], states: UserCourseState[]) {
    this.states.clear();
    courseIds.forEach((courseId) => this.states.set(courseId, structuredClone(states.find((state) => state.courseId === courseId) ?? {
      userId, courseId, isActive: false, assignmentStates: {}, materialStates: {}, updatedAt: now()
    })));
    this.emit();
  }

  getCourseState(userId: string, courseId: string) {
    const existing = this.states.get(courseId);
    if (existing) return existing;
    const initial: UserCourseState = { userId, courseId, isActive: false, assignmentStates: {}, materialStates: {}, updatedAt: now() };
    this.states.set(courseId, initial);
    return initial;
  }

  async activateCourse(courseId: string) {
    return this.setMembership(courseId, "activate-course");
  }

  async deactivateCourse(courseId: string) {
    return this.setMembership(courseId, "deactivate-course");
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

  updateMaterialReadingState(userId: string, courseId: string, lessonId: string | undefined, materialId: string, update: Partial<UserMaterialState>) {
    const current = this.getCourseState(userId, courseId);
    const previous = current.materialStates[materialId] ?? { materialId, updatedAt: now() };
    this.persist({ ...current, ...(lessonId ? { recentLessonId: lessonId } : {}), materialStates: { ...current.materialStates, [materialId]: { ...previous, ...update, materialId, updatedAt: update.updatedAt ?? now() } }, updatedAt: now() });
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  flush() {
    return this.writes.flush();
  }

  resetAuthenticatedState() {
    this.writes.cancel();
    this.states.clear();
    this.emit();
  }

  private persist(state: UserCourseState) {
    const activeState = { ...state, isActive: true };
    this.states.set(state.courseId, structuredClone(activeState));
    this.writes.enqueue(() => apiRequest("/api/progress", { method: "PUT", body: JSON.stringify(activeState) }));
    this.emit();
  }

  private async setMembership(courseId: string, action: "activate-course" | "deactivate-course") {
    const result = await apiRequest<{ state: UserCourseState }>("/api/progress", { method: "POST", body: JSON.stringify({ action, courseId }) });
    const current = this.states.get(courseId);
    const merged = { ...current, ...result.state, assignmentStates: current?.assignmentStates ?? result.state.assignmentStates, materialStates: current?.materialStates ?? result.state.materialStates };
    this.states.set(courseId, structuredClone(merged));
    this.emit();
    return merged;
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}
