import { tool } from "ai";
import { z } from "zod";
import { planGoalForAssistant } from "../assistantData.js";
import { assistantToolId, safeTool, type AssistantPlugin } from "./types.js";

export const planningPlugin: AssistantPlugin = {
  id: "planning",
  title: "学习目标与课程规划",
  cards: [{ cardType: "course_match", panel: "route" }],
  progress: {
    planLearningGoal: "整理学习目标",
  },
  tools: ({ client, dependencies }) => ({
    planLearningGoal: tool({
      description: "Resolve a learner Goal to real visible Knowledge, factual prerequisite closure, and deterministic existing-Course coverage/gaps. You may first search Knowledge and suggest candidate IDs, but this tool revalidates every ID. This tool never creates a Course or chooses a formal Next Action.",
      inputSchema: z.object({ goalText: z.string().trim().min(1).max(1000), candidateKnowledgeIds: z.array(assistantToolId).max(20).optional() }),
      execute: ({ goalText, candidateKnowledgeIds }: { goalText: string; candidateKnowledgeIds?: string[] }) => safeTool(() => planGoalForAssistant(client, goalText, candidateKnowledgeIds, dependencies.goalLanguageResolver, dependencies.onGoalPlan))
    })
  })
};
