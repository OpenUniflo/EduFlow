import { z } from "zod";

const text = z.string().min(1).max(2000).refine((value)=>value.trim().length>0);
const finite = z.number().finite();
const teaching = z.object({
  explanation: text.optional(),
  feedback: z.record(z.string().min(1).max(80), text).optional(),
}).optional();
const mode = z.enum(["explore", "challenge"]);
const unique = (values: string[]) => new Set(values).size === values.length;
const edge = z.object({ id: text, from: text, to: text, label: text });
export const flowSchema = z.object({
  type: z.literal("flow-execution"), mode, teaching,
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
  type: z.literal("simulation"), mode, teaching,
  parameter: z.object({ label: text, min: finite.nonnegative(), max: finite.positive(), step: finite.positive(), initial: finite }),
  model: z.object({ kind: z.literal("quadratic-descent"), curvature: finite.positive().max(100), optimum: finite.min(-100).max(100), initial: finite.min(-100).max(100), steps: z.number().int().min(2).max(60) }),
  target: z.object({ maxLoss: finite.positive(), maxGrowth: finite.min(1) }),
}).superRefine((simulation, ctx) => {
  const { min, max, initial } = simulation.parameter;
  if (Math.log(Math.max(1, Math.abs(1 - max * simulation.model.curvature))) * simulation.model.steps > 300 || min >= max || initial < min || initial > max || max > 10 || simulation.model.initial === simulation.model.optimum) ctx.addIssue({ code: "custom", message: "Simulation requires a bounded parameter range and a nontrivial initial state." });
});
export const transformationSchema = z.object({
  type: z.literal("data-transform"), mode, teaching,
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
export type MechanismFeedback = { correct: boolean; reason: string; message: string; edgeId?: string; executed?: number; cell?: number; expected?: number; actual?: number; state?: ReturnType<typeof simulationTrajectory> };

/** Generic operational fallback; knowledge-specific explanations belong to the definition. */
export function mechanismMessage(definition: MicroMechanism, result: MechanismFeedback) {
  return definition.teaching?.feedback?.[result.reason] ?? result.message;
}
export function flowAdvance(definition: FlowDefinition, edgeIds: string[], executed: number) {
  const event = definition.events[executed];
  if (event?.edgeId && !edgeIds.includes(event.edgeId)) {
    return { executed, reason: "missing-required-edge", edgeId: event.edgeId, error: `缺少连接：${definition.edges.find((edge) => edge.id === event.edgeId)!.label}` };
  }
  return { executed: event ? executed + 1 : executed, reason: event ? "advanced" : "completed", error: null };
}

export function mechanismFeedback(definition: MicroMechanism, input: unknown): MechanismFeedback {
  const parsed = mechanismAnswerSchema.safeParse(input);
  if (!parsed.success) return { correct: false, reason: "not-started", message: "请先操作并执行观察。" };
  const answer = parsed.data;
  if (definition.type === "flow-execution" && answer.kind === "flow") {
    if (!unique(answer.edgeIds) || answer.edgeIds.some((id) => !definition.edges.some((edge) => edge.id === id))) return { correct: false, reason: "invalid-edge", message: "连接无效。" };
    const extra = definition.edges.find((edge) => answer.edgeIds.includes(edge.id) && !definition.correctEdgeIds.includes(edge.id));
    if (extra && definition.mode === "challenge") return { correct: false, reason: "unexpected-edge", edgeId: extra.id, message: `存在额外连接：${extra.label}` };
    const missing = definition.correctEdgeIds.find((id) => !answer.edgeIds.includes(id));
    if (definition.mode === "challenge" && missing) return { correct: false, reason: "missing-required-edge", edgeId: missing, executed: answer.executed, message: "缺少必要连接。" };
    for (let index = 0; index < definition.events.length; index += 1) {
      const next = flowAdvance(definition, answer.edgeIds, index);
      if (next.error) return { correct: false, reason: next.reason, edgeId: next.edgeId, executed: index, message: next.error };
    }
    const correct = answer.executed === definition.events.length;
    return { correct, reason: correct ? "completed" : "incomplete", executed: answer.executed, message: correct ? "执行完成。" : "请执行完整流程。" };
  }
  if (definition.type === "simulation" && answer.kind === "simulation") {
    if (answer.parameter < definition.parameter.min || answer.parameter > definition.parameter.max || answer.executed !== definition.model.steps + 1) return { correct: false, reason: "incomplete", executed: answer.executed, message: "请在参数范围内执行完整轨迹。" };
    const state = simulationTrajectory(definition, answer.parameter);
    const correct = definition.mode === "explore" || (state.finalLoss <= definition.target.maxLoss && state.maxLoss <= state.trajectory[0].loss * definition.target.maxGrowth);
    return { correct, reason: state.behavior, state, message: `状态：${state.behavior}；最终 Loss：${state.finalLoss.toPrecision(4)}` };
  }
  if (definition.type === "data-transform" && answer.kind === "transformation") {
    const events = transformationEvents(definition), expected = transformationCells(definition, events.length);
    const cell = expected.findIndex((value,index) => answer.cells[index] !== value);
    const correct = answer.executed === events.length && answer.cells.length === expected.length && cell === -1;
    return { correct, reason: correct ? "completed" : cell >= 0 ? "wrong-matrix-cell" : "incomplete", executed: answer.executed, ...(cell >= 0 ? {cell, expected: expected[cell], actual: answer.cells[cell]} : {}), message: correct ? "计数完成。" : "计数尚未符合当前事件集合。" };
  }
  return { correct: false, reason: "incompatible-answer", message: "操作结果与当前机制不匹配，请重置后重试。" };
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
