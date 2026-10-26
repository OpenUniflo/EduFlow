import { expect, it } from "vitest";
import type { JsonValue, JsonSchema, WorkflowDefinitionV2 } from "./types";
const props = (definition: WorkflowDefinitionV2) => definition.state.schema.properties as Record<string, JsonSchema>;
import { createNodeV2, createWorkflowV2, stateBinding } from "./factory";
import {
  defaultNodeOutput, pruneOrphanStateFields, removeStateField, renameStateField, stateFieldInitial, stateFieldNameIssue, stateTypeLabel,
  withDefaultNodeOutput, withStateField, withStateFieldInitial, withStateFieldInput, withStateFieldWrite,
  withStateReducer,
} from "./stateAuthoring";

it("declares a State field once with a Chinese type and initial value", () => {
  const definition = createWorkflowV2();
  const next = withStateField(definition, "summary", "object");
  expect(props(next).summary).toMatchObject({ type: "object" });
  expect((next.state.initial as Record<string, JsonValue>).summary).toEqual({});
  expect(next.state.reducers.summary).toEqual({ name: "replace", version: 1 });
  expect(withStateField(next, "summary", "string")).toBe(next);
  expect(stateFieldNameIssue(next.state.schema, "summary")).toContain("已存在");
  expect(stateFieldNameIssue(next.state.schema, "__proto__")).toContain("保留名称");
  expect(stateFieldNameIssue(next.state.schema, "1bad")).toContain("字母");
  expect(stateTypeLabel("array")).toBe("列表");
  expect(stateFieldInitial("array")).toEqual([]);
});

it("binds an input and creates its State field in one definition update", () => {
  const definition = { ...createWorkflowV2(), nodes: [createNodeV2("core.llm", "model")] };
  const next = withStateFieldInput(definition, "model", "question", "question", "string");
  expect(props(next).question).toMatchObject({ type: "string" });
  expect(next.nodes[0].inputs.question).toMatchObject({ source: "state", pointer: "/question" });
});

it("maps an output to a new State field and can remove a replaced field", () => {
  const definition = { ...createWorkflowV2(), nodes: [createNodeV2("core.llm", "model")] };
  const next = withStateFieldWrite(definition, "model", "answerText", "string", "/text");
  expect(next.nodes[0].writes.answerText).toBe("/text");
  expect(props(next).answerText).toMatchObject({ type: "string" });
  expect(withStateReducer(next, "answerText", "append").state.reducers.answerText.name).toBe("append");
  const cleared = removeStateField(withStateFieldInitial(next, "answerText", undefined), "answerText");
  expect(props(cleared).answerText).toBeUndefined();
  expect(cleared.state.reducers.answerText).toBeUndefined();
});

it("gives a new node a purpose-named output and suffixes collisions", () => {
  expect(defaultNodeOutput("core.llm")).toMatchObject({ field: "answer", pointer: "/text" });
  expect(defaultNodeOutput("core.tool")).toMatchObject({ field: "result", pointer: "/result" });
  expect(defaultNodeOutput("core.router")).toBeUndefined();

  const definition = createWorkflowV2();
  const first = withDefaultNodeOutput(definition, createNodeV2("core.llm", "model-1"));
  expect(first.node.writes).toEqual({ answer: "/text" });
  expect(props(first.definition).answer).toMatchObject({ type: "string" });

  const second = withDefaultNodeOutput(first.definition, createNodeV2("core.llm", "model-2"));
  expect(second.node.writes).toEqual({ answer_2: "/text" });
  expect(props(second.definition).answer_2).toMatchObject({ type: "string" });

  const tool = withDefaultNodeOutput(second.definition, createNodeV2("core.tool", "tool-1"));
  expect(tool.node.writes).toEqual({ result: "/result" });
  expect(props(tool.definition).result).toMatchObject({ type: "object" });
});

function fieldWithWrite() {
  const base = withStateField(createWorkflowV2(), "answer", "string");
  const model = { ...createNodeV2("core.llm", "model"), writes: { answer: "/text" } };
  return { ...base, nodes: [...base.nodes, model] };
}

it("removes an orphan field when its last write is deleted", () => {
  const definition = fieldWithWrite();
  const withoutWrite = { ...definition, nodes: definition.nodes.map(node => node.id === "model" ? { ...node, writes: {} } : node) };
  const pruned = pruneOrphanStateFields(withoutWrite, ["answer"]);
  expect(props(pruned).answer).toBeUndefined();
  expect(pruned.state.initial.answer).toBeUndefined();
  expect(pruned.state.reducers.answer).toBeUndefined();
});

