import { describe, expect, it } from "vitest";
import {
  assignmentCoverages,
  courseAssignments,
  courseAssignmentSummary,
  courseChapters,
  courseSkillTreeNodes,
  validateCourseAssignmentCoverage
} from "./data";
import { buildCourseGraphProjection } from "./course/graph/courseGraphProjection";
import { ATOMIC_FOOTPRINT_HEIGHT, ATOMIC_FOOTPRINT_WIDTH, COMPANION_OFFSET_X, COMPANION_OFFSET_Y, KNOWLEDGE_CARD_HEIGHT, KNOWLEDGE_CARD_WIDTH, layoutCourseGraph } from "./course/graph/elkCourseLayout";
import { toReactFlow } from "./course/graph/reactFlowAdapter";
import { assignmentProjectionForNode, buildChapterAssignmentProjection, courseDrawerProjectionKind, detailFacetForMode, flowIdForAnchor, type SelectedAnchor } from "./course/courseSelection";

describe("Course Assignment invariants", () => {
  it("covers every Course KnowledgeNode", () => {
    const nodeIds = courseSkillTreeNodes.map((node) => node.id);
    expect({ knowledgeNodeCount: nodeIds.length, assignmentCount: courseAssignments.length, coverageCount: assignmentCoverages.length }).toEqual({ knowledgeNodeCount: 78, assignmentCount: 30, coverageCount: 94 });
    expect(validateCourseAssignmentCoverage(nodeIds, assignmentCoverages)).toEqual([]);
    expect(new Set(assignmentCoverages.map((coverage) => coverage.nodeId)).size).toBe(nodeIds.length);
  });

  it("resolves every coverage reference", () => {
    const assignmentIds = new Set(courseAssignments.map((assignment) => assignment.id));
    const nodeIds = new Set(courseSkillTreeNodes.map((node) => node.id));
    expect(assignmentCoverages.every((coverage) => assignmentIds.has(coverage.assignmentId) && nodeIds.has(coverage.nodeId))).toBe(true);
  });

  it("requires a template only for workflow mode", () => {
    expect(courseAssignments.filter((assignment) => assignment.mode === "workflow").every((assignment) => Boolean(assignment.workflowTemplateId))).toBe(true);
    expect(courseAssignments.some((assignment) => assignment.mode === "instruction" && !assignment.workflowTemplateId)).toBe(true);
  });

  it("contains real N:M examples in both directions", () => {
    expect(courseAssignments.some((assignment) => assignmentCoverages.filter((coverage) => coverage.assignmentId === assignment.id).length > 1)).toBe(true);
    expect(courseSkillTreeNodes.some((node) => node.assignmentCount > 1)).toBe(true);
  });

  it("deduplicates Assignment IDs in chapter and course summaries", () => {
    courseChapters.forEach((chapter) => {
      expect(chapter.assignmentSummary.assignmentCount).toBe(new Set(chapter.assignmentSummary.assignmentIds).size);
    });
    expect(courseAssignmentSummary.assignmentCount).toBe(new Set(assignmentCoverages.map((coverage) => coverage.assignmentId)).size);
  });
});

