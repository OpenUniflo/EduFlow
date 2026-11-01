import type { CapabilityEnable, CourseKnowledgeOrder, RoutePlanningInput, RoutePrerequisite } from "../../src/shared/learning/routePlanning";

/**
 * Three synthetic, structurally equivalent Course graphs. They deliberately use
 * generic identities (never product content) and cover the route-entry rules:
 * a course target with no hard prerequisite, an extra-course factual root, an
 * acquired start, and a soft-only target. All edges are explicit facts.
 */
export type SyntheticRouteCourse = {
  id: string;
  /** Prefix used by every node in this synthetic Course. */
  prefix: string;
  /** Course target suffix order. */
  targets: readonly string[];
  input: RoutePlanningInput;
};

const targetSuffixes = ["ENTRY", "CHAIN", "ACQUIRED_TARGET", "SOFT_ONLY"] as const;
const node = (prefix: string, suffix: string) => `${prefix}-${suffix}`;

function course(prefix: string): SyntheticRouteCourse {
  const acquired = node(prefix, "ACQUIRED");
  const acquiredTarget = node(prefix, "ACQUIRED_TARGET");
  const supported = node(prefix, "SUPPORTED");
  const entry = node(prefix, "ENTRY");
  const root = node(prefix, "ROOT");
  const middle = node(prefix, "MIDDLE");
  const chain = node(prefix, "CHAIN");
  const softOnly = node(prefix, "SOFT_ONLY");
  const softSource = node(prefix, "SOFT_SOURCE");
  const prerequisiteEdges: RoutePrerequisite[] = [
    { id: `${acquired}>${supported}`, source: acquired, target: supported, strength: "hard" },
    { id: `${supported}>${acquiredTarget}`, source: supported, target: acquiredTarget, strength: "hard" },
    { id: `${root}>${middle}`, source: root, target: middle, strength: "hard" },
    { id: `${middle}>${chain}`, source: middle, target: chain, strength: "hard" },
    { id: `${softSource}>${softOnly}`, source: softSource, target: softOnly, strength: "soft" },
  ];
  const enablesEdges: CapabilityEnable[] = [
    { id: `${root}>${softOnly}`, source: root, target: softOnly, relation: "enables", strength: 0.8 },
  ];
  const courseOrder: CourseKnowledgeOrder[] = targetSuffixes.map((suffix, coverageOrder) => ({
    nodeId: node(prefix, suffix), lessonOrder: 0, coverageOrder,
  }));
  return {
    id: `synthetic-course-${prefix.toLowerCase()}`,
    prefix,
    targets: targetSuffixes,
    input: {
      nodeIds: [acquired, acquiredTarget, supported, entry, root, middle, chain, softOnly, softSource],
      prerequisiteEdges,
      enablesEdges,
      currentNodeIds: [acquired],
      courseOrder,
    },
  };
}

export const syntheticRouteCourses: readonly SyntheticRouteCourse[] = [course("ALPHA"), course("BETA"), course("GAMMA")];

export const syntheticNodeId = (courseValue: SyntheticRouteCourse, suffix: string) => node(courseValue.prefix, suffix);
