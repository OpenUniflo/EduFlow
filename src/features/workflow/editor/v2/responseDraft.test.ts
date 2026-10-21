import { expect, it } from "vitest";
import { initializeResponseDraft } from "./responseDraft";

const schema = {
  type: "object",
  properties: {
    approved: { type: "boolean" },
    finalNote: { type: "string" },
    comment: { type: "string" },
    accommodation: { type: "number" },
    tags: { type: "array", items: { type: "string" } },
    details: { type: "object", properties: { tag: { type: "string" }, optional: { type: "string" } }, required: ["tag"], additionalProperties: false },
  },
  required: ["approved", "finalNote", "accommodation", "tags"],
  additionalProperties: false,
};

it("adds empty text only for missing required plain strings", () => {
  const input = { approved: true, accommodation: 0, tags: [] };
  const result = initializeResponseDraft(schema, input);
  expect(result).toEqual({ approved: true, accommodation: 0, tags: [], finalNote: "" });
  expect(result).not.toHaveProperty("comment");
  expect(input).not.toHaveProperty("finalNote");
});

it("preserves explicit null, false, zero, empty list and existing strings", () => {
  const input = { approved: false, finalNote: null, accommodation: 0, tags: ["a"], comment: "" };
  const result = initializeResponseDraft(schema, input);
  expect(result).toEqual(input);
  expect(result.finalNote).toBeNull();
});

it("recurses only into existing objects and leaves optional nested fields absent", () => {
  const input = { approved: true, accommodation: 0, tags: [], details: {} };
  const result = initializeResponseDraft(schema, input);
  expect(result.details).toEqual({ tag: "" });
  expect(result.details).not.toHaveProperty("optional");
});

it("does not initialize enum, const, union or ref text fields", () => {
  const complex = {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["a", "b"] },
      fixed: { type: "string", const: "x" },
      maybe: { type: ["string", "null"] },
      ref: { $ref: "#/$defs/text" },
    },
    required: ["kind", "fixed", "maybe", "ref"],
    additionalProperties: false,
  };
  expect(initializeResponseDraft(complex, {})).toEqual({});
});
