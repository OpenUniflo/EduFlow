import { describe, expect, it } from "vitest";
import { buildAssistantWorkflowContext } from "./assistantWorkflowContext";

const definition = {
  workflowId: "workflow-1",
  name: "示例流程",
  revision: 3,
  nodes: [
    { id: "start", label: "开始", type: "core.start", typeVersion: 1, config: {} },
    { id: "model", label: "回答", type: "core.llm", typeVersion: 2, config: { providerRef: "p4:owner:provider:1", modelRef: "deepseek-flash", apiKey: "never-return-this", prompt: { system: [{ type: "text", text: "secret prompt" }] } } }
  ]
};

describe("Assistant Workflow context projection", () => {
  it("keeps safe node identity and summaries but never config values or credentials", () => {
    const context = buildAssistantWorkflowContext(definition, undefined, "model");
    expect(context).toMatchObject({ workflowId: "workflow-1", name: "示例流程", nodeCount: 2, truncated: false });
    expect(context?.selectedNode).toMatchObject({ id: "model", type: "core.llm", title: "回答", summary: "deepseek-flash" });
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("never-return-this");
    expect(serialized).not.toContain("secret prompt");
    expect(serialized).not.toContain("p4:owner:provider:1");
  });

  it("includes the latest run status and a safe error summary", () => {
    const context = buildAssistantWorkflowContext(definition, {
      run_id: "run-1",
      status: "failed",
      revision: 3,
      created_at: "2026-11-11T10:00:00Z",
      error: { code: "MODEL_REQUEST_FAILED", message: "provider raw failure", reason: "provider_error" }
    });
    expect(context?.latestRun).toMatchObject({ runId: "run-1", status: "failed", revision: 3, error: { title: "模型请求失败" } });
    expect(JSON.stringify(context)).not.toContain("provider raw failure");
  });

  it("omits a selected node that is not part of the server-read definition", () => {
    expect(buildAssistantWorkflowContext(definition, undefined, "not-in-this-workflow")?.selectedNode).toBeUndefined();
  });
});
