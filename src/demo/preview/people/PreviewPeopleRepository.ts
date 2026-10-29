import { PreviewReadOnlyError, type FollowedPerson, type PeopleRepository, type PersonVisibility } from "@/features/profile/people/PeopleRepository";
import { sampleFollowedPeople } from "./sampleFollowedPeople";

/**
 * Read-only Feature Preview source implementing the same contract as the future
 * real repository. Reads are fixed samples; every write throws instead of
 * touching a durable store so a preview can never leak into real user data.
 */
export class PreviewPeopleRepository implements PeopleRepository {
  readonly kind = "preview" as const;

  async listFollowed(_ownerId: string): Promise<readonly FollowedPerson[]> {
    return sampleFollowedPeople;
  }

  async getPerson(_ownerId: string, personId: string): Promise<FollowedPerson | null> {
    return sampleFollowedPeople.find((person) => person.id === personId) ?? null;
  }

  async follow(): Promise<void> {
    throw new PreviewReadOnlyError("follow");
  }

  async unfollow(): Promise<void> {
    throw new PreviewReadOnlyError("unfollow");
  }

  async setVisibility(_ownerId: string, _personId: string, _visibility: PersonVisibility): Promise<void> {
    throw new PreviewReadOnlyError("setVisibility");
  }
}
