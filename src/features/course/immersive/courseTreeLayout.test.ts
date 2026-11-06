import { describe, expect, it } from "vitest";
import type { CoursePlaneLayout } from "@/features/archive/model/coursePlaneLayout";
import type { CourseGraphData } from "../runtime/courseRuntime";
import {
  COURSE_ROW_GAP,
  COURSE_ROW_PITCH,
  REFLECTION_OFFSET,
  basePracticeCards,
  layerMixAt,
  layerOffsetsAt,
  assignmentKnowledgeMap,
  buildDependencyRoutes,
  buildPlaneCourseLayout,
  buildPracticeCards,
  buildRouteTrack,
  buildWindingRoute,
  capabilityPathToTargets,
  courseSelectionRelations,
  positionPracticeCards,
  primaryKnowledgeByAssignment,
  reflectionOffset,
  resolveFacetSelection
} from "./courseTreeLayout";

const graphData = {
  courseId: "course",
  revision: "r1",
  chapters: [
    { id: "ch1", title: "第一章", displayNumber: 1, order: 1, knowledgeProgress: 50, assignmentSummary: { assignmentCount: 2 } },
    { id: "ch2", title: "第二章", displayNumber: 2, order: 2, knowledgeProgress: 0, assignmentSummary: { assignmentCount: 1 } },
    { id: "ch3", title: "第三章", displayNumber: 3, order: 3, knowledgeProgress: 0, assignmentSummary: { assignmentCount: 0 }, lessonCount: 1, outcome: "综合项目" }
  ],
  knowledgeNodes: [
    {
      id: "K1", title: "知识一", chapterId: "ch1", status: "completed", assignmentIds: ["A1", "A2"],
      assignmentContexts: [
        { assignmentId: "A1", assignment: { id: "A1", title: "实践一", order: 0 }, state: { status: "accepted" } },
        { assignmentId: "A2", assignment: { id: "A2", title: "实践二", order: 1 }, state: { status: "started" } }
      ],
      primaryCoverage: { lessonOrder: 1, order: 1 }, materialContexts: []
    },
    {
      id: "K2", title: "知识二", chapterId: "ch1", status: "learning", assignmentIds: ["A2"],
      assignmentContexts: [{ assignmentId: "A2", assignment: { id: "A2", title: "实践二", order: 1 }, state: { status: "started" } }],
      primaryCoverage: { lessonOrder: 1, order: 2 }, materialContexts: []
    },
    {
      id: "K3", title: "知识三", chapterId: "ch2", status: "available", assignmentIds: [],
      assignmentContexts: [], primaryCoverage: { lessonOrder: 2, order: 1 }, materialContexts: []
    }
  ],
  knowledgeEdges: [
    { id: "e1", source: "K1", target: "K2", relation: "prerequisite", strength: "hard" },
    { id: "e2", source: "K2", target: "K3", relation: "enables", strength: 1 }
  ],
  chapterEdges: [],
  assignmentSummary: {}
} as unknown as CourseGraphData;

const plane: CoursePlaneLayout = {
  positions: { K1: { x: -120, y: 60, z: 0 }, K2: { x: -120, y: -10, z: 0 }, K3: { x: 120, y: 20, z: 0 } },
  chapters: [
    { id: "ch1", title: "第一章", x: -200, y: 120, width: 176, height: 220 },
    { id: "ch2", title: "第二章", x: 40, y: 120, width: 176, height: 160 },
    { id: "ch3", title: "第三章", x: 240, y: 120, width: 176, height: 120 }
  ],
  dependencies: [{ id: "e1", source: "K1", target: "K2", relation: "prerequisite", points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] }],
  width: 416, height: 220, cardWidth: 176, cardHeight: 40, source: "elk-course"
};

