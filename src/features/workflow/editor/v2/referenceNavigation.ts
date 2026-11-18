/**
 * Presentation-only navigation context for opening a fixed-reference target in
 * the editor. It lives in React state for one editor session; it is never a
 * Workflow parent field, a route identity or an authorization claim. The target
 * API still resolves the owner and exact revision from the authenticated user.
 */

export type ReferenceCaller = {
  workflowId: string;
  revision: number;
  nodeId: string;
  nodeLabel: string;
  /** Path of embedded graphs inside the caller Workflow, e.g. ["team_graph"]. */
  graphPath: string[];
};

/** One Workflow on the way down from the independent root to the current target. */
export type ReferenceTrailEntry = {
  workflowId: string;
  workflowName: string;
  revision: number;
  /** Node in this Workflow that opened the next target. */
  viaNodeLabel?: string;
};

export type ReferenceOpenRequest = {
  workflowId: string;
  revision: number;
  environmentRef: string;
  caller: ReferenceCaller;
  ancestors: ReferenceTrailEntry[];
};

/** Context a reference target editor receives from its loader. */
export type ReferenceEditorContext = {
  ancestors: ReferenceTrailEntry[];
  caller: ReferenceCaller;
  /** Revision frozen in the caller's node config. */
  pinnedRevision: number;
  /** Current head of the target, when known. */
  latestRevision: number;
  /** The overlay is showing an older pinned snapshot read-only. */
  pinnedReadOnly: boolean;
  /** The target head is archived; this reference cannot run. */
  archived?: boolean;
  /** Explicit user action; absent when the pinned revision is already current. */
  onEditLatest?: () => void;
};

export type ReferenceBreadcrumbPart = {
  kind: "workflow" | "node" | "revision";
  label: string;
};

/** Trail passed to a nested target; the current Workflow becomes an ancestor. */
export function referenceChildAncestors(args: {
  ancestors: readonly ReferenceTrailEntry[] | undefined;
  workflowId: string;
  workflowName: string;
  revision: number;
  viaNodeLabel: string;
}): ReferenceTrailEntry[] {
  return [
    ...(args.ancestors ?? []),
    { workflowId: args.workflowId, workflowName: args.workflowName, revision: args.revision, viaNodeLabel: args.viaNodeLabel },
  ];
}

/**
 * Breadcrumb for the reference target editor. It always starts at the
 * independent root and never fabricates a parent when there is no local trail
 * (a direct URL load has no context at all).
 */
export function referenceBreadcrumb(args: {
  ancestors: readonly ReferenceTrailEntry[] | undefined;
  currentName: string;
  currentRevision: number;
  pinnedRevision: number;
}): ReferenceBreadcrumbPart[] {
  const parts: ReferenceBreadcrumbPart[] = [];
  for (const ancestor of args.ancestors ?? []) {
    parts.push({ kind: "workflow", label: `${ancestor.workflowName} · 版本 ${ancestor.revision}` });
    if (ancestor.viaNodeLabel) parts.push({ kind: "node", label: ancestor.viaNodeLabel });
  }
  parts.push({ kind: "workflow", label: `${args.currentName} · 版本 ${args.currentRevision}` });
  parts.push({ kind: "revision", label: `父引用固定版本 ${args.pinnedRevision}` });
  return parts;
}

/** Stable key for the one active target overlay of an editor session. */
export function referenceOverlayKey(request: Pick<ReferenceOpenRequest, "workflowId" | "revision" | "environmentRef" | "caller">): string {
  return `${request.workflowId}@${request.revision}@${request.environmentRef}|${request.caller.workflowId}@${request.caller.revision}|${request.caller.graphPath.join("/")}|${request.caller.nodeId}`;
}
