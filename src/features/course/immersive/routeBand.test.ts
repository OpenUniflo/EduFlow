import { describe, expect, it } from "vitest";
import { advancePulse, routeMetrics } from "@/shared/scene/routePulse";
import {
  buildRouteAnchorSequence,
  cometGradientStops,
  pointAtRouteDistance,
  routeBandComets,
  routeBandMetrics,
  staggeredWindowCenters,
  windowIntensity
} from "./routeBand";

describe("current route anchor sequence", () => {
  it("walks the execution order including cardless capability nodes", () => {
    const nodes = [
      { id: "K2", x: 200, y: 0, z: 0 },
      { id: "CAP", x: 100, y: 40, z: -280 },
      { id: "K1", x: 0, y: 0, z: 0 },
      { id: "K3", x: 400, y: 0, z: 0 }
    ];
    const anchors = buildRouteAnchorSequence(["K1", "CAP", "K2", "K3", "K2", "MISSING"], nodes);
    expect(anchors.map((anchor) => anchor.id)).toEqual(["K1", "CAP", "K2", "K3"]);
    expect(anchors[1]).toEqual({ id: "CAP", x: 100, y: 40, z: -280 });
  });

  it("does not depend on cards: every id with a drawn position is an anchor", () => {
    const nodes = ["K1", "B1", "K2"].map((id, index) => ({ id, x: index * 50, y: 0, z: 0 }));
    expect(buildRouteAnchorSequence(["K1", "B1", "K2"], nodes).map((anchor) => anchor.id)).toEqual(["K1", "B1", "K2"]);
  });
});

describe("staggered bright windows", () => {
  it("advances one mean step per second by travelled distance", () => {
    const metrics = routeMetrics([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 300, y: 0 }]);
    expect(metrics.stepDistance).toBe(150);
    const oneSecond = advancePulse(0, metrics, 1000);
    expect(oneSecond).toBeCloseTo(150);
    expect(advancePulse(oneSecond, metrics, 500)).toBeCloseTo(225);
  });

  it("spreads three windows evenly and keeps them staggered", () => {
    const metrics = routeMetrics([{ x: 0, y: 0 }, { x: 300, y: 0 }]);
    const centers = staggeredWindowCenters(0, metrics, 3);
    expect(centers).toHaveLength(3);
    expect(centers[1] - centers[0]).toBeCloseTo(100);
    expect(centers[2] - centers[1]).toBeCloseTo(100);
    const moved = staggeredWindowCenters(50, metrics, 3);
    expect(moved[0]).toBeCloseTo(50);
    expect(moved[1]).toBeCloseTo(150);
    expect(moved[2]).toBeCloseTo(250);
  });

  it("produces one continuous head→tail comet per staggered window", () => {
    const metrics = routeBandMetrics([{ id: "a", x: 0, y: 0, z: 0 }, { id: "b", x: 300, y: 0, z: 0 }]);
    const comets = routeBandComets(0, metrics, 30, { count: 3 });
    expect(comets).toHaveLength(3);
    expect(new Set(comets.map((comet) => comet.window)).size).toBe(3);
    comets.forEach((comet) => {
      expect(comet.head).toBeGreaterThan(comet.tail);
      expect(comet.end - comet.start).toBeGreaterThan(0);
      // A comet is a single continuous gradient, never a stack of slices.
      expect(comet.end).toBeLessThanOrEqual(metrics.total);
      expect(comet.start).toBeGreaterThanOrEqual(0);
    });
    expect(windowIntensity(10, 10, 30)).toBeGreaterThan(windowIntensity(-5, 10, 30));
    expect(windowIntensity(0, 10, 30)).toBeLessThan(windowIntensity(8, 10, 30));
    const anchors = [{ id: "a", x: 0, y: 0, z: 0 }, { id: "b", x: 300, y: 0, z: 0 }];
    expect(pointAtRouteDistance(anchors, metrics, -20)?.x).toBe(0);
    expect(pointAtRouteDistance(anchors, metrics, 150)?.x).toBeCloseTo(150);
    expect(pointAtRouteDistance(anchors, metrics, 900)?.x).toBe(300);
  });

  it("keeps the head brightest and the tail transparent along one gradient", () => {
    const core = cometGradientStops("core");
    const halo = cometGradientStops("halo");
    expect(core[0].opacity).toBeCloseTo(0.7);
    expect(core[core.length - 1].opacity).toBe(0);
    expect(halo[0].opacity).toBeLessThan(core[0].opacity);
    expect(halo[halo.length - 1].opacity).toBe(0);
    for (let index = 1; index < core.length; index += 1) {
      expect(core[index].opacity).toBeLessThan(core[index - 1].opacity);
      expect(core[index].offset).toBeGreaterThan(core[index - 1].offset);
    }
  });
});
