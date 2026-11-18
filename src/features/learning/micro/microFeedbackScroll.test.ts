import { describe, expect, it } from "vitest";
import { feedbackScrollDelta } from "./microFeedbackScroll";

describe("feedback scroll geometry", () => {
  it("scrolls down when feedback is below the visible area", () => {
    expect(feedbackScrollDelta({ top: 700, bottom: 780, containerTop: 100, containerBottom: 700 })).toBe(92);
  });

  it("reserves the sticky footer height", () => {
    expect(feedbackScrollDelta({ top: 500, bottom: 600, containerTop: 100, containerBottom: 760, footerTop: 560 })).toBe(52);
  });

  it("does nothing when the whole feedback is already visible", () => {
    expect(feedbackScrollDelta({ top: 300, bottom: 380, containerTop: 100, containerBottom: 700, footerTop: 640 })).toBe(0);
  });

  it("scrolls up when feedback starts above the container", () => {
    expect(feedbackScrollDelta({ top: 60, bottom: 140, containerTop: 100, containerBottom: 700 })).toBe(-52);
  });

  it("aligns the top when the feedback is taller than the visible area", () => {
    expect(feedbackScrollDelta({ top: 700, bottom: 1300, containerTop: 100, containerBottom: 700 })).toBe(588);
  });
});
