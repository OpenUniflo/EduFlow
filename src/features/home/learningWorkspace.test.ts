import { describe, expect, it } from "vitest";
import { isMicroPathInWorkspace, openPanelParams, openWorkspaceParams, removeWorkspaceParam, workspaceParamFor } from "./learningWorkspace";

describe("isMicroPathInWorkspace", () => {
  it("hides the conversation copy only for the same open micro path", () => {
    expect(isMicroPathInWorkspace({ kind: "micro", pathId: "path-1" }, "path-1")).toBe(true);
    expect(isMicroPathInWorkspace({ kind: "micro", pathId: "path-1" }, "path-2")).toBe(false);
    expect(isMicroPathInWorkspace({ kind: "practice" }, "path-1")).toBe(false);
    expect(isMicroPathInWorkspace(null, "path-1")).toBe(false);
  });
});

describe("workspaceParamFor", () => {
  it("maps the workspace kind to its URL parameter", () => {
    expect(workspaceParamFor({ kind: "micro" })).toBe("micro");
    expect(workspaceParamFor({ kind: "practice" })).toBe("practice");
    expect(workspaceParamFor(null)).toBeNull();
  });
});

describe("removeWorkspaceParam", () => {
  it("removes only the closed workspace parameter and keeps the others", () => {
    const params = new URLSearchParams("panel=1&micro=A02%3Apath%3Acourse&view=tree");
    const next = removeWorkspaceParam(params, "micro");
    expect(next.get("micro")).toBeNull();
    expect(next.get("panel")).toBe("1");
    expect(next.get("view")).toBe("tree");
  });

  it("does not mutate the input parameters", () => {
    const params = new URLSearchParams("practice=course%3Aassignment");
    removeWorkspaceParam(params, "practice");
    expect(params.get("practice")).toBe("course:assignment");
  });
});

describe("panel / workspace mutual exclusion", () => {
  it("opens My and removes the workspace parameter together", () => {
    const next = openPanelParams(new URLSearchParams("panel=0&micro=A02%3Apath%3Acourse&view=tree"), "micro");
    expect(next.get("panel")).toBe("1");
    expect(next.get("micro")).toBeNull();
    expect(next.get("view")).toBe("tree");
  });

  it("opens a workspace and removes My", () => {
    const next = openWorkspaceParams(new URLSearchParams("panel=1&view=tree"));
    expect(next.get("panel")).toBeNull();
    expect(next.get("view")).toBe("tree");
  });

  it("does not mutate the current parameters", () => {
    const params = new URLSearchParams("panel=1&practice=course%3Aassignment");
    openPanelParams(params, "practice");
    openWorkspaceParams(params);
    expect(params.get("panel")).toBe("1");
    expect(params.get("practice")).toBe("course:assignment");
  });
});
