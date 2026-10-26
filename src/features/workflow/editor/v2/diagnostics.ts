import type { JsonSchema, JsonValue, WorkflowDiagnostic, WorkflowDefinitionV2, WorkflowRunV2, WorkflowStepV2 } from "../../domain/v2/types";
const explanations: Record<string, [string,string]> = {
  INVALID_RUN_INPUT: ["外部调用数据不符合要求", "请补齐标记的必填字段，并检查输入格式。"],
  INVALID_OUTLETS: ["节点出口尚未连接完整", "为每个出口选择一个下游节点；同一出口只连接一次。"],
  UNREACHABLE_NODE: ["节点没有接入流程", "请将这个节点连接到入口可到达的路径，或删除不需要的节点。"],
  MISSING_END: ["流程缺少可到达的结束节点", "连接一条从入口到结束的路径。"],
  UNKNOWN_BINDING_FIELD: ["读取的字段不存在", "检查输入或共享状态中的字段，再重新选择绑定。"],
  INVALID_STATE_WRITE: ["结果写入位置未配置正确", "检查共享状态字段和节点输出位置。"],
  DANGLING_NODE: ["连线目标已不存在", "重新选择这条线的来源或目标节点。"],
  INVALID_CONFIG: ["节点配置尚未完成", "检查提供方、模型和该节点必需的参数。"],
  TOOL_FORBIDDEN: ["此节点没有工具权限", "分别检查模型节点和执行工具节点的工具授权。"],
  TOOL_CONTRACT_CHANGED: ["工具配置已更新", "重新读取工具目录并确认契约后再运行。"],
  UNSUPPORTED_SCHEMA: ["当前不支持此结构", "请检查该区域的结构声明；高级 JSON 也不能绕过执行限制。"],
  UNSUPPORTED_SCHEMA_KEYWORD: ["结构使用了暂不支持的规则", "请在对应结构中移除或替换不受支持的规则；高级 JSON 不能绕过限制。"],
  UNSUPPORTED_SCHEMA_REFERENCE: ["结构引用不可用", "仅支持当前结构内非递归的 $defs 引用；远程或递归引用不能执行。"],
  INVALID_SCHEMA: ["结构声明不符合要求", "检查对应结构的类型、字段和引用声明。"],
  INVALID_STATE: ["共享状态初值不符合结构", "检查共享状态初值的类型、必填字段和范围。"],
  INVALID_INITIAL_STATE: ["共享状态初值不符合结构", "检查共享状态初值的类型、必填字段和范围。"],
  INVALID_REDUCER: ["状态合并规则不可用", "为该共享状态字段选择可用的合并规则及版本。"],
  INVALID_BINDING: ["读取位置不符合要求", "重新选择固定值、外部调用数据或共享状态，以及对应字段。"],
  INVALID_NODE_INPUT: ["节点输入不符合要求", "检查该节点的输入绑定及字段类型。"],
  BINDING_TYPE_MISMATCH: ["读取字段的类型不兼容", "这里读取整个输入项，不会自动包装单个字段。请选择类型相符的对象或字段，也可用固定值表单填写。"],
  INVALID_NODE_INPUT_BINDINGS: ["节点输入尚未配置完整", "为节点的必需输入选择对应字段或固定值。"],
  INVALID_PREDICATE: ["分支条件不符合要求", "检查分支读取字段、比较方式和比较值的类型。"],
  INVALID_ROUTER: ["分支配置不完整", "检查分支条件、稳定出口以及默认出口。"],
  INVALID_POLICY: ["运行限制不符合要求", "检查步数、超时和调用上限，使用允许范围内的值。"],
  TOOL_UNAVAILABLE: ["工具在当前环境不可用", "切换到已授权环境，或显式重新选择可用工具。"],
  UNKNOWN_OPERATION: ["数据转换操作不可用", "显式选择当前注册表支持的转换操作及版本。"],
  UNKNOWN_NODE_TYPE: ["节点类型或版本不可用", "替换为当前注册表支持的节点类型及版本。"],
};
const pointerTokens = (pointer = "") => pointer.split("/").slice(1).map(token => token.replace(/~1/g, "/").replace(/~0/g, "~"));
const objectSchema = (value: JsonValue | undefined): JsonSchema => value && typeof value === "object" && !Array.isArray(value) ? value : {};
function fieldSchema(root: JsonSchema, path: string[]) {
  let current = root;
  const resolve = (node: JsonSchema) => {
    const seen = new Set<string>();
    while (typeof node.$ref === "string" && node.$ref.startsWith("#/$defs/") && !seen.has(node.$ref)) {
      seen.add(node.$ref);
      const value = pointerTokens(node.$ref.slice(1)).reduce<JsonValue | undefined>((value, key) => value && typeof value === "object" && !Array.isArray(value) ? value[key] : undefined, root);
      node = { ...objectSchema(value), ...Object.fromEntries(Object.entries(node).filter(([key]) => key !== "$ref")) };
    }
    return node;
  };
  for (const token of path) { current = resolve(current); current = objectSchema(current.type === "array" ? current.items : objectSchema(current.properties)[token]); }
  return resolve(current);
}
const typeNames: Record<string, string> = { string: "文本", number: "数字", integer: "整数", boolean: "是或否", object: "对象", array: "列表", null: "空值 null" };
export function diagnosticText(item: WorkflowDiagnostic, definition: WorkflowDefinitionV2) {
  const pair = explanations[item.code]; const node = definition.nodes.find(node => node.id === item.nodeId);
  const tokens = pointerTokens(item.pointer);
  const input = item.scope === "input";
  const state = !input && tokens[0] === "state";
  const output = !input && ["outputSchema", "outputBindings"].includes(tokens[0]);
  let location = node?.label ?? (input ? "外部调用数据" : state ? "共享状态" : output ? "输出结构" : tokens[0] === "inputSchema" ? "输入结构" : item.scope === "environment" ? "环境变量" : "工作流配置");
  if (node && tokens[0] === "nodes" && tokens[2] === "inputs" && tokens[3]) location += ` · ${tokens[3] === "arguments" ? "工具参数" : tokens[3]}`;
  const valuePath = input ? tokens : state && tokens[1] === "initial" ? tokens.slice(2) : undefined;
  const expected = valuePath ? fieldSchema(input ? definition.inputSchema : definition.state.schema, valuePath) : undefined;
  if (valuePath?.length) location += ` · ${typeof expected?.title === "string" ? expected.title : valuePath.join(" / ")}`;
  const types = expected ? (Array.isArray(expected.type) ? expected.type : [expected.type]).filter((type): type is string => typeof type === "string").map(type => typeNames[type] ?? type) : [];
  if(input&&item.code==='INVALID_RUN_INPUT') {
    const field=typeof expected?.title==='string'?expected.title:valuePath?.join(' / ')||'调用参数';
    const requirement=expected?.type==='string'&&typeof expected.minLength==='number'&&expected.minLength>0?'非空文本':types.join('或')||'声明的格式';
    return {location,title:`“${field}”需要${requirement}`,advice:`请打开“图设置 → 高级调用数据（API / 调试）”，将“${field}”填写或修正为${requirement}，再运行。${expected?.description?String(expected.description):''}`};
  }
  const advice = types.length ? `此字段要求${types.join("或")}。${pair?.[1] ?? "请按声明的类型和范围填写。"}` : pair?.[1] ?? "点击定位到相关区域；详细信息可用于进一步排查。";
  return { title: pair?.[0] ?? "有配置需要检查", advice, location };
}

