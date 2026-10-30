import type { PeopleRepository } from "@/features/profile/people/PeopleRepository";
import type { CourseSocialRepository } from "@/features/course/immersive/courseSocial";
import { PreviewPeopleRepository } from "@/demo/preview/people/PreviewPeopleRepository";
import { PreviewCourseSocialRepository } from "@/demo/preview/course/PreviewCourseSocialRepository";

/**
 * Application-level injection of Feature Preview sources. The repository is
 * bound to the same contract a real backend adapter will implement, so swapping
 * preview for real data only changes this composition root.
 */
export type ApplicationPreviewServices = {
  peopleRepository: PeopleRepository;
  courseSocialRepository: CourseSocialRepository;
  /** Binds preview-only public subsets to the hydrated active Knowledge catalog. */
  bindKnowledgeCatalog(nodeIds: readonly string[]): void;
};

export function createPreviewApplicationServices(): ApplicationPreviewServices {
  const people = new PreviewPeopleRepository();
  const courseSocial = new PreviewCourseSocialRepository();
  return {
    peopleRepository: people,
    courseSocialRepository: courseSocial,
    bindKnowledgeCatalog: (nodeIds) => people.bindKnowledgeNodeIds(nodeIds)
  };
}

export const previewApplicationServices = createPreviewApplicationServices();
