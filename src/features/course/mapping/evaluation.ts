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

export type PracticeKnowledgeMatchDecision = {
  goldPracticeId: string;
  productionAssignmentId?: string;
  expectedKnowledgeNodeIds: string[];
  actualKnowledgeNodeIds: string[];
  coverageRecall: number;
  overlap: number;
  extraKnowledgeCount: number;
  semanticSimilarity: number;
};

const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : 0;

export function matchGoldPracticesByKnowledgeSet(input: {
  knowledgePracticeLinks: MappingGold["knowledgePracticeLinks"];
  knowledgeNodeIdByGold: ReadonlyMap<string, string>;
  assignments: CourseRuntimeData["assignments"];
  assignmentCoverages: CourseRuntimeData["assignmentCoverages"];
  semanticScores?: ReadonlyMap<string, number>;
}) {
  const goldPracticeIds = Array.from(new Set(input.knowledgePracticeLinks.map((link) => link.practiceId))).sort();
  const knowledgeByAssignment = new Map(input.assignments.map((assignment) => [assignment.id, new Set(input.assignmentCoverages.filter((coverage) => coverage.assignmentId === assignment.id).map((coverage) => coverage.nodeId))]));
  const upstreamBlocked: Array<{ practiceId: string; missingGoldKnowledgeIds: string[] }> = [];
  const expectedByPractice = new Map<string, Set<string>>();
  goldPracticeIds.forEach((practiceId) => {
    const goldIds = Array.from(new Set(input.knowledgePracticeLinks.filter((link) => link.practiceId === practiceId).map((link) => link.knowledgeNodeId))).sort();
    const missingGoldKnowledgeIds = goldIds.filter((id) => !input.knowledgeNodeIdByGold.has(id));
    if (missingGoldKnowledgeIds.length) upstreamBlocked.push({ practiceId, missingGoldKnowledgeIds });
    else expectedByPractice.set(practiceId, new Set(goldIds.map((id) => input.knowledgeNodeIdByGold.get(id) as string)));
  });
  const pairs = Array.from(expectedByPractice).flatMap(([practiceId, expected]) => input.assignments.map((assignment) => {
    const actual = knowledgeByAssignment.get(assignment.id) ?? new Set<string>();
    const intersection = Array.from(expected).filter((id) => actual.has(id)).length;
    const union = new Set([...expected, ...actual]).size;
    return { practiceId, assignmentId: assignment.id, expected, actual, coverageRecall: ratio(intersection, expected.size), overlap: ratio(intersection, union), extraKnowledgeCount: Array.from(actual).filter((id) => !expected.has(id)).length, semanticSimilarity: input.semanticScores?.get(`${practiceId}:${assignment.id}`) ?? 0 };
  })).filter((pair) => pair.coverageRecall > 0).sort((left, right) => right.coverageRecall - left.coverageRecall || right.overlap - left.overlap || left.extraKnowledgeCount - right.extraKnowledgeCount || right.semanticSimilarity - left.semanticSimilarity || left.practiceId.localeCompare(right.practiceId) || left.assignmentId.localeCompare(right.assignmentId));
  const matches = new Map<string, string>();
  pairs.forEach((pair) => { if (!matches.has(pair.practiceId)) matches.set(pair.practiceId, pair.assignmentId); });
  const decisions: PracticeKnowledgeMatchDecision[] = goldPracticeIds.map((goldPracticeId) => {
    const productionAssignmentId = matches.get(goldPracticeId);
    const expected = expectedByPractice.get(goldPracticeId) ?? new Set<string>();
    const actual = productionAssignmentId ? knowledgeByAssignment.get(productionAssignmentId) ?? new Set<string>() : new Set<string>();
    const pair = pairs.find((candidate) => candidate.practiceId === goldPracticeId && candidate.assignmentId === productionAssignmentId);
    return { goldPracticeId, productionAssignmentId, expectedKnowledgeNodeIds: Array.from(expected).sort(), actualKnowledgeNodeIds: Array.from(actual).sort(), coverageRecall: pair?.coverageRecall ?? 0, overlap: pair?.overlap ?? 0, extraKnowledgeCount: pair?.extraKnowledgeCount ?? 0, semanticSimilarity: pair?.semanticSimilarity ?? 0 };
  });
  return { matches, decisions, upstreamBlocked };
}

