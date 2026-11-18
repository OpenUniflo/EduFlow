import { describe, expect, it } from "vitest";
import { createPreviewApplicationServices } from "@/app/services/previewServices";
import { CoursePreviewReadOnlyError } from "@/features/course/immersive/courseSocial";

describe("course social preview source", () => {
  it("is injected through src/app and uses obviously sample identities", async () => {
    const services = createPreviewApplicationServices();
    const repository = services.courseSocialRepository;
    expect(repository.kind).toBe("preview");
    const people = await repository.listCoLearners({ courseId: "any-course", sectionTitle: "Tools、RAG 与 Memory" });
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((person) => person.sample)).toBe(true);
    expect(people.every((person) => person.displayName.includes("示例"))).toBe(true);
    const fallback = await repository.listCoLearners({ courseId: "any-course", sectionTitle: "不存在的章节" });
    expect(fallback.length).toBeGreaterThan(0);
  });

  it("never writes durable social state", () => {
    const error = new CoursePreviewReadOnlyError("follow");
    expect(error.code).toBe("preview_read_only");
    expect(error.message).toContain("不会写入");
  });
});
