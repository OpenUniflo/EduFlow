import type { CourseTargetKnowledge } from "../types";
import type { KnowledgeEdge, KnowledgeNode } from "@/features/knowledge/types";

export type GoalKnowledge = Pick<KnowledgeNode, "id" | "title" | "description">;
export type GoalKnowledgeCandidate = GoalKnowledge & Pick<KnowledgeNode, "status" | "tags">;

export type GoalResolutionResult = {
  status: "ready" | "needs_clarification" | "no_match";
  goalText: string;
  targetKnowledge: GoalKnowledge[];
  candidates: GoalKnowledge[];
  reason?: string;
};

export type PrerequisiteClosure = {
  prerequisiteKnowledgeIds: string[];
  cycleDetected: boolean;
  cycleNodeIds: string[];
};

export type CourseMatchLevel = "high" | "medium" | "low";
export type CourseMatch = {
  courseId: string;
  courseTitle: string;
  courseType: "standard" | "personal";
  targetCoverage: number;
  requiredCoverage: number;
  scopePrecision: number;
  missingTargetKnowledgeIds: string[];
  missingPrerequisiteKnowledgeIds: string[];
  extraKnowledgeIds: string[];
  level: CourseMatchLevel;
  recommendation: "use_existing" | "customize" | "create_personal";
};

export type MatchableCourse = {
  id: string;
  title: string;
  lifecycle: "draft" | "published" | "archived";
  courseType: "standard" | "personal";
  coveredKnowledgeIds: string[];
};

export type GoalPlan = {
  resolution: GoalResolutionResult;
  prerequisiteKnowledge: GoalKnowledge[];
  prerequisiteCycleDetected: boolean;
  matches: CourseMatch[];
};

function knowledge(value: GoalKnowledgeCandidate): GoalKnowledge {
  return { id: value.id, title: value.title, description: value.description };
}

/**
 * Product-owned Goal resolution. A language adapter may suggest IDs, but every
 * identity is revalidated against the caller-visible active Knowledge set.
 */
export function resolveGoalToKnowledge(input: { goalText: string; visibleNodes: GoalKnowledgeCandidate[]; suggestedKnowledgeIds?: string[] }): GoalResolutionResult {
  const goalText = input.goalText.trim();
  const nodes = input.visibleNodes.filter((node) => node.status === "active");
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const suggested = [...new Set(input.suggestedKnowledgeIds ?? [])];
  if (suggested.length) {
    const invalid = suggested.filter((id) => !byId.has(id));
    if (invalid.length) return { status: "no_match", goalText, targetKnowledge: [], candidates: [], reason: `Suggested Knowledge is unavailable: ${invalid.join(", ")}` };
    return { status: "ready", goalText, targetKnowledge: suggested.map((id) => knowledge(byId.get(id)!)), candidates: [] };
  }

  return { status: "no_match", goalText, targetKnowledge: [], candidates: [], reason: "No validated Knowledge target is available for this Goal." };
}

export function noMatchGoalPlan(goalText: string, reason: string): GoalPlan {
  return {
    resolution: { status: "no_match", goalText: goalText.trim(), targetKnowledge: [], candidates: [], reason },
    prerequisiteKnowledge: [],
    prerequisiteCycleDetected: false,
    matches: []
  };
}

/** prerequisite edges are directed source prerequisite -> target dependent. */
export function computePrerequisiteClosure(targetKnowledgeIds: string[], edges: KnowledgeEdge[]): PrerequisiteClosure {
  const targets = new Set(targetKnowledgeIds);
  const prerequisitesByTarget = new Map<string, string[]>();
  edges.filter((edge) => edge.relation === "prerequisite").forEach((edge) => prerequisitesByTarget.set(edge.target, [...(prerequisitesByTarget.get(edge.target) ?? []), edge.source]));
  prerequisitesByTarget.forEach((ids) => ids.sort((left, right) => left.localeCompare(right)));
  const state = new Map<string, "visiting" | "visited">();
  const ordered: string[] = [];
  const cycleNodes = new Set<string>();

  function visit(nodeId: string, path: string[]) {
    if (state.get(nodeId) === "visited") return;
    if (state.get(nodeId) === "visiting") {
      const start = path.indexOf(nodeId);
      (start >= 0 ? path.slice(start) : [nodeId]).forEach((id) => cycleNodes.add(id));
      cycleNodes.add(nodeId);
      return;
    }
    state.set(nodeId, "visiting");
    for (const prerequisiteId of prerequisitesByTarget.get(nodeId) ?? []) visit(prerequisiteId, [...path, nodeId]);
    state.set(nodeId, "visited");
    if (!targets.has(nodeId) && !ordered.includes(nodeId)) ordered.push(nodeId);
  }

  [...targets].sort((left, right) => left.localeCompare(right)).forEach((id) => visit(id, []));
  return { prerequisiteKnowledgeIds: ordered, cycleDetected: cycleNodes.size > 0, cycleNodeIds: [...cycleNodes].sort((left, right) => left.localeCompare(right)) };
}

function ratio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

export function matchCoursesToGoal(input: { targetKnowledgeIds: string[]; prerequisiteKnowledgeIds: string[]; courses: MatchableCourse[] }): CourseMatch[] {
  const targetIds = [...new Set(input.targetKnowledgeIds)].sort();
  const prerequisiteIds = [...new Set(input.prerequisiteKnowledgeIds)].filter((id) => !targetIds.includes(id)).sort();
  const requiredIds = [...new Set([...targetIds, ...prerequisiteIds])];
  return input.courses.filter((course) => course.lifecycle === "published").map((course) => {
    const covered = new Set(course.coveredKnowledgeIds);
    const missingTargetKnowledgeIds = targetIds.filter((id) => !covered.has(id));
    const missingPrerequisiteKnowledgeIds = prerequisiteIds.filter((id) => !covered.has(id));
    const targetCoverage = ratio(targetIds.length - missingTargetKnowledgeIds.length, targetIds.length);
    const requiredCoverage = ratio(requiredIds.filter((id) => covered.has(id)).length, requiredIds.length);
    const extraKnowledgeIds = [...covered].filter((id) => !requiredIds.includes(id)).sort();
    const scopePrecision = ratio(requiredIds.filter((id) => covered.has(id)).length, covered.size);
    const level: CourseMatchLevel = targetCoverage === 1 && requiredCoverage >= 0.8 && scopePrecision >= 0.5
      ? "high"
      : targetCoverage >= 0.5 || requiredCoverage >= 0.6
        ? "medium"
        : "low";
    const recommendation: CourseMatch["recommendation"] = level === "high" ? "use_existing" : level === "medium" ? "customize" : "create_personal";
    return {
      courseId: course.id,
      courseTitle: course.title,
      courseType: course.courseType,
      targetCoverage,
      requiredCoverage,
      scopePrecision,
      missingTargetKnowledgeIds,
      missingPrerequisiteKnowledgeIds,
      extraKnowledgeIds,
      level,
      recommendation
    };
  }).sort((left, right) => right.targetCoverage - left.targetCoverage
    || right.requiredCoverage - left.requiredCoverage
    || left.missingTargetKnowledgeIds.length - right.missingTargetKnowledgeIds.length
    || left.extraKnowledgeIds.length - right.extraKnowledgeIds.length
    || Number(left.courseType === "personal") - Number(right.courseType === "personal")
    || left.courseId.localeCompare(right.courseId));
}

export function targetKnowledgeIds(targets: CourseTargetKnowledge[]) {
  return targets.filter((target) => target.required).map((target) => target.nodeId).sort((left, right) => left.localeCompare(right));
}
