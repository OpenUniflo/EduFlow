import { describe, expect, it } from "vitest";
import type { WorkflowDefinitionV2 } from "./types";
import { referenceInputFields, referenceMappingIssues, referenceOutputFields, referencePointerRoot, referenceRevisionStatus, referenceSchemaAtPointer, referenceSchemaTypes, referenceTypesCompatible, workflowReferenceConfig } from "./workflowReferenceMapping";

const objectSchema = (properties: Record<string, import("./types").JsonSchema>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

const target = {
  schemaVersion: "2.0", workflowId: "target", revision: 3, name: "目标", description: "",
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", title: "问题" },
      count: { type: "integer", default: 2 },
      optional: { type: "boolean" },
    },
    required: ["question"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: { answer: { type: "string", title: "回答" }, score: { type: "number" } },
    required: ["answer"],
    additionalProperties: false,
  },
  state: { schema: { type: "object", properties: {} }, initial: {}, inputBindings: {}, reducers: {} },
  entryNodeId: "start", nodes: [], transitions: [], outputBindings: {},
  policy: { timeoutMs: 1, nodeTimeoutMs: 1, maxNodeExecutions: 1, maxToolCalls: 1, maxInputBytes: 1, maxStateBytes: 1, maxEventBytes: 1, maxOutputTokens: 1, maxAttempts: 1 },
  requiredCapabilities: [],
} as unknown as WorkflowDefinitionV2;

describe("fixed Workflow reference interface", () => {
  it("reads title, required and default from the exact target Schema", () => {
    expect(referenceInputFields(target.inputSchema)).toEqual([
      expect.objectContaining({ name: "question", title: "问题", required: true }),
      expect.objectContaining({ name: "count", required: false, defaultValue: 2 }),
      expect.objectContaining({ name: "optional", required: false }),
    ]);
    expect(referenceOutputFields(target.outputSchema).map(field => field.name)).toEqual(["answer", "score"]);
    expect(referencePointerRoot("/answer")).toBe("answer");
    expect(referencePointerRoot("/a~1b/x")).toBe("a/b");
    expect(referencePointerRoot("")).toBeUndefined();
  });

  it("reports missing/extra/type mapping issues without deleting anything", () => {
    const inputs = {
      count: { source: "literal", value: "two" },
      stray: { source: "literal", value: true },
    } as const;
    const writes = { reply: "/answer", legacy: "/removed" };
    const issues = referenceMappingIssues(target, inputs, writes);
    expect(issues.map(issue => `${issue.kind}:${issue.field}`)).toEqual(expect.arrayContaining([
      "input-missing:question",
      "input-extra:stray",
      "input-type:count",
      "output-extra:legacy",
    ]));
    expect(issues.some(issue => issue.field === "reply")).toBe(false);
  });

  it("does not flag removed optional fields or an open target interface", () => {
    const open = { ...target, inputSchema: { type: "object", additionalProperties: true }, outputSchema: { type: "object" } };
    expect(referenceMappingIssues(open, { anything: { source: "literal", value: 1 } }, { any: "/value" })).toEqual([]);
  });

  it("still reports extra keys for a closed interface with no declared fields", () => {
    const closedEmpty = { ...target, inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: {}, additionalProperties: false } };
    expect(referenceMappingIssues(closedEmpty, { value: { source: "literal", value: 1 } }, { answer: "/value" }).map(issue => issue.kind)).toEqual(["input-extra", "output-extra"]);
  });

  it("checks output-to-parent-State required fields and declared JSON types like the compiler", () => {
    const parentState = {
      type: "object",
      properties: { answer: { type: "string" }, score: { type: "string" } },
      additionalProperties: false,
    };
    const issues = referenceMappingIssues(target, {
      question: { source: "literal", value: "ok" },
      count: { source: "literal", value: 2 },
    }, { answer: "/answer", score: "/score", missing: "/answer" }, { stateSchema: parentState });
    expect(issues.map(issue => `${issue.kind}:${issue.field}`)).toEqual(expect.arrayContaining([
      "output-state-type:score",
      "output-state-missing:missing",
    ]));
    // integer/number are intentionally compatible, and unknown/untyped schemas stay runtime decisions.
    expect(referenceTypesCompatible(referenceSchemaTypes({ type: "integer" }), referenceSchemaTypes({ type: "number" }))).toBe(true);
    expect(referenceTypesCompatible(undefined, referenceSchemaTypes({ type: "string" }))).toBe(true);
    expect(referenceSchemaTypes({ anyOf: [{ type: "string" }] })).toBeUndefined();
    expect(referenceSchemaTypes({ $ref: "#/$defs/value" })).toBeUndefined();
    expect(referenceSchemaAtPointer(target.outputSchema, "/answer")).toMatchObject({ type: "string" });
    expect(referenceSchemaAtPointer(target.outputSchema, "/removed")).toBeUndefined();
    const sourceIssues = referenceMappingIssues(target, {
      question: { source: "state", pointer: "/question", onMissing: { mode: "error" } },
    }, {}, {
      inputSchema: objectSchema({}),
      stateSchema: objectSchema({ question: { type: "number" } }),
    });
    expect(sourceIssues.map(issue => `${issue.kind}:${issue.field}`)).toContain("input-source-type:question");
  });

  it("describes the pinned revision against the current head", () => {
    expect(referenceRevisionStatus({ pinnedRevision: 3, currentRevision: 3 }).tone).toBe("current");
    expect(referenceRevisionStatus({ pinnedRevision: 2, currentRevision: 4 })).toMatchObject({ tone: "outdated", readOnly: true });
    expect(referenceRevisionStatus({ pinnedRevision: 2, currentRevision: 4, archived: true }).tone).toBe("archived");
    expect(referenceRevisionStatus({ pinnedRevision: 2, currentRevision: 4, missing: true }).tone).toBe("missing");
    expect(referenceRevisionStatus({ pinnedRevision: 5, currentRevision: 4 }).tone).toBe("missing");
  });

  it("builds the same fixed-reference config for new and re-pointed nodes", () => {
    expect(workflowReferenceConfig("wf", 4, "local")).toEqual({
      workflowRef: { workflowId: "wf", revision: 4 },
      environmentRef: "local",
      stateMode: "independent",
      persistence: "per-invocation",
    });
  });
});
