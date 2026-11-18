import { describe, expect, it } from "vitest";
import { referenceBreadcrumb, referenceChildAncestors, referenceOverlayKey } from "./referenceNavigation";

describe("fixed reference editor navigation", () => {
  it("builds a root-to-current trail without duplicating the current Workflow", () => {
    const root = referenceChildAncestors({ ancestors: undefined, workflowId: "root", workflowName: "父流程", revision: 2, viaNodeLabel: "调用目标" });
    expect(root).toEqual([{ workflowId: "root", workflowName: "父流程", revision: 2, viaNodeLabel: "调用目标" }]);
    const nested = referenceChildAncestors({ ancestors: root, workflowId: "target", workflowName: "目标流程", revision: 5, viaNodeLabel: "再调用" });
    expect(nested.map(entry => entry.workflowName)).toEqual(["父流程", "目标流程"]);
  });

  it("shows the call path and the pinned revision in the breadcrumb", () => {
    const parts = referenceBreadcrumb({
      ancestors: [
        { workflowId: "root", workflowName: "父流程", revision: 2, viaNodeLabel: "调用目标" },
        { workflowId: "target", workflowName: "目标流程", revision: 5, viaNodeLabel: "再调用" },
      ],
      currentName: "叶子流程",
      currentRevision: 3,
      pinnedRevision: 2,
    });
    expect(parts.map(part => part.label)).toEqual([
      "父流程 · 版本 2", "调用目标", "目标流程 · 版本 5", "再调用", "叶子流程 · 版本 3", "父引用固定版本 2",
    ]);
    expect(parts[parts.length - 1]).toEqual({ kind: "revision", label: "父引用固定版本 2" });
  });

  it("keys overlays by target and exact calling node so parallel callers stay distinct", () => {
    const base = { workflowId: "target", revision: 3, environmentRef: "local", caller: { workflowId: "root", revision: 1, nodeId: "call_a", nodeLabel: "A", graphPath: [] } };
    const other = { ...base, caller: { ...base.caller, nodeId: "call_b" } };
    const otherEnvironment = { ...base, environmentRef: "local-alt" };
    expect(referenceOverlayKey(base)).not.toBe(referenceOverlayKey(other));
    expect(referenceOverlayKey(base)).not.toBe(referenceOverlayKey(otherEnvironment));
    expect(referenceOverlayKey(base)).toContain("call_a");
  });
});
