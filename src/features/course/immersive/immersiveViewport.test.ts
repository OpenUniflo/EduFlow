import { describe, expect, it } from "vitest";
import { computeCourseFit } from "./immersiveViewport";

describe("course viewport fit", () => {
  it("fits a 7-chapter/78-knowledge course by width and ignores height", () => {
    const fit = computeCourseFit({ viewportWidth: 1440, viewportHeight: 900, bounds: { x: 686, y: 1181 } });
    expect(fit.pxPerWorld).toBeCloseTo((1440 - 56) / 1372, 3);
    expect(fit.pxPerWorld).toBeGreaterThanOrEqual(0.95);
    expect(fit.horizontalOverflow).toBe(false);
    expect(fit.verticalOverflow).toBe(true);
    expect(fit.panY).toBeCloseTo(fit.minPanY, 5);
  });

  it("keeps the readable floor and allows horizontal panning at 960px", () => {
    const fit = computeCourseFit({ viewportWidth: 960, viewportHeight: 780, bounds: { x: 686, y: 1181 } });
    expect(fit.pxPerWorld).toBe(0.85);
    expect(fit.horizontalOverflow).toBe(true);
    expect(fit.panX).toBeCloseTo(fit.maxPanX, 5);
  });

  it("never magnifies a small course beyond the cap and centres it", () => {
    const fit = computeCourseFit({ viewportWidth: 1440, viewportHeight: 900, bounds: { x: 294, y: 260 } });
    expect(fit.pxPerWorld).toBe(1.12);
    expect(fit.horizontalOverflow).toBe(false);
    expect(fit.panX).toBe(0);
    expect(fit.verticalOverflow).toBe(false);
    expect(fit.panY).toBe(0);
  });
});
