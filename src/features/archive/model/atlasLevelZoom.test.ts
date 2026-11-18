import { describe, expect, it } from "vitest";
import { atlasLevelCameraDistance } from "./atlasLevelZoom";

describe("Atlas level camera distance", () => {
  it("moves far for Domains, mid for topics and near for Knowledge", () => {
    const limits = { min: 1, max: 10_000 };
    expect(atlasLevelCameraDistance(0, 1_000, limits)).toBe(2_350);
    expect(atlasLevelCameraDistance(1, 1_000, limits)).toBe(1_200);
    expect(atlasLevelCameraDistance(2, 1_000, limits)).toBe(720);
  });

  it("respects the camera limits and never produces a zero distance", () => {
    expect(atlasLevelCameraDistance(0, 0, { min: 50, max: 900 })).toBe(50);
    expect(atlasLevelCameraDistance(2, 0, { min: 50, max: 900 })).toBe(50);
    expect(atlasLevelCameraDistance(0, 10_000, { min: 50, max: 900 })).toBe(900);
  });
});
