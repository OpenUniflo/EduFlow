import { apiRequest } from "@/shared/api/apiClient";
import type { H5PContentDescriptor, MicroLearningPath, MicroLearningRepository, MicroLearningSubmission, MicroPathProgress, MicroUnitProgress } from "./microLearning";

type Payload = { paths: MicroLearningPath[]; pathProgress: MicroPathProgress[]; unitProgress: MicroUnitProgress[] };

export class ApiMicroLearningRepository implements MicroLearningRepository {
  private paths: MicroLearningPath[] = [];
  private pathProgress = new Map<string, MicroPathProgress>();
  private unitProgress = new Map<string, MicroUnitProgress>();
  private guestCompletedSteps = new Map<string, Set<string>>();
  private userId: string | undefined;
  private listeners = new Set<() => void>();

  async hydrate(userId?: string) {
    this.userId = userId;
    const result = await apiRequest<Payload>("/api/micro");
    this.paths = result.paths;
    this.pathProgress = new Map(result.pathProgress.map((progress) => [progress.pathId, progress]));
    this.unitProgress = new Map(result.unitProgress.map((progress) => [progress.unitId, progress]));
    if (userId) this.guestCompletedSteps.clear();
    this.emit();
  }

  getPath(knowledgeId: string, context: { courseId?: string; mode?: MicroLearningPath["mode"] } = {}) {
    const compatible = this.paths.filter((path) => path.knowledgeId === knowledgeId && (!context.mode || path.mode === context.mode));
    return compatible.find((path) => path.courseId === context.courseId) ?? compatible.find((path) => path.scope === "global") ?? null;
  }

  getLesson(knowledgeId: string, context: { courseId?: string; coverageRole?: string } = {}) {
    const path = this.getPath(knowledgeId, { courseId: context.courseId, mode: "learn" });
    return path ? { id: path.id, knowledgeId: path.knowledgeId, title: path.title, estimatedMinutes: path.estimatedMinutes, mode: path.mode, steps: path.units.flatMap((unit) => unit.steps) } : null;
  }

  listSupportedKnowledgeIds() { return Array.from(new Set(this.paths.map((path) => path.knowledgeId))); }

  getPathProgress(pathId: string) { return this.pathProgress.get(pathId); }
  getUnitProgress(unitId: string) { return this.unitProgress.get(unitId); }

  resetAuthenticatedState() {
    this.userId = undefined;
    this.pathProgress.clear();
    this.unitProgress.clear();
    this.guestCompletedSteps.clear();
    this.emit();
  }

  async start(pathId: string, contextCourseId?: string) {
    if (!this.userId) {
      const path = this.paths.find((item) => item.id === pathId);
      const firstUnit = path?.units[0]; const firstStep = firstUnit?.steps[0]; const now = new Date().toISOString();
      this.pathProgress.set(pathId, { pathId, status: "in_progress", currentUnitId: firstUnit?.id, currentStepId: firstStep?.id, startedAt: now, updatedAt: now });
      this.emit();
      return;
    }
    const result = await apiRequest<{ progress: MicroPathProgress }>("/api/micro", { method: "POST", body: JSON.stringify({ action: "start", pathId, contextCourseId }) });
    this.pathProgress.set(pathId, result.progress);
    this.emit();
  }

  resolveH5PContent(pathId:string,unitId:string,stepId:string,contentRef:string) {
    return apiRequest<H5PContentDescriptor>("/api/micro",{method:"POST",body:JSON.stringify({action:"resolve-h5p",pathId,unitId,stepId,contentRef})});
  }

  async completeStep(pathId: string, unitId: string, stepId: string, submission?: MicroLearningSubmission,contextCourseId?:string) {
    const result = await apiRequest<{ correct: boolean; completed: boolean; pathProgress?: MicroPathProgress }>("/api/micro", { method: "POST", body: JSON.stringify({ action: "complete-step", pathId, unitId, stepId, submission,contextCourseId }) });
    if (!this.userId) {
      if (!result.correct) return { correct: false, completed: false };
      const path = this.paths.find((item) => item.id === pathId); const unit = path?.units.find((item) => item.id === unitId);
      if (!path || !unit) return { correct: true, completed: false };
      const completedSteps = this.guestCompletedSteps.get(unitId) ?? new Set<string>(); completedSteps.add(stepId); this.guestCompletedSteps.set(unitId, completedSteps);
      const unitCompleted = unit.steps.every((step) => completedSteps.has(step.id));
      const nextStep = unit.steps.find((step) => !completedSteps.has(step.id));
      const now = new Date().toISOString(); const previous = this.pathProgress.get(pathId);
      this.unitProgress.set(unitId, { unitId, pathId, status: unitCompleted ? "completed" : "in_progress", currentStepId: nextStep?.id, completedStepIds: [...completedSteps], startedAt: previous?.startedAt ?? now, completedAt: unitCompleted ? now : undefined, updatedAt: now });
      const completedUnitIds = new Set([...this.unitProgress.values()].filter((item) => item.pathId === pathId && item.status === "completed").map((item) => item.unitId));
      const requiredUnits = path.units.filter((item) => item.required); const pathCompleted = requiredUnits.length > 0 && requiredUnits.every((item) => completedUnitIds.has(item.id));
      const nextUnit = path.units.find((item) => !completedUnitIds.has(item.id));
      this.pathProgress.set(pathId, { pathId, status: pathCompleted ? "completed" : "in_progress", currentUnitId: pathCompleted ? undefined : (unitCompleted ? nextUnit?.id : unitId), currentStepId: pathCompleted ? undefined : (unitCompleted ? nextUnit?.steps[0]?.id : nextStep?.id), startedAt: previous?.startedAt ?? now, completedAt: pathCompleted ? now : undefined, updatedAt: now });
      this.emit();
      return { correct: true, completed: pathCompleted };
    }
    if (result.pathProgress) this.pathProgress.set(pathId, result.pathProgress);
    await this.hydrate(this.userId);
    return { correct: result.correct, completed: result.completed };
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit() { this.listeners.forEach((listener) => listener()); }
}
