export type LearningWorkspaceKind = "micro" | "practice";

/** True only when the open side panel is the same Micro path shown in the conversation. */
export function isMicroPathInWorkspace(workspace: { kind: "micro"; pathId: string } | { kind: "practice" } | null, pathId?: string) {
  return Boolean(pathId && workspace?.kind === "micro" && workspace.pathId === pathId);
}

/** The URL parameter that owns the currently open workspace. */
export function workspaceParamFor(workspace: { kind: LearningWorkspaceKind } | null): LearningWorkspaceKind | null {
  return workspace?.kind ?? null;
}

/** Remove only the workspace parameter, preserving panel and every other parameter. */
export function removeWorkspaceParam(params: URLSearchParams, kind: LearningWorkspaceKind) {
  const next = new URLSearchParams(params);
  next.delete(kind);
  return next;
}

/** Opening My closes the workspace in the same navigation. */
export function openPanelParams(params: URLSearchParams, workspaceKind?: LearningWorkspaceKind | null) {
  const next = workspaceKind ? removeWorkspaceParam(params, workspaceKind) : new URLSearchParams(params);
  next.set("panel", "1");
  return next;
}

/** Opening a workspace closes My in the same navigation. */
export function openWorkspaceParams(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.delete("panel");
  return next;
}
