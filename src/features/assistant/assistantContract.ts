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
  structuredContent?: AssistantStructuredContent;
  context: AssistantContextSnapshot;
  createdAt: string;
};

export type CourseSearchTimelineContent = {
  type: "course_search";
  schemaVersion: 1;
  planningId: string;
  goalText: string;
  intentSummary: string;
  refinement?: string;
  refinedFromPlanningId?: string;
  plan: import("@/features/course/goal/goalPlanning").GoalPlan;
};

export type CourseCreationBrief = {
  type: "course_creation_brief";
  schemaVersion: 1;
  briefId: string;
  planningId: string;
  planningMessageId: string;
  goal: string;
  sourceCourseId?: string;
  targetKnowledge: Array<{ id: string; title: string; description: string }>;
  requestedAdjustments?: string;
  referenceMaterialIntent: "none" | "upload_in_creator";
};

export type AssistantStructuredContent = CourseSearchTimelineContent | CourseCreationBrief;

export type AssistantSession = {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantSessionDetail = AssistantSession & { messages: AssistantMessage[] };

function requiredString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Assistant structured content ${key} is invalid`);
  return value.trim();
}

export function parseAssistantStructuredContent(value: unknown): AssistantStructuredContent | undefined {
  if (value == null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Assistant structured content is invalid");
  const source = value as Record<string, unknown>;
  if (source.schemaVersion !== 1) throw new Error("Assistant structured content schema is unsupported");
  if (source.type === "course_search") {
    if (!source.plan || typeof source.plan !== "object" || Array.isArray(source.plan)) throw new Error("Assistant Course Search plan is invalid");
    return {
      type: "course_search", schemaVersion: 1,
      planningId: requiredString(source, "planningId"), goalText: requiredString(source, "goalText"),
      intentSummary: requiredString(source, "intentSummary"),
      ...(typeof source.refinement === "string" && source.refinement.trim() ? { refinement: source.refinement.trim() } : {}),
      ...(typeof source.refinedFromPlanningId === "string" && source.refinedFromPlanningId.trim() ? { refinedFromPlanningId: source.refinedFromPlanningId.trim() } : {}),
      plan: source.plan as CourseSearchTimelineContent["plan"]
    };
  }
  if (source.type === "course_creation_brief") {
    if (!Array.isArray(source.targetKnowledge)) throw new Error("Assistant Course Creation Brief targetKnowledge is invalid");
    const targetKnowledge = source.targetKnowledge.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Assistant Brief Knowledge is invalid");
      const knowledge = item as Record<string, unknown>;
      return { id: requiredString(knowledge, "id"), title: requiredString(knowledge, "title"), description: requiredString(knowledge, "description") };
    });
    if (source.referenceMaterialIntent !== "none" && source.referenceMaterialIntent !== "upload_in_creator") throw new Error("Assistant Brief reference intent is invalid");
    return {
      type: "course_creation_brief", schemaVersion: 1,
      briefId: requiredString(source, "briefId"), planningId: requiredString(source, "planningId"), planningMessageId: requiredString(source, "planningMessageId"), goal: requiredString(source, "goal"),
      ...(typeof source.sourceCourseId === "string" && source.sourceCourseId.trim() ? { sourceCourseId: source.sourceCourseId.trim() } : {}),
      targetKnowledge,
      ...(typeof source.requestedAdjustments === "string" && source.requestedAdjustments.trim() ? { requestedAdjustments: source.requestedAdjustments.trim() } : {}),
      referenceMaterialIntent: source.referenceMaterialIntent
    };
  }
  throw new Error("Assistant structured content type is unsupported");
}

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
