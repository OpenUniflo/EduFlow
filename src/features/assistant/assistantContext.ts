import type { UserCapability, UserRole } from "@/features/auth/types";
import type { AssistantContextSnapshot, AssistantWorkspace } from "./assistantContract";

export type { AssistantWorkspace } from "./assistantContract";
export type AssistantExperienceMode = "learn" | "design";

export type AssistantContext = AssistantContextSnapshot & {
  userRole: UserRole;
  capabilities: UserCapability[];
};

export function snapshotAssistantContext(context: AssistantContext): AssistantContextSnapshot {
  const { userRole: _userRole, capabilities: _capabilities, ...snapshot } = context;
  return snapshot;
}

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
