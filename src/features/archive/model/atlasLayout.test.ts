import { beforeEach, describe, expect, it } from "vitest";
import type { ArchiveEdge } from "./atlasModel";
import {
  boundsForIds,
  cameraForIntent,
  cameraPercent,
  clearArchiveLayoutCache,
  fitCamera,
  getArchiveLayout,
  measureAtlasLayoutQuality,
  panCamera,
  worldToScreen,
  zoomCamera,
  type AtlasCamera
} from "./atlasLayout";

const nodes = Array.from({ length: 18 }, (_, index) => ({ id: `K${String(index).padStart(2, "0")}` }));
const edges: ArchiveEdge[] = nodes.slice(1).map((node, index) => ({
  id: `e${String(index).padStart(2, "0")}`,
  source: nodes[Math.floor(index / 3)].id,
  target: node.id,
  relation: index % 4 === 0 ? "related" : index % 3 === 0 ? "enables" : "prerequisite",
  strength: index % 4 === 0 || index % 3 === 0 ? 1 : "hard"
}));
const viewport = { width: 1364, height: 960 };
const mine = new Set(["K00", "K05", "K11"]);

function boundsCenter(bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

beforeEach(() => clearArchiveLayoutCache());

describe("one deterministic relation-driven Atlas layout", () => {
  it("computes the same positions for the same structural graph, independent of input edge order", () => {
    const first = getArchiveLayout(nodes, edges);
    clearArchiveLayoutCache();
    const second = getArchiveLayout(nodes, [...edges].reverse());
    expect(second.structureKey).toBe(first.structureKey);
    expect(second.positions).toEqual(first.positions);
  });

  it("returns the cached layout object; presentation actions never relayout", () => {
    const layout = getArchiveLayout(nodes, edges);
    const positions = structuredClone(layout.positions);
    const all = fitCamera(layout.bounds, viewport, 70);
    const mineCamera = cameraForIntent({ intent: { type: "mine" }, layout, viewport, mineNodeIds: mine });
    const searchCamera = cameraForIntent({ intent: { type: "search", ids: ["K01", "K02", "K03"] }, layout, viewport, mineNodeIds: mine });
    const courseCamera = cameraForIntent({ intent: { type: "course" }, layout, viewport, mineNodeIds: mine, courseIds: new Set(["K04", "K05", "K06"]) });
    const peopleCamera = cameraForIntent({ intent: { type: "people" }, layout, viewport, mineNodeIds: mine, peopleIds: [new Set(["K07", "K08"])] });
    const zoomed = zoomCamera(all, 1.8, { x: 500, y: 400 });
    const panned = panCamera(zoomed, 120, -40);
    worldToScreen(panned, layout.positions.K01);
    expect(getArchiveLayout(nodes, edges)).toBe(layout);
    expect(layout.positions).toEqual(positions);
    expect(mineCamera.scale).toBeGreaterThan(0);
    expect(searchCamera.scale).toBeGreaterThan(0);
    expect(courseCamera.scale).toBeGreaterThan(0);
    expect(peopleCamera.scale).toBeGreaterThan(0);
    expect(cameraPercent(all, all)).toBe(100);
    expect(cameraPercent(zoomed, all)).toBeGreaterThan(100);
  });

  it("fits a real bounds and keeps zoom anchored under the pointer", () => {
    const layout = getArchiveLayout(nodes, edges);
    const camera = fitCamera(layout.bounds, viewport, 100);
    const anchor = { x: 600, y: 400 };
    const before = worldToScreen(camera, { x: 300, y: 300 });
    const next = zoomCamera(camera, 1.5, anchor);
    const after = worldToScreen(next, { x: 300, y: 300 });
    expect(Math.abs((after.x - anchor.x) - (before.x - anchor.x) * 1.5)).toBeLessThan(0.001);
    expect(Math.abs((after.y - anchor.y) - (before.y - anchor.y) * 1.5)).toBeLessThan(0.001);
  });

  it("clusters by domain and keeps factual edges much shorter than random pairs", () => {
    const clusteredNodes = Array.from({ length: 36 }, (_, index) => ({ id: `C${String(index).padStart(2, "0")}`, domainId: `d${index % 3}` }));
    const clusteredEdges: ArchiveEdge[] = [0, 1, 2].flatMap((domain) => {
      const ids = clusteredNodes.filter((_, index) => index % 3 === domain).map((node) => node.id);
      return ids.slice(1).map((id, index) => ({
        id: `ce${domain}-${String(index).padStart(2, "0")}`,
        source: ids[index],
        target: id,
        relation: "prerequisite" as const,
        strength: "hard" as const
      }));
    });
    const layout = getArchiveLayout(clusteredNodes, clusteredEdges);
    const quality = measureAtlasLayoutQuality(layout, clusteredNodes, clusteredEdges);
    expect(quality.sampledPairs).toBeGreaterThan(100);
    expect(quality.linkedRatio).toBeLessThan(0.7);
    expect(quality.domainRatio).not.toBeNull();
    expect(quality.domainRatio as number).toBeLessThan(0.85);
    expect(quality.crossDomainMean as number).toBeGreaterThan(quality.sameDomainMean as number);
  });

  it("frames my subset near 132% inside the right of the course panel without relayout", () => {
    const layout = getArchiveLayout(nodes, edges);
    const allCamera = cameraForIntent({ intent: { type: "all" }, layout, viewport, mineNodeIds: mine });
    const mineCamera = cameraForIntent({ intent: { type: "mine" }, layout, viewport, mineNodeIds: mine });
    expect(cameraPercent(mineCamera, allCamera)).toBeGreaterThanOrEqual(125);
    expect(cameraPercent(mineCamera, allCamera)).toBeLessThanOrEqual(138);
    const mineCenter = worldToScreen(mineCamera, boundsCenter(boundsForIds(layout, mine)));
    expect(mineCenter.x).toBeGreaterThan(viewport.width / 2 - 40);
  });

  it("falls back to the full graph when a person/compare intent has no ids", () => {
    const layout = getArchiveLayout(nodes, edges);
    const camera: AtlasCamera = cameraForIntent({ intent: { type: "people" }, layout, viewport, mineNodeIds: new Set() });
    expect(camera.scale).toBeGreaterThan(0);
    expect(camera.x).toBeLessThan(viewport.width);
  });
});
