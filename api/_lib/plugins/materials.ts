import { tool } from "ai";
import { z } from "zod";
import { getMaterialContext, searchMaterialContent, searchMaterials } from "../assistantData.js";
import { assistantToolId, safeTool, type AssistantPlugin } from "./types.js";

export const materialsPlugin: AssistantPlugin = {
  id: "materials",
  title: "资料与阅读器",
  cards: [{ cardType: "material", panel: "reader" }],
  tools: ({ client, user }) => ({
    searchMaterials: tool({
      description: "Search readable Course Materials by title or description. Use this before getMaterialContext when the learner asks which material to read.",
      inputSchema: z.object({ courseId: assistantToolId, query: z.string().trim().min(1).max(300) }),
      execute: ({ courseId, query }: { courseId: string; query: string }) => safeTool(() => searchMaterials(client, user, courseId, query))
    }),
    getMaterialContext: tool({
      description: "Read a Course-owned Material and optional current Segment with authoritative MaterialKnowledgeCoverage.",
      inputSchema: z.object({ courseId: assistantToolId, materialId: assistantToolId, segmentId: assistantToolId.optional() }),
      execute: ({ courseId, materialId, segmentId }: { courseId: string; materialId: string; segmentId?: string }) => safeTool(() => getMaterialContext(client, user, courseId, materialId, segmentId))
    }),
    searchMaterialContent: tool({
      description: "Deterministically search content inside one readable Course Material without vector search.",
      inputSchema: z.object({ courseId: assistantToolId, materialId: assistantToolId, query: z.string().trim().min(1).max(300) }),
      execute: ({ courseId, materialId, query }: { courseId: string; materialId: string; query: string }) => safeTool(() => searchMaterialContent(client, user, courseId, materialId, query))
    })
  })
};
