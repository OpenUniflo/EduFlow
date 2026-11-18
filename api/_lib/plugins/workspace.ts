import { tool } from "ai";
import { z } from "zod";
import { getAssignmentContext, getKnowledge, getMaterialContext, readableCourse } from "../assistantData.js";
import { assistantToolId, safeTool, type AssistantPlugin } from "./types.js";
import { normalizeFollowUps } from "../assistantSuggestions.js";

export const workspacePlugin: AssistantPlugin = {
  id: "workspace",
  title: "面板控制",
  cards: [],
  progress: {
    suggestFollowUps: "整理后续建议",
    openWorkspacePanel: "打开面板",
  },
  tools: ({ client, user, context }) => ({
    suggestFollowUps: tool({
      description: "Offer zero to three short next-message suggestions after an answer. For a substantive learning answer with a useful next step, provide one to three; omit only for small talk, a plain fact, an error, or when there is genuinely nothing useful to suggest. The client only fills the chosen sentence into the input box; it never sends it automatically.",
      inputSchema: z.object({ suggestions: z.array(z.string().trim().min(2).max(80)).max(3) }),
      execute: ({ suggestions }: { suggestions: unknown[] }) => {
        const usable = normalizeFollowUps(suggestions);
        return { shown: usable.length > 0, suggestions: usable };
      }
    }),
    openWorkspacePanel: tool({
      description: "Open an existing EduFlow panel for the learner: assignment requirements/history, the Course route, the Material reader, records, My, or the Knowledge map. Use only identities returned by tools. This opens the real product panel; it never writes a conversation operation message.",
      inputSchema: z.object({ panel: z.enum(["assignment", "route", "material", "records", "my", "map"]), courseId: assistantToolId.optional(), assignmentId: assistantToolId.optional(), materialId: assistantToolId.optional(), segmentId: assistantToolId.optional(), nodeId: assistantToolId.optional() }),
      execute: ({ panel, courseId, assignmentId, materialId, segmentId, nodeId }: { panel: "assignment" | "route" | "material" | "records" | "my" | "map"; courseId?: string; assignmentId?: string; materialId?: string; segmentId?: string; nodeId?: string }) => safeTool(async () => {
        const resolvedCourseId = courseId ?? context.courseId;
        if (panel === "assignment") {
          const resolvedAssignmentId = assignmentId ?? context.assignmentId;
          if (!resolvedCourseId || !resolvedAssignmentId) return { status: "unavailable" };
          const assignment = await getAssignmentContext(client, user, resolvedCourseId, resolvedAssignmentId);
          if (!assignment) return { status: "unavailable" };
          return { status: "opened", panel, courseId: resolvedCourseId, assignmentId: resolvedAssignmentId, title: assignment.assignment.title };
        }
        if (panel === "route") {
          if (!resolvedCourseId || !await readableCourse(client, user, resolvedCourseId)) return { status: "unavailable" };
          return { status: "opened", panel, courseId: resolvedCourseId };
        }
        if (panel === "material") {
          const resolvedMaterialId = materialId ?? context.materialId;
          if (!resolvedCourseId || !resolvedMaterialId) return { status: "unavailable" };
          const material = await getMaterialContext(client, user, resolvedCourseId, resolvedMaterialId, segmentId ?? context.segmentId);
          if (!material) return { status: "unavailable" };
          return { status: "opened", panel, courseId: resolvedCourseId, materialId: resolvedMaterialId, ...(segmentId ?? context.segmentId ? { segmentId: segmentId ?? context.segmentId } : {}) };
        }
        if (panel === "map") {
          if (nodeId && !await getKnowledge(client, nodeId)) return { status: "unavailable" };
          return { status: "opened", panel, ...(nodeId ? { nodeId } : {}) };
        }
        return { status: "opened", panel };
      })
    })
  })
};
