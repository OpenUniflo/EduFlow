import { tool } from "ai";
import { z } from "zod";
import { getCourseContext, searchCourses } from "../assistantData.js";
import { assistantToolId, safeTool, type AssistantPlugin } from "./types.js";

export const coursesPlugin: AssistantPlugin = {
  id: "courses",
  title: "课程与路线",
  cards: [
    { cardType: "route", panel: "route" },
    { cardType: "course_chapter", panel: "route" },
    { cardType: "course_match", panel: "route" }
  ],
  progress: {
    searchCourses: "查找课程",
    getCourseContext: "读取课程路线",
  },
  tools: ({ client, user }) => ({
    searchCourses: tool({
      description: "Search Courses readable by the authenticated user.",
      inputSchema: z.object({ query: z.string().trim().min(1).max(300) }),
      execute: ({ query }: { query: string }) => safeTool(() => searchCourses(client, user, query))
    }),
    getCourseContext: tool({
      description: "Read a Course route, curriculum order, covered Knowledge, and its real Assignments. CurriculumSequence is explicitly not a KnowledgeEdge.",
      inputSchema: z.object({ courseId: assistantToolId, knowledgeId: assistantToolId.optional() }),
      execute: ({ courseId, knowledgeId }: { courseId: string; knowledgeId?: string }) => safeTool(() => getCourseContext(client, user, courseId, knowledgeId))
    })
  })
};
