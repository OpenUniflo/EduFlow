import { tool } from "ai";
import { z } from "zod";
import { getMicroContext, searchMicro } from "../assistantData.js";
import { assistantToolId, safeTool, type AssistantPlugin } from "./types.js";

export const microPlugin: AssistantPlugin = {
  id: "micro",
  title: "小练习",
  cards: [{ cardType: "micro", panel: "route" }],
  tools: ({ client, user, context }) => ({
    searchMicro: tool({
      description: "Find real published 小练习 (interactive Micro paths) the learner can start. Filter by a Knowledge node and/or a title query. Prefer the current Course; results say which Course each 小练习 belongs to. A 小练习 is not a 动手任务 (Course Assignment).",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(300).optional(),
        knowledgeId: assistantToolId.optional(),
        courseId: assistantToolId.optional()
      }),
      execute: ({ query, knowledgeId, courseId }: { query?: string; knowledgeId?: string; courseId?: string }) => safeTool(() =>
        searchMicro(client, user, { ...(query ? { query } : {}), ...(knowledgeId ? { knowledgeId } : {}), ...(courseId ?? context.courseId ? { courseId: courseId ?? context.courseId } : {}) })
      )
    }),
    getMicroContext: tool({
      description: "Read one published 小练习's real units and steps, including which Course it belongs to. Use it before describing or nominating a specific 小练习.",
      inputSchema: z.object({ pathId: assistantToolId, unitId: assistantToolId.optional(), stepId: assistantToolId.optional() }),
      execute: ({ pathId, unitId, stepId }: { pathId: string; unitId?: string; stepId?: string }) => safeTool(() => getMicroContext(client, user, pathId, unitId, stepId))
    })
  })
};
