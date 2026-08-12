import type { FlowNode, WorkflowDefinition } from "@/features/workflow/domain/types";
import { isControlOutletEdge } from "@/features/workflow/domain/graphOperations";
import type { WorkflowAssignmentContext, WorkflowRunNodeRecord, WorkflowRunRecord, WorkflowRuntime } from "@/features/workflow/runtime/types";
import { demoWorkflowSchemaFields } from "./demoWorkflowTemplates";

function parseFormValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || ["true", "false", "null"].includes(trimmed)) {
    try { return JSON.parse(trimmed); } catch { return value; }
  }
  return value;
}

function mockFieldValue(field: string, node: FlowNode): unknown {
  const values: Record<string, unknown> = {
    user_input: "总结这份文件",
    query: "Knowledge Atlas workflow",
    messages: ["用户请求", `${node.label} 准备执行`],
    task_type: "agent",
    api_result: { items: 3 },
    draft_answer: `${node.label} 的草稿输出`,
    should_continue: node.kind !== "agent",
    tool_name: "search_api",
    tool_args: { query: "Knowledge Atlas workflow" },
    tool_result: "检索到 3 条相关资料",
    final_answer: `${node.label} 的测试输出`,
    iteration: 1
  };
  return values[field] ?? `mock_${field}`;
}

function nodeInput(node: FlowNode) {
  return node.kind === "system" ? {} : Object.fromEntries(node.reads.map((field) => [field, mockFieldValue(field, node)]));
}

function nodeOutput(node: FlowNode, input: Record<string, unknown>) {
  if (node.kind === "system") return node.id === "start" ? { event: "enter_workflow" } : { event: "finish_workflow" };
  return {
    ...Object.fromEntries(node.writes.map((field) => [field, mockFieldValue(field, node)])),
    _debug: { isolated: true, consumed_fields: Object.keys(input) }
  };
}

function applyStep(definition: WorkflowDefinition, state: Record<string, unknown>, itemId: string, index: number) {
  const node = definition.nodes.find((item) => item.id === itemId);
  const edge = definition.edges.find((item) => item.id === itemId);
  state.messages = definition.runOrder.slice(0, index + 1).filter((item) => definition.nodes.some((candidate) => candidate.id === item));
  node?.writes.forEach((field) => { state[field] = mockFieldValue(field, node); });
  if (edge && isControlOutletEdge(edge, definition)) {
    state.task_type = edge.label;
    state.should_continue = edge.label === "continue";
  }
  if ((definition.id === "agent" || definition.id === "showcase") && itemId === "tool") state.tool_result = "检索到 3 条相关资料";
  if (itemId === "end") {
    state.final_answer = definition.result;
    state.should_continue = false;
  }
}

function createStepSnapshot(definition: WorkflowDefinition, itemId: string, index: number) {
  const state: Record<string, unknown> = {
    user_input: "总结这份文件",
    messages: definition.runOrder.slice(0, index + 1).filter((item) => definition.nodes.some((node) => node.id === item)),
    task_type: "",
    api_result: {},
    draft_answer: "",
    tool_call: null,
    tool_name: null,
    tool_args: null,
    tool_result: "",
    final_answer: "",
    should_continue: false,
    iteration: 0
  };
  const node = definition.nodes.find((item) => item.id === itemId);
  const edge = definition.edges.find((item) => item.id === itemId);
  node?.writes.forEach((field) => { state[field] = mockFieldValue(field, node); });
  if (edge && isControlOutletEdge(edge, definition)) {
    state.task_type = edge.label;
    state.should_continue = edge.label === "continue";
  }
  if ((definition.id === "agent" || definition.id === "showcase") && itemId === "tool") state.tool_result = "检索到 3 条相关资料";
  if (itemId === "end") {
    state.final_answer = definition.result;
    state.should_continue = false;
  }
  return state;
}

export class DemoWorkflowRuntime implements WorkflowRuntime {
  readonly stepDelayMs = 760;

  createInitialState() {
    return Object.fromEntries(demoWorkflowSchemaFields.map((field) => [field.name, parseFormValue(field.defaultValue)]));
  }

  createStateSnapshot(definition: WorkflowDefinition, stateValues: Record<string, unknown>, runIndex: number) {
    const state = { ...this.createInitialState(), ...stateValues };
    const visibleSteps = runIndex < 0 ? [] : definition.runOrder.slice(0, runIndex + 1);
    visibleSteps.forEach((itemId, index) => applyStep(definition, state, itemId, index));
    return state;
  }

  createRunRecord(definition: WorkflowDefinition, stateValues: Record<string, unknown>, runNumber: number, assignmentContext?: WorkflowAssignmentContext): WorkflowRunRecord {
    const nodes = definition.runOrder.reduce<WorkflowRunNodeRecord[]>((records, itemId, index) => {
      const node = definition.nodes.find((item) => item.id === itemId);
      if (!node) return records;
      const snapshot = createStepSnapshot(definition, itemId, index);
      const input = { ...nodeInput(node), ...Object.fromEntries(node.reads.map((field) => [field, stateValues[field] ?? snapshot[field] ?? mockFieldValue(field, node)])) };
      records.push({ id: node.id, label: node.label, input, output: nodeOutput(node, input) });
      return records;
    }, []);
    const finalState = this.createStateSnapshot(definition, stateValues, definition.runOrder.length - 1);
    return {
      id: `${definition.id}-${Date.now()}-${runNumber}`,
      workflowId: definition.id,
      workflowTemplateId: definition.id,
      courseId: assignmentContext?.courseId,
      assignmentId: assignmentContext?.assignmentId,
      workflowName: definition.name,
      createdAt: new Date().toISOString(),
      status: "success",
      nodeCount: nodes.length,
      outputSummary: String(finalState.final_answer || definition.result || "运行完成"),
      finalState,
      nodes
    };
  }

  scheduleNextStep(advance: () => void) {
    const timer = globalThis.setTimeout(advance, this.stepDelayMs);
    return () => globalThis.clearTimeout(timer);
  }
}
