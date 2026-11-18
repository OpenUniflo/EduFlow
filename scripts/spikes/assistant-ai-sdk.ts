import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";

const baseURL = process.env.LLM_BASE_URL;
const apiKey = process.env.LLM_API_KEY;
const modelId = process.env.LLM_MODEL;
if (!baseURL || !apiKey || !modelId) throw new Error("LLM_BASE_URL, LLM_API_KEY and LLM_MODEL are required");

const provider = createOpenAICompatible({ name: "eduflow", baseURL, apiKey, includeUsage: true });
const model = provider(modelId);
// The Assistant tool loop disables thinking; the spike uses the same setting.
const providerOptions = { eduflow: { thinking: { type: "disabled" } } } as const;
// A separate check still verifies that the endpoint can stream reasoning.
const reasoningProviderOptions = { eduflow: { thinking: { type: "enabled" } } } as const;

async function consume(label: string, result: { fullStream: AsyncIterable<{ type: string }>; text: PromiseLike<string>; finishReason: PromiseLike<unknown>; steps: PromiseLike<unknown[]> }) {
  const partCounts = new Map<string, number>();
  for await (const part of result.fullStream) partCounts.set(part.type, (partCounts.get(part.type) ?? 0) + 1);
  const [text, finishReason, steps] = await Promise.all([result.text, result.finishReason, result.steps]);
  console.log(JSON.stringify({ label, ok: Boolean(text.trim()), finishReason, steps: steps.length, parts: Object.fromEntries(partCounts), textLength: text.length }));
  if (!text.trim()) throw new Error(`${label} returned no final text`);
  return { text, steps, partCounts };
}

await consume("text-stream", streamText({ model, prompt: "Reply with exactly: EduFlow stream ready.", timeout: { totalMs: 60_000 } }));

const reasoning = await consume("reasoning-stream", streamText({
  model,
  prompt: "Think briefly, then explain in one sentence why 9.8 is greater than 9.11.",
  providerOptions: reasoningProviderOptions,
  timeout: { totalMs: 60_000 }
}));
if (!reasoning.partCounts.has("reasoning-delta")) throw new Error("No reasoning stream parts were observed");

let contextCalls = 0;
const toolFlow = await consume("tool-final", streamText({
  model,
  system: "Use the provided tool for EduFlow facts. Never invent tool results.",
  prompt: "Use getLearningContext, then tell me the current Knowledge title.",
  providerOptions,
  tools: {
    getLearningContext: tool({
      description: "Read the current EduFlow learning context.",
      inputSchema: z.object({}),
      execute: async () => { contextCalls += 1; return { knowledgeId: "K-SPIKE", title: "Compatibility Spike Knowledge" }; }
    })
  },
  stopWhen: stepCountIs(6),
  timeout: { totalMs: 90_000, stepMs: 45_000 }
}));
if (contextCalls !== 1 || toolFlow.steps.length < 2) throw new Error("Tool -> final flow did not complete");

const calls: string[] = [];
const multi = await consume("two-round-tools", streamText({
  model,
  system: "Follow the requested tool order. Do not calculate values yourself.",
  prompt: "First call getSeed. After its result, call getDouble with that exact value. Then report the final value.",
  providerOptions,
  tools: {
    getSeed: tool({
      description: "Return the seed value. Must be called first.",
      inputSchema: z.object({}),
      execute: async () => { calls.push("getSeed"); return { value: 21 }; }
    }),
    getDouble: tool({
      description: "Double a value returned by getSeed. Must be called only after getSeed.",
      inputSchema: z.object({ value: z.number() }),
      execute: async ({ value }) => { calls.push("getDouble"); return { value: value * 2 }; }
    })
  },
  stopWhen: stepCountIs(5),
  timeout: { totalMs: 90_000, stepMs: 45_000 }
}));
if (calls.join(",") !== "getSeed,getDouble" || multi.steps.length < 3) throw new Error(`Expected two sequential tool calls, got ${calls.join(",")}`);

// The real tool loop can end with tool-calls and no text. The production
// fallback must therefore accept assistant tool-call + tool-result messages
// without passing tools (verified against the configured DeepSeek endpoint).
const finalFromToolHistory = await consume("no-tools-final-from-tool-history", streamText({
  model,
  system: "Tools are not available. Use only the tool result in this conversation and answer in one short sentence.",
  messages: [
    { role: "user", content: "Use lookup, then tell me the course title." },
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "spike-final-call", toolName: "lookup", input: { query: "agent" } }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "spike-final-call", toolName: "lookup", output: { type: "json", value: { title: "EduFlow Spike Course" } } }] }
  ],
  providerOptions,
  timeout: { totalMs: 45_000, stepMs: 40_000 }
}));
if (finalFromToolHistory.steps.length !== 1) throw new Error("No-tools final answer unexpectedly used more than one step");

console.log(JSON.stringify({ compatibility: "pass", provider: "eduflow", model: modelId, toolOrder: calls, noToolsToolHistory: true }));
