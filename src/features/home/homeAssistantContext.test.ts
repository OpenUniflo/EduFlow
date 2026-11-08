import { describe, expect, it } from "vitest";
import { parseAssistantContext } from "@/features/assistant/assistantContract";
import { buildHomeAssistantContext } from "./homeAssistantContext";

describe("buildHomeAssistantContext", () => {
  it("sends the visible course and knowledge identities", () => {
    const context = buildHomeAssistantContext({
      selectedCourseId: "course-1",
      currentKnowledgeId: "knowledge-1",
      workspace: null,
      removedContextIds: []
    });
    expect(parseAssistantContext(context)).toMatchObject({ workspace: "learning", courseId: "course-1", knowledgeId: "knowledge-1" });
  });

  it("drops a removed capsule from the request", () => {
    const withoutCourse = buildHomeAssistantContext({
      selectedCourseId: "course-1",
      currentKnowledgeId: "knowledge-1",
      workspace: null,
      removedContextIds: ["course"]
    });
    expect(withoutCourse.courseId).toBeUndefined();
    expect(withoutCourse.knowledgeId).toBe("knowledge-1");

    const withoutKnowledge = buildHomeAssistantContext({
      selectedCourseId: "course-1",
      currentKnowledgeId: "knowledge-1",
      workspace: null,
      removedContextIds: ["knowledge"]
    });
    expect(withoutKnowledge.knowledgeId).toBeUndefined();
    expect(withoutKnowledge.courseId).toBe("course-1");
  });

  it("sends assignmentId and courseId for an open practice", () => {
    const context = buildHomeAssistantContext({
      selectedCourseId: "course-1",
      currentKnowledgeId: "knowledge-1",
      workspace: { kind: "practice", courseId: "course-2", assignmentId: "assignment-9" },
      removedContextIds: ["course"]
    });
    expect(parseAssistantContext(context)).toMatchObject({ courseId: "course-2", assignmentId: "assignment-9" });
  });

  it("sends microPathId and knowledgeId for an open micro path", () => {
    const context = buildHomeAssistantContext({
      selectedCourseId: "course-1",
      currentKnowledgeId: "knowledge-1",
      workspace: { kind: "micro", knowledgeId: "knowledge-2", courseId: "course-2", pathId: "path-7" },
      removedContextIds: ["course", "knowledge"]
    });
    expect(parseAssistantContext(context)).toMatchObject({ courseId: "course-2", knowledgeId: "knowledge-2", microPathId: "path-7" });
    expect(() => parseAssistantContext(context)).not.toThrow();
  });

  it("does not send a micro path whose capsule was removed", () => {
    const context = buildHomeAssistantContext({
      selectedCourseId: "course-1",
      currentKnowledgeId: "knowledge-1",
      workspace: { kind: "micro", knowledgeId: "knowledge-2", courseId: "course-2", pathId: "path-7" },
      removedContextIds: ["micro"]
    });
    expect(context.microPathId).toBeUndefined();
    expect(context.knowledgeId).toBe("knowledge-1");
  });

  it("keeps person identity only while the person capsule is visible", () => {
    const visible = buildHomeAssistantContext({ selectedPersonId: "person-1", workspace: null, removedContextIds: [] });
    expect(visible.selectedObject).toBe("person:person-1");
    const removed = buildHomeAssistantContext({ selectedPersonId: "person-1", workspace: null, removedContextIds: ["person"] });
    expect(removed.selectedObject).toBeUndefined();
  });
});

describe("buildHomeAssistantContext active object", () => {
  it("sends the open object identity instead of the focus identities", () => {
    const practice = buildHomeAssistantContext({
      selectedCourseId: "focus",
      currentKnowledgeId: "focus-knowledge",
      workspace: null,
      removedContextIds: [],
      activeObject: { kind: "practice", courseId: "course-2", assignmentId: "assignment-9", title: "任务" },
      objectContextVisible: true
    });
    expect(practice).toMatchObject({ courseId: "course-2", assignmentId: "assignment-9", presentation: "practice" });
    expect(practice.knowledgeId).toBeUndefined();

    const route = buildHomeAssistantContext({
      selectedCourseId: "focus",
      currentKnowledgeId: "focus-knowledge",
      workspace: null,
      removedContextIds: [],
      activeObject: { kind: "route", courseId: "course-3", title: "路线" },
      objectContextVisible: true
    });
    expect(route).toMatchObject({ courseId: "course-3", presentation: "route" });
    expect(route.knowledgeId).toBeUndefined();
  });

  it("carries no object identity after the learner removes the tag", () => {
    const context = buildHomeAssistantContext({
      selectedCourseId: "focus",
      currentKnowledgeId: "focus-knowledge",
      workspace: { kind: "practice", courseId: "course-2", assignmentId: "assignment-9" },
      removedContextIds: [],
      activeObject: { kind: "practice", courseId: "course-2", assignmentId: "assignment-9", title: "任务" },
      objectContextVisible: false
    });
    expect(context).toEqual({ workspace: "learning", experienceMode: "learn", presentation: "today" });
    expect(() => parseAssistantContext(context)).not.toThrow();
  });
});
