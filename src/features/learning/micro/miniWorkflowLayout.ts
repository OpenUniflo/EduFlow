export const microWorkflowNodeWidth = 132;
export const microWorkflowNodeHeight = 56;

export type MicroWorkflowBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Deterministic vertical flow used by the mini workflow canvas. Keeping the
 * layout pure means the canvas and its tests agree on every node rectangle.
 */
export function layoutMicroWorkflow(order: readonly string[]): MicroWorkflowBox[] {
  const gapY = 24;
  const inset = 24;
  return order.map((id, index) => ({
    id,
    x: 0,
    y: inset + index * (microWorkflowNodeHeight + gapY),
    width: microWorkflowNodeWidth,
    height: microWorkflowNodeHeight
  }));
}

export function microWorkflowBoxesOverlap(left: MicroWorkflowBox, right: MicroWorkflowBox) {
  return left.x < right.x + right.width
    && right.x < left.x + left.width
    && left.y < right.y + right.height
    && right.y < left.y + left.height;
}

/** Pairwise check used by the layout test; ordering-independent. */
export function microWorkflowLayoutHasOverlap(boxes: readonly MicroWorkflowBox[]) {
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      if (microWorkflowBoxesOverlap(boxes[left], boxes[right])) return true;
    }
  }
  return false;
}
