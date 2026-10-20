import { describe, expect, it } from "vitest";
import { workflowRedact, workflowStrictBody, validateWorkflowEditor } from "./workflowV2Protocol.js";

describe("Workflow V2 authenticated boundary", () => {
  it("rejects authority supplied in public Run requests", () => {
    expect(() => workflowStrictBody({ workflowId: "w", revision: 1, input: {}, environmentRef: "e", ownerUserId: "other" }, ["workflowId", "revision", "input", "environmentRef"])).toThrow("Unexpected");
    expect(() => workflowStrictBody({ verification: "passed" }, [])).toThrow("Unexpected");
  });
  it("projects nested secrets, provider values, credential-bearing code and private fields", () => {
    const input = { apiKey: "danger", nested: { authorization: "Bearer private", email: "a@example.org" }, text: 'api_key="literal-danger"', message: "known-value" };
    const output = workflowRedact(input, ["known-value"]);
    expect(JSON.stringify(output)).not.toMatch(/danger|a@example|known-value/);
    expect(input.apiKey).toBe("danger");
  });
  it("rejects editor references and unsafe positions", () => {
    const editor = { schemaVersion: 1, workflowId: "w", definitionRevision: 1, editorRevision: 1, nodes: { absent: { x: 0, y: 0 } }, edges: {} };
    expect(() => validateWorkflowEditor(editor, { nodes: [], transitions: [] })).toThrow("unknown node");
    editor.nodes = { absent: { x: Infinity, y: 0 } };
    expect(() => validateWorkflowEditor(editor, { nodes: [{ id: "absent" }], transitions: [] })).toThrow("Finite");
  });
});
it("removes credential-bearing object keys only from projections", () => {
  const source = { "prefix-synthetic-private-key": "ordinary", safe: { "synthetic-private-key": "ordinary" } };
  const projected = workflowRedact(source, ["synthetic-private-key"]);
  expect(projected).toEqual({ safe: {} });
  expect(JSON.stringify(projected)).not.toContain("synthetic-private-key");
  expect(source["prefix-synthetic-private-key"]).toBe("ordinary");
});

describe("Versioned display routing", () => {
  const definition = { nodes: [{ id: "a" }, { id: "b" }], transitions: [{ id: "ab", from: "a", outlet: "next", to: "b" }] };
  const editor = () => ({ schemaVersion: 1, workflowId: "w", definitionRevision: 1, editorRevision: 1, nodes: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, edges: { ab: { routing: { version: 1, mode: "manual", source: { side: "bottom", offset: 0.3 }, target: { side: "top", offset: 1 }, points: [{ x: 30, y: 40 }] } } } });
  it("validates bounded graph-space points without touching execution semantics", () => {
    const document = editor(); const original = structuredClone(definition);
    validateWorkflowEditor(document, definition);
    expect(definition).toEqual(original);
  });
  it.each([
    { version: 2, mode: "auto" }, { version: 1, mode: "other" },
    { version: 1, mode: ["auto"] }, { version: 1, mode: "auto", source: { side: ["left"], offset: 0.5 } },
    { version: 1, mode: "manual", source: { side: "left", offset: 1.1 } },
    { version: 1, mode: "manual", points: [{ x: NaN, y: 0 }] },
    { version: 1, mode: "manual", points: Array.from({ length: 33 }, () => ({ x: 0, y: 0 })) },
    { version: 1, mode: "auto", unknown: true },
  ])("rejects invalid and unknown routing extensions", (routing) => {
    expect(() => validateWorkflowEditor({ ...editor(), edges: { ab: { routing } } }, definition)).toThrow();
  });
  it("rejects silent erasure by older clients but permits explicit auto or deleted transitions", () => {
    const previous = editor();
    const older = { ...previous, edges: { ab: {} } };
    expect(() => validateWorkflowEditor(older, definition, previous)).toThrow("Preserve routing");
    expect(() => validateWorkflowEditor({ ...older, edges: { ab: { routing: { version: 1, mode: "auto" } } } }, definition, previous)).not.toThrow();
    expect(() => validateWorkflowEditor({ ...older, edges: {} }, { ...definition, transitions: [] }, previous)).not.toThrow();
  });
});

describe("Safe explicit input reuse", () => {
  it("preserves false, zero, null, empty containers and JSON Pointer escaping", async () => {
    const { workflowInputReuse } = await import("./workflowV2Protocol.js");
    expect(workflowInputReuse({ zero: 0, no: false, nil: null, empty: {}, list: [], "a/b~c": "x" }, [])).toEqual({ available: true, complete: true, fields: [{ pointer: "/zero", value: 0 }, { pointer: "/no", value: false }, { pointer: "/nil", value: null }, { pointer: "/empty", value: {} }, { pointer: "/list", value: [] }, { pointer: "/a~1b~0c", value: "x" }], removedFields: [] });
  });
  it("omits sensitive and transformed values with metadata, never derives safety from masks", async () => {
    const { workflowInputReuse } = await import("./workflowV2Protocol.js");
    const original = { query: "***", address: "private", nested: { note: "secret-value", text: "ok" }, rows: [{ email: "private" }] };
    const result = workflowInputReuse(original, ["secret-value"]);
    expect(result.fields).toEqual([{ pointer: "/query", value: "***" }, { pointer: "/nested/text", value: "ok" }]);
    expect(result.removedFields).toEqual([{ pointer: "/address", reason: "sensitive" }, { pointer: "/nested/note", reason: "redacted" }, { pointer: "/rows", reason: "redacted" }]);
    expect(result.complete).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/secret-value|private/);
    expect(original.address).toBe("private");
  });
  it("never leaks sensitive object keys and marks absent input unavailable", async () => {
    const { workflowInputReuse } = await import("./workflowV2Protocol.js");
    expect(workflowInputReuse({ "known-secret-value": "x" }, ["known-secret-value"])).toEqual({ available: true, complete: false, fields: [], removedFields: [{ pointer: "", reason: "sensitive" }] });
    expect(workflowInputReuse(undefined).available).toBe(false);
  });
});



it("validates subgraph layouts against their scoped node identities", () => {
  const graph = { nodes: [{ id: "same" }], transitions: [] };
  const definition = { nodes: [{ id: "same" }, { id: "sub", type: "core.subgraph", config: { graph } }], transitions: [] };
  const editor = { schemaVersion: 1, workflowId: "w", editorRevision: 1, definitionRevision: 1, nodes: { same: { x: 1, y: 2 } }, edges: {}, graphs: { '["sub"]': { nodes: { same: { x: 9, y: 8 } }, edges: {} } } };
  expect(() => validateWorkflowEditor(editor, definition)).not.toThrow();
  expect(() => validateWorkflowEditor({ ...editor, graphs: { '["unknown"]': editor.graphs['["sub"]'] } }, definition)).toThrow("unknown subgraph");
  expect(() => validateWorkflowEditor({ ...editor, graphs: { '["sub"]': { nodes: { outside: { x: 1, y: 2 } }, edges: {} } } }, definition)).toThrow("unknown node");
});
