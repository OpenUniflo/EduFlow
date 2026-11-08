import { tool } from "ai";
import { z } from "zod";
import { navigationForAssistant } from "../assistantData.js";
import { assistantToolId, safeTool, type AssistantPlugin } from "./types.js";

export const navigationPlugin: AssistantPlugin = {
  id: "navigation",
  title: "下一步与教学顺序",
  cards: [{ cardType: "route", panel: "route" }],
  tools: ({ client, user, context }) => ({
    getNavigationDecision: tool({
      description: "Read the deterministic Navigation Engine's current Next Action and reason for one server-validated Course. Use this whenever the learner asks what to learn or do next. Never invent, rerank, replace, or override its decision. Without courseId it uses the page Course context or returns readable Courses.",
      inputSchema: z.object({ courseId: assistantToolId.optional() }),
      execute: ({ courseId }: { courseId?: string }) => safeTool(async () => { console.info("assistant_tool getNavigationDecision"); return navigationForAssistant(client, user, context, courseId); })
    })
  })
};
