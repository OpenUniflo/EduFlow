import { expect, it } from "vitest";
import { createNodeV2, createWorkflowV2, stateBinding } from "./factory";
import { llmConfigDiagnostics } from "./validation";
import { removeModelStructuredField, renameModelStructuredField, renameModelStructuredWriteField, withModelStructuredField } from "./structuredOutput";
import { renameStateField, withStateField } from "./stateAuthoring";

function modelDefinition() {
  const definition = createWorkflowV2();
  const node = createNodeV2("core.llm", "model");
  node.config = { ...node.config, providerRef: "p", modelRef: "m", prompt: { system: [], messages: [{ role: "user", content: [{ type: "text", text: "x" }] }] } };
  return { ...definition, nodes: [...definition.nodes, node] };
}

it("adds a structured field, its State field and its /<name> write in one edit", () => {
  const definition = withModelStructuredField(modelDefinition(), "model", { name: "keywords", type: "string", description: "搜索关键词" });
  const node = definition.nodes.find(item => item.id === "model")!;
  expect(node.config.structuredOutput).toEqual({ fields: [{ name: "keywords", type: "string", description: "搜索关键词" }] });
  expect(node.writes.keywords).toBe("/keywords");
  expect((definition.state.schema.properties as Record<string, unknown>).keywords).toMatchObject({ type: "string" });
  expect((definition.state.initial as Record<string, unknown>).keywords).toBe("");
});

it("removes the legacy answer write and its orphan field when no downstream node reads it", () => {
  const definition = withModelStructuredField(withStateField(modelDefinition(), "answer", "string"), "model", { name: "keywords", type: "string" });
  const node = definition.nodes.find(item => item.id === "model")!;
  expect(node.writes.answer).toBeUndefined();
  expect(node.writes.keywords).toBe("/keywords");
  expect((definition.state.schema.properties as Record<string, unknown>).answer).toBeUndefined();
});

it("keeps a consumed answer write and does not change downstream behavior", () => {
  const base = modelDefinition();
  const consumer = createNodeV2("core.function", "consumer");
  consumer.inputs = { input: stateBinding("/answer") };
  base.nodes = [...base.nodes, consumer];
  const definition = withModelStructuredField(base, "model", { name: "keywords", type: "string" });
  const node = definition.nodes.find(item => item.id === "model")!;
  expect(node.writes.answer).toBe("/text");
  expect(node.writes.keywords).toBe("/keywords");
});

it("keeps a consumed answer write when the workflow output reads it", () => {
  const base = modelDefinition();
  base.outputBindings = { answer: stateBinding("/answer") };
  const definition = withModelStructuredField(base, "model", { name: "keywords", type: "string" });
  const node = definition.nodes.find(item => item.id === "model")!;
  expect(node.writes.answer).toBe("/text");
  expect(node.writes.keywords).toBe("/keywords");
});

it("removes the field definition and the write together", () => {
  const added = withModelStructuredField(modelDefinition(), "model", { name: "keywords", type: "string" });
  const removed = removeModelStructuredField(added, "model", "keywords");
  const node = removed.nodes.find(item => item.id === "model")!;
  expect(node.config.structuredOutput).toBeUndefined();
  expect(node.writes.keywords).toBeUndefined();
});

it("validates duplicate and reserved structured field names in the frontend domain", () => {
  const definition = modelDefinition();
  definition.nodes = definition.nodes.map(node => node.id === "model" ? { ...node, config: { ...node.config, structuredOutput: { fields: [{ name: "text", type: "string" }, { name: "text", type: "number" }] } } } : node);
  const diagnostics = llmConfigDiagnostics(definition.nodes.find(node => node.id === "model")!, definition);
  expect(diagnostics.map(item => item.code)).toEqual(["INVALID_STRUCTURED_OUTPUT", "INVALID_STRUCTURED_OUTPUT", "INVALID_STRUCTURED_OUTPUT"]);
  expect(diagnostics[0].pointer).toContain("/config/structuredOutput/fields/0/name");
});

