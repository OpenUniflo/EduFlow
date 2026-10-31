import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CapabilityModel } from "@/shared/learning/routePlanning";
import type { CourseGraphData } from "../runtime/courseRuntime";
import type { CourseChapterTree } from "../graph/courseChapterTree";
import {
  buildCapabilitySceneLayout,
  buildImmersiveCourseLayout,
  capabilitySupportByNode,
  clearImmersiveLayoutCache,
  flattenCapabilityLayout,
  immersiveLayoutLoadCount,
  layoutCapabilityFlatten,
  layoutCapabilityFlattenLayout,
  layoutVerticalRoute,
  layoutVerticalRouteFlow,
  loadImmersiveCourseLayout,
  placeCapabilityAnchors
} from "./immersiveLayout";

const tree: CourseChapterTree = {
  width: 600,
  height: 420,
  chapters: [
    { id: "ch1", title: "第一章", displayNumber: 1, layer: 0, orderInLayer: 0, x: 0, y: 0, width: 200, height: 180, knowledgeCount: 3, learnedCount: 1, assignmentCount: 1, progress: 33, tone: 1 },
    { id: "ch2", title: "第二章", displayNumber: 2, layer: 1, orderInLayer: 0, x: 260, y: 0, width: 200, height: 180, knowledgeCount: 2, learnedCount: 0, assignmentCount: 1, progress: 0, tone: 2 }
  ],
  nodes: [
    { id: "K1", title: "知识一", chapterId: "ch1", chapterTitle: "第一章", status: "completed", current: false, x: 12, y: 32, width: 116, height: 28 },
    { id: "K2", title: "知识二", chapterId: "ch1", chapterTitle: "第一章", status: "learning", current: true, x: 12, y: 67, width: 116, height: 28 },
    { id: "K3", title: "知识三", chapterId: "ch1", chapterTitle: "第一章", status: "available", current: false, x: 12, y: 102, width: 116, height: 28 },
    { id: "K4", title: "知识四", chapterId: "ch2", chapterTitle: "第二章", status: "locked", current: false, x: 272, y: 32, width: 116, height: 28 },
    { id: "K5", title: "知识五", chapterId: "ch2", chapterTitle: "第二章", status: "available", current: false, x: 272, y: 67, width: 116, height: 28 }
  ],
  edges: [
    { id: "chapter:e1", source: "ch1", target: "ch2", kind: "chapter", crossChapter: true, path: "" }
  ]
};

const knowledgeNode = (id: string, chapterId: string, title: string, status: "completed" | "learning" | "available" | "locked", assignmentIds: string[] = []) => ({
  id,
  title,
  chapterId,
  status,
  assignmentIds,
  assignmentContexts: assignmentIds.map((assignmentId) => ({
    assignmentId,
    assignment: { id: assignmentId, courseId: "course", title: `实训 ${assignmentId}`, order: 1 },
    state: { status: "started" }
  })),
  materialContexts: [],
  primaryCoverage: { lessonOrder: 1, order: 1 }
});

const graphData = {
  courseId: "course",
  revision: "r1",
  chapters: [
    { id: "ch1", title: "第一章", displayNumber: 1, order: 1, knowledgeProgress: 33, assignmentSummary: { assignmentCount: 1 } },
    { id: "ch2", title: "第二章", displayNumber: 2, order: 2, knowledgeProgress: 0, assignmentSummary: { assignmentCount: 1 } }
  ],
  knowledgeNodes: [
    knowledgeNode("K1", "ch1", "知识一", "completed"),
    knowledgeNode("K2", "ch1", "知识二", "learning", ["A1"]),
    knowledgeNode("K3", "ch1", "知识三", "available"),
    knowledgeNode("K4", "ch2", "知识四", "locked"),
    knowledgeNode("K5", "ch2", "知识五", "available", ["A2"])
  ],
  knowledgeEdges: [
    { id: "e1", source: "K1", target: "K2", relation: "prerequisite", strength: "hard" },
    { id: "e2", source: "K2", target: "K3", relation: "enables", strength: 1 },
    { id: "e3", source: "K3", target: "K4", relation: "prerequisite", strength: "soft" }
  ],
  chapterEdges: [{ id: "ce1", source: "ch1", target: "ch2", primaryRelation: "prerequisite", sourceKind: "knowledge", supportCount: 1 }],
  assignmentSummary: {}
} as unknown as CourseGraphData;

