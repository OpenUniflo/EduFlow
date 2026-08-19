import type { UserCapability, UserRole } from "@/features/auth/types";

export type AssistantWorkspace = "learning" | "explore" | "courses" | "canvas" | "teaching" | "system" | "material";
export type AssistantExperienceMode = "learn" | "design";

export type AssistantContext = {
  workspace: AssistantWorkspace;
  experienceMode: AssistantExperienceMode;
  userRole: UserRole;
  capabilities: UserCapability[];
  courseId?: string;
  chapterId?: string;
  knowledgeId?: string;
  materialId?: string;
  segmentId?: string;
  assignmentId?: string;
  workflowId?: string;
  runId?: string;
  selectedObject?: string;
};

export type AssistantCapabilities = {
  canExplain: boolean;
  canRecommend: boolean;
  canStartMicroLesson: boolean;
  canEditCurriculum: boolean;
  canEditMaterial: boolean;
  canPreviewMutation: boolean;
  canApplyMutation: boolean;
  canPublish: boolean;
};

function canDesign(role: UserRole, capabilities: UserCapability[]) {
  return role === "teacher" || role === "admin" || capabilities.includes("global-domain-admin");
}

export function resolveAssistantCapabilities(context: AssistantContext): AssistantCapabilities {
  const designAllowed = context.experienceMode === "design" && canDesign(context.userRole, context.capabilities);
  return {
    canExplain: true,
    canRecommend: true,
    canStartMicroLesson: context.experienceMode === "learn" && ["learning", "explore", "courses", "material"].includes(context.workspace),
    canEditCurriculum: designAllowed && ["courses", "teaching"].includes(context.workspace),
    canEditMaterial: designAllowed && ["material", "teaching"].includes(context.workspace),
    canPreviewMutation: designAllowed && ["courses", "material", "teaching"].includes(context.workspace),
    canApplyMutation: designAllowed && ["courses", "material", "teaching"].includes(context.workspace),
    canPublish: designAllowed && ["courses", "teaching"].includes(context.workspace)
  };
}
