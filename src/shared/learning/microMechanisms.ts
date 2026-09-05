import { z } from "zod";

const text = z.string().min(1).max(2000).refine((value)=>value.trim().length>0);
const finite = z.number().finite();
const mode = z.enum(["explore", "challenge"]);
const unique = (values: string[]) => new Set(values).size === values.length;
const edge = z.object({ id: text, from: text, to: text, label: text });
export const flowSchema = z.object({
  type: z.literal("flow-execution"), mode,
  nodes: z.array(z.object({ id: text, label: text, x: finite, y: finite })).min(2).max(16),
  edges: z.array(edge).min(1).max(40), initialEdgeIds: z.array(text),
  events: z.array(z.object({ nodeId: text, edgeId: text.optional(), title: text, message: text, explanation: text })).min(2).max(40),
  correctEdgeIds: z.array(text).min(1),
}).superRefine((flow, ctx) => {
  const ids = flow.nodes.map((node) => node.id), edges = flow.edges.map((item) => item.id);
  if (!unique(ids) || !unique(edges) || !unique(flow.initialEdgeIds) || !unique(flow.correctEdgeIds) || flow.edges.some((item) => !ids.includes(item.from) || !ids.includes(item.to)) || [...flow.initialEdgeIds, ...flow.correctEdgeIds].some((id) => !edges.includes(id))) ctx.addIssue({ code: "custom", message: "Flow identities and connections must be valid and unique." });
  flow.events.forEach((event, index) => {
    const link = flow.edges.find((item) => item.id === event.edgeId);
    if (!ids.includes(event.nodeId) || (index === 0 ? Boolean(event.edgeId) : !link || link.from !== flow.events[index - 1].nodeId || link.to !== event.nodeId || !flow.correctEdgeIds.includes(link.id))) ctx.addIssue({ code: "custom", message: "Execution events must follow actual directed connections." });
  });
});
export const simulationSchema = z.object({
  type: z.literal("simulation"), mode,
  parameter: z.object({ label: text, min: finite.nonnegative(), max: finite.positive(), step: finite.positive(), initial: finite }),
  model: z.object({ kind: z.literal("quadratic-descent"), curvature: finite.positive().max(100), optimum: finite.min(-100).max(100), initial: finite.min(-100).max(100), steps: z.number().int().min(2).max(60) }),
  target: z.object({ maxLoss: finite.positive(), maxGrowth: finite.min(1) }),
}).superRefine((simulation, ctx) => {
  const { min, max, initial } = simulation.parameter;
  if (Math.log(Math.max(1, Math.abs(1 - max * simulation.model.curvature))) * simulation.model.steps > 300 || min >= max || initial < min || initial > max || max > 10 || simulation.model.initial === simulation.model.optimum) ctx.addIssue({ code: "custom", message: "Simulation requires a bounded parameter range and a nontrivial initial state." });
});
export const transformationSchema = z.object({
  type: z.literal("data-transform"), mode,
  corpus: z.array(z.array(text).min(2).max(20)).min(1).max(8),
  vocabulary: z.array(text).min(2).max(8), window: z.number().int().min(1).max(3),
}).superRefine((data, ctx) => {
  if (!unique(data.vocabulary) || data.corpus.flat().some((token) => !data.vocabulary.includes(token))) ctx.addIssue({ code: "custom", message: "Every token needs a unique vocabulary identity." });
});
export const mechanismSchema = z.union([flowSchema, simulationSchema, transformationSchema]);
export type FlowDefinition = z.infer<typeof flowSchema>;
export type SimulationDefinition = z.infer<typeof simulationSchema>;
export type TransformationDefinition = z.infer<typeof transformationSchema>;
export type MicroMechanism = z.infer<typeof mechanismSchema>;
export type MechanismAnswer = { kind: "flow"; edgeIds: string[]; executed: number } | { kind: "simulation"; parameter: number; executed: number } | { kind: "transformation"; cells: number[]; executed: number };
export const mechanismAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("flow"), edgeIds: z.array(text).max(40), executed: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("simulation"), parameter: finite, executed: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("transformation"), cells: z.array(z.number().int().nonnegative()).max(64), executed: z.number().int().nonnegative() }),
]);

export function simulationTrajectory(definition: SimulationDefinition, parameter: number) {
  const { curvature, optimum, initial, steps } = definition.model;
  const trajectory: Array<{index:number;value:number;gradient:number;loss:number;delta:number}> = []; let value = initial;
  for (let index = 0; index <= steps; index += 1) {
    const gradient = curvature * (value - optimum), loss = curvature * (value - optimum) ** 2 / 2;
    trajectory.push({ index, value, gradient, loss, delta: -parameter * gradient });
    value -= parameter * gradient;
  }
  const first = trajectory[0].loss, last = trajectory[trajectory.length - 1].loss;
  const oscillating = trajectory.some((point, index) => index > 0 && (point.value - optimum) * (trajectory[index - 1].value - optimum) < 0);
  const behavior: "diverging"|"oscillating"|"slow"|"converged" = last > first * 1.01 ? "diverging" : last > definition.target.maxLoss ? (oscillating ? "oscillating" : "slow") : "converged";
  return { trajectory, behavior, oscillating, maxLoss: Math.max(...trajectory.map((point) => point.loss)), finalLoss: last };
}