it("renames a structured field, its output pointer, its State field and downstream readers", () => {
  let definition = withModelStructuredField(modelDefinition(), "model", { name: "type", type: "string" });
  const reader = createNodeV2("core.function", "reader");
  reader.inputs = { input: stateBinding("/type") };
  const promptReader = createNodeV2("core.llm", "prompt-reader");
  promptReader.inputs = { type: stateBinding("/type") };
  promptReader.config = { prompt: { system: [{ type: "param", name: "type" }], messages: [] } };
  definition = { ...definition, nodes: [...definition.nodes, reader, promptReader] };
  const next = renameModelStructuredField(definition, "model", "type", "kind");
  const node = next.nodes.find(item => item.id === "model")!;
  expect((node.config.structuredOutput as { fields: { name: string }[] }).fields[0].name).toBe("kind");
  expect(node.writes).toEqual({ kind: "/kind" });
  expect((next.state.schema.properties as Record<string, unknown>).type).toBeUndefined();
  expect((next.state.schema.properties as Record<string, unknown>).kind).toMatchObject({ type: "string" });
  expect(next.nodes.find(item => item.id === "reader")!.inputs.input).toMatchObject({ pointer: "/kind" });
  const promptNode = next.nodes.find(item => item.id === "prompt-reader")!;
  expect(promptNode.inputs.kind).toMatchObject({ pointer: "/kind" });
  expect((promptNode.config.prompt as { system: { name: string }[] }).system[0].name).toBe("kind");
});

it("rejects a structured field rename that collides or is illegal", () => {
  let definition = withModelStructuredField(modelDefinition(), "model", { name: "type", type: "string" });
  definition = withModelStructuredField(definition, "model", { name: "other", type: "string" });
  expect(renameModelStructuredField(definition, "model", "type", "other")).toBe(definition);
  expect(renameModelStructuredField(definition, "model", "type", "1bad")).toBe(definition);
});

it("creates a new write destination for a structured field without changing the model key", () => {
  const base = withModelStructuredField(modelDefinition(), "model", { name: "kw_en", type: "string" });
  const reader = createNodeV2("core.function", "reader");
  reader.inputs = { input: stateBinding("/kw_en") };
  const definition = { ...base, nodes: [...base.nodes, reader] };
  const next = renameModelStructuredWriteField(definition, "model", "kw_en", "terms_en");
  const node = next.nodes.find(item => item.id === "model")!;
  const fields = (node.config.structuredOutput as { fields: { name: string }[] }).fields;
  expect(fields.map(field => field.name)).toEqual(["kw_en"]);
  expect(node.writes).toEqual({ terms_en: "/kw_en" });
  // A custom write destination is a State-field rename, exactly like a tool
  // output: readers follow the new destination instead of being left broken.
  expect((next.state.schema.properties as Record<string, unknown>).kw_en).toBeUndefined();
  expect((next.state.schema.properties as Record<string, unknown>).terms_en).toMatchObject({ type: "string" });
  expect(next.nodes.find(item => item.id === "reader")!.inputs.input).toMatchObject({ pointer: "/terms_en" });
});

it("renames a separated structured key without moving its write destination", () => {
  const split = renameModelStructuredWriteField(withModelStructuredField(modelDefinition(), "model", { name: "kw_en", type: "string" }), "model", "kw_en", "terms_en");
  const next = renameModelStructuredField(split, "model", "kw_en", "keywords_en");
  const node = next.nodes.find(item => item.id === "model")!;
  const fields = (node.config.structuredOutput as { fields: { name: string }[] }).fields;
  expect(fields.map(field => field.name)).toEqual(["keywords_en"]);
  expect(node.writes).toEqual({ terms_en: "/keywords_en" });
  expect((next.state.schema.properties as Record<string, unknown>).terms_en).toMatchObject({ type: "string" });
});

it("syncs downstream readers for tool and structured write destinations the same way", () => {
  const toolBase = withStateField(createWorkflowV2(), "hits", "array");
  const tool = createNodeV2("core.tool", "search");
  tool.writes = { hits: "/result/hits" };
  const toolReader = createNodeV2("core.function", "tool-reader");
  toolReader.inputs = { input: stateBinding("/hits") };
  const toolNext = renameStateField({ ...toolBase, nodes: [tool, toolReader] }, "hits", "hn_hits");

  const modelBase = withModelStructuredField(modelDefinition(), "model", { name: "kw_en", type: "string" });
  const modelReader = createNodeV2("core.function", "model-reader");
  modelReader.inputs = { input: stateBinding("/kw_en") };
  const modelNext = renameModelStructuredWriteField({ ...modelBase, nodes: [...modelBase.nodes, modelReader] }, "model", "kw_en", "terms_en");

  expect(toolNext.nodes.find(item => item.id === "tool-reader")!.inputs.input).toMatchObject({ pointer: "/hn_hits" });
  expect(modelNext.nodes.find(item => item.id === "model-reader")!.inputs.input).toMatchObject({ pointer: "/terms_en" });
  expect((modelNext.nodes.find(item => item.id === "model")!.config.structuredOutput as { fields: { name: string }[] }).fields.map(field => field.name)).toEqual(["kw_en"]);
});
