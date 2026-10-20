import { graphAtPath, graphInNode, interactionResponseIssue, nodeAuthoring } from "../../domain/v2/authoring";
import { validateSchemaValue } from "../../domain/v2/validation";
import type { Binding, Predicate, JsonValue, WorkflowDefinitionV2, WorkflowDocumentV2, WorkflowStepV2, WorkflowEventV2 } from "../../domain/v2/types";

// A frontend event tape, not a LangGraph executor. It never evaluates node code,
// invokes providers/tools, reads credentials, persists Runs or creates evidence.
export type PreviewTask = { id: string; nodeId: string; path: string[]; invocation: number; parallelGroup?: string; itemKey?: string; item?: JsonValue; after?: boolean };
export type PreviewStep = WorkflowStepV2 & { path: string[]; taskId: string; beforeState: Record<string,JsonValue>; checkpointCursor?:number; checkpoint: Record<string, JsonValue>; checkpointStates: Record<string, Record<string, JsonValue>>; parallelGroup?: string };
export type FrontendPreview = { id: string; mode: "preview"; snapshot: WorkflowDocumentV2; tasks: PreviewTask[]; cursor: number; steps: PreviewStep[]; states: Record<string, Record<string, JsonValue>>; inputs: Record<string, JsonValue>; status: "running" | "waiting" | "success" | "failed" | "cancelled"; scenario: "normal" | "retry" | "failure"; failureInjected: boolean; events:WorkflowEventV2[]; stream?:{stepId:string;output:JsonValue;chunks:string[];next:number}; parent?: { id: string; checkpoint: string }; error?: string };
export const previewScope = (path: string[]) => JSON.stringify(path);
export function planPreview(graph: WorkflowDefinitionV2, path: string[] = [], counter = { value: 0 }): PreviewTask[] {
  const reachable: string[] = []; const activeEdges: typeof graph.transitions = [];
  const pending = [graph.entryNodeId];
  while (pending.length && reachable.length < 100) {
    const id = pending.shift()!; if (reachable.includes(id)) continue;
    const node = graph.nodes.find(node => node.id === id); if (!node) continue;
    reachable.push(id);
    const edges = graph.transitions.filter(edge => edge.from === id);
    const choice = nodeAuthoring(node).previewBranch;
    const selected = node.type === "core.router" ? [edges.find(edge => edge.outlet === choice) ?? edges[0]].filter(Boolean) : edges;
    activeEdges.push(...selected); pending.push(...selected.map(edge => edge.to));
  }
  const done = new Set<string>(); const tasks: PreviewTask[] = [];
  while (done.size < reachable.length && counter.value < 100) {
    const remaining = reachable.filter(id => !done.has(id));
    const ready = remaining.filter(id => {
      const node = graph.nodes.find(node => node.id === id)!;
      const waits = node.type === "control.join" && Array.isArray(node.config.waitFor) ? node.config.waitFor : [];
      const parents=[...activeEdges.filter(edge => edge.to === id).map(edge => edge.from), ...waits.filter((id): id is string => typeof id === "string" && reachable.includes(id))];
      return node.type==="control.join"&&node.config.strategy==="any"?parents.some(parent=>done.has(parent)):parents.every(parent=>done.has(parent));
    });
    // Cycles are traversed once in this visual tape, never executed as real conditions.
    const id = ready.find(id=>graph.nodes.some(node=>node.id===id&&node.type==="control.join"&&node.config.strategy==="any")) ?? ready[0] ?? remaining[0]; if (!id) break;
    const node = graph.nodes.find(node => node.id === id)!; done.add(id);
    const fork = activeEdges.find(edge => edge.to === id && graph.nodes.find(node=>node.id===edge.from)?.type === "control.fork");
    const task: PreviewTask = { id: `preview-task-${++counter.value}`, nodeId: id, path, invocation: 1, parallelGroup: fork ? `${previewScope(path)}:${fork.from}` : undefined };
    tasks.push(task);
    const child = graphInNode(node);
    if (child) tasks.push(...planPreview(child, [...path, node.id], counter), { ...task, id: `${task.id}-return`, after: true });
  }
  return tasks;
}

