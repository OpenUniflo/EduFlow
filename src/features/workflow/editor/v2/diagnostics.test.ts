import { expect, it } from "vitest";
import { createNodeV2, createWorkflowV2 } from "../../domain/v2/factory";
import type { WorkflowDiagnostic, WorkflowRunV2, WorkflowStepV2 } from "../../domain/v2/types";
import { diagnosticTarget, diagnosticText, runFailureTarget } from "./diagnostics";

const definition = createWorkflowV2();
const diagnostic = (fields: Partial<WorkflowDiagnostic>): WorkflowDiagnostic => ({ code: "INVALID_SCHEMA", severity: "error", message: "Compiler diagnostic", ...fields });

it("locates a real pre-Step input failure only in its immutable execution definition without inventing a Step", () => {
  const run = { runId: "run", status: "failed", error: { code: "BINDING_MISSING", nodeId: "start", invocation: 2, stage: "input_resolution", pointer: "/nodes/start/inputs/arguments" } } as WorkflowRunV2;
  const target = runFailureTarget(run, [], definition);
  expect(target).toMatchObject({ nodeId: "start", invocation: 2, beforeExecution: true, pointer: "/nodes/start/inputs/arguments" });
  expect(runFailureTarget(run, [], { ...definition, nodes: [] })).toBeUndefined();
  expect(runFailureTarget({ ...run, status: "success" }, [], definition)).toBeUndefined();
});
it("keeps historical failed invocation identity and never guesses a node for legacy or system failures", () => {
  const run = { runId: "run", status: "failed", error: { code: "TIMEOUT" } } as WorkflowRunV2;
  const steps = [1, 3].map(invocation => ({ stepId: `step${invocation}`, runId: "run", nodeId: "start", invocation, status: "failed" } as WorkflowStepV2));
  expect(runFailureTarget(run, steps, definition)).toMatchObject({ nodeId: "start", invocation: 3, beforeExecution: false });
  expect(runFailureTarget(run, [{ ...steps[0], runId: "other" }], definition)).toBeUndefined();
  expect(runFailureTarget(run, [], definition)).toBeUndefined();
});

it.each([
  ["/inputSchema/properties/question", "输入 Schema"],
  ["/outputSchema/type", "输出 Schema"],
  ["/state/schema", "Graph State"],
  ["/state/reducers/answer", "Graph State"],
  ["/state/inputBindings/answer", "Graph State"],
  ["/outputBindings/answer", "最终输出绑定"],
  ["/policy/maxSteps", "运行限制"],
])("routes a real compiler Definition pointer %s to an editable global field", (pointer, field) => {
  const target = diagnosticTarget(diagnostic({ pointer }), definition);
  expect(target.panel).toBe("state");
  expect(target.nodeId).toBeUndefined();
  expect(target.fields).toEqual([field, "工作流配置"]);
});

it("does not confuse a run input named state with Definition State", () => {
  const target = diagnosticTarget(diagnostic({ scope: "input", pointer: "/state" }), definition);
  expect(target.panel).toBe("input");
  expect(target.fields).toEqual([]);
});

it("resolves stable node identities and escaped field names with editable fallbacks", () => {
  const target = diagnosticTarget(diagnostic({ nodeId: "start", pointer: "/nodes/start/inputs/a~1b~0c" }), definition);
  expect(target).toMatchObject({ panel: "node", nodeId: "start", fields: ["inputs/a/b~c", "输入绑定", "节点配置"] });
  expect(diagnosticTarget(diagnostic({ pointer: "/nodes/0/config/modelRef" }), definition).fields).toEqual(["config/modelRef", "节点参数", "节点配置"]);
});

it("locates a transition's source outlet and retains a visible fallback for unknown locations", () => {
  const edge = definition.transitions[0];
  expect(diagnosticTarget(diagnostic({ code: "DANGLING_TRANSITION", transitionId: edge.id }), definition)).toMatchObject({ panel: "node", nodeId: edge.from, transitionId: edge.id, fields: ["outlets", "节点配置"] });
  expect(diagnosticTarget(diagnostic({ pointer: "/unknown" }), definition)).toEqual({ panel: "problems", fields: ["问题摘要"] });
});

