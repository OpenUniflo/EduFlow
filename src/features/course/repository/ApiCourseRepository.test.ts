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
});
