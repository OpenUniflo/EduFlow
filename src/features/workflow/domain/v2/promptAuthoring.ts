import { PARAM_NAME_PATTERN, RESERVED_PARAM_NAME } from "./schema";
import type { Binding, JsonValue, LlmConfigV2, PromptSegment, WorkflowNodeV2 } from "./types";

/** The persisted prompt section of a typeVersion 2 model node. */
export type PromptConfigV2 = LlmConfigV2["prompt"];
export type RenderedPromptMessage = { role: "user" | "assistant"; content: string };
export type RenderedPrompt = { system?: string; messages: RenderedPromptMessage[] };

function jsonText(value: JsonValue): string {
  const text = JSON.stringify(value);
  return text === undefined ? String(value) : text;
}

/**
 * Worker M10 rendering for one segment: `text` keeps strings verbatim and stringifies numbers,
 * booleans and null; objects and arrays fall back to JSON. `json` always uses JSON. A missing
 * parameter is rendered as an empty string — the caller resolves bindings (including `onMissing`)
 * before previewing, exactly like the Worker's `resolved` dictionary.
 */
export function renderPromptSegment(segment: PromptSegment, params: Readonly<Record<string, JsonValue | undefined>>): string {
  if (segment.type === "text") return segment.text;
  const value = params[segment.name];
  if (value === undefined) return "";
  if (segment.format === "json") return jsonText(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return jsonText(value);
}

/**
 * Renders a whole prompt the way the Worker assembles it: an optional system message followed by
 * the user/assistant messages, each with its segments concatenated. Used by the editor preview and
 * by unit tests that pin the Worker's rules (plan M10).
 */
export function renderPromptPreview(prompt: PromptConfigV2, params: Readonly<Record<string, JsonValue | undefined>>): RenderedPrompt {
  const system = Array.isArray(prompt?.system) ? prompt.system.map(segment => renderPromptSegment(segment, params)).join("") : "";
  const messages = Array.isArray(prompt?.messages) ? prompt.messages.map(message => ({
    role: message.role,
    content: Array.isArray(message.content) ? message.content.map(segment => renderPromptSegment(segment, params)).join("") : "",
  })) : [];
  return system ? { system, messages } : { messages };
}

/** Parameter names referenced by prompt segments, in first-seen order; declaration is still `node.inputs`. */
export function promptParamUsage(prompt: PromptConfigV2): Set<string> {
  const used = new Set<string>();
  const collect = (segments: PromptSegment[] | undefined) => {
    if (!Array.isArray(segments)) return;
    for (const segment of segments) if (segment && segment.type === "param" && typeof segment.name === "string") used.add(segment.name);
  };
  collect(prompt?.system);
  if (Array.isArray(prompt?.messages)) for (const message of prompt.messages) if (message) collect(message.content);
  return used;
}

function assertParamName(name: string, label: string) {
  if (name === RESERVED_PARAM_NAME || !PARAM_NAME_PATTERN.test(name)) throw new Error(`${label}「${name}」不是合法的参数名：只能使用字母、数字和下划线，不能以数字开头，且 ${RESERVED_PARAM_NAME} 为保留名。`);
}

/**
 * Renames one declared parameter and every prompt segment that references it. `history` is a
 * reserved input key, never a prompt parameter, so it cannot be renamed here. Invalid names,
 * missing source parameters and collisions throw instead of returning a half-renamed config.
 */
export function renameParam(
  config: LlmConfigV2,
  inputs: Readonly<Record<string, Binding>>,
  from: string,
  to: string,
): { config: LlmConfigV2; inputs: Record<string, Binding> } {
  if (!config || typeof config !== "object" || !config.prompt || !Array.isArray(config.prompt.system) || !Array.isArray(config.prompt.messages)) throw new Error("提示词配置无效，无法重命名参数。");
  if (!inputs || typeof inputs !== "object" || !Object.prototype.hasOwnProperty.call(inputs, from)) throw new Error(`参数「${from}」不存在。`);
  assertParamName(to, "新参数名");
  if (to !== from && Object.prototype.hasOwnProperty.call(inputs, to)) throw new Error(`参数「${to}」已存在。`);

  const renameSegments = (segments: PromptSegment[]): PromptSegment[] => segments.map(segment => segment && segment.type === "param" && segment.name === from ? { ...segment, name: to } : segment);
  const nextInputs = Object.fromEntries(Object.entries(inputs).map(([key, binding]) => [key === from ? to : key, binding]));
  return {
    config: {
      ...config,
      prompt: {
        system: renameSegments(config.prompt.system),
        messages: config.prompt.messages.map(message => ({ role: message.role, content: renameSegments(message.content) })),
      },
    },
    inputs: nextInputs,
  };
}

/**
 * Applies one input-table edit to a node. For a typeVersion 2 model node, a
 * single removed/added parameter is a rename, so its prompt segments follow.
 * A rejected rename keeps the prompt untouched; the table reported the reason.
 */
export function withRenamedNodeParams(node: WorkflowNodeV2, inputs: Record<string, Binding>): WorkflowNodeV2 {
  if (node.type !== "core.llm" || node.typeVersion < 2) return { ...node, inputs };
  const history = node.inputs.history;
  const previousNames = Object.keys(node.inputs).filter(name => name !== "history");
  const nextNames = Object.keys(inputs);
  const removed = previousNames.filter(name => !nextNames.includes(name));
  const added = nextNames.filter(name => !previousNames.includes(name));
  let config = node.config;
  if (removed.length === 1 && added.length === 1) {
    try { config = renameParam(node.config as unknown as LlmConfigV2, node.inputs, removed[0], added[0]).config as unknown as Record<string, JsonValue>; } catch { /* keep the prompt unchanged; the table already reported the rename error */ }
  }
  return { ...node, config, inputs: { ...inputs, ...(history ? { history } : {}) } };
}
