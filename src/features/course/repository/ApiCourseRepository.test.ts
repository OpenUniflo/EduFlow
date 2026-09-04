import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryKnowledgeRepository } from "@/features/knowledge/repository/InMemoryKnowledgeRepository";
import { routeOnlyKnowledgeGraph, routeOnlyRuntime } from "../runtime/courseFoundation.fixture";

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/apiClient", () => ({ apiRequest }));

import { ApiCourseRepository } from "./ApiCourseRepository";

describe("ApiCourseRepository route-only discovery", () => {
  beforeEach(() => apiRequest.mockReset());

  it("hydrates a database-backed Course without hard-coded product registration", async () => {
    apiRequest.mockResolvedValue({ courses: [routeOnlyRuntime] });
    const repository = new ApiCourseRepository(new InMemoryKnowledgeRepository(routeOnlyKnowledgeGraph));

    await repository.hydrate("learner");

    expect(apiRequest).toHaveBeenCalledWith("/api/courses");
    expect(repository.listCourseRuntimes().map((runtime) => runtime.course.id)).toEqual(["route-only-course"]);
    expect(repository.getCourse("route-only-course")).toEqual(routeOnlyRuntime);
  });

  it("hydrates a valid Published Course and an incomplete Draft together", async () => {
    const draft = {
      ...routeOnlyRuntime,
      course: { ...routeOnlyRuntime.course, id: "empty-draft", lifecycle: "draft" as const },
      curriculum: { ...routeOnlyRuntime.curriculum, id: "empty-draft-curriculum", courseId: "empty-draft" },
      chapters: routeOnlyRuntime.chapters.map((chapter) => ({ ...chapter, id: "empty-draft-chapter", courseId: "empty-draft" })),
      lessons: routeOnlyRuntime.lessons.map((lesson) => ({ ...lesson, id: "empty-draft-lesson", courseId: "empty-draft", chapterId: "empty-draft-chapter" })),
      curriculumCoverages: []
    };
    apiRequest.mockResolvedValue({ courses: [routeOnlyRuntime, draft] });
    const repository = new ApiCourseRepository(new InMemoryKnowledgeRepository(routeOnlyKnowledgeGraph));

    await expect(repository.hydrate("admin")).resolves.toBeUndefined();
    expect(repository.listCourseRuntimes().map((runtime) => runtime.course.id)).toEqual(["route-only-course", "empty-draft"]);
    expect(repository.getCourse("empty-draft")).toEqual(draft);
  });

  it("rejects a Draft with a broken owned reference", async () => {
    const draft = {
      ...routeOnlyRuntime,
      course: { ...routeOnlyRuntime.course, lifecycle: "draft" as const },
      lessons: routeOnlyRuntime.lessons.map((lesson) => ({ ...lesson, chapterId: "missing-chapter" })),
      curriculumCoverages: []
    };
    apiRequest.mockResolvedValue({ courses: [draft] });
    const repository = new ApiCourseRepository(new InMemoryKnowledgeRepository(routeOnlyKnowledgeGraph));

    await expect(repository.hydrate("admin")).rejects.toThrow(/references unknown Chapter/);
  });

  it("keeps a Published Course without a Knowledge route invalid", async () => {
    apiRequest.mockResolvedValue({ courses: [{ ...routeOnlyRuntime, curriculumCoverages: [] }] });
    const repository = new ApiCourseRepository(new InMemoryKnowledgeRepository(routeOnlyKnowledgeGraph));

    await expect(repository.hydrate("learner")).rejects.toThrow(/at least one CurriculumCoverage Knowledge route/);
  });
});