describe("Course Assignment layout footprint", () => {
  it("includes the companion offset in one stable footprint", () => {
    expect(ATOMIC_FOOTPRINT_WIDTH).toBe(KNOWLEDGE_CARD_WIDTH + COMPANION_OFFSET_X);
    expect(ATOMIC_FOOTPRINT_HEIGHT).toBe(KNOWLEDGE_CARD_HEIGHT + COMPANION_OFFSET_Y);
  });

  it("keeps every expanded footprint inside its Chapter and avoids local overlap", async () => {
    const layout = await layoutCourseGraph(buildCourseGraphProjection("full", null));
    const chapters = new Map(layout.nodes.filter((node) => node.kind === "chapter").map((node) => [node.id, node]));
    const byParent = new Map<string, typeof layout.nodes>();
    layout.nodes.filter((node) => node.kind === "knowledge" && node.parentId).forEach((node) => byParent.set(node.parentId!, [...(byParent.get(node.parentId!) ?? []), node]));

    byParent.forEach((nodes, parentId) => {
      const chapter = chapters.get(parentId);
      expect(chapter).toBeDefined();
      nodes.forEach((node) => {
        expect(node.width).toBe(ATOMIC_FOOTPRINT_WIDTH);
        expect(node.height).toBe(ATOMIC_FOOTPRINT_HEIGHT);
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.x + node.width).toBeLessThanOrEqual(chapter!.width + 0.01);
        expect(node.y + node.height).toBeLessThanOrEqual(chapter!.height + 0.01);
      });
      const positions = new Set(nodes.map((node) => `${node.x}:${node.y}`));
      expect(positions.size).toBe(nodes.length);
      for (let left = 0; left < nodes.length; left += 1) {
        for (let right = left + 1; right < nodes.length; right += 1) {
          const a = nodes[left];
          const b = nodes[right];
          const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
          expect(overlaps).toBe(false);
        }
      }
    });
  });

  it("changes presentation without changing topology, geometry, or viewport-owned data", async () => {
    const layout = await layoutCourseGraph(buildCourseGraphProjection("full", null));
    const knowledgeFlow = toReactFlow(layout, "knowledge", null, null);
    const assignmentFlow = toReactFlow(layout, "assignment", null, null);
    expect(assignmentFlow.nodes.map(({ id, position, width, height, parentId }) => ({ id, position, width, height, parentId }))).toEqual(knowledgeFlow.nodes.map(({ id, position, width, height, parentId }) => ({ id, position, width, height, parentId })));
    expect(assignmentFlow.edges.map((edge) => [edge.id, edge.source, edge.target])).toEqual(knowledgeFlow.edges.map((edge) => [edge.id, edge.source, edge.target]));
  });
});

describe("Course anchor and Drawer facet", () => {
  const multiNode = courseSkillTreeNodes.find((node) => node.assignmentCount > 1)!;
  const singleNode = courseSkillTreeNodes.find((node) => node.assignmentCount === 1)!;

  it("preserves a Knowledge anchor while mode drives the facet", () => {
    const anchor: SelectedAnchor = { kind: "knowledge", id: multiNode.id };
    expect(courseDrawerProjectionKind(anchor, "knowledge", multiNode)).toBe("atomic-knowledge");
    expect(courseDrawerProjectionKind(anchor, "assignment", multiNode)).toBe("assignment-group");
    expect(flowIdForAnchor(anchor)).toBe(`knowledge:${multiNode.id}`);
    expect(detailFacetForMode("assignment")).toBe("assignment");
  });

  it("projects the same Chapter anchor through Knowledge and Assignment facets", () => {
    const anchor: SelectedAnchor = { kind: "chapter", id: courseChapters[0].id };
    expect(courseDrawerProjectionKind(anchor, "knowledge")).toBe("chapter-knowledge");
    expect(courseDrawerProjectionKind(anchor, "assignment")).toBe("chapter-assignment");
    expect(flowIdForAnchor(anchor)).toBe(`chapter:${anchor.id}`);
    const aggregate = buildChapterAssignmentProjection(courseChapters[0], courseSkillTreeNodes);
    expect(aggregate.assignments).toHaveLength(courseChapters[0].assignmentSummary.assignmentCount);
    expect(new Set(aggregate.assignments.map((item) => item.assignment.id)).size).toBe(aggregate.assignments.length);
  });

  it("opens an Assignment Group before detail for multiple Assignments", () => {
    expect(assignmentProjectionForNode(multiNode, null)).toMatchObject({ kind: "group" });
    expect(assignmentProjectionForNode(multiNode, multiNode.assignmentContexts[0].assignmentId)).toMatchObject({ kind: "detail", canReturnToGroup: true });
  });

  it("opens direct detail for exactly one Assignment", () => {
    expect(assignmentProjectionForNode(singleNode, null)).toMatchObject({ kind: "detail", canReturnToGroup: false });
  });

  it("keeps Assignment facet authoritative for a search-selected anchor", () => {
    const searchAnchor: SelectedAnchor = { kind: "knowledge", id: singleNode.id };
    expect(detailFacetForMode("assignment")).toBe("assignment");
    expect(courseDrawerProjectionKind(searchAnchor, "assignment", singleNode)).toBe("assignment-detail");
  });
});
