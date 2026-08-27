import { describe, expect, it } from "vitest";
import { classifyCourseCreatorIntent } from "./courseCreatorIntent";

describe("Course Creator intent routing", () => {
  it.each(["下一步", "继续", "可以了", "确认", "没问题", "就这样"])("routes %s without mutation", (input) => {
    expect(classifyCourseCreatorIntent(input)).toBe("navigate");
  });

  it("separates explanation from editing", () => {
    expect(classifyCourseCreatorIntent("为什么需要 Loss Function？")).toBe("explain");
    expect(classifyCourseCreatorIntent("把课程再精简一点。")).toBe("edit");
  });
});
