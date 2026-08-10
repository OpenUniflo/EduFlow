import type { UserAssignmentState, UserCourseState, UserMaterialState } from "../types";
import type { LearningProgressRepository, UserCourseStateFactory } from "./LearningProgressRepository";

const PREFIX = "eduflow:v2:user-course";
export const LEARNING_PROGRESS_SCHEMA_VERSION = 1;

export type PersistedUserCourseStateEnvelope = {
  schemaVersion: typeof LEARNING_PROGRESS_SCHEMA_VERSION;
  state: UserCourseState;
};

export function learningProgressStorageKey(userId: string, courseId: string) {
  return `${PREFIX}:${encodeURIComponent(userId)}:${encodeURIComponent(courseId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isValidProgress(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function isValidUserCourseState(value: unknown, expectedUserId?: string, expectedCourseId?: string): value is UserCourseState {
  if (!isRecord(value)
    || typeof value.userId !== "string"
    || typeof value.courseId !== "string"
    || typeof value.updatedAt !== "string"
    || !isRecord(value.assignmentStates)
    || !isRecord(value.materialStates)
    || (value.recentLessonId !== undefined && typeof value.recentLessonId !== "string")
    || (expectedUserId !== undefined && value.userId !== expectedUserId)
    || (expectedCourseId !== undefined && value.courseId !== expectedCourseId)) return false;

  const assignmentsValid = Object.entries(value.assignmentStates).every(([key, state]) => isRecord(state)
    && state.assignmentId === key
    && ["not-started", "in-progress", "completed"].includes(String(state.status))
    && (state.progress === undefined || isValidProgress(state.progress)));
  const materialsValid = Object.entries(value.materialStates).every(([key, state]) => isRecord(state)
    && state.materialId === key
    && typeof state.updatedAt === "string"
    && (state.recentSegmentId === undefined || typeof state.recentSegmentId === "string")
    && (state.viewedSegmentIds === undefined || isStringArray(state.viewedSegmentIds))
    && (state.completedSegmentIds === undefined || isStringArray(state.completedSegmentIds))
    && (state.progress === undefined || isValidProgress(state.progress)));
  return assignmentsValid && materialsValid;
}

export function migrateLearningProgress(raw: unknown, userId: string, courseId: string): UserCourseState | null {
  if (isRecord(raw) && raw.schemaVersion === LEARNING_PROGRESS_SCHEMA_VERSION && isValidUserCourseState(raw.state, userId, courseId)) return raw.state;
  if (isValidUserCourseState(raw, userId, courseId)) return raw;
  return null;
}

function envelope(state: UserCourseState): PersistedUserCourseStateEnvelope {
  return { schemaVersion: LEARNING_PROGRESS_SCHEMA_VERSION, state };
}

export class LocalStorageLearningProgressRepository implements LearningProgressRepository {
  private readonly listeners = new Set<() => void>();
  private readonly cache = new Map<string, UserCourseState>();

  constructor(private readonly createInitialState: UserCourseStateFactory) {}

  private initialState(userId: string, courseId: string) {
    const state = this.createInitialState(userId, courseId);
    if (!isValidUserCourseState(state, userId, courseId)) throw new Error(`Initial learning progress is invalid for ${userId}/${courseId}`);
    return state;
  }

  getCourseState(userId: string, courseId: string): UserCourseState {
    const key = learningProgressStorageKey(userId, courseId);
    const cached = this.cache.get(key);
    if (cached) return cached;
    if (typeof window === "undefined") {
      const initial = this.initialState(userId, courseId);
      this.cache.set(key, initial);
      return initial;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const state = migrateLearningProgress(JSON.parse(raw), userId, courseId);
        if (state) {
          this.cache.set(key, state);
          window.localStorage.setItem(key, JSON.stringify(envelope(state)));
          return state;
        }
      }
    } catch {
      // Invalid local state falls back to the injected initial-state factory.
    }
    const initial = this.initialState(userId, courseId);
    this.cache.set(key, initial);
    return initial;
  }

  private save(state: UserCourseState) {
    const { userId, courseId } = state;
    if (!isValidUserCourseState(state, userId, courseId)) throw new Error(`Learning progress is invalid for ${userId}/${courseId}`);
    this.cache.set(learningProgressStorageKey(state.userId, state.courseId), state);
    if (typeof window !== "undefined") window.localStorage.setItem(learningProgressStorageKey(state.userId, state.courseId), JSON.stringify(envelope(state)));
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
