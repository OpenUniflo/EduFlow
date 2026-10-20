import { expect, it } from "vitest";
import { getSmoothStepPath, Position } from "@xyflow/react";
import { automaticRouteCorridor, routeEntersConnectedNode } from "./routing";

it("rejects the observed route from a top port into its own node and permits outside routes", () => {
  const bounds = [{ x: 260, y: 148, width: 170, height: 150 }, { x: 480, y: 160, width: 170, height: 171.3 }];
  expect(routeEntersConnectedNode([{x:345,y:148},{x:345,y:218.65},{x:565,y:331.3}], bounds)).toBe(true);
  expect(routeEntersConnectedNode([{x:345,y:148},{x:345,y:120},{x:700,y:120},{x:700,y:360},{x:565,y:360},{x:565,y:331.3}], bounds)).toBe(false);
});
it("detects a segment crossing a moved node even when all control points are outside", () => {
  expect(routeEntersConnectedNode([{x:0,y:0},{x:300,y:0}], [{x:100,y:-50,width:100,height:100}])).toBe(true);
  expect(routeEntersConnectedNode([{x:0,y:-50},{x:300,y:-50}], [{x:100,y:-50,width:100,height:100}])).toBe(false);
});

it("keeps the real backwards loop outside both connected nodes using the SDK router", () => {
  const bounds = [{ x: 828, y: 228, width: 170, height: 150 }, { x: 260, y: 200, width: 170, height: 171 }];
  const source = { x: 998, y: 303 }; const target = { x: 260, y: 260 };
  const [path] = getSmoothStepPath({ sourceX: source.x, sourceY: source.y, targetX: target.x, targetY: target.y, sourcePosition: Position.Right, targetPosition: Position.Left, ...automaticRouteCorridor(source, target, "right", "left", bounds) });
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const points = Array.from({ length: numbers.length / 2 }, (_, index) => ({ x: numbers[index * 2], y: numbers[index * 2 + 1] }));
  expect(routeEntersConnectedNode(points, bounds)).toBe(false);
});