const model: CapabilityModel = {
  orderedNodeIds: ["B1", "K1", "K2", "B2", "K3"],
  prerequisiteEdges: [
    { id: "p1", source: "B1", target: "K1", strength: "hard" },
    { id: "p2", source: "K1", target: "K2", strength: "hard" },
    { id: "p3", source: "B2", target: "K3", strength: "hard" }
  ],
  supportEdges: [
    { id: "p1", source: "B1", target: "K1", strength: "hard", relation: "prerequisite" },
    { id: "p2", source: "K1", target: "K2", strength: "hard", relation: "prerequisite" },
    { id: "p3", source: "B2", target: "K3", strength: "hard", relation: "prerequisite" },
    { id: "s1", source: "K2", target: "K3", relation: "enables", strength: 1 }
  ],
  courseKnowledgeIds: ["K1", "K2", "K3"],
  currentKnowledgeIds: ["K1"],
  bridgeKnowledgeIds: ["B1", "B2"],
  actionableNodeIds: ["K2"],
  connectedCourseKnowledgeIds: ["K1", "K2", "K3"],
  disconnectedCourseKnowledgeIds: []
};

beforeEach(() => clearImmersiveLayoutCache());

describe("capability support and placement", () => {
  it("counts direct and indirect factual support without unexplained zeros", () => {
    const direct = capabilitySupportByNode(model);
    expect(direct.get("B1")).toMatchObject({ direct: ["K1"], indirect: [] });
    expect(direct.get("B2")).toMatchObject({ direct: ["K3"], indirect: [] });
    const chained: CapabilityModel = {
      ...model,
      orderedNodeIds: ["A1", "B1", "K1", "K2"],
      supportEdges: [
        { id: "a1", source: "A1", target: "B1", strength: "hard", relation: "prerequisite" },
        { id: "a2", source: "B1", target: "K1", strength: "hard", relation: "prerequisite" },
        { id: "a3", source: "B1", target: "K2", strength: "hard", relation: "prerequisite" }
      ],
      courseKnowledgeIds: ["K1", "K2"],
      currentKnowledgeIds: [],
      bridgeKnowledgeIds: ["A1", "B1"]
    };
    const chainedSupport = capabilitySupportByNode(chained);
    expect(chainedSupport.get("A1")).toMatchObject({ direct: [], indirect: ["K1", "K2"] });
    expect(chainedSupport.get("B1")).toMatchObject({ direct: ["K1", "K2"], indirect: [] });
  });

  it("places a capability behind the centre of the Knowledge it supports", () => {
    const positions = new Map([
      ["K1", { x: -100, y: 40, z: 0 }],
      ["K2", { x: 100, y: -20, z: 0 }]
    ]);
    const placement = placeCapabilityAnchors(new Map([["C1", ["K1", "K2"]]]), positions);
    expect(placement.get("C1")).toMatchObject({ x: 0, y: 10 });
    expect(placement.get("C1")!.z).toBeLessThan(-200);
  });

  it("fans several capabilities sharing an anchor around that anchor without a corner pile", () => {
    const positions = new Map([["K1", { x: 40, y: 30, z: 0 }]]);
    const supports = new Map([["C1", ["K1"]], ["C2", ["K1"]], ["C3", ["K1"]], ["C4", ["K1"]]]);
    const placement = placeCapabilityAnchors(supports, positions);
    const points = [...placement.values()];
    expect(new Set(points.map((point) => `${point.x}:${point.y}`)).size).toBe(points.length);
    points.forEach((point) => {
      expect(Math.hypot(point.x - 40, point.y - 30)).toBeLessThanOrEqual(100);
      expect(point.z).toBeLessThan(-200);
    });
  });
});

