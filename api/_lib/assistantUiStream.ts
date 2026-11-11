import type { UIMessageChunk } from "ai";
import type { AssistantCardRef } from "../../src/features/assistant/assistantCards.js";
import type { TimelinePart } from "./assistantTimeline.js";
import { assistantToolProgressLabel } from "./toolProgress.js";
import { normalizeFollowUps, type FollowUpSuggestion } from "./assistantSuggestions.js";
import type { WriteToolDefinition } from "./plugins/types.js";

type Row = Record<string, unknown>;
const PRESENTATION_TOOLS = new Set(["displayCard", "suggestFollowUps"]);

export type AssistantUiTimeline = {
  /** The exact ordered parts that will be persisted and re-read after refresh. */
  recorder: { parts: TimelinePart[] };
  /** Standard AI SDK UI stream transform; no project-specific protocol. */
  transform: TransformStream<UIMessageChunk, UIMessageChunk>;
};

/**
 * Record the model's actual output order: every text block, tool progress and
 * card is kept where it happened. Nothing is removed, merged, reordered or
 * restored later, so the live stream, the persisted parts and a refreshed
 * conversation are the same sequence.
 */
export function createAssistantUiTimeline(options: { writeTools?: Record<string, WriteToolDefinition> } = {}): AssistantUiTimeline {
  const recorder: { parts: TimelinePart[] } = { parts: [] };
  const textByPart = new Map<string, number>();
  const toolNameByCall = new Map<string, string>();
  const toolInputByCall = new Map<string, unknown>();
  const followUps: FollowUpSuggestion[] = [];

  const transform = new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === "text-start") {
        textByPart.set(chunk.id, recorder.parts.length);
        recorder.parts.push({ type: "text", text: "" });
        controller.enqueue(chunk);
        return;
      }
      if (chunk.type === "text-delta") {
        const index = textByPart.get(chunk.id);
        if (index !== undefined) {
          const part = recorder.parts[index];
          if (part && part.type === "text") part.text += chunk.delta;
        }
        controller.enqueue(chunk);
        return;
      }
      if (chunk.type === "tool-input-available") {
        const toolName = String(chunk.toolName ?? "");
        toolNameByCall.set(chunk.toolCallId, toolName);
        toolInputByCall.set(chunk.toolCallId, chunk.input);
        if (!PRESENTATION_TOOLS.has(toolName)) {
          const part: TimelinePart = { type: "data-tool-progress", data: { toolName, label: assistantToolProgressLabel(toolName) } };
          recorder.parts.push(part);
          controller.enqueue(part as UIMessageChunk);
        }
        controller.enqueue(chunk);
        return;
      }
      if (chunk.type === "tool-output-available") {
        const toolName = toolNameByCall.get(chunk.toolCallId) ?? "";
        if (toolName === "displayCard") {
          const input = toolInputByCall.get(chunk.toolCallId);
          const output = chunk.output && typeof chunk.output === "object" ? chunk.output as Row : {};
          const card = (output.card ?? input) as AssistantCardRef | undefined;
          if (card) recorder.parts.push({ type: "tool-displayCard", toolCallId: chunk.toolCallId, state: "output-available", input: card, output: { card } });
        }
        if (toolName === "suggestFollowUps") {
          const output = chunk.output && typeof chunk.output === "object" ? chunk.output as Row : {};
          if (Array.isArray(output.suggestions)) {
            for (const suggestion of normalizeFollowUps(output.suggestions)) {
              if (!followUps.some((item) => item.text === suggestion.text)) followUps.push(suggestion);
            }
          }
        }
        const writeTool = options.writeTools?.[toolName];
        if (writeTool) {
          let result: ReturnType<WriteToolDefinition["result"]>;
          try {
            result = writeTool.result(chunk.output);
          } catch {
            result = { ok: false, title: "操作结果未知", detail: "服务端未能读取工具结果，请从任务面板确认" };
          }
          const part: TimelinePart = { type: "data-write-result", data: { id: crypto.randomUUID(), toolName, ...result } };
          recorder.parts.push(part);
          controller.enqueue(part as UIMessageChunk);
        }
        controller.enqueue(chunk);
        return;
      }
      if (chunk.type === "finish") {
        if (followUps.length) {
          const items = followUps.filter((item, index, all) => all.findIndex((candidate) => candidate.text === item.text) === index).slice(0, 3);
          const part: TimelinePart = { type: "data-follow-ups", data: { items } };
          recorder.parts.push(part);
          controller.enqueue(part as UIMessageChunk);
        }
        controller.enqueue(chunk);
        return;
      }
      controller.enqueue(chunk);
    }
  });

  return { recorder, transform };
}