export function createFrontendPreview(snapshot: WorkflowDocumentV2, id: string, scenario: FrontendPreview["scenario"] = "normal", input:JsonValue = {}): FrontendPreview {
  const state = {...structuredClone(snapshot.definition.state.initial),...Object.fromEntries(Object.entries(snapshot.definition.state.inputBindings).map(([key,binding])=>[key,previewBinding(binding,{},input)]))};
  return { id, mode: "preview", snapshot: structuredClone(snapshot), tasks: planPreview(snapshot.definition), cursor: 0, steps: [], states: { "[]": state }, inputs: {"[]": structuredClone(input)}, status: "running", scenario, failureInjected: false, events:[] };
}
export function previewNode(session: FrontendPreview) { const task = session.tasks[session.cursor]; return task ? graphAtPath(session.snapshot.definition, task.path).nodes.find(node => node.id === task.nodeId) : undefined; }
export function advancePreview(current: FrontendPreview): FrontendPreview {
  if (current.status !== "running") return current;
  const session = structuredClone(current); if(session.steps.length>=100)return {...session,status:"failed",error:"已达到前端演示的 100 步上限；未执行真实请求。"}; const task = session.tasks[session.cursor];
  if (!task) return { ...session, status: "success" };
  const graph = graphAtPath(session.snapshot.definition, task.path); const node = graph.nodes.find(node => node.id === task.nodeId)!;
  const scope = previewScope(task.path); const state = session.states[scope] ?? structuredClone(graph.state.initial);
  session.states[scope] = state;
  const settings = nodeAuthoring(node); const now = new Date().toISOString();
  if(session.stream){
    const stream=session.stream; const step=session.steps.find(step=>step.stepId===stream.stepId)!;
    session.events=[...(session.events??[]),{protocolVersion:"1",eventId:`${step.stepId}:delta:${stream.next}`,runId:session.id,seq:(session.events??[]).length+1,type:"node.output.delta",occurredAt:now,stepId:step.stepId,nodeId:node.id,attempt:step.attempt,payload:{text:stream.chunks[stream.next++]}}];
    if(stream.next<stream.chunks.length)return session;
    step.status="completed";step.output=stream.output;step.finishedAt=now;applyPreviewWrites(graph,node,stream.output,state);
    step.checkpoint=structuredClone(state);step.checkpointStates=structuredClone(session.states);step.checkpointCursor=++session.cursor;delete session.stream;
    if(session.cursor>=session.tasks.length)session.status="success";return session;
  }
  if(task.after){
    const step=session.steps.find(step=>step.taskId===task.id.replace(/-return$/,""));const child=graphInNode(node);
    if(!step||!child)return {...session,status:"failed",error:"子图演示跨度缺失，未执行真实请求。"};
    const childScope=previewScope([...task.path,node.id]);const childState=session.states[childScope]??child.state.initial;
    step.output=Object.fromEntries(Object.entries(child.outputBindings).map(([key,binding])=>[key,previewBinding(binding,childState,session.inputs[childScope]??{})]));
    applyPreviewWrites(graph,node,step.output,state);step.status="completed";step.finishedAt=now;step.checkpoint=structuredClone(state);step.checkpointStates=structuredClone(session.states);step.checkpointCursor=++session.cursor;
    if(session.cursor>=session.tasks.length)session.status="success";return session;
  }
  const input: Record<string, JsonValue> = task.item === undefined ? {} : { [task.itemKey ?? "item"]: task.item };
  for (const [name, binding] of Object.entries(node.inputs)) input[name] = previewBinding(binding, state, session.inputs[scope] ?? {});

  const before = session.steps.filter(step => step.taskId === task.id).length;
  const previousInvocation = session.steps.filter(step=>step.nodeId===node.id&&previewScope(step.path)===scope).reduce((value,step)=>Math.max(value,step.invocation),0);
  const step: PreviewStep = { stepId: `${session.id}:${task.id}:${before + 1}`, taskId: task.id, runId: session.id, nodeId: node.id, path: task.path, invocation: session.steps.find(step=>step.taskId===task.id)?.invocation ?? previousInvocation + 1, attempt: before + 1, status: "completed", input, output: {}, startedAt: now, finishedAt: now, beforeState:structuredClone(state), checkpoint: structuredClone(state), checkpointStates: structuredClone(session.states), parallelGroup: task.parallelGroup };
  if (settings.interrupt && !task.after) { step.status = "waiting"; delete step.finishedAt; session.status = "waiting"; session.steps.push(step); return session; }
  if (session.scenario !== "normal" && !session.failureInjected && !["core.start", "core.end"].includes(node.type) && !node.type.startsWith("control.")) {
    session.failureInjected = true; step.status = "failed"; step.error = { code: "PREVIEW_FAILURE", message: "演示事件：此节点发生错误，未调用真实服务。" };
    session.steps.push(step);
    if (session.scenario === "retry") return session;
    return { ...session, status: "failed", error: step.error.message };
  }
  step.output = settings.previewOutput ?? {};
  const streaming=node.type==="core.llm"?fixtureStreamText(settings.previewOutput??{}):"";
  if(streaming){const letters=Array.from(streaming),size=Math.max(1,Math.ceil(letters.length/6));const chunks:string[]=[];for(let index=0;index<letters.length;index+=size)chunks.push(letters.slice(index,index+size).join(""));step.status="running";delete step.finishedAt;const output=step.output;delete step.output;session.steps.push(step);session.stream={stepId:step.stepId,output,chunks,next:0};return session;}
  // Only explicit fixture returns are projected into the preview State.
  const child = graphInNode(node);
  if(!child)applyPreviewWrites(graph,node,step.output??{},state);
  if (child) {
    step.status="running";delete step.finishedAt;
    const childScope = previewScope([...task.path, node.id]); session.inputs[childScope] = input;
    session.states[childScope] = { ...structuredClone(child.state.initial), ...Object.fromEntries(Object.entries(child.state.inputBindings).map(([key, binding]) => [key, previewBinding(binding, {}, input)])) };
  }
  step.checkpoint = structuredClone(state); step.checkpointStates = structuredClone(session.states); session.steps.push(step); step.checkpointCursor=++session.cursor;
  if (node.type === "core.router") {
    const cases = (Array.isArray(node.config.cases)?node.config.cases:[]) as unknown as {id:string;priority:number;predicate:Predicate}[];
    const chosen = settings.previewBranch || [...cases].sort((a,b)=>a.priority-b.priority).find(item=>previewPredicate(item.predicate,state,session.inputs[scope]??{}))?.id || String(node.config.defaultOutlet??"default");
    const edge = graph.transitions.find(edge=>edge.from===node.id&&edge.outlet===chosen);
    if(!edge)return {...session,status:"failed",error:`演示出口 ${chosen} 尚未连接。`};
    const outside = session.tasks.slice(session.cursor).filter(item=>!task.path.every((id,index)=>item.path[index]===id));
    session.tasks = [...session.tasks.slice(0,session.cursor),...planPreview({...graph,entryNodeId:edge.to},task.path,{value:session.tasks.length+session.steps.length}),...outside];
  }
  if (node.type === "control.send") {
    const items = state[String(node.config.items ?? "/items").slice(1)]; const target = String(node.config.target ?? "");
    if (Array.isArray(items) && graph.nodes.some(node => node.id === target)) {
      const dynamic = items.slice(0, 20).map((item, index) => ({ id: `${task.id}:send:${index}`, nodeId: target, path: task.path, invocation: index + 1, parallelGroup: task.id, itemKey: String(node.config.itemKey ?? "item"), item }));
      session.tasks.splice(session.cursor, 0, ...dynamic);
    }
  }
  if (session.cursor >= session.tasks.length) session.status = "success";
  return session;
}
export function respondPreview(current: FrontendPreview, response: Record<string, JsonValue>): FrontendPreview {
  if (current.status !== "waiting") return current;
  const session = structuredClone(current); const task = session.tasks[session.cursor]; const node = previewNode(session); const interaction = node && nodeAuthoring(node).interrupt;
  if (!interaction || !validateSchemaValue(interaction.schema, response).valid || interactionResponseIssue(interaction.schema,response)) return current;
  const state = session.states[previewScope(task.path)];
  for (const [name, field] of Object.entries(interaction.resumeWrites)) if (field && response[name] !== undefined) state[field] = response[name];
  const step = session.steps[session.steps.length - 1]; step.status = "completed"; step.output = {...(nodeAuthoring(node!).previewOutput??{}),...response};
  applyPreviewWrites(graphAtPath(session.snapshot.definition,task.path),node!,step.output,state);
  const child=graphInNode(node!);if(child){step.status="running";const scope=previewScope([...task.path,node!.id]);const childInput=Object.fromEntries(Object.entries(node!.inputs).map(([key,binding])=>[key,previewBinding(binding,state,session.inputs[previewScope(task.path)]??{})]));session.inputs[scope]=childInput;session.states[scope]={...structuredClone(child.state.initial),...Object.fromEntries(Object.entries(child.state.inputBindings).map(([key,binding])=>[key,previewBinding(binding,{},childInput)]))};}else step.finishedAt = new Date().toISOString();
  step.checkpoint = structuredClone(state); step.checkpointStates = structuredClone(session.states);
  step.checkpointCursor=++session.cursor; session.status = session.cursor >= session.tasks.length ? "success" : "running";
  return session;
}
export function forkPreview(source: FrontendPreview, stepId: string, id: string): FrontendPreview {
  const step = source.steps.find(step => step.stepId === stepId); if (!step) throw new Error("检查点不存在");
  const index = source.tasks.findIndex(task => task.id === step.taskId);
  return { ...structuredClone(source), id, parent: { id: source.id, checkpoint: stepId }, steps: [], states: structuredClone(step.checkpointStates), events:[], stream:undefined, cursor: step.checkpointCursor??index + 1, status: "running", failureInjected: true };
}

