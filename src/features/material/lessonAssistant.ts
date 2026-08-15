import type { Material, MaterialSegment } from "@/features/course/types";

export type LessonAssistantAction = { id: string; label: string };
export type LessonMutation = { id: string; segment: MaterialSegment };
export type LessonAssistantResult = { message: string; mutation?: LessonMutation; fallback?: boolean };

export interface LessonAssistantProvider {
  listActions(material: Material): LessonAssistantAction[];
  resolveAction(material: Material, actionId: string): LessonAssistantResult;
  resolveText(material: Material, input: string): LessonAssistantResult;
}
