export const NAVIGATION_POLICY_VERSION = "course-rule-v6" as const;
export type NavigationKnowledgeStatus = "explore" | "mastered" | "learning" | "learned" | "practicing";
export type NavigationActionKind = "skip" | "remediation" | "review" | "practice" | "next";
export type NavigationResourceKind = "micro" | "material" | "assignment" | "course";
export type NavigationAsset = { id: string; nodeId: string; order: number; required?: boolean };
export type NavigationNode = { id: string; title: string; lessonOrder: number; coverageOrder: number };
export type NavigationPathItem = { nodeId: string; title: string; state: "skipped" | "learned" | "underway" | "eligible" | "blocked"; blockedBy: string[] };
export type NavigationNextAction = { kind: NavigationActionKind; nodeId?: string; resourceKind: NavigationResourceKind; resourceId?: string; reasonCode: string; reason: string };
export type NavigationPlan = { policyVersion: typeof NAVIGATION_POLICY_VERSION; courseId: string; path: NavigationPathItem[]; skippedNodeIds: string[]; nextAction: NavigationNextAction };
export type NavigationDecision = NavigationPlan & { decisionId: string; decidedAt: string; recommendationPolicy?: "fixed" | "rule_v1"; recommendationVersion?: string };
export type NavigationEngineInput = {
  courseId: string;
  targetNodeIds: string[];
  /** Server-computed complete route; absent for legacy/default callers. */
  personalRoute?: { orderedNodeIds: string[]; bridgeKnowledgeIds: string[] };
  nodes: NavigationNode[];
  prerequisiteEdges: Array<{ source: string; target: string; strength?: "hard" | "soft" }>;
  knowledgeStatuses: Record<string, NavigationKnowledgeStatus | undefined>;
  microPaths: NavigationAsset[];
  completedMicroPathIds: string[];
  assignments: NavigationAsset[];
  assignmentOutcomes: Record<string, "passed" | "failed" | "pending" | undefined>;
  materials: NavigationAsset[];
};
