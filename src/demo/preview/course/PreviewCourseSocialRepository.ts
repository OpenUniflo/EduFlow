import type { CoursePeerPresence, CourseSocialRepository } from "@/features/course/immersive/courseSocial";

const samplePeople: readonly CoursePeerPresence[] = [
  { id: "sample-peer-zhou", displayName: "示例 · 周然", accent: "cyan", sample: true, sectionTitle: "Tools、RAG 与 Memory", sharedCourseIds: [] },
  { id: "sample-peer-wang", displayName: "示例 · 小王", accent: "orange", sample: true, sectionTitle: "Tools、RAG 与 Memory", sharedCourseIds: [] },
  { id: "sample-peer-qing", displayName: "示例 · 阿青", accent: "rose", sample: true, sectionTitle: "Runtime 与可靠性", sharedCourseIds: [] }
];

/** Read-only sample presence; it never writes or mixes with real learner data. */
export class PreviewCourseSocialRepository implements CourseSocialRepository {
  readonly kind = "preview" as const;

  async listCoLearners({ sectionTitle }: { courseId: string; sectionTitle?: string }): Promise<readonly CoursePeerPresence[]> {
    if (!sectionTitle) return samplePeople;
    const matched = samplePeople.filter((person) => person.sectionTitle === sectionTitle);
    return matched.length ? matched : samplePeople.slice(0, 3);
  }
}
