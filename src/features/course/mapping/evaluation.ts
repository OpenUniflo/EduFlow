import type { CourseRuntimeData } from "../runtime/courseRuntime";

export type MappingGold = {
  knowledgeMaterialLinks: Array<{ knowledgeNodeId: string; sourceRefs: Array<{ pdfPages?: number[]; section?: string }> }>;
  knowledgePracticeLinks: Array<{ knowledgeNodeId: string; practiceId: string }>;
  practiceDependencies: Array<{ from: string; to: string }>;
  chapterOutcomes: Array<{ id: string; practiceIds: string[] }>;
  finalProject: { id: string; chapterOutcomeIds: string[] };
};

export type MappingIdentityMatches = {
  knowledgeNodeIdByGold: ReadonlyMap<string, string>;
  assignmentIdByGoldPractice: ReadonlyMap<string, string>;
  outcomeIdByGold: ReadonlyMap<string, string>;
  finalProjectIdByGold: ReadonlyMap<string, string>;
};

const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : 0;

export function evaluateCourseMapping(runtime: CourseRuntimeData, gold: MappingGold, matches: MappingIdentityMatches) {
  const materialById = new Map(runtime.materials.map((material) => [material.id, material]));
  const materialChecks = gold.knowledgeMaterialLinks.map((link) => {
    const nodeId = matches.knowledgeNodeIdByGold.get(link.knowledgeNodeId);
    const pages = new Set(runtime.materialKnowledgeCoverages.filter((coverage) => coverage.nodeId === nodeId).flatMap((coverage) => {
      const segment = materialById.get(coverage.materialId)?.segments.find((segment) => segment.id === coverage.segmentId);
      return segment?.page === undefined ? [] : [segment.page];
    }));
    const expectedPages = new Set(link.sourceRefs.flatMap((source) => source.pdfPages ?? []));
    return { knowledgeNodeId: link.knowledgeNodeId, nodeId, resolved: Boolean(nodeId && Array.from(expectedPages).some((page) => pages.has(page))), expectedPages: Array.from(expectedPages), resolvedPages: Array.from(pages).sort((a, b) => a - b) };
  });
  const expectedAssignmentPairs = new Set(gold.knowledgePracticeLinks.flatMap((link) => {
    const nodeId = matches.knowledgeNodeIdByGold.get(link.knowledgeNodeId);
    const assignmentId = matches.assignmentIdByGoldPractice.get(link.practiceId);
    return nodeId && assignmentId ? [`${assignmentId}:${nodeId}`] : [];
  }));
  const actualAssignmentPairs = new Set(runtime.assignmentCoverages.map((coverage) => `${coverage.assignmentId}:${coverage.nodeId}`));
  const missingAssignmentLinks = Array.from(expectedAssignmentPairs).filter((pair) => !actualAssignmentPairs.has(pair));
  const matchedAssignmentIds = new Set(matches.assignmentIdByGoldPractice.values());
  const matchedNodeIds = new Set(matches.knowledgeNodeIdByGold.values());
  const extraAssignmentLinks = Array.from(actualAssignmentPairs).filter((pair) => {
    const [assignmentId, nodeId] = pair.split(":");
    return matchedAssignmentIds.has(assignmentId) && matchedNodeIds.has(nodeId) && !expectedAssignmentPairs.has(pair);
  });
  const coveredGoldKnowledge = new Set(gold.knowledgePracticeLinks.filter((link) => {
    const nodeId = matches.knowledgeNodeIdByGold.get(link.knowledgeNodeId);
    const assignmentId = matches.assignmentIdByGoldPractice.get(link.practiceId);
    return nodeId && assignmentId && actualAssignmentPairs.has(`${assignmentId}:${nodeId}`);
  }).map((link) => link.knowledgeNodeId));
  const actualDependencyPairs = new Set(runtime.assignmentDependencies.map((edge) => `${edge.sourceAssignmentId}:${edge.targetAssignmentId}`));
  const reviewedDependencyChecks = gold.practiceDependencies.map((edge) => {
    const source = matches.assignmentIdByGoldPractice.get(edge.from); const target = matches.assignmentIdByGoldPractice.get(edge.to);
    return { from: edge.from, to: edge.to, sourceAssignmentId: source, targetAssignmentId: target, covered: Boolean(source && target && actualDependencyPairs.has(`${source}:${target}`)) };
  });
  const assignmentOutcomePairs = new Set(runtime.assignmentOutcomeCompositions.map((item) => `${item.assignmentId}:${item.outcomeId}`));
  const outcomeChecks = gold.chapterOutcomes.flatMap((outcome) => outcome.practiceIds.map((practiceId) => {
    const assignmentId = matches.assignmentIdByGoldPractice.get(practiceId); const outcomeId = matches.outcomeIdByGold.get(outcome.id);
    return { practiceId, goldOutcomeId: outcome.id, assignmentId, outcomeId, covered: Boolean(assignmentId && outcomeId && assignmentOutcomePairs.has(`${assignmentId}:${outcomeId}`)) };
  }));
  const finalProjectId = matches.finalProjectIdByGold.get(gold.finalProject.id);
  const finalPairs = new Set(runtime.finalProjectOutcomeCompositions.map((item) => `${item.finalProjectId}:${item.outcomeId}`));
  const finalProjectChecks = gold.finalProject.chapterOutcomeIds.map((goldOutcomeId) => { const outcomeId = matches.outcomeIdByGold.get(goldOutcomeId); return { goldOutcomeId, outcomeId, covered: Boolean(finalProjectId && outcomeId && finalPairs.has(`${finalProjectId}:${outcomeId}`)) }; });
  return {
    knowledgeMaterial: { sampled: materialChecks.length, resolved: materialChecks.filter((item) => item.resolved).length, recall: ratio(materialChecks.filter((item) => item.resolved).length, materialChecks.length), checks: materialChecks },
    knowledgeAssignment: { sampledKnowledge: new Set(gold.knowledgePracticeLinks.map((link) => link.knowledgeNodeId)).size, coveredKnowledge: coveredGoldKnowledge.size, coverage: ratio(coveredGoldKnowledge.size, new Set(gold.knowledgePracticeLinks.map((link) => link.knowledgeNodeId)).size), missingLinks: missingAssignmentLinks, extraLinks: extraAssignmentLinks },
    assignmentDependencies: { reviewed: reviewedDependencyChecks.length, covered: reviewedDependencyChecks.filter((item) => item.covered).length, checks: reviewedDependencyChecks },
    outcomes: { sampledAssignments: outcomeChecks.length, coveredAssignments: outcomeChecks.filter((item) => item.covered).length, checks: outcomeChecks, finalProjectChecks },
  };
}

export function compareMappingCounts(before: Record<string, number>, after: Record<string, number>) {
  const changed = Object.keys({ ...before, ...after }).filter((key) => before[key] !== after[key]);
  return { before, after, changed, idempotent: changed.length === 0 };
}
