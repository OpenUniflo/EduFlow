import { describe, expect, it } from "vitest";
import { buildFirstSegment, projectLearnedMap, summarizeFirstSegment, type AssignmentProgressStatus, type LearnerEvidenceStatus } from "./firstSegment";

const micro = (pathId: string, title: string, minutes = 5) => ({ pathId, title, estimatedMinutes: minutes });
const practice = (assignmentId: string, title: string, minutes = 15) => ({ assignmentId, title, estimatedMinutes: minutes });

describe("first segment derivation", () => {
  const ordered = ["A02", "AGC01", "R10", "AGC02", "AGC03"];
  const microByNode = new Map([
    ["A02", micro("p-a02", "Agent：从回答到行动", 7)],
    ["AGC01", micro("p-agc01", "观察与动作", 5)],
    ["R10", micro("p-r10", "ReAct", 7)],
    ["AGC02", micro("p-agc02", "Harness", 7)]
  ]);
  const practiceByNode = new Map([
    ["R10", practice("task-r10", "跑通最小 ReAct 循环")],
    ["AGC02", practice("task-agc02", "组装最小 Harness")]
  ]);

  it("ends at the first Assignment and includes the Micro on that node", () => {
    const segment = buildFirstSegment({
      orderedNodeIds: ordered,
      microByNode,
      practiceByNode,
      knowledgeStatusByNode: new Map(),
      assignmentStatusByAssignment: new Map()
    });
    expect(segment.steps.map((step) => step.id)).toEqual(["micro:p-a02", "micro:p-agc01", "micro:p-r10", "practice:task-r10"]);
    expect(segment.boundaryNodeId).toBe("R10");
    expect(segment.totalMinutes).toBe(34);
    expect(segment.steps[0].status).toBe("now");
    expect(segment.started).toBe(false);
  });

  it("is complete only when every Micro is learned and the task passed", () => {
    const statuses = new Map<string, LearnerEvidenceStatus>([["A02", "learned"], ["AGC01", "learned"], ["R10", "learned"]]);
    const assignments = new Map<string, AssignmentProgressStatus>([["task-r10", "needs_revision"]]);
    const pending = buildFirstSegment({ orderedNodeIds: ordered, microByNode, practiceByNode, knowledgeStatusByNode: statuses, assignmentStatusByAssignment: assignments });
    expect(pending.complete).toBe(false);
    expect(pending.completedCount).toBe(3);
    expect(pending.currentStep?.id).toBe("practice:task-r10");
    const passed = buildFirstSegment({ orderedNodeIds: ordered, microByNode, practiceByNode, knowledgeStatusByNode: statuses, assignmentStatusByAssignment: new Map([["task-r10", "accepted"]]) });
    expect(passed.complete).toBe(true);
    expect(passed.steps.every((step) => step.status === "done")).toBe(true);
    expect(summarizeFirstSegment(passed)).toEqual({
      learnedSteps: [
        { id: "micro:p-a02", nodeId: "A02", title: "Agent：从回答到行动" },
        { id: "micro:p-agc01", nodeId: "AGC01", title: "观察与动作" },
        { id: "micro:p-r10", nodeId: "R10", title: "ReAct" }
      ],
      passedTasks: [{ id: "practice:task-r10", assignmentId: "task-r10", title: "跑通最小 ReAct 循环" }],
      learnedNodeIds: ["A02", "AGC01", "R10"],
      complete: true
    });
  });

  it("marks an in-progress Micro as started even before the first completion", () => {
    const segment = buildFirstSegment({ orderedNodeIds: ordered, microByNode, practiceByNode, knowledgeStatusByNode: new Map([["A02", "learning"]]), assignmentStatusByAssignment: new Map() });
    expect(segment.started).toBe(true);
    expect(segment.completedCount).toBe(0);
  });

  it("falls back to the first three Micro paths only when the Course has no Assignment", () => {
    const segment = buildFirstSegment({
      orderedNodeIds: ordered,
      microByNode,
      practiceByNode: new Map(),
      knowledgeStatusByNode: new Map(),
      assignmentStatusByAssignment: new Map()
    });
    expect(segment.steps).toHaveLength(3);
    expect(segment.boundaryNodeId).toBeUndefined();
  });
});

describe("learned mini-map projection", () => {
  it("keeps only learned nodes and edges whose endpoints are both learned", () => {
    const map = projectLearnedMap({
      learnedNodeIds: ["A02", "AGC01", "R10"],
      orderedNodeIds: ["A02", "AGC01", "R10", "not-learned"],
      titles: new Map([["A02", "Agent 结构"], ["AGC01", "观察与动作"], ["R10", "ReAct"]]),
      edges: [
        { id: "e1", source: "A02", target: "AGC01" },
        { id: "e2", source: "AGC01", target: "R10" },
        { id: "e3", source: "R10", target: "not-learned" }
      ]
    });
    expect(map.nodes.map((node) => node.id)).toEqual(["A02", "AGC01", "R10"]);
    expect(map.edges.map((edge) => edge.id)).toEqual(["e1", "e2"]);
    expect(map.nodes.every((node) => node.x > 0 && node.y > 0)).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const input = { learnedNodeIds: ["B", "A"], titles: new Map([["A", "A"], ["B", "B"]]), edges: [] };
    expect(projectLearnedMap(input)).toEqual(projectLearnedMap(input));
  });
});
