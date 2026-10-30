import { describe, expect, it } from "vitest";
import { buildPlaneDependencyRoutes, type PlaneDependencyChapter, type PlaneDependencyRoute } from "./coursePlaneDependencies";

const CARD_WIDTH = 176;
const CARD_HEIGHT = 40;
const PITCH_X = CARD_WIDTH + 20;
const PITCH_Y = CARD_HEIGHT + 16;

function fixture(chapters: number, rows: number) {
  // Same centred y-up coordinate system produced by composeCoursePlane.
  const worldWidth = chapters * PITCH_X;
  const worldHeight = 56 + rows * CARD_HEIGHT + (rows - 1) * (PITCH_Y - CARD_HEIGHT) + 16;
  const positions: Record<string, { x: number; y: number; z: number }> = {};
  const boxes: PlaneDependencyChapter[] = [];
  for (let chapter = 0; chapter < chapters; chapter += 1) {
    const chapterX = chapter * PITCH_X - worldWidth / 2;
    const top = worldHeight / 2;
    boxes.push({ x: chapterX, y: top, width: PITCH_X, height: worldHeight });
    for (let row = 0; row < rows; row += 1) {
      positions[`c${chapter}-r${row}`] = {
        x: chapterX + PITCH_X / 2,
        y: top - 56 - row * PITCH_Y - CARD_HEIGHT / 2,
        z: 0
      };
    }
  }
  return { positions, chapters: boxes };
}

function cardRect(id: string, positions: Record<string, { x: number; y: number; z: number }>) {
  const position = positions[id];
  return {
    id,
    left: position.x - CARD_WIDTH / 2,
    right: position.x + CARD_WIDTH / 2,
    top: position.y + CARD_HEIGHT / 2,
    bottom: position.y - CARD_HEIGHT / 2
  };
}

function segmentCrossesInterior(start: { x: number; y: number }, end: { x: number; y: number }, rect: ReturnType<typeof cardRect>) {
  const EPSILON = 0.01;
  if (Math.abs(start.y - end.y) < EPSILON) {
    if (!(start.y > rect.bottom + EPSILON && start.y < rect.top - EPSILON)) return false;
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    return right > rect.left + EPSILON && left < rect.right - EPSILON;
  }
  if (Math.abs(start.x - end.x) < EPSILON) {
    if (!(start.x > rect.left + EPSILON && start.x < rect.right - EPSILON)) return false;
    const bottom = Math.min(start.y, end.y);
    const top = Math.max(start.y, end.y);
    return top > rect.bottom + EPSILON && bottom < rect.top - EPSILON;
  }
  throw new Error(`non-orthogonal segment ${JSON.stringify(start)} -> ${JSON.stringify(end)}`);
}

function assertCardSafe(route: PlaneDependencyRoute, positions: Record<string, { x: number; y: number; z: number }>) {
  for (let index = 0; index < route.points.length - 1; index += 1) {
    const start = route.points[index];
    const end = route.points[index + 1];
    // Every segment is axis aligned.
    expect(Math.abs(start.x - end.x) < 0.001 || Math.abs(start.y - end.y) < 0.001, `${route.id} segment ${index}`).toBe(true);
    Object.keys(positions).forEach((id) => {
      expect(segmentCrossesInterior(start, end, cardRect(id, positions)), `${route.id} crosses ${id}`).toBe(false);
    });
  }
  const onCardEdge = (point: { x: number; y: number }, id: string) => {
    const center = positions[id];
    const horizontalEdge = Math.abs(Math.abs(point.x - center.x) - CARD_WIDTH / 2) < 0.01
      && Math.abs(point.y - center.y) <= CARD_HEIGHT / 2 + 0.01;
    const verticalEdge = Math.abs(Math.abs(point.y - center.y) - CARD_HEIGHT / 2) < 0.01
      && Math.abs(point.x - center.x) <= CARD_WIDTH / 2 + 0.01;
    return horizontalEdge || verticalEdge;
  };
  expect(onCardEdge(route.points[0], route.source), route.id).toBe(true);
  expect(onCardEdge(route.points[route.points.length - 1], route.target), route.id).toBe(true);
}

describe("course plane dependency routes", () => {
  it("draws an adjacent same-column dependency as a vertical segment", () => {
    const { positions, chapters } = fixture(2, 4);
    const [route] = buildPlaneDependencyRoutes({
      positions,
      chapters,
      cardWidth: CARD_WIDTH,
      cardHeight: CARD_HEIGHT,
      edges: [{ id: "a-b", source: "c0-r0", target: "c0-r1", relation: "prerequisite" }]
    });
    expect(route.points).toHaveLength(2);
    expect(route.points[0].x).toBeCloseTo(route.points[1].x, 5);
    assertCardSafe(route, positions);
  });

  it("routes a skipped same-column dependency around the cards in between", () => {
    const { positions, chapters } = fixture(2, 4);
    const [route] = buildPlaneDependencyRoutes({
      positions,
      chapters,
      cardWidth: CARD_WIDTH,
      cardHeight: CARD_HEIGHT,
      edges: [{ id: "a-c", source: "c0-r0", target: "c0-r2", relation: "enables" }]
    });
    expect(route.points.length).toBeGreaterThanOrEqual(4);
    assertCardSafe(route, positions);
  });

  it("uses horizontal-vertical-horizontal for adjacent columns", () => {
    const { positions, chapters } = fixture(3, 4);
    const [route] = buildPlaneDependencyRoutes({
      positions,
      chapters,
      cardWidth: CARD_WIDTH,
      cardHeight: CARD_HEIGHT,
      edges: [{ id: "a-d", source: "c0-r0", target: "c1-r2", relation: "prerequisite" }]
    });
    expect(route.points).toHaveLength(4);
    assertCardSafe(route, positions);
  });

  it("keeps distant-column routes in a row alley so no intermediate card is crossed", () => {
    const { positions, chapters } = fixture(4, 5);
    const [route] = buildPlaneDependencyRoutes({
      positions,
      chapters,
      cardWidth: CARD_WIDTH,
      cardHeight: CARD_HEIGHT,
      edges: [{ id: "a-l", source: "c0-r1", target: "c3-r1", relation: "prerequisite" }]
    });
    expect(route.points.length).toBeGreaterThan(4);
    assertCardSafe(route, positions);
  });

  it("ignores non-factual relations and edges whose endpoints are outside the plane", () => {
    const { positions, chapters } = fixture(2, 3);
    const routes = buildPlaneDependencyRoutes({
      positions,
      chapters,
      cardWidth: CARD_WIDTH,
      cardHeight: CARD_HEIGHT,
      edges: [
        { id: "related", source: "c0-r0", target: "c1-r0", relation: "related" },
        { id: "external", source: "c0-r0", target: "outside", relation: "prerequisite" },
        { id: "real", source: "c0-r0", target: "c1-r1", relation: "enables" }
      ]
    });
    expect(routes.map((route) => route.id)).toEqual(["real"]);
  });
});
