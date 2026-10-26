import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Extensions } from "./FunctionExecutionFields";
import { createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import type { WorkflowEnvironment } from "../../domain/v2/types";

const catalog = vi.hoisted(() => ({
  data: {
    functions: [],
    reducers: [],
    runtime: { available: {}, limits: {} },
    connections: [
      { connectionKey: "p4:owner-uuid:hn_community_question:2", ref: "hn_community_question", version: 2, disabled: false, hasCredential: true, content: { type: "http", name: "课程问答连接", baseUrl: "https://api.example.com", path: "/question" } },
    ],
  } as unknown as Extensions,
  error: "",
  refresh: () => undefined,
}));

vi.mock("./FunctionExecutionFields", () => ({ useExtensions: () => catalog }));

import { EnvironmentPanel, connectionDisplayName } from "./EnvironmentPanel";

const environment: WorkflowEnvironment = { environmentRef: "local", environmentRevision: "1", name: "本机", capabilities: [], providers: [], connectors: [] };

function definitionWith(ref: string) {
  const definition = createWorkflowV2("资源展示");
  const model = createNodeV2("core.llm", "model");
  model.config = { ...model.config, providerRef: ref, modelRef: "deepseek-chat" };
  definition.nodes = [model];
  return definition;
}

describe("EnvironmentPanel connection labels", () => {
  it("shows the catalog connection name and version instead of the internal ref", () => {
    const html = renderToStaticMarkup(createElement(EnvironmentPanel, { definition: definitionWith("p4:owner-uuid:hn_community_question:2"), environment, tools: [], locked: false, onApplyBindings: vi.fn(), onOpenResourceCenter: vi.fn() }));
    expect(html).toContain("课程问答连接 · v2");
    expect(html).not.toContain("owner-uuid");
    expect(html).not.toContain("p4:owner-uuid:hn_community_question:2");
  });

  it("falls back to the logical name segment and version when the catalog has no match", () => {
    expect(connectionDisplayName("p4:owner-uuid:hn_community_question:2", [])).toBe("hn_community_question · v2");
    expect(connectionDisplayName("platform-provider", [])).toBe("platform-provider");
  });
});
