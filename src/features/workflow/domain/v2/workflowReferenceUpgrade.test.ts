import { describe, expect, it } from "vitest";
import type { JsonSchema, WorkflowDefinitionV2, WorkflowDocumentV2 } from "./types";
import { assessReferenceUpgrade, referenceInterfaceChanges, referenceUpgradeCanApply, referenceUpgradeDocumentMatches } from "./workflowReferenceUpgrade";

const objectSchema = (properties: Record<string, JsonSchema>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

function definition(overrides: Partial<WorkflowDefinitionV2> = {}): WorkflowDefinitionV2 {
  return {
    schemaVersion: "2.0", workflowId: "target", revision: 1, name: "目标", description: "",
    inputSchema: objectSchema({
      question: { type: "string", title: "问题" },
      count: { type: "integer", default: 2 },
      optional: { type: "boolean" },
    }, ["question"]),
    outputSchema: objectSchema({ answer: { type: "string" }, score: { type: "number" } }, ["answer"]),
    state: { schema: objectSchema({}), initial: {}, inputBindings: {}, reducers: {} },
    entryNodeId: "start", nodes: [], transitions: [], outputBindings: {},
    policy: { timeoutMs: 1, nodeTimeoutMs: 1, maxNodeExecutions: 1, maxToolCalls: 1, maxInputBytes: 1, maxStateBytes: 1, maxEventBytes: 1, maxOutputTokens: 1, maxAttempts: 1 },
    requiredCapabilities: [],
    ...overrides,
  };
}

function documentFor(definitionValue: WorkflowDefinitionV2): WorkflowDocumentV2 {
  return {
    definition: definitionValue,
    editor: { schemaVersion: 1, workflowId: definitionValue.workflowId, editorRevision: 1, definitionRevision: definitionValue.revision, nodes: {}, edges: {} },
  };
}

const previous = definition();
const next = definition({
  revision: 4,
  inputSchema: objectSchema({
    question: { type: "number", title: "问题" },
    mode: { type: "string", title: "模式" },
    count: { type: "integer", default: 3 },
  }, ["question", "mode"]),
  outputSchema: objectSchema({ answer: { type: "string" }, score: { type: "string" }, note: { type: "string" } }, ["answer"]),
});

describe("fixed Workflow reference upgrade preview", () => {
  it("reports added, removed, required, type and default changes without inventing interface fields", () => {
    const changes = referenceInterfaceChanges(previous, next);
    expect(changes.total).toBe(6);
    expect(changes.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "question", kind: "changed", attributes: ["type"] }),
      expect.objectContaining({ name: "mode", kind: "added" }),
      expect.objectContaining({ name: "optional", kind: "removed" }),
      expect.objectContaining({ name: "count", kind: "changed", attributes: ["default"] }),
    ]));
    expect(changes.outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "score", kind: "changed", attributes: ["type"] }),
      expect.objectContaining({ name: "note", kind: "added" }),
    ]));
  });

  it("derives required mappings and output State type repairs from the exact new revision", () => {
    const assessment = assessReferenceUpgrade({
      previous, next,
      inputs: {
        question: { source: "literal", value: 1 },
        count: { source: "literal", value: "three" },
        stray: { source: "literal", value: true },
      },
      writes: { answer: "/answer", score: "/score", stale: "/removed" },
      inputSchema: objectSchema({}),
      stateSchema: objectSchema({ answer: { type: "string" }, score: { type: "number" } }, ["answer", "score"]),
    });
    expect(assessment.compatible).toBe(false);
    expect(assessment.issues.map(issue => `${issue.kind}:${issue.field}`)).toEqual(expect.arrayContaining([
      "input-missing:mode",
      "input-extra:stray",
      "input-type:count",
      "output-extra:stale",
      "output-state-type:score",
    ]));
  });

  it("keeps unchanged mappings compatible and available for explicit apply", () => {
    const compatibleNext = definition({ revision: 2, inputSchema: objectSchema({ question: { type: "string", title: "问题" } }, ["question"]) });
    const assessment = assessReferenceUpgrade({
      previous, next: compatibleNext,
      inputs: { question: { source: "literal", value: "ok" } },
      writes: { answer: "/answer" },
      inputSchema: objectSchema({}),
      stateSchema: objectSchema({ answer: { type: "string" } }, ["answer"]),
    });
    expect(assessment.compatible).toBe(true);
    expect(referenceUpgradeCanApply({
      document: documentFor(compatibleNext), selectedRevision: 2, currentRevision: 1,
      environmentAvailable: true, loading: false, error: "", applying: false,
    })).toBe(true);
    expect(referenceUpgradeCanApply({
      document: documentFor(compatibleNext), selectedRevision: 2, currentRevision: 1,
      environmentAvailable: false, loading: false, error: "", applying: false,
    })).toBe(false);
    expect(referenceUpgradeCanApply({
      document: documentFor(compatibleNext), selectedRevision: 2, currentRevision: 2,
      environmentAvailable: true, loading: false, error: "", applying: false,
    })).toBe(false);
  });

  it("applies only the previewed exact revision and rejects a rewritten or deleted one", () => {
    const preview = documentFor(definition({ revision: 2 }));
    expect(referenceUpgradeDocumentMatches(2, preview, documentFor(definition({ revision: 2 })))).toBe(true);
    expect(referenceUpgradeDocumentMatches(2, preview, documentFor(definition({ revision: 3 })))).toBe(false);
    expect(referenceUpgradeDocumentMatches(2, preview, documentFor(definition({ revision: 2, name: "changed" })))).toBe(false);
  });
});