function previewBinding(binding: Binding, state: Record<string, JsonValue>, input: JsonValue): JsonValue {
  if (binding.source === "literal") return binding.value;
  let value: JsonValue | undefined = binding.source === "state" ? state : binding.source === "input" ? input : undefined;
  for (const token of binding.pointer.split("/").slice(1)) value = value && typeof value === "object" ? (value as Record<string, JsonValue>)[token.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined;
  return value ?? (binding.onMissing.mode === "default" ? binding.onMissing.value : null);
}
/** Project explicit preview State changes into the same presentation event contract as live Runs. */
export function frontendPreviewEvents(session: FrontendPreview) {
  const states:WorkflowEventV2[]=session.steps.filter(step => step.status === "completed").map((step, index) => {
    const scope = previewScope(step.path);
    const at = session.steps.indexOf(step);
    const previous = session.steps.slice(0, at).reverse().find(item => previewScope(item.path) === scope && item.status === "completed");
    const before = step.beforeState ?? previous?.checkpoint ?? graphAtPath(session.snapshot.definition, step.path).state.initial;
    const changes = Object.keys(step.checkpoint).filter(field => JSON.stringify(before[field]) !== JSON.stringify(step.checkpoint[field])).map(field => ({ field, before: before[field] ?? null, after: step.checkpoint[field] }));
    return { protocolVersion: "1" as const, eventId: `${step.stepId}:state`, runId: session.id, seq: index + 1, type: "state.updated", occurredAt: step.finishedAt ?? step.startedAt!, stepId: step.stepId, nodeId: step.nodeId, attempt: step.attempt, payload: { changes } };
  });
  return [...(session.events??[]),...states].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)).map((event,index)=>({...event,seq:index+1}));
}

