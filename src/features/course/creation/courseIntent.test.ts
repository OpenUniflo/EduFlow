import { describe, expect, it } from "vitest";
import { parseCourseIntent } from "./courseIntent";

describe("CourseIntent", () => {
  it("accepts an explicit target outcome", () => {
    expect(parseCourseIntent({ status: "ready", targetOutcome: "Build a tool-using Agent" })).toEqual({ status: "ready", targetOutcome: "Build a tool-using Agent" });
  });

  it("requires a clarification question with 3 to 5 options", () => {
    expect(parseCourseIntent({ status: "needs_clarification", clarificationQuestion: "What should learners build?", recommendedOptions: ["A", "B", "C"] }).status).toBe("needs_clarification");
    expect(() => parseCourseIntent({ status: "needs_clarification", clarificationQuestion: "What?", recommendedOptions: ["A", "B"] })).toThrow(/3 to 5/);
  });
});
