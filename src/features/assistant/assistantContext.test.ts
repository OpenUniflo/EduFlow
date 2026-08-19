import { describe, expect, it } from "vitest";
import { resolveAssistantCapabilities } from "./assistantContext";

describe("EduFlow Assistant capability resolver", () => {
  it("never exposes design mutation in Learn mode", () => {
    const capabilities = resolveAssistantCapabilities({ workspace:"courses", experienceMode:"learn", userRole:"admin", capabilities:["global-domain-admin"] });
    expect(capabilities.canExplain).toBe(true);
    expect(capabilities.canStartMicroLesson).toBe(true);
    expect(capabilities.canEditCurriculum).toBe(false);
    expect(capabilities.canApplyMutation).toBe(false);
    expect(capabilities.canPublish).toBe(false);
  });

  it("exposes validated design actions to a capable teacher in Design mode", () => {
    const capabilities = resolveAssistantCapabilities({ workspace:"courses", experienceMode:"design", userRole:"teacher", capabilities:[] });
    expect(capabilities.canEditCurriculum).toBe(true);
    expect(capabilities.canPreviewMutation).toBe(true);
    expect(capabilities.canApplyMutation).toBe(true);
    expect(capabilities.canPublish).toBe(true);
  });
});
