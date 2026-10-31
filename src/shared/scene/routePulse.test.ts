import { describe, expect, it } from "vitest";
import { advancePulse, normalisedDistance, pulseCenters, pulseWindow, routeMetrics, windowLengthForPixels } from "./routePulse";

describe("constant per-step route pulse", () => {
  it("moves one step per second regardless of the total route length", () => {
    const short = routeMetrics([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]);
    const long = routeMetrics([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }]);
    expect(short.stepDistance).toBe(100);
    expect(long.stepDistance).toBe(1000);
    expect(advancePulse(0, short, 1000)).toBeCloseTo(100);
    expect(advancePulse(0, long, 1000)).toBeCloseTo(1000);
    // Half a second moves half a step, not half of 100% of the route.
    expect(advancePulse(0, long, 500)).toBeCloseTo(500);
  });

  it("wraps and normalises against the actual sampled length", () => {
    const metrics = routeMetrics([{ x: 0, y: 0 }, { x: 0, y: 120 }, { x: 160, y: 120 }]);
    expect(metrics.total).toBe(280);
    expect(normalisedDistance(140, metrics)).toBeCloseTo(0.5);
  });

  it("produces a fading-tail window that advances with distance", () => {
    const head = pulseWindow(0.5, 0.5, 0.1, 2.4);
    const middle = pulseWindow(0.45, 0.5, 0.1, 2.4);
    const tail = pulseWindow(0.39, 0.5, 0.1, 2.4);
    expect(head).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(tail);
    expect(pulseWindow(0.2, 0.5, 0.1, 2.4)).toBe(0);
  });

  it("uses one pulse for short routes and two for long ones", () => {
    expect(pulseCenters(10, routeMetrics([{ x: 0, y: 0 }, { x: 100, y: 0 }]))).toHaveLength(1);
    expect(pulseCenters(10, routeMetrics([{ x: 0, y: 0 }, { x: 800, y: 0 }]))).toHaveLength(2);
  });

  it("converts the 40–80px screen window into a normalised window", () => {
    const metrics = routeMetrics([{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    expect(windowLengthForPixels(60, 1, metrics)).toBeCloseTo(0.06);
  });
});
