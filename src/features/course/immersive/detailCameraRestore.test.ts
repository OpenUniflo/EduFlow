import { describe, expect, it } from "vitest";
import { beginDetailCameraRestore, cancelDetailCameraRestore, takeDetailCameraRestore } from "./detailCameraRestore";

describe("course detail camera restore", () => {
  const first = { position: [1, 2, 3] as [number, number, number], target: [4, 5, 6] as [number, number, number] };
  const second = { position: [7, 8, 9] as [number, number, number], target: [10, 11, 12] as [number, number, number] };

  it("keeps the pre-panel camera when the selected card changes", () => {
    const restore = beginDetailCameraRestore(beginDetailCameraRestore(null, first), second);
    expect(takeDetailCameraRestore(restore)).toEqual(first);
  });

  it("skips the restore after any manual camera movement", () => {
    const restore = cancelDetailCameraRestore(beginDetailCameraRestore(null, first));
    expect(takeDetailCameraRestore(restore)).toBeNull();
  });

  it("has nothing to restore when opening the panel did not move the camera", () => {
    expect(takeDetailCameraRestore(null)).toBeNull();
  });
});
