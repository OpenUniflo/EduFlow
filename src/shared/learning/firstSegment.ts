/**
 * Stage 4 first-segment projection.
 *
 * The first segment is derived from the Course's explicit curriculum order and
 * its real Micro / Assignment assets: every Micro up to the first Assignment,
 * then that Assignment. Nothing here knows a Course identity, title or duration
 * ahead of time; a Course without an Assignment uses its real curriculum end
 * rather than a fixed count. This module is pure so the Home route card, the
 * summary card, the route panel and server-side completion checks share one
 * definition.
 */
import { satisfiesTeachingPrerequisite } from "./teachingPrerequisites.js";

export type LearnerEvidenceStatus = "explore" | "learning" | "learned" | "practicing" | "mastered";
export type AssignmentProgressStatus = "not_started" | "started" | "submitted" | "needs_revision" | "accepted" | "completed";

export type FirstSegmentMicroAsset = { pathId: string; title: string; estimatedMinutes?: number };
export type FirstSegmentPracticeAsset = { assignmentId: string; title: string; estimatedMinutes?: number };

export type FirstSegmentStep =
  | { id: string; kind: "micro"; nodeId: string; pathId: string; title: string; minutes?: number; status: "done" | "now" | "quiet" }
  | { id: string; kind: "practice"; nodeId: string; assignmentId: string; title: string; minutes?: number; status: "done" | "now" | "quiet" };

export type FirstSegment = {
  steps: FirstSegmentStep[];
  /** The Knowledge node whose Assignment closes the segment, when one exists. */
  boundaryNodeId?: string;
  completedCount: number;
  totalMinutes: number;
  started: boolean;
  complete: boolean;
  currentStep?: FirstSegmentStep;
};

const passedAssignments = new Set<AssignmentProgressStatus>(["accepted", "completed"]);

export function isLearnedStatus(status: LearnerEvidenceStatus | undefined) {
  return satisfiesTeachingPrerequisite(status);
}

export function isPassedAssignment(status: AssignmentProgressStatus | undefined) {
  return Boolean(status && passedAssignments.has(status));
}

export function buildFirstSegment(input: {
  orderedNodeIds: readonly string[];
  microByNode: ReadonlyMap<string, FirstSegmentMicroAsset>;
  practiceByNode: ReadonlyMap<string, FirstSegmentPracticeAsset>;
  knowledgeStatusByNode: ReadonlyMap<string, LearnerEvidenceStatus>;
  assignmentStatusByAssignment?: ReadonlyMap<string, AssignmentProgressStatus>;
}): FirstSegment {
  const steps: FirstSegmentStep[] = [];
  let boundaryNodeId: string | undefined;

  for (const nodeId of input.orderedNodeIds) {
    const micro = input.microByNode.get(nodeId);
    const practice = input.practiceByNode.get(nodeId);
    if (micro) {
      const status = isLearnedStatus(input.knowledgeStatusByNode.get(nodeId)) ? "done" as const : "quiet" as const;
      steps.push({
        id: `micro:${micro.pathId}`,
        kind: "micro",
        nodeId,
        pathId: micro.pathId,
        title: micro.title,
        ...(micro.estimatedMinutes ? { minutes: micro.estimatedMinutes } : {}),
        status
      });
    }
    if (practice) {
      const status = isPassedAssignment(input.assignmentStatusByAssignment?.get(practice.assignmentId)) ? "done" as const : "quiet" as const;
      steps.push({
        id: `practice:${practice.assignmentId}`,
        kind: "practice",
        nodeId,
        assignmentId: practice.assignmentId,
        title: practice.title,
        ...(practice.estimatedMinutes ? { minutes: practice.estimatedMinutes } : {}),
        status
      });
      boundaryNodeId = nodeId;
      break;
    }
  }

  const resolved = steps.map((step) => ({ ...step }));
  const firstOpen = resolved.findIndex((step) => step.status !== "done");
  if (firstOpen >= 0) resolved[firstOpen] = { ...resolved[firstOpen], status: "now" };
  const completedCount = resolved.filter((step) => step.status === "done").length;
  const complete = resolved.length > 0 && completedCount === resolved.length;
  const started = resolved.length > 0 && (
    completedCount > 0
    || resolved.some((step) => step.kind === "practice" && step.status !== "quiet")
    || resolved.some((step) => {
      const status = input.knowledgeStatusByNode.get(step.nodeId);
      return Boolean(status && status !== "explore");
    })
  );
  return {
    steps: resolved,
    ...(boundaryNodeId ? { boundaryNodeId } : {}),
    completedCount,
    totalMinutes: resolved.reduce((total, step) => total + (step.minutes ?? 0), 0),
    started,
    complete,
    ...(firstOpen >= 0 ? { currentStep: resolved[firstOpen] } : {})
  };
}

