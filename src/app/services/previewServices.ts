import type { PeopleRepository } from "@/features/profile/people/PeopleRepository";
import { PreviewPeopleRepository } from "@/demo/preview/people/PreviewPeopleRepository";

/**
 * Application-level injection of Feature Preview sources. The repository is
 * bound to the same contract a real backend adapter will implement, so swapping
 * preview for real data only changes this composition root.
 */
export type ApplicationPreviewServices = {
  peopleRepository: PeopleRepository;
};

export function createPreviewApplicationServices(): ApplicationPreviewServices {
  return { peopleRepository: new PreviewPeopleRepository() };
}

export const previewApplicationServices = createPreviewApplicationServices();