it("keeps a field that is still read, initialized from startup input, or not part of the deletion", () => {
  const read = fieldWithWrite();
  read.nodes.push({ ...createNodeV2("core.function", "reader"), inputs: { input: stateBinding("/answer") } });
  const readWithoutWrite = { ...read, nodes: read.nodes.map(node => node.id === "model" ? { ...node, writes: {} } : node) };
  expect(props(pruneOrphanStateFields(readWithoutWrite, ["answer"])).answer).toBeDefined();

  const started = { ...fieldWithWrite(), state: { ...fieldWithWrite().state, inputBindings: { answer: { source: "input" as const, pointer: "/question", onMissing: { mode: "error" as const } } } } };
  const startedWithoutWrite = { ...started, nodes: started.nodes.map(node => node.id === "model" ? { ...node, writes: {} } : node) };
  expect(props(pruneOrphanStateFields(startedWithoutWrite, ["answer"])).answer).toBeDefined();

  const sibling = withStateField(fieldWithWrite(), "tone", "string");
  const siblingWithoutWrite = { ...sibling, nodes: sibling.nodes.map(node => node.id === "model" ? { ...node, writes: {} } : node) };
  const pruned = pruneOrphanStateFields(siblingWithoutWrite, ["answer"]);
  expect(props(pruned).answer).toBeUndefined();
  expect(props(pruned).tone).toBeDefined();
});


it("renames a State field and every writer, reader, router, output and prompt reference", () => {
  const base = withStateField(withStateField(createWorkflowV2(), "type", "string"), "other", "string");
  const writer = { ...createNodeV2("core.llm", "writer"), writes: { type: "/type" }, config: { prompt: { system: [], messages: [] } } };
  const reader = { ...createNodeV2("core.function", "reader"), inputs: { input: stateBinding("/type") } };
  const promptReader = {
    ...createNodeV2("core.llm", "prompt-reader"),
    inputs: { type: stateBinding("/type") },
    config: { prompt: { system: [{ type: "param", name: "type" }], messages: [{ role: "user", content: [{ type: "text", text: "x" }, { type: "param", name: "type", format: "json" }] }] } },
  };
  const router = {
    ...createNodeV2("core.router", "router"),
    config: { cases: [{ id: "has", priority: 1, predicate: { op: "and", children: [{ op: "nonEmpty", source: "state", pointer: "/type" }] } }] },
  };
  const definition = {
    ...base,
    state: {
      ...base.state,
      initial: { ...base.state.initial, type: "x" },
      reducers: { ...base.state.reducers, type: { name: "append", version: 1 as const } },
      inputBindings: { type: { source: "input" as const, pointer: "/seed", onMissing: { mode: "error" as const } } },
    },
    nodes: [...base.nodes, writer, reader, promptReader, router],
    outputBindings: { type: stateBinding("/type") },
  } as WorkflowDefinitionV2;
  const next = renameStateField(definition, "type", "kind");
  expect(props(next).type).toBeUndefined();
  expect(props(next).kind).toMatchObject({ type: "string" });
  expect(next.state.initial.kind).toBe("x");
  expect(next.state.reducers.kind).toEqual({ name: "append", version: 1 });
  expect(next.state.inputBindings.kind).toMatchObject({ source: "input", pointer: "/seed" });
  expect(next.nodes.find(node => node.id === "writer")!.writes).toEqual({ kind: "/type" });
  expect(next.nodes.find(node => node.id === "reader")!.inputs.input).toMatchObject({ pointer: "/kind" });
  const promptNode = next.nodes.find(node => node.id === "prompt-reader")!;
  expect(promptNode.inputs.kind).toMatchObject({ pointer: "/kind" });
  expect(promptNode.inputs.type).toBeUndefined();
  const prompt = promptNode.config.prompt as { system: { name: string }[]; messages: { content: { name?: string }[] }[] };
  expect(prompt.system[0].name).toBe("kind");
  expect(prompt.messages[0].content[1].name).toBe("kind");
  expect(next.nodes.find(node => node.id === "router")!.config.cases).toEqual([{ id: "has", priority: 1, predicate: { op: "and", children: [{ op: "nonEmpty", source: "state", pointer: "/kind" }] } }]);
  expect((next.outputBindings.type as { pointer: string }).pointer).toBe("/kind");
});

it("rejects an illegal or colliding State field rename without changing the definition", () => {
  const definition = withStateField(withStateField(createWorkflowV2(), "type", "string"), "other", "string");
  expect(renameStateField(definition, "type", "other")).toBe(definition);
  expect(renameStateField(definition, "type", "1bad")).toBe(definition);
  expect(renameStateField(definition, "missing", "kind")).toBe(definition);
});
