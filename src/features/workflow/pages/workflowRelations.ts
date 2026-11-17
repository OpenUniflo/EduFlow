import type { WorkflowReferenceBlock, WorkflowReferenceItem, WorkflowReferenceTargetInfo } from "../domain/v2/types";

/**
 * Presentation-only grouping for the Works relationship detail. It never
 * resolves permissions or revisions itself: the API already read only the
 * authenticated owner's Workflows and returned each pinned revision.
 */
export type ReferenceTargetGroup = {
  workflowId: string;
  items: WorkflowReferenceItem[];
};

export type DirectCallerGroup = {
  sourceWorkflowId: string;
  sourceRevision: number;
  sourceName: string;
  items: WorkflowReferenceBlock[];
};

export type ReferenceTargetStatus = {
  label: string;
  tone: "ok" | "warn" | "quiet";
  openable: boolean;
};

export function relationSummaryText(relations: { referenceWorkflows: number; referencedByWorkflows: number } | undefined): string {
  if (!relations) return "查看引用关系";
  return `引用 ${relations.referenceWorkflows} 个工作流 · 被 ${relations.referencedByWorkflows} 个工作流引用`;
}

export function referencePathLabel(graphPath: readonly string[]): string {
  return graphPath.length ? `内嵌路径 ${graphPath.join(" / ")}` : "根图";
}

export function referenceTargetStatus(target: WorkflowReferenceTargetInfo): ReferenceTargetStatus {
  if (!target.available) {
    if (target.reason === "archived") return { label: `固定版本 ${target.revision} · 目标已归档`, tone: "warn", openable: false };
    return { label: `固定版本 ${target.revision} · 版本不可用`, tone: "warn", openable: false };
  }
  if (target.currentRevision === target.revision) return { label: `固定版本 ${target.revision} · 当前版本`, tone: "ok", openable: true };
  return {
    label: target.currentRevision ? `固定版本 ${target.revision} · 目标当前版本 ${target.currentRevision}` : `固定版本 ${target.revision} · 旧版本`,
    tone: "quiet",
    openable: true,
  };
}

export function targetDisplayName(target: Pick<WorkflowReferenceTargetInfo, "name" | "workflowId">): string {
  return target.name?.trim() || "目标工作流不可用";
}

export function groupReferenceItems(items: readonly WorkflowReferenceItem[]): ReferenceTargetGroup[] {
  const groups = new Map<string, ReferenceTargetGroup>();
  for (const item of items) {
    const key = `${item.target.workflowId}\u0000${item.target.revision}`;
    const group = groups.get(key) ?? { workflowId: item.target.workflowId, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => {
    const leftName = targetDisplayName(left.items[0].target);
    const rightName = targetDisplayName(right.items[0].target);
    return leftName.localeCompare(rightName, "zh-CN") || left.workflowId.localeCompare(right.workflowId);
  });
}

/** A direct caller has a current source revision and a one-hop chain. */
export function isDirectReference(block: WorkflowReferenceBlock): boolean {
  return block.sourceCurrent !== false && block.chain.length <= 2 && block.sourceWorkflowId === block.rootWorkflowId;
}

export function directCallerGroups(blocks: readonly WorkflowReferenceBlock[]): DirectCallerGroup[] {
  const groups = new Map<string, DirectCallerGroup>();
  for (const block of blocks.filter(isDirectReference)) {
    const key = `${block.sourceWorkflowId}\u0000${block.sourceRevision}`;
    const group = groups.get(key) ?? {
      sourceWorkflowId: block.sourceWorkflowId,
      sourceRevision: block.sourceRevision,
      sourceName: block.sourceName?.trim() || "来源工作流不可用",
      items: [],
    };
    group.items.push(block);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.sourceName.localeCompare(right.sourceName, "zh-CN") || left.sourceWorkflowId.localeCompare(right.sourceWorkflowId));
}

export function indirectReferenceBlocks(blocks: readonly WorkflowReferenceBlock[]): WorkflowReferenceBlock[] {
  return blocks.filter(block => !isDirectReference(block)).sort((left, right) => {
    const leftName = left.chainNames.join(" / ");
    const rightName = right.chainNames.join(" / ");
    return leftName.localeCompare(rightName, "zh-CN") || left.targetRevision - right.targetRevision || left.nodeId.localeCompare(right.nodeId);
  });
}

export function referencedByCounts(blocks: readonly WorkflowReferenceBlock[]) {
  const direct = blocks.filter(isDirectReference);
  const indirect = blocks.filter(block => !isDirectReference(block));
  return {
    directWorkflows: new Set(direct.map(block => block.sourceWorkflowId)).size,
    directCallSites: direct.length,
    indirectRoots: new Set(indirect.map(block => block.rootWorkflowId)).size,
    indirectCallSites: indirect.length,
  };
}
