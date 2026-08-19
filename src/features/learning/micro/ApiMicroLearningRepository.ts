import { apiRequest } from "@/shared/api/apiClient";
import type { MicroLearningPath, MicroLearningRepository, MicroLearningAnswer, MicroPathProgress, MicroUnitProgress } from "./microLearning";

type Payload = { paths: MicroLearningPath[]; pathProgress: MicroPathProgress[]; unitProgress: MicroUnitProgress[] };

export class ApiMicroLearningRepository implements MicroLearningRepository {
  private paths: MicroLearningPath[] = [];
  private pathProgress = new Map<string, MicroPathProgress>();
  private unitProgress = new Map<string, MicroUnitProgress>();
  private listeners = new Set<() => void>();

  async hydrate(_userId: string) {
    const result = await apiRequest<Payload>("/api/micro");
    this.paths = result.paths;
    this.pathProgress = new Map(result.pathProgress.map((progress) => [progress.pathId, progress]));
    this.unitProgress = new Map(result.unitProgress.map((progress) => [progress.unitId, progress]));
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

  async start(pathId: string) {
    const result = await apiRequest<{ progress: MicroPathProgress }>("/api/micro", { method: "POST", body: JSON.stringify({ action: "start", pathId }) });
    this.pathProgress.set(pathId, result.progress);
    this.emit();
  }

  async completeStep(pathId: string, unitId: string, stepId: string, answer?: MicroLearningAnswer) {
    const result = await apiRequest<{ correct: boolean; completed: boolean; pathProgress?: MicroPathProgress }>("/api/micro", { method: "POST", body: JSON.stringify({ action: "complete-step", pathId, unitId, stepId, answer }) });
    if (result.pathProgress) this.pathProgress.set(pathId, result.pathProgress);
    await this.hydrate("");
    return { correct: result.correct, completed: result.completed };
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit() { this.listeners.forEach((listener) => listener()); }
}
