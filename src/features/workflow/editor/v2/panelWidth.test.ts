import { describe, expect, it } from "vitest";
import { clampPanelWidth, INSPECTOR_MAX_WIDTH, INSPECTOR_MIN_WIDTH, readStoredPanelWidth, storePanelWidth, INSPECTOR_WIDTH_STORAGE_KEY } from "./panelWidth";

describe("clampPanelWidth", () => {
  it("keeps values inside the range", () => {
    expect(clampPanelWidth(460)).toBe(460);
    expect(clampPanelWidth(360)).toBe(360);
    expect(clampPanelWidth(720)).toBe(720);
  });
  it("clamps below and above the range", () => {
    expect(clampPanelWidth(120)).toBe(INSPECTOR_MIN_WIDTH);
    expect(clampPanelWidth(2000)).toBe(INSPECTOR_MAX_WIDTH);
    expect(clampPanelWidth(100, 200, 300)).toBe(200);
    expect(clampPanelWidth(900, 200, 300)).toBe(300);
  });
  it("rounds fractional widths and tolerates unusable numbers", () => {
    expect(clampPanelWidth(480.6)).toBe(481);
    expect(clampPanelWidth(Number.NaN)).toBe(INSPECTOR_MIN_WIDTH);
    expect(clampPanelWidth(Number.POSITIVE_INFINITY)).toBe(INSPECTOR_MIN_WIDTH);
  });
  it("normalizes reversed bounds instead of returning NaN", () => {
    expect(clampPanelWidth(400, 720, 360)).toBe(400);
  });
});

describe("panel width storage", () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
      values,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
  }
  it("round-trips a stored width", () => {
    const storage = memoryStorage();
    storePanelWidth(512.4, storage);
    expect(storage.values.get(INSPECTOR_WIDTH_STORAGE_KEY)).toBe("512");
    expect(readStoredPanelWidth(storage)).toBe(512);
  });
  it("returns null for missing, unparsable or out-of-range values", () => {
    expect(readStoredPanelWidth(memoryStorage())).toBeNull();
    expect(readStoredPanelWidth(memoryStorage({ [INSPECTOR_WIDTH_STORAGE_KEY]: "wide" }))).toBeNull();
    expect(readStoredPanelWidth(memoryStorage({ [INSPECTOR_WIDTH_STORAGE_KEY]: "40" }))).toBe(INSPECTOR_MIN_WIDTH);
  });
  it("ignores storage failures", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readStoredPanelWidth(broken)).toBeNull();
    expect(() => storePanelWidth(500, broken)).not.toThrow();
  });
});