describe("course tree geometry", () => {
  it("keeps the Archive column/order but reserves the action-row card height", () => {
    const layout = buildPlaneCourseLayout(graphData, plane);
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    const k1 = byId.get("K1")!;
    const k2 = byId.get("K2")!;
    const k3 = byId.get("K3")!;
    expect(k1).toMatchObject({ x: -112, z: 0, width: 176, height: 64 });
    expect(k2.x).toBe(k1.x);
    expect(k2.y - k1.y).toBe(COURSE_ROW_PITCH);
    expect(k3.y).toBe(k1.y);
    expect(layout.chapters.map((chapter) => chapter.id)).toEqual(["ch1", "ch2", "ch3"]);
    expect(layout.chapters.find((chapter) => chapter.id === "ch3")?.empty).toBe(true);
    expect(layout.chapters.find((chapter) => chapter.id === "ch1")?.height).toBe(56 + 2 * 64 + COURSE_ROW_GAP + 12);
    expect(layout.edges.map((edge) => edge.id)).toEqual(["e1", "e2"]);
  });

  it("has zero overlap for solid cards at every zoom scale", () => {
    const layout = buildPlaneCourseLayout(graphData, plane);
    const knowledge = layout.nodes.filter((node) => node.kind === "knowledge");
    const box = (node: { x: number; y: number; width: number; height: number }) => ({
      left: node.x - node.width / 2, right: node.x + node.width / 2,
      top: node.y + node.height / 2, bottom: node.y - node.height / 2
    });
    const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.01
      && Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom) > 0.01;
    [0.85, 1, 1.3].forEach((scale) => {
      const boxes = knowledge.map((node) => {
        const value = box(node);
        return { left: value.left * scale, right: value.right * scale, top: value.top * scale, bottom: value.bottom * scale };
      });
      for (let a = 0; a < boxes.length; a += 1) for (let b = a + 1; b < boxes.length; b += 1) {
        expect(overlap(boxes[a], boxes[b]), `scale ${scale}: ${a}/${b}`).toBe(false);
      }
    });
    const practice = positionPracticeCards(buildPracticeCards(graphData), layout, false);
    const practiceBoxes = practice.map((card) => box(card));
    for (let a = 0; a < practiceBoxes.length; a += 1) for (let b = a + 1; b < practiceBoxes.length; b += 1) {
      expect(overlap(practiceBoxes[a], practiceBoxes[b])).toBe(false);
    }
  });

  it("routes every course dependency orthogonally through gutters, never across a card", () => {
    const layout = buildPlaneCourseLayout(graphData, plane);
    const routes = buildDependencyRoutes({
      nodes: layout.nodes.filter((node) => node.kind === "knowledge"),
      chapters: layout.chapters,
      edges: graphData.knowledgeEdges
    });
    const cards = layout.nodes.filter((node) => node.kind === "knowledge").map((node) => ({
      id: node.id,
      left: node.x - node.width / 2,
      right: node.x + node.width / 2,
      top: node.y - node.height / 2,
      bottom: node.y + node.height / 2
    }));
    expect(routes.size).toBe(2);
    routes.forEach((points, edgeId) => {
      const edge = graphData.knowledgeEdges.find((item) => item.id === edgeId)!;
      for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index];
        const to = points[index + 1];
        expect(Math.abs(from.x - to.x) < 0.01 || Math.abs(from.y - to.y) < 0.01).toBe(true);
        const minX = Math.min(from.x, to.x);
        const maxX = Math.max(from.x, to.x);
        const minY = Math.min(from.y, to.y);
        const maxY = Math.max(from.y, to.y);
        cards.forEach((card) => {
          if (card.id === edge.source || card.id === edge.target) return;
          const overlaps = Math.min(maxX, card.right) - Math.max(minX, card.left) > 0.5
            && Math.min(maxY, card.bottom) - Math.max(minY, card.top) > 0.5;
          expect(overlaps, `${edgeId} crosses ${card.id}`).toBe(false);
        });
      }
    });
  });

  it("threads the route band through each step's left-edge number disc", () => {
    const layout = buildPlaneCourseLayout(graphData, plane);
    const cards = new Map(layout.nodes.filter((node) => node.kind === "knowledge").map((node) => [node.id, {
      id: node.id, x: node.x, y: -node.y, width: node.width, height: node.height, chapterId: node.chapterId
    }]));
    const ids = ["K1", "K2", "K3"];
    const track = buildRouteTrack(ids, cards);
    expect(track).toHaveLength(3);
    track.forEach((point, index) => {
      const card = cards.get(ids[index])!;
      // One point per step, on the disc, not a detour around the card edge.
      expect(point.x).toBeCloseTo(card.x - card.width / 2, 5);
      expect(point.y).toBeCloseTo(card.y, 5);
      expect(point.z).toBe(-24);
    });
  });

  it("offsets the reflection right-down-behind and swaps only by presentation", () => {
    expect(reflectionOffset(true, true)).toEqual({ x: 0, y: 0, z: 0 });
    expect(reflectionOffset(true, false)).toEqual(REFLECTION_OFFSET);
    expect(reflectionOffset(false, true)).toEqual(REFLECTION_OFFSET);
    expect(reflectionOffset(false, false)).toEqual({ x: 0, y: 0, z: 0 });
    const layout = buildPlaneCourseLayout(graphData, plane);
    const cards = buildPracticeCards(graphData);
    const solid = positionPracticeCards(cards, layout, true);
    const mirrored = positionPracticeCards(cards, layout, false);
    const k1 = layout.nodes.find((node) => node.id === "K1")!;
    expect(solid.find((card) => card.knowledgeId === "K1")).toMatchObject({ x: k1.x + REFLECTION_OFFSET.x, y: k1.y + REFLECTION_OFFSET.y, z: REFLECTION_OFFSET.z });
    expect(mirrored.find((card) => card.knowledgeId === "K1")).toMatchObject({ x: k1.x, y: k1.y, z: 0 });
  });

  it("interpolates the layer swap continuously and ends on the two states", () => {
    const skill = layerOffsetsAt(0);
    const practice = layerOffsetsAt(1);
    expect(skill.knowledge).toEqual({ x: 0, y: 0, z: 0 });
    expect(skill.practice).toEqual(REFLECTION_OFFSET);
    expect(practice.knowledge).toEqual(REFLECTION_OFFSET);
    expect(practice.practice).toEqual({ x: 0, y: 0, z: 0 });
    const half = layerOffsetsAt(0.5);
    expect(half.knowledge.x).toBeCloseTo(REFLECTION_OFFSET.x / 2);
    expect(half.practice.x).toBeCloseTo(REFLECTION_OFFSET.x / 2);
    expect(layerMixAt(0, 1, 0)).toBe(0);
    expect(layerMixAt(0, 1, 210, 420)).toBeCloseTo(0.5, 2);
    expect(layerMixAt(0, 1, 420, 420)).toBe(1);
    expect(layerMixAt(0, 1, 100, 420, true)).toBe(1);
  });

  it("keeps practice and knowledge on one canonical coordinate for the stage animation", () => {
    const layout = buildPlaneCourseLayout(graphData, plane);
    const cards = buildPracticeCards(graphData);
    const base = basePracticeCards(cards, layout);
    const knowledge = layout.nodes.find((node) => node.id === "K1")!;
    expect(base.find((card) => card.knowledgeId === "K1")).toMatchObject({ x: knowledge.x, y: knowledge.y, z: knowledge.z });
  });

  it("groups multiple practices for one Knowledge instead of silently picking the first", () => {
    const cards = buildPracticeCards(graphData);
    expect(cards.get("K1")).toMatchObject({ kind: "group", assignmentIds: ["A1", "A2"], count: 2, code: "01", title: "实践一" });
    // The group card is the single foreground card for K1; A2 is not drawn a
    // second time as a solid card. K2 keeps a dashed identity placeholder.
    expect([...cards.values()].filter((card) => card.kind === "assignment" && card.assignmentIds.includes("A2"))).toHaveLength(0);
    expect(cards.get("K2")).toMatchObject({ kind: "shadow", assignmentIds: ["A2"], code: "02" });
    expect(cards.get("K3")).toMatchObject({ kind: "empty", title: "暂无对应实训" });
    expect(assignmentKnowledgeMap(graphData).get("A2")).toEqual(["K1", "K2"]);
    expect(primaryKnowledgeByAssignment(graphData).get("A2")).toBe("K1");
  });

  it("swaps an open detail facet without losing the anchor", () => {
    const practice = buildPracticeCards(graphData);
    const assignmentKnowledge = assignmentKnowledgeMap(graphData);
    const primary = primaryKnowledgeByAssignment(graphData);
    expect(resolveFacetSelection({ selection: { kind: "knowledge", id: "K2" }, knowledgeInFront: false, practiceByKnowledge: practice, assignmentKnowledge, primaryKnowledge: primary })).toEqual({ kind: "practice", id: "A2" });
    expect(resolveFacetSelection({ selection: { kind: "practice", id: "A2" }, knowledgeInFront: true, practiceByKnowledge: practice, assignmentKnowledge, primaryKnowledge: primary })).toEqual({ kind: "knowledge", id: "K1" });
    expect(resolveFacetSelection({ selection: { kind: "knowledge", id: "K3" }, knowledgeInFront: false, practiceByKnowledge: practice, assignmentKnowledge, primaryKnowledge: primary })).toEqual({ kind: "knowledge", id: "K3" });
  });

  it("keeps dependencies, practice group, capabilities and adjacent route steps highlighted", () => {
    const relations = courseSelectionRelations({
      selection: { kind: "knowledge", id: "K2" },
      knowledgeIds: ["K1", "K2", "K3"],
      dependencyEdges: [{ source: "K1", target: "K2" }, { source: "K2", target: "K3" }],
      assignmentsByKnowledge: new Map([["K1", ["A1", "A2"]], ["K2", ["A2"]], ["K3", []]]),
      assignmentKnowledge: assignmentKnowledgeMap(graphData),
      capabilitySupports: new Map([["B1", ["K2"]]]),
      routeOrder: ["K1", "K2", "K3"]
    });
    expect([...relations.knowledgeIds].sort()).toEqual(["K1", "K2", "K3"]);
    expect(relations.practiceKnowledgeIds.has("K2")).toBe(true);
    expect(relations.capabilityIds.has("B1")).toBe(true);
    expect(relations.onRoute).toBe(true);
    expect(relations.relatedKeys.has("p:K1")).toBe(true);
    expect(relations.relatedKeys.has("c:B1")).toBe(true);
  });

  it("fades the route beam when the selection is not on the route", () => {
    const relations = courseSelectionRelations({
      selection: { kind: "knowledge", id: "K3" },
      knowledgeIds: ["K1", "K2", "K3"],
      dependencyEdges: [{ source: "K1", target: "K2" }],
      assignmentsByKnowledge: new Map(),
      assignmentKnowledge: new Map(),
      capabilitySupports: new Map(),
      routeOrder: ["K1", "K2"]
    });
    expect(relations.onRoute).toBe(false);
  });

  it("lays out a winding route with chapter banners and a current start slot", () => {
    const layout = buildWindingRoute([
      { id: "K1", title: "知识一", chapterId: "ch1", chapterTitle: "第一章", chapterNumber: 1, status: "done", stateLabel: "已学" },
      { id: "K2", title: "知识二", chapterId: "ch1", chapterTitle: "第一章", chapterNumber: 1, status: "current", stateLabel: "待学" },
      { id: "K3", title: "知识三", chapterId: "ch2", chapterTitle: "第二章", chapterNumber: 2, status: "locked", stateLabel: "待学" }
    ], 560);
    expect(layout.steps).toHaveLength(3);
    expect(layout.headers.map((header) => header.chapterId)).toEqual(["ch1", "ch2"]);
    expect(layout.currentIndex).toBe(1);
    expect(layout.path.startsWith("M ")).toBe(true);
    expect(layout.donePath.length).toBeGreaterThan(0);
    expect(layout.steps[1].y - layout.headers[0].y).toBeGreaterThan(80);
    expect(layout.steps[2].y - layout.steps[1].y).toBeGreaterThan(200);
    const second = buildWindingRoute([
      { id: "K1", title: "知识一", chapterId: "ch1", chapterTitle: "第一章", chapterNumber: 1, status: "done", stateLabel: "已学" },
      { id: "K2", title: "知识二", chapterId: "ch1", chapterTitle: "第一章", chapterNumber: 1, status: "current", stateLabel: "待学" },
      { id: "K3", title: "知识三", chapterId: "ch2", chapterTitle: "第二章", chapterNumber: 2, status: "locked", stateLabel: "待学" }
    ], 560);
    expect(second).toEqual(layout);
  });

  it("keys repeated chapter banners by their execution position", () => {
    const layout = buildWindingRoute([
      { id: "K1", title: "知识一", chapterId: "ch1", chapterTitle: "第一章", chapterNumber: 1, status: "done", stateLabel: "已学" },
      { id: "K2", title: "知识二", chapterId: "ch2", chapterTitle: "第二章", chapterNumber: 2, status: "done", stateLabel: "已学" },
      { id: "K3", title: "知识三", chapterId: "ch1", chapterTitle: "第一章", chapterNumber: 1, status: "current", stateLabel: "待学" }
    ], 560);
    expect(layout.steps.map((step) => step.id)).toEqual(["K1", "K2", "K3"]);
    expect(layout.headers.map((header) => header.chapterId)).toEqual(["ch1", "ch2", "ch1"]);
    expect(new Set(layout.headers.map((header) => header.id)).size).toBe(3);
    expect(layout.headers[0].id).not.toBe(layout.headers[2].id);
  });
});


