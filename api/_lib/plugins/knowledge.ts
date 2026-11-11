import { tool } from "ai";
import { z } from "zod";
import { getKnowledge, getKnowledgeNeighbors, searchKnowledge } from "../assistantData.js";
import { assistantToolId, safeTool, type AssistantPlugin } from "./types.js";

export const knowledgePlugin: AssistantPlugin = {
  id: "knowledge",
  title: "知识与地图",
  cards: [{ cardType: "knowledge", panel: "map" }, { cardType: "mini_map", panel: "map" }],
  progress: {
    searchKnowledge: "查找知识点",
    getKnowledge: "读取知识点",
    getKnowledgeNeighbors: "查看知识关联",
  },
  tools: ({ client }) => ({
    searchKnowledge: tool({
      description: "Search visible active EduFlow Knowledge by title, description, or tags.",
      inputSchema: z.object({ query: z.string().trim().min(1).max(300) }),
      execute: ({ query }: { query: string }) => safeTool(() => searchKnowledge(client, query))
    }),
    getKnowledge: tool({
      description: "Read one visible active KnowledgeNode by stable ID.",
      inputSchema: z.object({ nodeId: assistantToolId }),
      execute: ({ nodeId }: { nodeId: string }) => safeTool(() => getKnowledge(client, nodeId))
    }),
    getKnowledgeNeighbors: tool({
      description: "Read factual prerequisite, enables, and related KnowledgeEdges for one visible KnowledgeNode.",
      inputSchema: z.object({ nodeId: assistantToolId }),
      execute: ({ nodeId }: { nodeId: string }) => safeTool(() => getKnowledgeNeighbors(client, nodeId))
    })
  })
};
