import { describe, expect, it } from "vitest";
import {
  SCENE_CAMERA,
  contentRadius,
  distanceForScreenSpacing,
  distanceForViewportRatio,
  doubleClickAction,
  fitDistanceForRadius,
  focusPose,
  frontPose,
  isCameraDrag,
  isPanGesture,
  medianNearestNeighbourDistance,
  sceneCameraLimits,
  shouldSnapToFront,
  zoomDistance,
  zoomPercent
} from "./cameraInteraction";
import {
  SELECTION_DIM_OPACITY,
  cardNameOpacity,
  cardShowsOwnName,
  hoverStyleFor,
  isPickable,
  nameOwnerFor,
  selectionOpacity
} from "./presentationRules";
import { courseColorVar, courseToneFor, courseToneForStatus, courseToneLegend } from "./coursePalette";
import { oneHopSelection } from "./selection";

describe("shared scene camera convention", () => {
  it("snaps back only below 15 degrees on release", () => {
    expect(shouldSnapToFront(0)).toBe(true);
    expect(shouldSnapToFront(9.9)).toBe(true);
    expect(shouldSnapToFront(14.99)).toBe(true);
    expect(shouldSnapToFront(15)).toBe(false);
    expect(shouldSnapToFront(45)).toBe(false);
    expect(SCENE_CAMERA.snapFrontAngle).toBe(15);
  });

  it("distinguishes a click from a camera drag", () => {
    expect(isCameraDrag(5)).toBe(false);
    expect(isCameraDrag(5.1)).toBe(true);
  });

  it("treats right button and Shift+left as pan", () => {
    expect(isPanGesture(2, false)).toBe(true);
    expect(isPanGesture(0, true)).toBe(true);
    expect(isPanGesture(0, false)).toBe(false);
  });

  it("clamps toolbar zoom to the same envelope", () => {
    expect(zoomDistance(1000, SCENE_CAMERA.zoomInFactor)).toBeCloseTo(820);
    expect(zoomDistance(100, 0.1)).toBe(SCENE_CAMERA.minDistance);
    expect(zoomDistance(5900, 2)).toBe(SCENE_CAMERA.maxDistance);
  });

  it("maps double click and front / focus poses", () => {
    expect(doubleClickAction("k1")).toBe("focus");
    expect(doubleClickAction(null)).toBe("front");
    expect(frontPose({ x: 10, y: 20, z: 30 }, 500)).toEqual({ target: { x: 10, y: 20, z: 30 }, position: { x: 10, y: 20, z: 530 } });
    expect(focusPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 500 }, { x: 20, y: -10, z: 0 })).toEqual({
      target: { x: 20, y: -10, z: 0 },
      position: { x: 20, y: -10, z: 500 }
    });
    // A compact person layout needs a front pose below the legacy 180 floor.
    expect(frontPose({ x: 0, y: 0, z: 0 }, 40, 30, 4000).position.z).toBe(40);
  });

  it("derives near / far distances from content instead of one shared floor", () => {
    // Archive: 6 world-unit node spacing at 200 css px in a 900px-tall viewport.
    const archive = sceneCameraLimits({ contentRadius: 900, viewportHeight: 900, adjacentSpacing: 6, nearSpacingPx: 200 });
    expect(archive.minDistance).toBeCloseTo(37.08, 1);
    expect(distanceForScreenSpacing(6, 200, 900)).toBeCloseTo(archive.minDistance);
    // Course: a 64-unit card covers half the viewport height.
    const course = sceneCameraLimits({ contentRadius: 1800, viewportHeight: 900, cardHeight: 64, nearCardViewportRatio: 0.5 });
    expect(course.minDistance).toBeCloseTo(distanceForViewportRatio(64, 0.5), 2);
    expect(course.minDistance).toBeCloseTo(175.86, 1);
    expect(course.maxDistance).toBeGreaterThan(course.fitDistance);
    // Percent is always relative to the fit-all distance and is not capped.
    expect(zoomPercent(course.fitDistance, course.fitDistance)).toBe(100);
    expect(zoomPercent(course.fitDistance, course.fitDistance / 40)).toBe(4000);
  });

  it("measures sparse person layouts from their real adjacency", () => {
    expect(medianNearestNeighbourDistance([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }])).toBe(4);
    expect(contentRadius([{ x: -100, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }])).toBe(100);
    expect(fitDistanceForRadius(100)).toBeGreaterThan(100);
  });
});

