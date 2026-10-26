import { expect, it } from "vitest";
import { workflowNameInputWidth } from "./workflowNameWidth";

it("keeps short names at the four-character minimum and long names at the 360px cap", () => {
  expect(workflowNameInputWidth(12)).toBe(60);
  expect(workflowNameInputWidth(45)).toBe(60);
  expect(workflowNameInputWidth(500)).toBe(360);
  expect(workflowNameInputWidth(360, 10)).toBe(360);
});

it("fits a measured Chinese or English name before the cap", () => {
  expect(workflowNameInputWidth(132)).toBe(136);
  expect(workflowNameInputWidth(240)).toBe(244);
});

it("adds the input padding, border and a slack so the last glyph never truncates", () => {
  expect(workflowNameInputWidth(132, 10)).toBe(146);
  expect(workflowNameInputWidth(131.2, 10)).toBe(146);
  expect(workflowNameInputWidth(132, 10.5)).toBe(147);
});
