import { tool } from "ai";
import { z } from "zod";
import { getLearnerState } from "../assistantData.js";
import { readEvidenceView } from "../evidenceRead.js";
import { assistantToolId, safeTool, type AssistantPlugin } from "./types.js";

export const progressPlugin: AssistantPlugin = {
  id: "progress",
  title: "进度与记录",
  cards: [{ cardType: "progress", panel: "records" }],
  progress: {
    getLearnerState: "读取学习进度",
    getEvidenceContext: "读取学习记录",
  },
  tools: ({ client, user }) => ({
    getLearnerState: tool({
      description: "Read only the authenticated learner's real Knowledge and Course state.",
      inputSchema: z.object({ nodeId: assistantToolId.optional(), courseId: assistantToolId.optional() }),
      execute: ({ nodeId, courseId }: { nodeId?: string; courseId?: string }) => safeTool(() => getLearnerState(client, user, nodeId, courseId))
    }),
    getEvidenceContext: tool({
      description: "Read one owned Evidence Source or Diagnosis Run and its actual proposals for explanation only. Never write or confirm capability.",
      inputSchema: z.object({ sourceId: z.string().uuid().optional(), runId: z.string().uuid().optional() }),
      execute: ({ sourceId, runId }: { sourceId?: string; runId?: string }) => safeTool(async () => runId ? readEvidenceView(client, { view: "run", runId }) : sourceId ? readEvidenceView(client, { view: "source", sourceId }) : null)
    })
  })
};