function applyPreviewWrites(graph: WorkflowDefinitionV2, node: import("../../domain/v2/types").WorkflowNodeV2, output: JsonValue, state: Record<string, JsonValue>) {
  for(const [field,pointer] of Object.entries(node.writes)) {
    let value:JsonValue|undefined=output;
    for(const token of pointer.split("/").slice(1))value=value&&typeof value==="object"?(value as Record<string,JsonValue>)[token.replace(/~1/g,"/").replace(/~0/g,"~")]:undefined;
    if(value!==undefined && ["replace","append","messages"].includes(graph.state.reducers[field]?.name??"replace"))state[field]=graph.state.reducers[field]?.name==="append"&&Array.isArray(state[field])&&Array.isArray(value)?[...state[field],...value]:value;
  }
}
function previewPredicate(predicate: Predicate, state: Record<string, JsonValue>, input: JsonValue): boolean {
  if(predicate.op==="and"||predicate.op==="or")return predicate.op==="and"?predicate.children.every(child=>previewPredicate(child,state,input)):predicate.children.some(child=>previewPredicate(child,state,input));
  if(predicate.op==="not")return !previewPredicate(predicate.child,state,input);
  if("source" in predicate){const value=previewBinding({source:predicate.source,pointer:predicate.pointer,onMissing:{mode:"default",value:null}},state,input);return predicate.op==="exists"?value!==null:value!==null&&value!==""&&(!Array.isArray(value)||value.length>0);}
  if(!("left" in predicate))return false;
  const left=previewBinding(predicate.left,state,input),right=previewBinding(predicate.right,state,input);
  if(predicate.op==="eq"||predicate.op==="ne"){const equal=JSON.stringify(left)===JSON.stringify(right);return predicate.op==="eq"?equal:!equal;}
  if(typeof left!=="number"||typeof right!=="number")return false;
  return predicate.op==="gt"?left>right:predicate.op==="gte"?left>=right:predicate.op==="lt"?left<right:left<=right;
}
export function previewActiveNodes(session: FrontendPreview, path: string[]): Set<string> {
  const task = session.tasks[session.cursor]; const result = new Set<string>();
  if(!task || !["running","waiting"].includes(session.status))return result;
  if(task.path.length>path.length && path.every((id,index)=>task.path[index]===id))result.add(task.path[path.length]);
  if(previewScope(task.path)!==previewScope(path))return result;
  result.add(task.nodeId);
  if(session.status==="running"&&task.parallelGroup)for(const item of session.tasks.slice(session.cursor)) {
    if(item.parallelGroup===task.parallelGroup&&previewScope(item.path)===previewScope(path)&&!session.steps.some(step=>step.taskId===item.id&&step.status==="completed"))result.add(item.nodeId);
  }
  return result;
}

function fixtureStreamText(output:Record<string,JsonValue>):string {
  if(typeof output.text==="string")return output.text;if(typeof output.answer==="string")return output.answer;
  const messages=Array.isArray(output.messages)?output.messages:[];const message=[...messages].reverse().find(value=>value&&typeof value==="object"&&!Array.isArray(value)&&value.role==="assistant");
  return message&&typeof message==="object"&&!Array.isArray(message)&&Array.isArray(message.content)?message.content.map(block=>block&&typeof block==="object"&&!Array.isArray(block)?String(block.text??""):"").join(""):"";
}
