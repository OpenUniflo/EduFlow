import { expect, it } from "vitest";
import { createEditorV2, createNodeV2, createWorkflowV2 } from "./factory";
import { insertAuthoringNode, messageAuthoringIssue, withModelState } from "./messageAuthoring";
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
it("gives a blank model graph editable messages, output mapping and actionable empty validation", () => {
  const definition = createWorkflowV2();
  const document = insertAuthoringNode({ definition, editor: createEditorV2(definition) }, createNodeV2("core.llm", "model"), 200, 100);
  expect(document.definition.outputBindings.messages).toMatchObject({ source: "state", pointer: "/messages" });
  expect(messageAuthoringIssue(document.definition.nodes[2])).toContain("添加至少一条");
  const example = liveQuestionExample(definition, "provider", "model");
  const model = example.definition.nodes.find(node => node.id === "model")!;
  expect(messageAuthoringIssue(model)).toBeUndefined();
  expect(model.inputs.messages).toMatchObject({ source: "state", pointer: "/messages" });
  expect(example.definition.inputSchema.required).toBeUndefined();
  const prepare=example.definition.nodes.find(node=>node.id==="prepare")!;
  expect(prepare.type).toBe("core.transform");
  expect(prepare.inputs.text).toMatchObject({source:"state",pointer:"/question"});
  expect(prepare.config.authoring).toMatchObject({interrupt:{title:"你想问什么？",resumeWrites:{question:"question"}}});
});