describe("shared selection presentation", () => {
  it("dims unrelated nodes to 20% and keeps the related set lit", () => {
    expect(SELECTION_DIM_OPACITY).toBe(0.2);
    expect(selectionOpacity(true)).toBe(1);
    expect(selectionOpacity(false)).toBe(0.2);
    expect(selectionOpacity(false, 0.5)).toBeCloseTo(0.1);
  });

  it("keeps dimmed nodes clickable and removes only undrawn nodes", () => {
    expect(isPickable(0.2)).toBe(true);
    expect(isPickable(0.24)).toBe(true);
    expect(isPickable(0)).toBe(false);
    expect(isPickable(0.02)).toBe(false);
  });

  it("never gives a card a second outside name", () => {
    expect(cardShowsOwnName({ cardVisible: true, pointMix: 0, cardNameOpacity: 1 })).toBe(true);
    expect(cardShowsOwnName({ cardVisible: true, pointMix: 1, cardNameOpacity: 1 })).toBe(false);
    expect(cardShowsOwnName({ cardVisible: true, pointMix: 0, cardNameOpacity: 1, isCapability: true })).toBe(false);
    expect(nameOwnerFor({ cardShowsName: true, outsideNameVisible: true })).toBe("card");
    expect(nameOwnerFor({ cardShowsName: false, outsideNameVisible: true })).toBe("outside");
    expect(cardNameOpacity(1, false)).toBe(0);
    expect(cardNameOpacity(0.6, true)).toBe(0.6);
  });

  it("hovers with an outline on cards and a ring only on points", () => {
    expect(hoverStyleFor("full")).toBe("outline");
    expect(hoverStyleFor("pill")).toBe("outline");
    expect(hoverStyleFor("dot")).toBe("ring");
    expect(hoverStyleFor("none")).toBe("none");
  });
});

describe("shared course colour mapping", () => {
  it("maps acquired / target / intermediate / practice", () => {
    expect(courseToneFor({ kind: "knowledge", category: "acquired" })).toBe("acquired");
    expect(courseToneFor({ kind: "knowledge", category: "learning" })).toBe("target");
    expect(courseToneFor({ kind: "knowledge", status: "learned" })).toBe("acquired");
    expect(courseToneFor({ kind: "capability", status: "completed" })).toBe("acquired");
    expect(courseToneFor({ kind: "capability" })).toBe("intermediate");
    expect(courseToneFor({ kind: "assignment" })).toBe("practice");
    expect(courseToneForStatus("mastered")).toBe("acquired");
    expect(courseToneForStatus("learning")).toBe("target");
    expect(courseToneForStatus("explore")).toBe("target");
  });

  it("keeps every colour behind a token", () => {
    expect(courseColorVar("acquired")).toBe("var(--course-acquired)");
    expect(courseColorVar("target")).toBe("var(--course-target)");
    expect(courseColorVar("intermediate")).toBe("var(--course-intermediate)");
    expect(courseToneLegend()).toHaveLength(3);
  });
});

describe("shared one-hop selection", () => {
  const edges = [
    { id: "dep-1", source: "K1", target: "K2" },
    { id: "dep-2", source: "K2", target: "K3" },
    { id: "cap-1", source: "B1", target: "K2" },
    { id: "cap-2", source: "ACQ", target: "B1" },
    { id: "far", source: "X", target: "Y" }
  ];
  const nodeIds = ["K1", "K2", "K3", "B1", "ACQ", "X", "Y"];

  it("keeps the selected node, one-hop neighbours and incident edges only", () => {
    const selection = oneHopSelection({ selectedIds: ["K2"], nodeIds, edges, routeOrder: ["K1", "K2", "K3"] });
    expect([...selection.nodeIds].sort()).toEqual(["B1", "K1", "K2", "K3"]);
    expect([...selection.edgeIds].sort()).toEqual(["cap-1", "dep-1", "dep-2"]);
    expect(selection.onRoute).toBe(true);
  });

  it("does not walk a second capability hop", () => {
    const selection = oneHopSelection({ selectedIds: ["K2"], nodeIds, edges });
    expect(selection.nodeIds.has("ACQ")).toBe(false);
    expect(selection.edgeIds.has("cap-2")).toBe(false);
  });

  it("supports a practice covering several Knowledge and route neighbours", () => {
    const selection = oneHopSelection({ selectedIds: ["K1", "K3"], nodeIds: [...nodeIds, "K0", "K4"], edges, routeOrder: ["K0", "K1", "K2", "K3", "K4"] });
    expect([...selection.nodeIds].sort()).toEqual(["K0", "K1", "K2", "K3", "K4"]);
    expect([...selection.routeNeighborIds].sort()).toEqual(["K0", "K2", "K4"]);
    expect(selection.edgeIds.has("far")).toBe(false);
  });

  it("keeps a selected capability's direct supporters and supported Knowledge", () => {
    const selection = oneHopSelection({ selectedIds: ["B1"], nodeIds, edges });
    expect([...selection.nodeIds].sort()).toEqual(["ACQ", "B1", "K2"]);
    expect([...selection.edgeIds].sort()).toEqual(["cap-1", "cap-2"]);
    expect(selection.onRoute).toBe(false);
  });
});
