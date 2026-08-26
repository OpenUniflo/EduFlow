export const assistantWorkspaces = ["learning", "explore", "courses", "canvas", "teaching", "system", "material", "messages"] as const;
export type AssistantWorkspace = (typeof assistantWorkspaces)[number];

export type AssistantContextSnapshot = {
  workspace: AssistantWorkspace;
  experienceMode: "learn" | "design";
  courseId?: string;
  chapterId?: string;
  lessonId?: string;
  knowledgeId?: string;
  materialId?: string;
  segmentId?: string;
  assignmentId?: string;
  workflowId?: string;
  runId?: string;
  actionId?: string;
  taskId?: string;
  microPathId?: string;
  microUnitId?: string;
  microStepId?: string;
  selectedObject?: string;
};

export type AssistantMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  context: AssistantContextSnapshot;
  createdAt: string;
};

export type AssistantSession = {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantSessionDetail = AssistantSession & { messages: AssistantMessage[] };

const optionalIdentityKeys = ["courseId", "chapterId", "lessonId", "knowledgeId", "materialId", "segmentId", "assignmentId", "workflowId", "runId", "actionId", "taskId", "microPathId", "microUnitId", "microStepId", "selectedObject"] as const;

export function parseAssistantContext(value: unknown): AssistantContextSnapshot {
  if (!value || typeof value !== "object") throw new Error("Assistant context is required");
  const source = value as Record<string, unknown>;
  if (!assistantWorkspaces.includes(source.workspace as AssistantWorkspace)) throw new Error("Assistant workspace is invalid");
  if (source.experienceMode !== "learn" && source.experienceMode !== "design") throw new Error("Assistant experience mode is invalid");
  const context: AssistantContextSnapshot = { workspace: source.workspace as AssistantWorkspace, experienceMode: source.experienceMode };
  for (const key of optionalIdentityKeys) {
    if (source[key] == null) continue;
    if (typeof source[key] !== "string" || !source[key].trim() || source[key].length > 240) throw new Error(`Assistant context ${key} is invalid`);
    if (key !== "selectedObject" && !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(source[key])) throw new Error(`Assistant context ${key} is invalid`);
    context[key] = source[key].trim();
  }
  return context;
}