describe("immersive course layout", () => {
  it("uses one ELK-derived layout for a structural revision and reuses it across presentation changes", async () => {
    const loader = vi.fn(async () => tree);
    const first = await loadImmersiveCourseLayout(graphData, loader);
    const second = await loadImmersiveCourseLayout(graphData, loader);
    expect(first).toBe(second);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(immersiveLayoutLoadCount()).toBe(1);

    buildImmersiveCourseLayout(graphData, first);
    buildImmersiveCourseLayout(graphData, first);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(immersiveLayoutLoadCount()).toBe(1);

    await loadImmersiveCourseLayout({ ...graphData, revision: "r2" }, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(immersiveLayoutLoadCount()).toBe(2);
  });

  it("keeps knowledge and assignment positions deterministic and shares chapter coordinates", () => {
    const first = buildImmersiveCourseLayout(graphData, tree);
    const second = buildImmersiveCourseLayout(graphData, tree);
    expect(second.nodes.map((node) => [node.id, node.x, node.y, node.z])).toEqual(first.nodes.map((node) => [node.id, node.x, node.y, node.z]));
    expect(first.chapters).toHaveLength(2);
    expect(first.nodes.filter((node) => node.kind === "assignment").map((node) => node.id).sort()).toEqual(["A1", "A2"]);
    expect(first.nodes.filter((node) => node.kind === "knowledge")).toHaveLength(5);
  });

  it("keeps capability and flattened projections on the same node and edge sets", () => {
    const courseLayout = buildImmersiveCourseLayout(graphData, tree);
    const spatial = buildCapabilitySceneLayout(courseLayout, model);
    const flattened = flattenCapabilityLayout(spatial, model);
    expect(flattened.nodes.map((node) => node.id).sort()).toEqual(spatial.nodes.map((node) => node.id).sort());
    expect(flattened.nodes.map((node) => node.id).sort()).toEqual([...model.orderedNodeIds].sort());
    expect(flattened.edges.map((edge) => edge.id).sort()).toEqual(spatial.edges.map((edge) => edge.id).sort());
    expect(flattened.edges.map((edge) => edge.id).sort()).toEqual(model.supportEdges.map((edge) => edge.id).sort());
  });

  it("places non-course ancestors directly behind the course Knowledge they support", () => {
    const courseLayout = buildImmersiveCourseLayout(graphData, tree);
    const spatial = buildCapabilitySceneLayout(courseLayout, model);
    const bridge = spatial.nodes.find((node) => node.id === "B1")!;
    const course = spatial.nodes.find((node) => node.id === "K1")!;
    expect(bridge.bridge).toBe(true);
    expect(Math.abs(bridge.x - course.x)).toBeLessThanOrEqual(8);
    expect(Math.abs(bridge.y - course.y)).toBeLessThanOrEqual(8);
    expect(bridge.z).toBeLessThan(course.z);
  });

  it("lays practice cards on a deterministic grid without overlaps", () => {
    const first = buildImmersiveCourseLayout(graphData, tree);
    const second = buildImmersiveCourseLayout(graphData, tree);
    const cards = first.nodes.filter((node) => node.kind === "assignment");
    expect(cards.map((node) => [node.id, node.x, node.y])).toEqual(second.nodes.filter((node) => node.kind === "assignment").map((node) => [node.id, node.x, node.y]));
    for (let left = 0; left < cards.length; left += 1) for (let right = left + 1; right < cards.length; right += 1) {
      const a = cards[left];
      const b = cards[right];
      const overlaps = Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;
      expect(overlaps).toBe(false);
    }
  });

  it("wraps a large target band into sub-columns instead of one endless column", () => {
    const targets = Array.from({ length: 40 }, (_, index) => `T${String(index).padStart(2, "0")}`);
    const large: CapabilityModel = {
      ...model,
      orderedNodeIds: [...targets, "K1"],
      courseKnowledgeIds: [...targets, "K1"],
      supportEdges: [],
      prerequisiteEdges: [],
      currentKnowledgeIds: ["K1"],
      bridgeKnowledgeIds: [],
      connectedCourseKnowledgeIds: targets,
      disconnectedCourseKnowledgeIds: []
    };
    const layout = layoutCapabilityFlattenLayout(large);
    const targetColumn = layout.columns.find((column) => column.kind === "target")!;
    expect(targetColumn.count).toBe(40);
    const xs = new Set(targets.map((id) => layout.positions.get(id)!.x));
    expect(xs.size).toBe(2);
    expect(layout.columns.map((column) => column.label)).toEqual(["已获得", "目标"]);
  });

  it("keeps only formally mastered Knowledge in the acquired column and places learned support by depth", () => {
    const routed: CapabilityModel = {
      ...model,
      orderedNodeIds: ["B1", "K1", "K2", "B2", "K3"],
      currentKnowledgeIds: ["K1", "K2"],
      courseKnowledgeIds: ["K1", "K2", "K3"]
    };
    const layout = layoutCapabilityFlattenLayout(routed, { acquiredNodeIds: ["K1"] });
    expect(layout.columns.find((column) => column.kind === "acquired")!.nodeIds).toEqual(["K1"]);
    expect(layout.columns.find((column) => column.kind === "intermediate")!.nodeIds).toContain("K2");
    expect(layout.columns.find((column) => column.kind === "target")!.nodeIds).toEqual(["K3"]);
    const acquired = layout.columns.find((column) => column.kind === "acquired")!;
    const target = layout.columns.find((column) => column.kind === "target")!;
    expect(acquired.count).toBe(1);
    expect(target.count).toBe(1);
  });

  it("honours explicit course targets and leaves the rest as intermediate capability", () => {
    const routed: CapabilityModel = {
      ...model,
      orderedNodeIds: ["K1", "K2", "K3", "B1"],
      currentKnowledgeIds: ["K1"],
      courseKnowledgeIds: ["K1", "K2", "K3"]
    };
    const layout = layoutCapabilityFlattenLayout(routed, { acquiredNodeIds: ["K1"], targetNodeIds: ["K2"] });
    expect(layout.columns.find((column) => column.kind === "acquired")!.nodeIds).toEqual(["K1"]);
    expect(layout.columns.find((column) => column.kind === "intermediate")!.nodeIds).toEqual(["B1", "K3"]);
    expect(layout.columns.find((column) => column.kind === "target")!.nodeIds).toEqual(["K2"]);
    expect(layout.columns.map((column) => column.label)).toEqual(["已获得", "中间能力", "目标"]);
  });

  it("gives every vertical route step and chapter strip a non-touching slot", () => {
    const steps = ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8"].map((id, index) => ({
      id,
      chapterId: index < 3 ? "ch1" : index < 6 ? "ch2" : "ch3",
      chapterTitle: `第 ${index < 3 ? 1 : index < 6 ? 2 : 3} 章`,
      chapterNumber: index < 3 ? 1 : index < 6 ? 2 : 3
    }));
    const flow = layoutVerticalRouteFlow(steps, 920);
    const rows = steps.map((step) => flow.positions.get(step.id)!.y).sort((left, right) => left - right);
    for (let index = 1; index < rows.length; index += 1) expect(rows[index] - rows[index - 1]).toBeGreaterThanOrEqual(130);
    flow.headers.forEach((header) => {
      const chapterSteps = steps.filter((step) => step.chapterId === header.chapterId).map((step) => flow.positions.get(step.id)!.y);
      expect(Math.min(...chapterSteps) - (header.y + header.height / 2)).toBeGreaterThan(40);
    });
    expect(new Set(rows).size).toBe(steps.length);
  });

  it("is a pure function of model structure: same structure gives the same flipped positions", () => {
    const first = layoutCapabilityFlatten(model);
    const reordered: CapabilityModel = {
      ...model,
      orderedNodeIds: [...model.orderedNodeIds].reverse(),
      supportEdges: [...model.supportEdges].reverse(),
      currentKnowledgeIds: [...model.currentKnowledgeIds].reverse(),
      bridgeKnowledgeIds: [...model.bridgeKnowledgeIds].reverse()
    };
    const second = layoutCapabilityFlatten(reordered);
    expect([...second.entries()].sort()).toEqual([...first.entries()].sort());
    expect(layoutCapabilityFlatten(model)).toEqual(first);
  });

  it("places the vertical route by execution order without duplicates", () => {
    const layout = layoutVerticalRoute(["K1", "K2", "K3", "K2"]);
    expect([...layout.keys()]).toEqual(["K1", "K2", "K3"]);
    expect(layout.get("K1")!.y).toBeLessThan(layout.get("K2")!.y);
    expect(layout.get("K2")!.y).toBeLessThan(layout.get("K3")!.y);
  });
});


describe("compressed capability layers", () => {
  const positions = new Map([
    ["K1", { x: 0, y: 0, z: 0 }],
    ["K2", { x: 400, y: 0, z: 0 }]
  ]);

  it("uses at most three close layers instead of stretching a long diagonal", () => {
    const chain = placeCapabilityAnchors(
      new Map([["C1", ["K1"]], ["C2", ["K1"]], ["C3", ["K1"]]]),
      positions,
      new Map(),
      {
        baseZ: -280,
        edges: [
          { source: "C1", target: "K1" },
          { source: "C2", target: "C1" },
          { source: "C3", target: "C2" }
        ]
      }
    );
    const c1 = chain.get("C1")!;
    const c2 = chain.get("C2")!;
    const c3 = chain.get("C3")!;
    expect(c1.z).toBe(-280);
    expect(c2.z).toBe(-334);
    expect(c3.z).toBe(-388);
    expect(c2.z - c1.z).toBeLessThanOrEqual(54);
    expect(c3.y - c2.y).toBeLessThanOrEqual(26);
  });
});
