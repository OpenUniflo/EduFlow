import { assertDirectedAcyclic } from "@/features/knowledge/graphAlgorithms";
import type { GeneratedAssignmentCandidate, GeneratedAssignmentDependency } from "./types";

export type AssignmentDagReport = {
  selfEdges: GeneratedAssignmentDependency[];
  danglingEdges: GeneratedAssignmentDependency[];
  duplicateEdges: GeneratedAssignmentDependency[];
  redundantTransitiveEdges: GeneratedAssignmentDependency[];
  cycles: boolean;
};

function reachable(source: string, target: string, edges: GeneratedAssignmentDependency[], excluded: GeneratedAssignmentDependency) {
  const adjacency = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (edge === excluded) return;
    adjacency.set(edge.sourceSemanticKey, [...(adjacency.get(edge.sourceSemanticKey) ?? []), edge.targetSemanticKey]);
  });
  const queue = [...(adjacency.get(source) ?? [])];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift() as string;
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

export function validateAssignmentDAG(assignments: readonly GeneratedAssignmentCandidate[], dependencies: readonly GeneratedAssignmentDependency[]): AssignmentDagReport {
  const ids = new Set(assignments.map((assignment) => assignment.semanticKey));
  const selfEdges = dependencies.filter((edge) => edge.sourceSemanticKey === edge.targetSemanticKey);
  const danglingEdges = dependencies.filter((edge) => !ids.has(edge.sourceSemanticKey) || !ids.has(edge.targetSemanticKey));
  const seen = new Set<string>();
  const duplicateEdges = dependencies.filter((edge) => {
    const pair = `${edge.sourceSemanticKey}:${edge.targetSemanticKey}`;
    if (seen.has(pair)) return true;
    seen.add(pair);
    return false;
  });
  let cycles = false;
  try {
    assertDirectedAcyclic(ids, dependencies.map((edge) => ({ source: edge.sourceSemanticKey, target: edge.targetSemanticKey })));
  } catch {
    cycles = true;
  }
  const eligible = dependencies.filter((edge) => !selfEdges.includes(edge) && !danglingEdges.includes(edge) && !duplicateEdges.includes(edge));
  const redundantTransitiveEdges = cycles ? [] : eligible.filter((edge) => reachable(edge.sourceSemanticKey, edge.targetSemanticKey, eligible, edge));
  return { selfEdges, danglingEdges, duplicateEdges, redundantTransitiveEdges, cycles };
}

export function assertValidAssignmentDAG(assignments: readonly GeneratedAssignmentCandidate[], dependencies: readonly GeneratedAssignmentDependency[]) {
  const report = validateAssignmentDAG(assignments, dependencies);
  if (report.selfEdges.length || report.danglingEdges.length || report.duplicateEdges.length || report.redundantTransitiveEdges.length || report.cycles) throw new Error(`Invalid Assignment dependency DAG: self=${report.selfEdges.length}; dangling=${report.danglingEdges.length}; duplicate=${report.duplicateEdges.length}; redundant=${report.redundantTransitiveEdges.length}; cycles=${report.cycles}`);
  return report;
}

export function reduceAssignmentDependencies(assignments: readonly GeneratedAssignmentCandidate[], dependencies: readonly GeneratedAssignmentDependency[]) {
  const report = validateAssignmentDAG(assignments, dependencies);
  if (report.selfEdges.length || report.danglingEdges.length || report.duplicateEdges.length || report.cycles) throw new Error(`Invalid Assignment dependency DAG before reduction: self=${report.selfEdges.length}; dangling=${report.danglingEdges.length}; duplicate=${report.duplicateEdges.length}; cycles=${report.cycles}`);
  const redundant = new Set(report.redundantTransitiveEdges);
  const reduced = dependencies.filter((edge) => !redundant.has(edge));
  assertValidAssignmentDAG(assignments, reduced);
  return { dependencies: reduced, removedRedundantEdges: report.redundantTransitiveEdges };
}
