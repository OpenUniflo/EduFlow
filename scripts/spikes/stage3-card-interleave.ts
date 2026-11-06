/**
 * Stage 3 spike: compare two real-model ways to interleave answer text and
 * read-only display cards.
 *
 * A — bounded research loop, then a final answer call whose only tool is
 *     `displayCard` (the production shape).
 * B — one unified loop with research + display tools.
 *
 * Each variant runs 10 times. The question deliberately needs several product
 * reads. We record the real card/text order and any serialized protocol text.
 * Every underlying HTTP request is counted against the stage budget.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { readUIMessageStream, stepCountIs, streamText, tool, type ModelMessage, type UIMessage, type UIMessageChunk } from "ai";
import { z } from "zod";
import { assistantProtocolLeakRule } from "../../src/features/assistant/protocolGuard.js";

const baseURL = process.env.LLM_BASE_URL;
const apiKey = process.env.LLM_API_KEY;
const modelId = process.env.LLM_MODEL;
if (!baseURL || !apiKey || !modelId) throw new Error("LLM_BASE_URL, LLM_API_KEY and LLM_MODEL are required");

const provider = createOpenAICompatible({ name: "eduflow", baseURL, apiKey, includeUsage: true });
const model = provider(modelId);
const providerOptions = { eduflow: { thinking: { type: "disabled" } } } as const;

let httpRequests = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  httpRequests += 1;
  return realFetch(input, init);
}) as typeof fetch;

const PRODUCT = {
  course: { id: "course-agent", title: "深入理解 AI Agent" },
  chapters: [{ id: "chapter-1", title: "Agent 架构与运行基础", order: 1 }],
  knowledge: [
    { id: "A02", title: "Agent：从回答到行动", minutes: 7 },
    { id: "AGC01", title: "观察与动作：知道办法不等于做得到", minutes: 5 },
    { id: "R10", title: "ReAct：结果怎样改变下一步", minutes: 7 }
  ],
  route: [
    { nodeId: "A02", title: "Agent：从回答到行动", state: "eligible" },
    { nodeId: "AGC01", title: "观察与动作：知道办法不等于做得到", state: "quiet" },
    { nodeId: "R10", title: "ReAct：结果怎样改变下一步", state: "quiet" }
  ],
  micro: [
    { pathId: "path-a02", knowledgeId: "A02", title: "Agent 和普通聊天有什么不同", minutes: 7 },
    { pathId: "path-agc01", knowledgeId: "AGC01", title: "看见结果再决定下一步", minutes: 5 }
  ]
};

const getCourse = tool({
  description: "Read the readable Course, its chapters, and the first route steps.",
  inputSchema: z.object({ query: z.string() }),
  execute: async () => ({ course: PRODUCT.course, chapters: PRODUCT.chapters, knowledge: PRODUCT.knowledge, route: PRODUCT.route })
});

const getNavigation = tool({
  description: "Read the deterministic next learning action for the Course.",
  inputSchema: z.object({ courseId: z.string() }),
  execute: async () => ({ nextAction: { kind: "next", nodeId: "A02", resourceKind: "micro", resourceId: "path-a02", reason: "这是课程路线的第一步。" } })
});

const getMicro = tool({
  description: "Read the published Micro Learning path for one Knowledge node.",
  inputSchema: z.object({ knowledgeId: z.string() }),
  execute: async ({ knowledgeId }) => PRODUCT.micro.find((item) => item.knowledgeId === knowledgeId) ?? null
});

const researchTools = { getCourse, getNavigation, getMicro };

const displayCard = tool({
  description: "Show one product card inside the answer. Nominate only a card type and existing object IDs from tool results. At most 3 cards. Never describe card contents or repeat their numbers.",
  inputSchema: z.discriminatedUnion("cardType", [
    z.object({ cardType: z.literal("route"), courseId: z.string() }),
    z.object({ cardType: z.literal("micro"), knowledgeId: z.string(), pathId: z.string().optional(), courseId: z.string().optional() }),
    z.object({ cardType: z.literal("knowledge"), nodeId: z.string() }),
    z.object({ cardType: z.literal("course_chapter"), courseId: z.string(), chapterId: z.string() })
  ]),
  execute: async (input) => {
    if (input.cardType === "route") return { card: { cardType: "route", courseId: "course-agent" }, display: { title: PRODUCT.course.title, kicker: "起步路线", steps: PRODUCT.route } };
    if (input.cardType === "micro") {
      const micro = PRODUCT.micro.find((item) => item.knowledgeId === input.knowledgeId);
      if (!micro) return { skipped: "invalid" };
      return { card: { cardType: "micro", pathId: micro.pathId, knowledgeId: micro.knowledgeId, courseId: "course-agent" }, display: { title: micro.title, kicker: "小练习", meta: [`约 ${micro.minutes} 分钟`] } };
    }
    if (input.cardType === "knowledge") {
      const node = PRODUCT.knowledge.find((item) => item.id === input.nodeId);
      if (!node) return { skipped: "invalid" };
      return { card: { cardType: "knowledge", nodeId: node.id }, display: { title: node.title, kicker: "要点" } };
    }
    return { card: { cardType: "course_chapter", courseId: "course-agent", chapterId: "chapter-1" }, display: { title: PRODUCT.chapters[0].title, kicker: "第 1 章" } };
  }
});

const QUESTION = "我想搞懂 Agent 怎么工作。先看看《深入理解 AI Agent》这门课从哪开始，再找一个现在能做的小练习。";

const RESEARCH_SYSTEM = `You are EduFlow Assistant. Use product tools for facts and never guess IDs. This is a research step: call the tools you need, then stop with one short sentence about what you found. Do not write the final learner-facing answer in this step. Learner-facing prose is Simplified Chinese.`;
const FINAL_SYSTEM = `You are EduFlow Assistant. Answer the learner in natural Simplified Chinese using only the research tool results already supplied. Cards are part of the answer, never page state. Call displayCard at the exact point where a card belongs; use 0 to 3 cards, only when directly relevant. Never invent IDs, titles or numbers, and never repeat card numbers in prose. The prose must stay complete if every card is removed. Follow four rules: answer first; ask at most one question; do not repeat a suggestion the learner ignored; always leave an exit. Never output a serialized tool call, XML-like tag, or protocol marker.`;

type RunResult = {
  variant: "A" | "B";
  run: number;
  requests: number;
  ok: boolean;
  leaked: boolean;
  leakRule: string | null;
  cards: Array<{ type: string; textBefore: number; textAfter: number }>;
  textLength: number;
  text: string;
  error?: string;
};

function partsOf(message: UIMessage | undefined) {
  return message?.parts ?? [];
}

function readParts(message: UIMessage | undefined) {
  const parts = partsOf(message);
  const text = parts.filter((part) => part.type === "text").map((part) => (part as { text: string }).text).join("");
  let offset = 0;
  const cards: Array<{ type: string; textBefore: number; textAfter: number }> = [];
  for (const part of parts) {
    if (part.type === "text") { offset += (part as { text: string }).text.length; continue; }
    if (part.type === "tool-displayCard") {
      const card = (part as { output?: { card?: { cardType?: string } } }).output?.card;
      cards.push({ type: card?.cardType ?? "unknown", textBefore: offset, textAfter: Math.max(0, text.length - offset) });
    }
  }
  return { text, cards };
}

async function consumeUI(result: { toUIMessageStream(options: Record<string, unknown>): ReadableStream<UIMessageChunk> }) {
  let last: UIMessage | undefined;
  for await (const message of readUIMessageStream({ stream: result.toUIMessageStream({ originalMessages: [] }) })) last = message;
  return last;
}

function researchMessages(messages: Array<{ role: string; content: unknown }>): ModelMessage[] {
  return messages.flatMap((message): ModelMessage[] => {
    if (message.role === "tool") return [message as unknown as ModelMessage];
    const content = typeof message.content === "string" ? [] : message.content as Array<{ type: string }>;
    const toolCalls = content.filter((part) => part.type === "tool-call");
    return toolCalls.length ? [{ role: "assistant", content: toolCalls } as ModelMessage] : [];
  });
}

async function runOnce(variant: "A" | "B", run: number): Promise<RunResult> {
  const before = httpRequests;
  try {
    let final: UIMessage | undefined;
    if (variant === "A") {
      const research = streamText({
        model,
        system: RESEARCH_SYSTEM,
        prompt: QUESTION,
        tools: researchTools,
        stopWhen: stepCountIs(4),
        timeout: { totalMs: 60_000, stepMs: 25_000 },
        providerOptions
      });
      await research.consumeStream();
      const [, responseMessages] = await Promise.all([research.text, research.responseMessages]);
      const messages: ModelMessage[] = [{ role: "user", content: QUESTION }, ...researchMessages(responseMessages as Array<{ role: string; content: unknown }>)];
      const finalResult = streamText({
        model,
        system: FINAL_SYSTEM,
        messages,
        tools: { displayCard },
        stopWhen: stepCountIs(4),
        timeout: { totalMs: 45_000, stepMs: 25_000 },
        providerOptions
      });
      final = await consumeUI(finalResult);
    } else {
      const result = streamText({
        model,
        system: `${FINAL_SYSTEM}\nYou may also call the read tools getCourse, getNavigation and getMicro before answering.`,
        prompt: QUESTION,
        tools: { ...researchTools, displayCard },
        stopWhen: stepCountIs(8),
        timeout: { totalMs: 75_000, stepMs: 25_000 },
        providerOptions
      });
      final = await consumeUI(result);
    }
    const { text, cards } = readParts(final);
    const rule = assistantProtocolLeakRule(text);
    return { variant, run, requests: httpRequests - before, ok: Boolean(text.trim()), leaked: Boolean(rule), leakRule: rule, cards, textLength: text.length, text };
  } catch (error) {
    return { variant, run, requests: httpRequests - before, ok: false, leaked: false, leakRule: null, cards: [], textLength: 0, text: "", error: error instanceof Error ? error.message.slice(0, 300) : "unknown" };
  }
}

const results: RunResult[] = [];
const variants: Array<"A" | "B"> = ["A", "B"];
for (const variant of variants) {
  for (let run = 1; run <= 10; run += 1) {
    const result = await runOnce(variant, run);
    results.push(result);
    console.log(JSON.stringify({ ...result, text: result.text.slice(0, 160) }));
    if (httpRequests >= 140) {
      console.error(`STOP: request budget nearly exhausted (${httpRequests})`);
      break;
    }
  }
}

const summary = variants.map((variant) => {
  const runs = results.filter((result) => result.variant === variant);
  return {
    variant,
    runs: runs.length,
    leaks: runs.filter((result) => result.leaked).length,
    empty: runs.filter((result) => !result.ok).length,
    requests: runs.reduce((sum, result) => sum + result.requests, 0),
    cards: runs.reduce((sum, result) => sum + result.cards.length, 0),
    interleaved: runs.filter((result) => result.cards.some((card) => card.textBefore > 0)).length
  };
});
console.log(JSON.stringify({ totalRequests: httpRequests, summary, results }, null, 1));
const fs = await import("node:fs");
fs.writeFileSync("/tmp/s3-experiment.json", JSON.stringify({ totalRequests: httpRequests, summary, results, model: modelId }, null, 2));
