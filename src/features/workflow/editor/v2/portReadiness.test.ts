import { expect, it } from "vitest";
import { canvasPortSignature, edgesWithMeasuredPorts } from "./portReadiness";

it("waits for both endpoints and remeasures a rewired target without hiding unrelated edges", () => {
  const source = { id: "start", data: { outlets: ["next"] } };
  const oldTarget = { id: "end", data: { outlets: [], targets: [{ id: "edge" }] } };
  const nextTarget = { id: "next", data: { outlets: ["next"], targets: [{ id: "edge" }] } };
  const ready = { start: canvasPortSignature(source.data), end: canvasPortSignature(oldTarget.data) };
  const oldEdge = { id: "edge", source: "start", target: "end" };
  expect(edgesWithMeasuredPorts([oldEdge], [source, oldTarget], {})).toEqual([]);
  expect(edgesWithMeasuredPorts([oldEdge], [source, oldTarget], ready)).toEqual([oldEdge]);
  const changed = { ...nextTarget, data: { ...nextTarget.data, targets: [{ id: "edge", placement: { side: "top" as const, offset: .3 } }] } };
  const moved = { ...oldEdge, target: "next" };
  const unaffected = { id: "other", source: "start", target: "end" };
  const stale = { ...ready, next: canvasPortSignature(nextTarget.data) };
  expect(edgesWithMeasuredPorts([moved, unaffected], [source, oldTarget, changed], stale)).toEqual([unaffected]);
  expect(edgesWithMeasuredPorts([moved], [source, changed], { ...ready, next: canvasPortSignature(changed.data) })).toEqual([moved]);
});