describe("complete capability path selection", () => {
  const supportEdges = [
    { id: "a", source: "ACQ", target: "B" },
    { id: "b", source: "B", target: "C" },
    { id: "c", source: "C", target: "K" },
    { id: "d", source: "D", target: "K" },
    { id: "e", source: "X", target: "Y" }
  ];

  it("walks upstream from the selected Knowledge to every acquired entry", () => {
    const path = capabilityPathToTargets({ targetNodeIds: ["K"], supportEdges, acquiredNodeIds: ["ACQ"] });
    expect([...path.nodeIds].sort()).toEqual(["ACQ", "B", "C", "K"]);
    expect([...path.edgeIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("excludes ancestors that are not reachable from an acquired capability", () => {
    const path = capabilityPathToTargets({ targetNodeIds: ["K"], supportEdges, acquiredNodeIds: ["NOPE"] });
    expect([...path.nodeIds]).toEqual([]);
    expect([...path.edgeIds]).toEqual([]);
  });

  it("keeps the knowledge node itself when it is already acquired", () => {
    const path = capabilityPathToTargets({ targetNodeIds: ["K"], supportEdges, acquiredNodeIds: ["K"] });
    expect([...path.nodeIds]).toEqual(["K"]);
  });

  it("lights only the one-hop capability supporters of the selected Knowledge", () => {
    const relations = courseSelectionRelations({
      selection: { kind: "knowledge", id: "K" },
      knowledgeIds: ["K", "K2"],
      dependencyEdges: [],
      assignmentsByKnowledge: new Map(),
      assignmentKnowledge: new Map(),
      capabilitySupports: new Map([["B", ["K"]], ["C", ["K"]]]),
      routeOrder: ["K"],
      supportEdges,
      acquiredNodeIds: ["ACQ"],
      modelNodeIds: ["ACQ", "B", "C", "D", "K"]
    });
    // P4R6: only the capabilities directly supporting K are one hop away;
    // ACQ and B need a second hop through C and are therefore not included.
    expect([...relations.capabilityIds].sort()).toEqual(["C", "D"]);
    expect([...relations.edgeIds].sort()).toEqual(["c", "d"]);
  });
});
