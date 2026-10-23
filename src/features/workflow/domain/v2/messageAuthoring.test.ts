import { expect, it } from "vitest";
import { createEditorV2, createNodeV2, createWorkflowV2 } from "./factory";
import { insertAuthoringNode, withModelState } from "./messageAuthoring";
import { liveQuestionExample } from "./authoringExamples";

it("adds model State without replacing existing declarations or reducer values", () => {
  const definition = createWorkflowV2();
  definition.state.schema.properties = { messages: { type: "array", description: "owned" } };
  definition.state.initial.messages = [{ id: "existing" }];
  definition.state.reducers.messages = { name: "registered-custom", version: 1 };
  const result = withModelState(definition);
  expect(result.state.schema.properties).toMatchObject({ messages: { description: "owned" }, pendingCalls: { type: "array" } });
  expect(result.state.initial).toEqual({ messages: [{ id: "existing" }], pendingCalls: [] });
  expect(result.state.reducers.messages.name).toBe("registered-custom");
  expect(definition.state.initial.pendingCalls).toBeUndefined();
});
it("gives a blank model graph the model answer state and output mapping", () => {
  const definition = createWorkflowV2();
  const document = insertAuthoringNode({ definition, editor: createEditorV2(definition) }, createNodeV2("core.llm", "model"), 200, 100);
  expect(document.definition.outputBindings.answer).toMatchObject({ source: "state", pointer: "/answer" });
  expect((document.definition.state.schema.properties as Record<string, unknown>)?.answer).toMatchObject({ type: "string" });
  const example = liveQuestionExample(definition, "provider", "model");
  const model = example.definition.nodes.find(node => node.id === "model")!;
  expect((model.config.prompt as { messages: unknown[] }).messages.length).toBeGreaterThan(0);
  expect(model.inputs.history).toMatchObject({ source: "state", pointer: "/messages" });
  expect(example.definition.inputSchema.required).toBeUndefined();
  const prepare=example.definition.nodes.find(node=>node.id==="prepare")!;
  expect(prepare.type).toBe("core.transform");
  expect(prepare.inputs.text).toMatchObject({source:"state",pointer:"/question"});
  expect(prepare.config.authoring).toMatchObject({interrupt:{title:"你想问什么？",resumeWrites:{question:"question"}}});
});