export function matchGoldOutcomesByAssignmentSet(input: {
  chapterOutcomes: MappingGold["chapterOutcomes"];
  assignmentIdByGoldPractice: ReadonlyMap<string, string>;
  outcomes: CourseRuntimeData["chapterOutcomes"];
  assignmentOutcomeCompositions: CourseRuntimeData["assignmentOutcomeCompositions"];
  semanticScores?: ReadonlyMap<string, number>;
}) {
  const assignmentsByOutcome = new Map(input.outcomes.map((outcome) => [outcome.id, new Set(input.assignmentOutcomeCompositions.filter((item) => item.outcomeId === outcome.id).map((item) => item.assignmentId))]));
  const pairs = input.chapterOutcomes.flatMap((goldOutcome) => {
    const expected = new Set(goldOutcome.practiceIds.map((id) => input.assignmentIdByGoldPractice.get(id)).filter((id): id is string => Boolean(id)));
    return input.outcomes.map((outcome) => {
      const actual = assignmentsByOutcome.get(outcome.id) ?? new Set<string>();
      const intersection = Array.from(expected).filter((id) => actual.has(id)).length;
      const union = new Set([...expected, ...actual]).size;
      return { goldOutcomeId: goldOutcome.id, outcomeId: outcome.id, recall: ratio(intersection, expected.size), overlap: ratio(intersection, union), extraAssignmentCount: Array.from(actual).filter((id) => !expected.has(id)).length, semanticSimilarity: input.semanticScores?.get(`${goldOutcome.id}:${outcome.id}`) ?? 0 };
    });
  }).filter((pair) => pair.recall > 0).sort((left, right) => right.recall - left.recall || right.overlap - left.overlap || left.extraAssignmentCount - right.extraAssignmentCount || right.semanticSimilarity - left.semanticSimilarity || left.goldOutcomeId.localeCompare(right.goldOutcomeId) || left.outcomeId.localeCompare(right.outcomeId));
  const matches = new Map<string, string>(); const usedOutcomes = new Set<string>();
  pairs.forEach((pair) => { if (!matches.has(pair.goldOutcomeId) && !usedOutcomes.has(pair.outcomeId)) { matches.set(pair.goldOutcomeId, pair.outcomeId); usedOutcomes.add(pair.outcomeId); } });
  return { matches, decisions: input.chapterOutcomes.map((outcome) => { const outcomeId = matches.get(outcome.id); const pair = pairs.find((item) => item.goldOutcomeId === outcome.id && item.outcomeId === outcomeId); return { goldId: outcome.id, productionId: outcomeId, recall: pair?.recall ?? 0, overlap: pair?.overlap ?? 0, extraAssignmentCount: pair?.extraAssignmentCount ?? 0, semanticSimilarity: pair?.semanticSimilarity ?? 0 }; }) };
}

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
    knowledgeMaterial: { sampled: materialChecks.length, eligible: materialChecks.filter((item) => Boolean(item.nodeId)).length, resolved: materialChecks.filter((item) => item.resolved).length, upstreamBlocked: materialChecks.filter((item) => !item.nodeId).map((item) => item.knowledgeNodeId), recall: ratio(materialChecks.filter((item) => item.resolved).length, materialChecks.filter((item) => Boolean(item.nodeId)).length), checks: materialChecks },
    knowledgeAssignment: { sampledKnowledge: new Set(gold.knowledgePracticeLinks.map((link) => link.knowledgeNodeId)).size, coveredKnowledge: coveredGoldKnowledge.size, coverage: ratio(coveredGoldKnowledge.size, new Set(gold.knowledgePracticeLinks.map((link) => link.knowledgeNodeId)).size), missingLinks: missingAssignmentLinks, extraLinks: extraAssignmentLinks },
    assignmentDependencies: { reviewed: reviewedDependencyChecks.length, covered: reviewedDependencyChecks.filter((item) => item.covered).length, checks: reviewedDependencyChecks },
    outcomes: { sampledAssignments: outcomeChecks.length, coveredAssignments: outcomeChecks.filter((item) => item.covered).length, checks: outcomeChecks, finalProjectChecks },
  };
}

export function compareMappingCounts(before: Record<string, number>, after: Record<string, number>) {
  const changed = Object.keys({ ...before, ...after }).filter((key) => before[key] !== after[key]);
  return { before, after, changed, idempotent: changed.length === 0 };
}
