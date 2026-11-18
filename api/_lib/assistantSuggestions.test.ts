import { describe, expect, it } from "vitest";
import { normalizeFollowUps } from "./assistantSuggestions";

describe("follow-up suggestions", () => {
  it("normalizes strings and legacy objects into one fill-only shape", () => {
    expect(normalizeFollowUps([
      "打开任务要求",
      { text: "看看课程路线" },
      { text: "打开任务要求" }
    ])).toEqual([{ text: "打开任务要求" }, { text: "看看课程路线" }]);
  });

  it("keeps at most three unique suggestions", () => {
    expect(normalizeFollowUps(["看路线", "看路线", "看进度", "看资料", "看记录"]))
      .toEqual([{ text: "看路线" }, { text: "看进度" }, { text: "看资料" }]);
  });
});