// Input resolution can fail before a Step exists. Use only actual server context
// and the immutable run definition; never manufacture a Step or infer current IDs.
export function runFailureTarget(run: WorkflowRunV2, steps: WorkflowStepV2[], definition?: WorkflowDefinitionV2) {
  if (run.status !== "failed" || !definition) return undefined;
  const error = run.error;
  const step = [...steps].reverse().find(item => item.runId === run.runId && item.status === "failed");
  const context = error?.stage === "input_resolution" && error.nodeId && Number.isInteger(error.invocation) && error.invocation! > 0
    ? { nodeId: error.nodeId, invocation: error.invocation!, beforeExecution: true, pointer: error.pointer }
    : step ? { nodeId: step.nodeId, invocation: step.invocation, beforeExecution: false, pointer: undefined } : undefined;
  const node = definition.nodes.find(node => node.id === context?.nodeId);
  return context && node ? { ...context, label: node.label } : undefined;
}

// Compiler pointers address Definition V2; they are distinct from this run's input pointers.
export function diagnosticTarget(item: WorkflowDiagnostic, definition: WorkflowDefinitionV2) {
  const tokens = (item.pointer ?? "").split("/").slice(1).map(token => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  const edge = definition.transitions.find(edge => edge.id === item.transitionId);
  const pointerNode = tokens[0] === "nodes" ? definition.nodes.find(node => node.id === tokens[1]) ?? (/^\d+$/.test(tokens[1] ?? "") ? definition.nodes[Number(tokens[1])] : undefined) : undefined;
  const node = definition.nodes.find(node => node.id === (item.nodeId ?? edge?.from)) ?? pointerNode;
  if (item.scope === "input") return { panel: "input" as const, fields: [] as string[] };
  if (node) {
    const section = tokens[0] === "nodes" ? tokens[2] : undefined;
    const name = tokens[3];
    const fields = ["INVALID_OUTLETS", "DANGLING_NODE", "DANGLING_TRANSITION"].includes(item.code) ? ["outlets"]
      : section === "inputs" ? [...(name ? [`inputs/${name}`] : []), "输入绑定"]
      : section === "writes" ? [...(name ? [`writes/${name}`] : []), "状态写入"]
      : section === "config" ? [...(name === "allowedToolRefs" ? ["工具授权"] : name === "prompt" ? ["提示词", "config/prompt"] : name ? [`config/${name}`] : []), "节点参数"]
      : item.code === "UNKNOWN_OPERATION" && node.type === "core.transform" ? ["config/operationRef", "节点参数"] : [];
    return { panel: "node" as const, nodeId: node.id, transitionId: edge?.id, fields: [...fields, "节点配置"] };
  }
  if (tokens[0] === "state" && ["initial", "reducers"].includes(tokens[1]) && Object.prototype.hasOwnProperty.call(definition.state.schema.properties ?? {}, tokens[2])) {
    return { panel: "state-field" as const, stateField: tokens[2], control: tokens[1] === "reducers" ? "reducer" as const : "initial" as const, fields: [`state/${tokens[2]}`, "流程数据", "工作流配置"] };
  }
  const globalFields: Record<string, string> = { inputSchema: "输入 Schema", outputSchema: "输出 Schema", state: "流程数据", outputBindings: "最终输出绑定", policy: "运行限制" };
  if (globalFields[tokens[0]]) return { panel: "state" as const, fields: [globalFields[tokens[0]], "工作流配置"] };
  if (item.scope === "environment") return { panel: "environment" as const, fields: [] as string[] };
  return { panel: "problems" as const, fields: ["问题摘要"] };
}