export type FirstSegmentSummary = {
  learnedSteps: Array<{ id: string; nodeId: string; title: string }>;
  passedTasks: Array<{ id: string; assignmentId: string; title: string }>;
  learnedNodeIds: string[];
  complete: boolean;
};

/** Reads only the real steps of the segment; it never adds a next or future fact. */
export function summarizeFirstSegment(segment: FirstSegment, titlesByNode: ReadonlyMap<string, string> = new Map()): FirstSegmentSummary {
  const learned = segment.steps.filter((step): step is Extract<FirstSegmentStep, { kind: "micro" }> => step.kind === "micro" && step.status === "done");
  const passed = segment.steps.filter((step): step is Extract<FirstSegmentStep, { kind: "practice" }> => step.kind === "practice" && step.status === "done");
  return {
    learnedSteps: learned.map((step) => ({ id: step.id, nodeId: step.nodeId, title: step.title || titlesByNode.get(step.nodeId) || step.nodeId })),
    passedTasks: passed.map((step) => ({ id: step.id, assignmentId: step.assignmentId, title: step.title })),
    learnedNodeIds: [...new Set(learned.map((step) => step.nodeId))],
    complete: segment.complete
  };
}

export type LearnedMapNode = { id: string; title: string; label: string; lines: string[]; x: number; y: number };
export type LearnedMapEdge = { id: string; source: string; target: string };
export type LearnedMapProjection = { nodes: LearnedMapNode[]; edges: LearnedMapEdge[]; width: number; height: number };

/** Two short lines fit the 1280 Home card without overlap; never hide the identity. */
function wrapMapLabel(value: string) {
  const characters = Array.from(value.trim());
  if (!characters.length) return [value];
  const lines: string[] = [];
  for (let index = 0; index < characters.length && lines.length < 2; index += 9) {
    lines.push(characters.slice(index, index + 9).join(""));
  }
  if (characters.length > 18) lines[1] = `${lines[1].slice(0, 8)}…`;
  return lines;
}

/**
 * A deterministic, presentation-only projection of the learner's own learned
 * Knowledge. Edges are drawn only when both endpoints are in the learned set;
 * no edge or node is invented for composition.
 */
export function projectLearnedMap(input: {
  learnedNodeIds: readonly string[];
  orderedNodeIds?: readonly string[];
  titles: ReadonlyMap<string, string>;
  edges: ReadonlyArray<{ id: string; source: string; target: string }>;
  width?: number;
  height?: number;
}): LearnedMapProjection {
  const learned = [...new Set(input.learnedNodeIds)];
  const orderIndex = new Map((input.orderedNodeIds ?? learned).map((id, index) => [id, index]));
  const sorted = learned.sort((left, right) => (orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right));
  const width = Math.max(120, input.width ?? 440);
  const height = Math.max(72, input.height ?? 132);
  const perRow = Math.min(4, Math.max(1, sorted.length));
  const rowCount = Math.max(1, Math.ceil(sorted.length / perRow));
  const xGap = width / (perRow + 1);
  const yGap = height / (rowCount + 1);
  const nodes = sorted.map((id, index) => {
    const row = Math.floor(index / perRow);
    const rowItems = Math.min(perRow, sorted.length - row * perRow);
    const column = index - row * perRow;
    const rowXGap = width / (rowItems + 1);
    const title = input.titles.get(id) ?? id;
    const lines = wrapMapLabel(title);
    return {
      id,
      title,
      label: lines.join(""),
      lines,
      x: Math.round(rowXGap * (column + 1)),
      y: Math.round(yGap * (row + 1))
    };
  });
  const learnedSet = new Set(sorted);
  const edges = input.edges
    .filter((edge) => learnedSet.has(edge.source) && learnedSet.has(edge.target))
    .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }));
  return { nodes, edges, width, height };
}
