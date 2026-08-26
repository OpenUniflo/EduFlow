import type { CourseTargetKnowledge } from "../types";
import type { KnowledgeEdge, KnowledgeNode } from "@/features/knowledge/types";

export type GoalKnowledge = Pick<KnowledgeNode, "id" | "title" | "description">;
export type GoalKnowledgeCandidate = GoalKnowledge & Pick<KnowledgeNode, "status" | "tags">;

export type GoalResolutionResult = {
  status: "ready" | "ambiguous" | "unsupported";
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

const conceptGlossary: Array<{ pattern: RegExp; concepts: string[] }> = [
  { pattern: /\b(?:rag|retrieval[ -]augmented generation)\b|检索增强/i, concepts: ["retrieval", "reranking", "citation"] },
  { pattern: /\b(?:tool|function)[ -]calling\b|工具调用/i, concepts: ["function calling"] },
  { pattern: /\b(?:long[ -]term )?memory\b|长期记忆|记忆系统/i, concepts: ["long-term memory"] },
  { pattern: /\b(?:llm|ai)[ -]agent\b|智能体架构/i, concepts: ["llm agent architecture"] },
  { pattern: /\bdeep[ -]learning\b|深度学习/i, concepts: ["deep learning"] },
  { pattern: /\bdocker\b|容器化/i, concepts: ["docker"] }
];

const ignoredTerms = new Set(["a", "an", "the", "and", "or", "with", "build", "develop", "learn", "course", "包含", "一个", "独立", "开发", "学会", "学习", "课程", "我想", "能够"]);

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[‐‑‒–—]/g, "-").replace(/[^\p{L}\p{N}+#.-]+/gu, " ").trim();
}

function knowledge(value: GoalKnowledgeCandidate): GoalKnowledge {
  return { id: value.id, title: value.title, description: value.description };
}

function conceptScore(node: GoalKnowledgeCandidate, concept: string) {
  const title = normalize(node.title);
  const description = normalize(node.description);
  const tags = normalize((node.tags ?? []).join(" "));
  const phrase = normalize(concept);
  if (title === phrase) return 100;
  if (title.includes(phrase)) return 60;
  if (description.includes(phrase)) return 20;
  if (tags.includes(phrase)) return 15;
  const terms = phrase.split(/\s+/).filter((term) => term.length > 1 && !ignoredTerms.has(term));
  return terms.reduce((score, term) => score + (title.includes(term) ? 8 : description.includes(term) ? 2 : tags.includes(term) ? 1 : 0), 0);
}

function ranked(nodes: GoalKnowledgeCandidate[], concept: string) {
  return nodes.map((node) => ({ node, score: conceptScore(node, concept) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.node.id.localeCompare(right.node.id));
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
    if (invalid.length) return { status: "unsupported", goalText, targetKnowledge: [], candidates: [], reason: `Suggested Knowledge is unavailable: ${invalid.join(", ")}` };
    return { status: "ready", goalText, targetKnowledge: suggested.map((id) => knowledge(byId.get(id)!)), candidates: [] };
  }

  const concepts = conceptGlossary.filter(({ pattern }) => pattern.test(goalText)).flatMap(({ concepts: matches }) => matches);
  if (concepts.length) {
    const selected = new Map<string, GoalKnowledgeCandidate>();
    const ambiguous = new Map<string, GoalKnowledgeCandidate>();
    for (const concept of concepts) {
      const candidates = ranked(nodes, concept);
      if (!candidates.length) continue;
      const top = candidates[0];
      const tied = candidates.filter((candidate) => candidate.score === top.score);
      if (tied.length > 1) tied.forEach(({ node }) => ambiguous.set(node.id, node));
      else if (top.score >= 20) selected.set(top.node.id, top.node);
    }
    if (ambiguous.size) return { status: "ambiguous", goalText, targetKnowledge: [...selected.values()].map(knowledge), candidates: [...ambiguous.values()].map(knowledge), reason: "Multiple visible Knowledge nodes match one or more goal concepts equally." };
    if (selected.size) return { status: "ready", goalText, targetKnowledge: [...selected.values()].map(knowledge), candidates: [] };
  }

  const fallback = ranked(nodes, normalize(goalText).split(/\s+/).filter((term) => term.length > 1 && !ignoredTerms.has(term)).join(" "));
  if (!fallback.length) return { status: "unsupported", goalText, targetKnowledge: [], candidates: [], reason: "No visible active Knowledge reliably matches this goal." };
  const top = fallback[0];
  const close = fallback.filter((candidate) => candidate.score >= top.score * 0.85).slice(0, 5);
  if (close.length > 1) return { status: "ambiguous", goalText, targetKnowledge: [], candidates: close.map(({ node }) => knowledge(node)), reason: "The goal matches multiple visible Knowledge nodes with similar lexical evidence." };
  return { status: "ready", goalText, targetKnowledge: [knowledge(top.node)], candidates: [] };
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
    const level: CourseMatchLevel = targetCoverage === 1 && requiredCoverage >= 0.8 ? "high" : targetCoverage >= 0.5 || requiredCoverage >= 0.6 ? "medium" : "low";
    const recommendation: CourseMatch["recommendation"] = level === "high" ? "use_existing" : level === "medium" ? "customize" : "create_personal";
    return {
      courseId: course.id,
      courseTitle: course.title,
      courseType: course.courseType,
      targetCoverage,
      requiredCoverage,
      missingTargetKnowledgeIds,
      missingPrerequisiteKnowledgeIds,
      extraKnowledgeIds,
      level,
      recommendation
    };
  }).sort((left, right) => right.targetCoverage - left.targetCoverage
    || right.requiredCoverage - left.requiredCoverage
    || left.missingTargetKnowledgeIds.length - right.missingTargetKnowledgeIds.length
    || Number(left.courseType === "personal") - Number(right.courseType === "personal")
    || left.courseId.localeCompare(right.courseId));
}

export function targetKnowledgeIds(targets: CourseTargetKnowledge[]) {
  return targets.filter((target) => target.required).map((target) => target.nodeId).sort((left, right) => left.localeCompare(right));
}
