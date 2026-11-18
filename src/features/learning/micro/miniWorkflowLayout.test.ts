import { describe, expect, it } from "vitest";
import { layoutMicroWorkflow, microWorkflowBoxesOverlap, microWorkflowLayoutHasOverlap } from "./miniWorkflowLayout";

const nodes = ["START", "LLM", "TOOL", "LLM RESULT", "END"];

function rotations(values: string[]) {
  return values.map((_, index) => [...values.slice(index), ...values.slice(0, index)]);
}

describe("mini workflow layout", () => {
  it("places every node once and never overlaps bounding boxes for rotations", () => {
    for (const order of rotations(nodes)) {
      const boxes = layoutMicroWorkflow(order);
      expect(boxes.map((box) => box.id)).toEqual(order);
      expect(new Set(boxes.map((box) => `${box.x}:${box.y}`)).size).toBe(order.length);
      expect(microWorkflowLayoutHasOverlap(boxes)).toBe(false);
    }
  });

  it("keeps a shuffled real interaction order free of overlap", () => {
    const boxes = layoutMicroWorkflow(["TOOL", "END", "START", "LLM RESULT", "LLM"]);
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        expect(microWorkflowBoxesOverlap(boxes[left], boxes[right])).toBe(false);
      }
    }
    expect(microWorkflowLayoutHasOverlap(boxes)).toBe(false);
  });
});
