import { describe, expect, it } from "vitest";
import { llmConfigV2Schema, PARAM_NAME_PATTERN, promptConfigV2Schema, promptSegmentSchema, RESERVED_PARAM_NAME } from "./schema";

describe("prompt param name contract", () => {
  it("accepts identifier-style names up to 64 characters", () => {
    expect(PARAM_NAME_PATTERN.test("query")).toBe(true);
    expect(PARAM_NAME_PATTERN.test("_private")).toBe(true);
    expect(PARAM_NAME_PATTERN.test("a1_B2")).toBe(true);
    expect(PARAM_NAME_PATTERN.test(`a${"b".repeat(63)}`)).toBe(true);
  });

  it("rejects digits-first, dashes, spaces and overlong names", () => {
    for (const name of ["", "1query", "has-dash", "has space", "有中文", `a${"b".repeat(64)}`]) expect(PARAM_NAME_PATTERN.test(name)).toBe(false);
  });
});

describe("promptSegmentSchema", () => {
  it("accepts text segments, parameter segments and JSON format", () => {
    expect(promptSegmentSchema.safeParse({ type: "text", text: "hi" }).success).toBe(true);
    expect(promptSegmentSchema.safeParse({ type: "param", name: "query" }).success).toBe(true);
    expect(promptSegmentSchema.safeParse({ type: "param", name: "query", format: "json" }).success).toBe(true);
  });

  it("rejects unknown segment types, unknown keys and an unknown format", () => {
    expect(promptSegmentSchema.safeParse({ type: "image", text: "x" }).success).toBe(false);
    expect(promptSegmentSchema.safeParse({ type: "text", text: "x", extra: 1 }).success).toBe(false);
    expect(promptSegmentSchema.safeParse({ type: "param", name: "query", format: "yaml" }).success).toBe(false);
  });

  it("rejects invalid parameter names and the reserved history name", () => {
    expect(promptSegmentSchema.safeParse({ type: "param", name: "1query" }).success).toBe(false);
    expect(promptSegmentSchema.safeParse({ type: "param", name: RESERVED_PARAM_NAME }).success).toBe(false);
    expect(RESERVED_PARAM_NAME).toBe("history");
  });
});

describe("promptConfigV2Schema", () => {
  it("accepts a system array and at least one message", () => {
    const result = promptConfigV2Schema.safeParse({ system: [], messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] });
    expect(result.success).toBe(true);
  });

  it("rejects an empty message list", () => {
    expect(promptConfigV2Schema.safeParse({ system: [], messages: [] }).success).toBe(false);
  });

  it("rejects unknown roles and missing arrays", () => {
    expect(promptConfigV2Schema.safeParse({ system: [], messages: [{ role: "system", content: [] }] }).success).toBe(false);
    expect(promptConfigV2Schema.safeParse({ messages: [] }).success).toBe(false);
  });
});

describe("llmConfigV2Schema", () => {
  const valid = {
    providerRef: "p4:owner:model:1",
    modelRef: "deepseek-flash",
    modelParameters: { temperature: 0.2 },
    allowedToolRefs: ["p4:owner:search:1"],
    prompt: { system: [{ type: "text", text: "你是助手。" }], messages: [{ role: "user", content: [{ type: "param", name: "query" }] }] },
  };

  it("accepts a complete typeVersion 2 model configuration", () => {
    expect(llmConfigV2Schema.safeParse(valid).success).toBe(true);
  });

  it("rejects the retired message-only shape and missing prompt fields", () => {
    expect(llmConfigV2Schema.safeParse({ providerRef: "p", modelRef: "m", modelParameters: {}, allowedToolRefs: [] }).success).toBe(false);
    expect(llmConfigV2Schema.safeParse({ ...valid, prompt: undefined }).success).toBe(false);
    expect(llmConfigV2Schema.safeParse({ ...valid, extra: true }).success).toBe(false);
    expect(llmConfigV2Schema.safeParse({ ...valid, modelParameters: { bad: undefined } }).success).toBe(false);
  });
});