it("prioritizes actionable model and policy pointers over a broad environment scope", () => {
  expect(diagnosticTarget(diagnostic({ scope: "environment", nodeId: "start", pointer: "/nodes/start/config/modelRef" }), definition)).toMatchObject({ panel: "node", fields: ["config/modelRef", "节点参数", "节点配置"] });
  expect(diagnosticTarget(diagnostic({ scope: "environment", pointer: "/policy/maxSteps" }), definition)).toMatchObject({ panel: "state", fields: ["运行限制", "工作流配置"] });
  expect(diagnosticTarget(diagnostic({ scope: "environment" }), definition).panel).toBe("environment");
});

it("locates existing State initial and reducer controls while missing fields use the full State editor", () => {
  const stateDefinition = { ...definition, state: { ...definition.state, schema: { type: "object", properties: { "a/b~c": { type: "number" } } } } };
  expect(diagnosticTarget(diagnostic({ pointer: "/state/initial/a~1b~0c" }), stateDefinition)).toMatchObject({ panel: "state-field", stateField: "a/b~c", control: "initial", fields: ["state/a/b~c", "Graph State", "工作流配置"] });
  expect(diagnosticTarget(diagnostic({ pointer: "/state/reducers/a~1b~0c" }), stateDefinition)).toMatchObject({ panel: "state-field", control: "reducer" });
  expect(diagnosticTarget(diagnostic({ pointer: "/state/reducers/absent" }), stateDefinition)).toMatchObject({ panel: "state", fields: ["Graph State", "工作流配置"] });
});

it("explains State and output diagnostics from structured pointers rather than English message text", () => {
  const document = { ...definition, state: { ...definition.state, schema: { type: "object", properties: { count: { type: "integer", title: "计数" } } } } };
  const state = diagnosticText(diagnostic({ code: "INVALID_INITIAL_STATE", pointer: "/state/initial/count", message: "unexpected provider prose" }), document);
  expect(state.location).toBe("共享状态 · 计数");
  expect(state.advice).toContain("整数");
  const output = diagnosticText(diagnostic({ code: "UNSUPPORTED_SCHEMA_KEYWORD", pointer: "/outputSchema/oneOf" }), document);
  expect(output.location).toBe("输出结构");
  expect(output.title).toContain("暂不支持");
  expect(output.advice).not.toContain("外部调用数据");
});

it("uses local referenced input types for actionable field guidance", () => {
  const document = { ...definition, inputSchema: { type: "object", properties: { quantity: { $ref: "#/$defs/count" } }, $defs: { count: { type: "integer", title: "数量" } } } };
  const text = diagnosticText(diagnostic({ code: "INVALID_RUN_INPUT", scope: "input", pointer: "/quantity" }), document);
  expect(text.location).toBe("外部调用数据 · 数量");
  expect(text.advice).toContain("整数");
  expect(text.title).toContain('数量');expect(text.advice).toContain('高级调用数据');
});

it('explains a required question as nonempty text and identifies the actual edit location',()=>{
  const document={...definition,inputSchema:{type:'object',properties:{question:{type:'string',title:'你的问题',minLength:1}}}};
  const text=diagnosticText(diagnostic({code:'INVALID_RUN_INPUT',scope:'input',pointer:'/question'}),document);
  expect(text.title).toBe('“你的问题”需要非空文本');expect(text.advice).toContain('图设置 → 高级调用数据');
});

it("locates a pointerless unknown conversion without masking more precise input diagnostics", () => {
  const transform = createNodeV2("core.transform", "calc");
  const document = { ...definition, nodes: [...definition.nodes, transform] };
  expect(diagnosticTarget(diagnostic({ code: "UNKNOWN_OPERATION", nodeId: "calc" }), document).fields).toEqual(["config/operationRef", "节点参数", "节点配置"]);
  expect(diagnosticTarget(diagnostic({ code: "UNKNOWN_OPERATION", nodeId: "calc", pointer: "/nodes/calc/inputs/left" }), document).fields).toEqual(["inputs/left", "输入绑定", "节点配置"]);
  expect(diagnosticTarget(diagnostic({ code: "UNRECOGNIZED_SERVER_CODE", nodeId: "calc" }), document).fields).toEqual(["节点配置"]);
});
