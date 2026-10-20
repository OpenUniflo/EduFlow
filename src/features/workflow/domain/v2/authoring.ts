import { createWorkflowV2 } from "./factory";
import { definitionSchemaV2, jsonValueSchema, bindingSchema } from "./schema";
import { z } from "zod";
import type { EditorDocumentV2, JsonSchema, JsonValue, WorkflowDefinitionV2, WorkflowNodeV2 } from "./types";

/** Frontend authoring contracts. These are saved drafts, never an executor registry. */
export const authoringNodeTypes = [
  { type: "core.progress", label: "过程进度", group: "执行节点" },
  { type: "core.memory", label: "长期记忆", group: "执行节点" },
  { type: "core.function", label: "函数", group: "执行节点" },
  { type: "core.subgraph", label: "子图", group: "执行节点" },
  { type: "control.fork", label: "并行分支", group: "控制流" },
  { type: "control.join", label: "等待汇合", group: "控制流" },
  { type: "control.send", label: "动态分发 Send", group: "控制流" },
];
export const nodeTypeLabel = (type: string) => authoringNodeTypes.find(item => item.type === type)?.label;
export type NodeInteraction = { title: string; schema: JsonSchema; resumeWrites: Record<string, string> };
/** Non-empty required response text must contain visible content; preserve valid text verbatim. */
export function interactionResponseIssue(schema: JsonSchema, response: JsonValue): string | undefined {
  if(!response||typeof response!=="object"||Array.isArray(response))return undefined;
  const properties=(schema.properties??{}) as Record<string,JsonSchema>;
  for(const name of Array.isArray(schema.required)?schema.required:[])if(typeof name==="string"){
    const field=properties[name],value=response[name];
    if(field?.type==="string"&&Number(field.minLength??0)>0&&typeof value==="string"&&!value.trim())return `${String(field.title??name)}需要填写内容，不能只包含空格。`;
  }
  return undefined;
}
export type NodeAuthoring = { previewBranch?: string; interrupt?: NodeInteraction; retry?: { maxAttempts: number; intervalMs: number; backoffFactor?:number; maxIntervalMs?:number; retryOn?:string[] }; timeoutMs?: number; cache?: { ttlMs: number }; errorHandler?: { functionRef: string; functionVersion?:number }; overwrite?:string[]; defer?:boolean; command?: { enabled: boolean; destinations: string[]; graph?:"current"|"parent"; update?:Record<string, import("./types").Binding> }; previewOutput?: Record<string, JsonValue> };
const nodeAuthoringSchema = z.object({ previewBranch:z.string().optional(), previewOutput:z.record(z.string(),jsonValueSchema).optional(), interrupt:z.object({title:z.string(),schema:z.record(z.string(),jsonValueSchema),resumeWrites:z.record(z.string(),z.string())}), retry:z.object({maxAttempts:z.number().int().min(1).max(10),intervalMs:z.number().nonnegative(),backoffFactor:z.number().min(1).optional(),maxIntervalMs:z.number().nonnegative().optional(),retryOn:z.array(z.string()).optional()}).optional(), timeoutMs:z.number().positive().optional(),cache:z.object({ttlMs:z.number().positive()}).optional(),overwrite:z.array(z.string()).optional(),errorHandler:z.object({functionRef:z.string(),functionVersion:z.number().int().positive().optional()}).optional(),defer:z.boolean().optional(),command:z.object({enabled:z.boolean(),destinations:z.array(z.string()),graph:z.enum(["current","parent"]).optional(),update:z.record(z.string(),bindingSchema).optional()}).optional() }).partial().passthrough();
export function nodeAuthoring(node: WorkflowNodeV2): NodeAuthoring { const result=nodeAuthoringSchema.safeParse(node.config.authoring??{});return result.success?result.data as NodeAuthoring:{}; }
export function graphInNode(node: WorkflowNodeV2): WorkflowDefinitionV2 | undefined {
  if (node.type !== "core.subgraph") return undefined;
  const result = definitionSchemaV2.safeParse(node.config.graph);
  return result.success ? result.data as WorkflowDefinitionV2 : undefined;
}
export function graphAtPath(root: WorkflowDefinitionV2, path: string[]): WorkflowDefinitionV2 {
  let graph = root;
  for (const id of path) { const node = graph.nodes.find(node => node.id === id); const child = node && graphInNode(node); if (!child) throw new Error("子图不存在，请返回上层画布。"); graph = child; }
  return graph;
}
export function replaceGraph(root: WorkflowDefinitionV2, path: string[], next: WorkflowDefinitionV2): WorkflowDefinitionV2 {
  if (!path.length) return next;
  const [id, ...remaining] = path;
  const node = root.nodes.find(node => node.id === id); const child = node && graphInNode(node);
  if (!node || !child) return root;
  return { ...root, nodes: root.nodes.map(item => item.id === id ? { ...item, config: { ...item.config, graph: replaceGraph(child, remaining, next) as unknown as JsonValue } } : item) };
}
export const scopeKey = (path: string[]) => JSON.stringify(path);
export function editorAtPath(editor: EditorDocumentV2, path: string[], graph: WorkflowDefinitionV2): EditorDocumentV2 {
  if (!path.length) return editor;
  const saved = editor.graphs?.[scopeKey(path)];
  return { schemaVersion: 1, workflowId: editor.workflowId, definitionRevision: editor.definitionRevision, editorRevision: editor.editorRevision, nodes: saved?.nodes ?? Object.fromEntries(graph.nodes.map((node, index) => [node.id, { x: 80 + index * 260, y: 160 }])), edges: saved?.edges ?? {}, viewport: saved?.viewport };
}
export function replaceGraphEditor(editor: EditorDocumentV2, path: string[], layout: EditorDocumentV2): EditorDocumentV2 {
  if (!path.length) return layout;
  return { ...editor, graphs: { ...editor.graphs, [scopeKey(path)]: { nodes: layout.nodes, edges: layout.edges, ...(layout.viewport ? { viewport: layout.viewport } : {}) } } };
}
export function createAuthoringNode(type: string, id: string): WorkflowNodeV2 {
  const config: Record<string, JsonValue> = type === "core.progress" ? {message:"已完成当前处理阶段",percent:50} : type === "core.memory" ? {operation:"get",scope:"workflow",collection:"default",key:"value",ttlMinutes:1440} : type === "core.function" ? { implementation: "code", functionRef: "", functionVersion:1, language: "python", code: 'def process(input, context):\n    return {"value": input.get("value", 0)}'  }
    : type === "core.subgraph" ? { graph: createWorkflowV2("子图") as unknown as JsonValue }
    : type === "control.fork" ? { branches: ["branch_1", "branch_2"] }
    : type === "control.join" ? { waitFor: [], strategy: "all" }
    : { items: "/items", target: "", itemKey: "item", concurrency: 3 };
  return { id, label: nodeTypeLabel(type) ?? type, type, typeVersion: 1, config, inputs: {}, writes: {} };
}
export function nodeOutlets(node: WorkflowNodeV2): string[] {
  if (node.type === "core.end") return [];
  if (node.type === "control.send") return ["item","next"];
  if (node.type === "control.fork") return Array.isArray(node.config.branches) ? node.config.branches.filter((item): item is string => typeof item === "string") : [];
  if (node.type !== "core.router") return ["next"];
  const cases = node.config.cases as { id: string }[] | undefined;
  return [...(Array.isArray(cases) ? cases.filter(item => item && typeof item.id === "string").map(item => item.id) : []), String(node.config.defaultOutlet ?? "default")];
}
export function frontendCapabilities(graph: WorkflowDefinitionV2, supported: string[] = []): string[] {
  const features = new Set<string>();
  if(graph.policy.authoring&&!supported.includes("checkpoint"))features.add("图中断等待与持久化策略");
  if(graph.policy.maxAttempts>1)features.add("图重试策略");
  if(!supported.includes("custom-reducer")&&Object.values(graph.state.reducers).some(reducer=>!["replace","append","messages"].includes(reducer.name)))features.add("自定义 Reducer");
  for (const node of graph.nodes) {
    if(node.config.authoring!==undefined&&!nodeAuthoringSchema.safeParse(node.config.authoring).success)features.add("运行行为配置待修正");
    const label = nodeTypeLabel(node.type); const capability:Record<string,string>={"core.progress":"runtime-context","core.memory":"store","core.function":"function","core.subgraph":"subgraph","control.fork":"parallel","control.join":"join","control.send":"send"}; if (label&&!supported.includes(capability[node.type])) features.add(label);
    const settings = nodeAuthoring(node);
    if (settings.interrupt&&!supported.includes("interrupt")) features.add("节点中断与恢复");
    if ((settings.retry || settings.timeoutMs)&&!supported.includes("node-retry")) features.add("节点执行策略");
    if(settings.cache&&!supported.includes("node-cache"))features.add("节点缓存");
    if(settings.errorHandler&&!supported.includes("node-error-handler"))features.add("节点错误处理");
    if (settings.command?.enabled&&!supported.includes("command")) features.add("Command 状态与路由");
    if (settings.previewOutput || settings.previewBranch) features.add("节点预览数据");
    const child = graphInNode(node); if (child) frontendCapabilities(child,supported).forEach(feature => features.add(feature));
  }
  return [...features];
}
export function authoringDiagnostics(graph: WorkflowDefinitionV2, prefix = "主流程"): string[] {
  const issues: string[] = []; const ids = new Set(graph.nodes.map(node => node.id));
  const inputFields=graph.inputSchema.properties??{},outputFields=graph.outputSchema.properties??{};
  const missingInput=(binding:import("./types").Binding)=>binding.source==="input"&&binding.pointer&&graph.inputSchema.additionalProperties===false&&!Object.prototype.hasOwnProperty.call(inputFields,binding.pointer.split("/")[1].replace(/~1/g,"/").replace(/~0/g,"~"));
  for(const [field,binding] of Object.entries(graph.state.inputBindings))if(missingInput(binding))issues.push(`${prefix}：State ${field} 的初始化引用了已删除的图输入字段`);
  for(const field of Object.keys(graph.outputBindings))if(graph.outputSchema.additionalProperties===false&&!Object.prototype.hasOwnProperty.call(outputFields,field))issues.push(`${prefix}：图输出映射 ${field} 未在输出接口中声明`);
  for(const field of graph.outputSchema.required as string[]??[])if(!graph.outputBindings[field])issues.push(`${prefix}：必需的图输出 ${field} 尚未配置 State 映射`);
  if (!ids.has(graph.entryNodeId)) issues.push(`${prefix}：缺少开始标记`);
  if (!graph.nodes.some(node => node.type === "core.end")) issues.push(`${prefix}：缺少结束标记`);
  for (const edge of graph.transitions) {
    const source = graph.nodes.find(node => node.id === edge.from);
    if (!source || !ids.has(edge.to) || !nodeOutlets(source).includes(edge.outlet)) issues.push(`${prefix}：连线 ${edge.id} 的端点或出口无效`);
  }
  for (const node of graph.nodes) {
    if(node.config.authoring!==undefined&&!nodeAuthoringSchema.safeParse(node.config.authoring).success)issues.push(`${prefix} / ${node.label}：运行行为配置格式无效，请检查高级处理参数`);
    const settings=nodeAuthoring(node);
    if(settings.errorHandler&&!settings.errorHandler.functionRef.trim())issues.push(`${prefix} / ${node.label}：请填写错误处理函数标识`);
    if(settings.command?.graph!=="parent"&&settings.command?.destinations.some(id=>!ids.has(id)))issues.push(`${prefix} / ${node.label}：Command 引用了不存在的目标节点`);
    for(const [name,binding] of Object.entries(node.inputs))if(missingInput(binding))issues.push(`${prefix} / ${node.label}：读取项 ${name} 引用了已删除的图输入字段`);
    if (node.type !== "core.end" && !graph.transitions.some(edge => edge.from === node.id) && node.type !== "control.send") issues.push(`${prefix} / ${node.label}：尚未连接后继`);
    const properties = graph.state.schema.properties ?? {};
    for (const field of Object.keys(node.writes)) if (!Object.prototype.hasOwnProperty.call(properties, field)) issues.push(`${prefix} / ${node.label}：写入目标 ${field} 未在 State 中声明`);
    for (const [name,binding] of Object.entries(node.inputs)) if (binding.source === "state" && binding.pointer) {
      const field = binding.pointer.split("/")[1].replace(/~1/g,"/").replace(/~0/g,"~");
      if (!Object.prototype.hasOwnProperty.call(properties, field)) issues.push(`${prefix} / ${node.label}：读取项 ${name} 引用了未声明的 State 字段 ${field}`);
    }
    const interaction = nodeAuthoring(node).interrupt;
    if (interaction) for (const field of Object.keys(interaction.schema.properties ?? {})) {
      const target = interaction.resumeWrites[field];
      if (!target || !Object.prototype.hasOwnProperty.call(graph.state.schema.properties ?? {}, target)) issues.push(`${prefix} / ${node.label}：回应字段 ${field} 需要映射到已声明的 State 字段`);
    }
    if (node.type === "core.subgraph") { const child = graphInNode(node); if (child) issues.push(...authoringDiagnostics(child, `${prefix} / ${node.label}`)); else issues.push(`${prefix} / ${node.label}：子图定义无效`); }
    if (node.type === "control.send" && !ids.has(String(node.config.target))) issues.push(`${prefix} / ${node.label}：请选择分发目标`);
    if (node.type === "control.join" && (!Array.isArray(node.config.waitFor) || !node.config.waitFor.length)) issues.push(`${prefix} / ${node.label}：请选择等待的前驱`);
  }
  return issues;
}
export function pruneGraphLayouts(definition: WorkflowDefinitionV2, editor: EditorDocumentV2): EditorDocumentV2 {
  if (!editor.graphs) return editor;
  return { ...editor, graphs: Object.fromEntries(Object.entries(editor.graphs).filter(([key]) => {
    try { const path: unknown = JSON.parse(key); return Array.isArray(path) && path.length > 0 && Boolean(graphAtPath(definition, path)); } catch { return false; }
  })) };
}
