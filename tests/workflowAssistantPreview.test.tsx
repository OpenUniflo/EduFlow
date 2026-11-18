import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Workflow Assistant proposal preview", () => {
  it("is clearly marked as sample data and never claims to analyze the open Workflow", () => {
    const sample = read("src/demo/preview/workflow/sampleWorkflowAssistantProposal.ts");
    expect(sample).toContain("示例");
    expect(sample).not.toContain("Hacker News");
    expect(sample).not.toContain("选中");
    const card = read("src/features/workflow/editor/v2/AssistantProposalCard.tsx");
    expect(card).toContain('label="预览 · 示例数据"');
    expect(card).toContain("示例建议 · 不会修改工作流");
    expect(card).toContain("wf-assistant-preview-disabled-note");
    expect(card).not.toContain("nodeLabel");
    expect(card).not.toContain("选中「");
  });

  it("explains a disabled entry visibly instead of relying on a title attribute", () => {
    const editor = read("src/features/workflow/editor/v2/LiveWorkflowEditor.tsx");
    expect(editor).toContain("wf-assistant-preview-note");
    expect(editor).toContain("示例预览尚未接入");
    expect(editor).toContain("disabled={!assistantProposal}");
  });

  it("keeps sample data injected by src/app rather than imported by the Feature", () => {
    expect(read("src/app/services/previewServices.ts")).toContain("sampleWorkflowAssistantProposal");
    expect(read("src/features/workflow/pages/WorkflowV2Entry.tsx")).not.toMatch(/from ["'][^"']*demo\//);
  });
});
