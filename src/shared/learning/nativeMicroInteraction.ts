import { mechanismSchema, mechanismFeedback, type MicroMechanism, type MechanismAnswer } from "./microMechanisms";
export type NativeMicroAnswer = string | string[] | number[] | MechanismAnswer;
export type InteractionMode = "explore" | "challenge";

export type NativeMicroInteraction = MicroMechanism
  | { type: "choice"; options: string[]; correctIndex: number }
  | { type: "multiple-choice"; options: string[]; correctIndexes: number[] }
  | { type: "fill-blank"; answers: string[]; caseSensitive?: boolean }
  | { type: "ordering"; items: string[]; correctOrder: string[] }
  | { type: "trace"; steps: Array<{ id: string; label: string }>; correctStepId: string }
  | { type: "mini-workflow"; nodes: string[]; correctOrder: string[] }
  | { type: "categorize"; items: Array<{ id: string; label: string }>; categories: string[]; correctCategories: string[] }
  | { type: "structure-builder"; mode: InteractionMode; nodes: string[]; edges: Array<{ id: string; from: string; to: string }>; correctEdgeIds?: string[] }
  | { type: "parameter-lab"; mode: InteractionMode; parameter: { label: string; min: number; max: number; step: number; initial: number }; target?: { min: number; max: number } }
  | { type: "matrix-tensor"; mode: InteractionMode; rows: number; columns: number; initialValues: number[]; targetValues?: number[] };

const unique = <T,>(items: readonly T[]) => new Set(items).size === items.length;
const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const numberArray = (value: unknown): value is number[] => Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
const exactStrings = (actual: string[], expected: string[]) => actual.length === expected.length && actual.every((item, index) => item === expected[index]);
const exactSet = (actual: string[], expected: string[]) => actual.length === expected.length && [...new Set(actual)].sort().every((item, index) => item === [...expected].sort()[index]);

export function validateNativeMicroInteraction(interaction: NativeMicroInteraction): string[] {
  try { return validateInteraction(interaction); } catch { return ["Malformed interaction definition."]; }
}
function validateInteraction(interaction: NativeMicroInteraction): string[] {
  if (interaction.type === "flow-execution" || interaction.type === "simulation" || interaction.type === "data-transform") { const result = mechanismSchema.safeParse(interaction); return result.success ? [] : result.error.issues.map((issue) => issue.message); }
  if (interaction.type === "choice") return interaction.options.length >= 2 && unique(interaction.options) && Number.isInteger(interaction.correctIndex) && interaction.correctIndex >= 0 && interaction.correctIndex < interaction.options.length ? [] : ["Choice requires unique options and a valid answer."];
  if (interaction.type === "multiple-choice") return interaction.options.length >= 2 && unique(interaction.options) && interaction.correctIndexes.length > 0 && unique(interaction.correctIndexes) && interaction.correctIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < interaction.options.length) ? [] : ["Multiple Choice requires unique options and valid answers."];
  if (interaction.type === "fill-blank") return interaction.answers.length > 0 && interaction.answers.every((answer) => answer.trim()) ? [] : ["Fill Blank requires an accepted answer."];
  if (interaction.type === "ordering") return interaction.items.length >= 2 && unique(interaction.items) && exactSet(interaction.items, interaction.correctOrder) ? [] : ["Ordering requires a complete permutation."];
  if (interaction.type === "trace") return interaction.steps.length >= 2 && unique(interaction.steps.map((step) => step.id)) && interaction.steps.some((step) => step.id === interaction.correctStepId) ? [] : ["Trace requires unique steps and a valid root cause."];
  if (interaction.type === "mini-workflow") return interaction.nodes.length >= 2 && unique(interaction.nodes) && exactSet(interaction.nodes, interaction.correctOrder) ? [] : ["Mini Workflow requires a complete node order."];
  if (interaction.type === "categorize") return interaction.items.length >= 2 && unique(interaction.items.map((item) => item.id)) && interaction.categories.length >= 2 && unique(interaction.categories) && interaction.correctCategories.length === interaction.items.length && interaction.correctCategories.every((category) => interaction.categories.includes(category)) ? [] : ["Categorize requires unique items and one valid category per item."];
  if (interaction.type === "structure-builder") {
    const nodeIds = new Set(interaction.nodes); const edgeIds = interaction.edges.map((edge) => edge.id);
    const valid = interaction.nodes.length >= 2 && unique(interaction.nodes) && unique(edgeIds) && interaction.edges.every((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to) && (interaction.mode === "explore" || Boolean(interaction.correctEdgeIds?.length && interaction.correctEdgeIds.every((id) => edgeIds.includes(id)) && unique(interaction.correctEdgeIds)));
    return valid ? [] : ["Structure Builder requires valid nodes, edges, and challenge targets."];
  }
  if (interaction.type === "parameter-lab") {
    const { min, max, step, initial } = interaction.parameter; const target = interaction.target;
    const valid = [min, max, step, initial].every(Number.isFinite) && min < max && step > 0 && initial >= min && initial <= max && (interaction.mode === "explore" || Boolean(target && target.min <= target.max && target.min >= min && target.max <= max));
    return valid ? [] : ["Parameter Lab requires a finite range and a challenge target."];
  }
  const size = interaction.rows * interaction.columns;
  const valid = Number.isInteger(interaction.rows) && Number.isInteger(interaction.columns) && interaction.rows > 0 && interaction.columns > 0 && size <= 36 && interaction.initialValues.length === size && interaction.initialValues.every(Number.isFinite) && (interaction.mode === "explore" || Boolean(interaction.targetValues?.length === size && interaction.targetValues.every(Number.isFinite)));
  return valid ? [] : ["Matrix/Tensor Explorer requires bounded dimensions and challenge targets."];
}

export function isNativeMicroInteractionCorrect(interaction: NativeMicroInteraction, answer: unknown) {
  if (validateNativeMicroInteraction(interaction).length) return false;
  if (interaction.type === "flow-execution" || interaction.type === "simulation" || interaction.type === "data-transform") return mechanismFeedback(interaction, answer).correct;
  if (interaction.type === "choice") return typeof answer === "string" && answer === interaction.options[interaction.correctIndex];
  if (interaction.type === "multiple-choice") return numberArray(answer) && exactSet(answer.map(String), interaction.correctIndexes.map(String));
  if (interaction.type === "fill-blank") { if (typeof answer !== "string") return false; const normalize = (value: string) => interaction.caseSensitive ? value.trim() : value.trim().toLocaleLowerCase(); return interaction.answers.some((candidate) => normalize(candidate) === normalize(answer)); }
  if (interaction.type === "ordering" || interaction.type === "mini-workflow") return stringArray(answer) && exactStrings(answer, interaction.correctOrder);
  if (interaction.type === "trace") return typeof answer === "string" && answer === interaction.correctStepId;
  if (interaction.type === "categorize") return stringArray(answer) && exactStrings(answer, interaction.correctCategories);
  if (interaction.type === "structure-builder") return stringArray(answer) && answer.every((id) => interaction.edges.some((edge) => edge.id === id)) && (interaction.mode === "explore" || exactSet(answer, interaction.correctEdgeIds ?? []));
  if (interaction.type === "parameter-lab") return numberArray(answer) && answer.length === 1 && answer[0] >= interaction.parameter.min && answer[0] <= interaction.parameter.max && (interaction.mode === "explore" || Boolean(interaction.target && answer[0] >= interaction.target.min && answer[0] <= interaction.target.max));
  return numberArray(answer) && answer.length === interaction.rows * interaction.columns && (interaction.mode === "explore" || answer.every((value, index) => value === interaction.targetValues?.[index]));
}