export function transformationEvents(definition: TransformationDefinition) {
  return definition.corpus.flatMap((sentence, sentenceIndex) => sentence.flatMap((center, index) => sentence.flatMap((context, contextIndex) => index !== contextIndex && Math.abs(index - contextIndex) <= definition.window ? [{ sentenceIndex, index, contextIndex, center, context, cell: definition.vocabulary.indexOf(center) * definition.vocabulary.length + definition.vocabulary.indexOf(context) }] : [])));
}
export function transformationCells(definition: TransformationDefinition, count: number) {
  const cells = Array<number>(definition.vocabulary.length ** 2).fill(0);
  for (const event of transformationEvents(definition).slice(0, count)) cells[event.cell] += 1;
  return cells;
}
export function flowAdvance(definition: FlowDefinition, edgeIds: string[], executed: number) {
  const event = definition.events[executed];
  if (!event) return { executed, error: null };
  if (event.edgeId && !edgeIds.includes(event.edgeId)) {
    const edge = definition.edges.find((item) => item.id === event.edgeId)!;
    return { executed, error: `执行停在缺失的 ${edge.label}：${event.explanation}` };
  }
  return { executed: executed + 1, error: null };
}

export function mechanismFeedback(definition: MicroMechanism, input: unknown): { correct: boolean; message: string } {
  const parsed = mechanismAnswerSchema.safeParse(input);
  if (!parsed.success) return { correct: false, message: "请先操作机制并执行观察。" };
  const answer = parsed.data;
  if (definition.type === "flow-execution" && answer.kind === "flow") {
    if (!unique(answer.edgeIds) || answer.edgeIds.some((id) => !definition.edges.some((edge) => edge.id === id))) return { correct: false, message: "连接必须来自当前流程中的有效节点。" };
    const extra = definition.edges.find((edge) => answer.edgeIds.includes(edge.id) && !definition.correctEdgeIds.includes(edge.id));
    if (extra && definition.mode === "challenge") return { correct: false, message: `检查「${extra.label}」：它跳过了当前示例要求的数据回传。断开它，再按刚才观察到的过程连接。` };
    if (definition.mode === "challenge" && definition.correctEdgeIds.some((id) => !answer.edgeIds.includes(id))) return { correct: false, message: "还有必要的数据连接缺失；按完整执行过程补齐，再运行。" };
    for (let index = 0; index < definition.events.length; index += 1) { const next = flowAdvance(definition, answer.edgeIds, index); if (next.error) return { correct: false, message: next.error }; }
    return answer.executed === definition.events.length ? { correct: true, message: definition.events[definition.events.length - 1].explanation } : { correct: false, message: "连接后请执行完整流程，观察每次消息和状态变化。" };
  }
  if (definition.type === "simulation" && answer.kind === "simulation") {
    if (answer.parameter < definition.parameter.min || answer.parameter > definition.parameter.max || answer.executed !== definition.model.steps + 1) return { correct: false, message: "请在范围内调整参数，并执行到最后一次更新后再比较结果。" };
    const result = simulationTrajectory(definition, answer.parameter);
    const messages = { slow: "更新幅度太小：每一步只消除少量误差，给定次数后仍未达到目标。适度增加步长，再比较轨迹。", oscillating: "参数反复跨过最小值：更新幅度超过当前误差。减小步长，观察摆动是否衰减。", diverging: "更新幅度过大：跨过最小值后误差反而放大，Loss 越来越高。减小步长，重新执行。", converged: "Loss 达到目标；更新幅度随梯度减小，参数趋近最小值。" };
    const correct = definition.mode === "explore" || (result.finalLoss <= definition.target.maxLoss && result.maxLoss <= result.trajectory[0].loss * definition.target.maxGrowth);
    return { correct, message: messages[result.behavior] };
  }
  if (definition.type === "data-transform" && answer.kind === "transformation") {
    const events = transformationEvents(definition), expected = transformationCells(definition, events.length);
    const correct = answer.executed === events.length && answer.cells.length === expected.length && answer.cells.every((value, index) => value === expected[index]);
    return { correct, message: correct ? "每个数字都来自同一句中窗口内的一次中心词→上下文词事件；行向量记录了这个词的邻居分布。" : "按中心词定位行、上下文词定位列。每个窗口事件只计数一次，不能跨句或凭印象补数。" };
  }
  return { correct: false, message: "操作结果与当前机制不匹配，请重置后重试。" };
}

export type TimelineState = { cursor: number; playing: boolean };
export type TimelineAction = { type: "step"; length: number } | { type: "play"; length: number } | { type: "pause" } | { type: "reset" };
export function timelineReducer(state: TimelineState, action: TimelineAction): TimelineState {
  if (action.type === "reset") return { cursor: 0, playing: false };
  if (action.type === "pause") return { ...state, playing: false };
  if (action.type === "play") return { ...state, playing: state.cursor < action.length };
  const cursor = Math.min(state.cursor + 1, action.length);
  return { cursor, playing: state.playing && cursor < action.length };
}

/** One cancellable scheduler shared by every teaching timeline; no per-reference timers. */
export function scheduleTimelineTick(state: TimelineState, disabled: boolean, step: () => void, delay = 1100) {
  if (!state.playing || disabled) return () => {};
  const timer = setTimeout(step, delay);
  return () => clearTimeout(timer);
}
