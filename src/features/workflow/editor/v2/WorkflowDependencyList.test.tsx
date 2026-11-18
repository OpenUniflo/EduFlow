import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkflowReferenceBlock } from "../../domain/v2/types";
import { WorkflowDependencyList } from "./WorkflowDependencyList";

function block(overrides: Partial<WorkflowReferenceBlock> = {}): WorkflowReferenceBlock {
  return {
    rootWorkflowId: "root", rootRevision: 1, rootName: "根流程",
    sourceWorkflowId: "root", sourceRevision: 1, sourceName: "来源流程",
    sourceCurrent: true, nodeId: "call", nodeLabel: "调用节点", graphPath: [],
    targetWorkflowId: "target", targetRevision: 1, targetName: "目标流程",
    chain: ["root:1", "target:1"], chainNames: ["根流程", "目标流程"],
    ...overrides,
  };
}

function render(value: WorkflowReferenceBlock): string {
  return renderToStaticMarkup(createElement(WorkflowDependencyList, { blocks: [value] }));
}

describe("delete and archive dependency wording", () => {
  it("calls an all-current multi-hop chain an indirect dependency without inventing an old revision", () => {
    const html = render(block({ indirect: true, sourceCurrent: true, chain: ["root:1", "middle:1", "target:1"], chainNames: ["根流程", "中间流程", "目标流程"] }));
    expect(html).toContain("间接依赖");
    expect(html).not.toContain("经固定旧版本");
    expect(html).not.toContain("最后来源修订");
    expect(html).not.toContain("已不是当前版本");
  });

  it("marks only sourceCurrent=false as a non-current last source revision", () => {
    const html = render(block({ sourceCurrent: false, sourceRevision: 4, chain: ["root:1", "target:1"], chainNames: ["根流程", "目标流程"] }));
    expect(html).toContain("最后来源修订 4 已不是当前版本");
    expect(html).not.toContain("经固定旧版本");
  });

  it("keeps a current direct reference labelled as direct", () => {
    const html = render(block({ sourceCurrent: true }));
    expect(html).toContain("当前直接引用");
    expect(html).not.toContain("最后来源修订");
  });
});
