import { describe, expect, it } from "vitest";
import { isNativeMicroInteractionCorrect, nativeChoiceOptionStates, validateNativeMicroInteraction, type NativeMicroInteraction } from "./nativeMicroInteraction";

const examples: Array<{ interaction: NativeMicroInteraction; pass: string[] | number[]; fail: string[] | number[] }> = [
  { interaction: { type: "categorize", items: [{ id: "rule", label: "Rule" }, { id: "learn", label: "Learn" }], categories: ["fixed", "data"], correctCategories: ["fixed", "data"] }, pass: ["fixed", "data"], fail: ["data", "fixed"] },
  { interaction: { type: "structure-builder", mode: "challenge", nodes: ["model", "tool"], edges: [{ id: "call", from: "model", to: "tool" }, { id: "return", from: "tool", to: "model" }], correctEdgeIds: ["call", "return"] }, pass: ["return", "call"], fail: ["call"] },
  { interaction: { type: "parameter-lab", mode: "challenge", parameter: { label: "lr", min: 0, max: 1, step: 0.1, initial: 0.5 }, target: { min: 0.1, max: 0.2 } }, pass: [0.2], fail: [0.8] },
  { interaction: { type: "matrix-tensor", mode: "challenge", rows: 2, columns: 2, initialValues: [1, 0, 0, 1], targetValues: [1, 2, 2, 1] }, pass: [1, 2, 2, 1], fail: [1, 2, 0, 1] }
];

describe("native Micro interaction contract", () => {
  it.each(examples)("validates and grades $interaction.type from the actual response", ({ interaction, pass, fail }) => {
    expect(validateNativeMicroInteraction(interaction)).toEqual([]);
    expect(isNativeMicroInteractionCorrect(interaction, pass)).toBe(true);
    expect(isNativeMicroInteractionCorrect(interaction, fail)).toBe(false);
  });

  it("reveals option correctness only after a submitted answer", () => {
    const choice: NativeMicroInteraction = { type: "choice", options: ["Reason", "Act", "Observation"], correctIndex: 0 };
    expect(nativeChoiceOptionStates(choice, "Act", false)).toBeNull();
    expect(nativeChoiceOptionStates(choice, "Act", true)?.map((item) => item.state)).toEqual(["correct", "incorrect", "idle"]);

    const multiple: NativeMicroInteraction = { type: "multiple-choice", options: ["A", "B", "C"], correctIndexes: [0, 2] };
    expect(nativeChoiceOptionStates(multiple, [0, 1], true)).toEqual([
      { optionIndex: 0, selected: true, correct: true, state: "correct" },
      { optionIndex: 1, selected: true, correct: false, state: "incorrect" },
      { optionIndex: 2, selected: false, correct: true, state: "correct" }
    ]);
  });

  it("lets Explore collect a valid observation without inventing a correct target", () => {
    const interaction = { type: "parameter-lab", mode: "explore", parameter: { label: "lr", min: 0, max: 1, step: 0.1, initial: 0.5 } } as const;
    expect(validateNativeMicroInteraction(interaction)).toEqual([]);
    expect(isNativeMicroInteractionCorrect(interaction, [0.7])).toBe(true);
    expect(isNativeMicroInteractionCorrect(interaction, [2])).toBe(false);
  });
});
