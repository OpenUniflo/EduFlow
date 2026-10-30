import { describe, expect, it } from "vitest";
import type { UserKnowledgeRecord } from "@/features/profile/types";
import { learnerLabel, summarizeLearnerState } from "./learnerStateProjection";

const record = (nodeId: string, status: UserKnowledgeRecord["status"], updatedAt: string): UserKnowledgeRecord => ({ nodeId, status, updatedAt });

describe("course learner-state projection", () => {
  const courseIds = Array.from({ length: 31 }, (_, index) => `K${String(index).padStart(2, "0")}`);
  const records: UserKnowledgeRecord[] = [
    record("K00", "mastered", "2026-10-01T00:00:00.000Z"),
    record("K01", "mastered", "2026-10-02T00:00:00.000Z"),
    ...courseIds.slice(2, 26).map((id, index) => record(id, "learned", `2026-10-0${(index % 9) + 3}T00:00:00.000Z`)),
    ...courseIds.slice(26, 30).map((id, index) => record(id, "learning", `2026-10-${String(20 + index).padStart(2, "0")}T00:00:00.000Z`)),
    record("K30", "practicing", "2026-10-30T00:00:00.000Z")
  ];

  it("legend categories are mutually exclusive and sum to the Course Knowledge count", () => {
    const { counts } = summarizeLearnerState(records, courseIds);
    expect(counts).toMatchObject({ acquired: 27, learning: 4, pending: 0, total: 31, target: 4, current: 1, currentId: "K26" });
    expect(counts.acquired + counts.learning + counts.pending).toBe(courseIds.length);
    // The target dimension overlaps status and is deliberately outside the total.
    expect(counts.target).toBe(4);
  });

  it("uses exactly one current item and follows curriculum order, not the latest update", () => {
    const { counts, nodes } = summarizeLearnerState(records, courseIds);
    expect(nodes.filter((node) => node.current).map((node) => node.nodeId)).toEqual(["K26"]);
    expect(counts.current).toBe(1);
    expect(counts.currentId).toBe("K26");
  });

  it("classifies every node with the same category used by the legend and label", () => {
    const { counts, nodes } = summarizeLearnerState(records, courseIds);
    expect(nodes).toHaveLength(counts.total);
    nodes.forEach((node) => {
      expect(node.label).toBe(learnerLabel(node.category));
      if (node.status === "mastered" || node.status === "learned" || node.status === "practicing") {
        expect(node.category).toBe("acquired");
        expect(node.label).toBe("已学");
      } else if (node.status === "learning") {
        expect(node.category).toBe("learning");
        expect(node.label).toBe("在学");
      }
    });
    expect(nodes.filter((node) => node.category === "acquired")).toHaveLength(counts.acquired);
    expect(nodes.filter((node) => node.category === "learning")).toHaveLength(counts.learning);
    expect(nodes.filter((node) => node.category === "pending")).toHaveLength(counts.pending);
  });

  it("puts Knowledge without UserKnowledgeState into 待学", () => {
    const { counts, nodes } = summarizeLearnerState([record("K19", "mastered", "2026-10-01T00:00:00.000Z")], courseIds);
    expect(counts).toMatchObject({ acquired: 1, learning: 0, pending: 30, total: 31, target: 30, current: 0, currentId: null });
    expect(nodes.find((node) => node.nodeId === "K19")?.label).toBe("已学");
    expect(nodes.find((node) => node.nodeId === "K20")?.label).toBe("待学");
    expect(nodes.find((node) => node.nodeId === "K20")?.status).toBeNull();
  });

  it("treats explore as 待学 but keeps it in the status total", () => {
    const { counts, nodes } = summarizeLearnerState([
      record("K00", "learning", "2026-10-01T00:00:00.000Z"),
      record("K01", "explore", "2026-10-02T00:00:00.000Z")
    ], courseIds);
    expect(counts).toMatchObject({ acquired: 0, learning: 1, pending: 30, explore: 1, total: 31, target: 31 });
    expect(nodes.find((node) => node.nodeId === "K01")?.label).toBe("待学");
  });

  it("ignores records outside the Course", () => {
    const { counts } = summarizeLearnerState([
      record("outside", "learning", "2026-10-31T00:00:00.000Z"),
      record("K02", "mastered", "2026-10-04T00:00:00.000Z"),
      record("K03", "learning", "2026-10-03T00:00:00.000Z")
    ], courseIds);
    expect(counts).toMatchObject({ acquired: 1, learning: 1, pending: 29, total: 31, target: 30, current: 1, currentId: "K03" });
  });

  it("falls back to the earliest learned/practicing item when nothing is explicitly in progress", () => {
    const { counts } = summarizeLearnerState([
      record("K05", "practicing", "2026-10-05T00:00:00.000Z"),
      record("K04", "learned", "2026-10-04T00:00:00.000Z")
    ], courseIds);
    expect(counts.currentId).toBe("K04");
    expect(counts.current).toBe(1);
  });
});
