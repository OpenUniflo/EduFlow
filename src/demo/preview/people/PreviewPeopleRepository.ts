import { PreviewReadOnlyError, type FollowedPerson, type PeopleRepository, type PersonVisibility } from "@/features/profile/people/PeopleRepository";
import { sampleFollowedPeople } from "./sampleFollowedPeople";

/**
 * Read-only Feature Preview source implementing the same contract as the future
 * real repository. Reads are fixed samples; every write throws instead of
 * touching a durable store so a preview can never leak into real user data.
 */
export class PreviewPeopleRepository implements PeopleRepository {
  readonly kind = "preview" as const;
  private knowledgeNodeIds: readonly string[] = [];

  /**
   * Bind the preview's public subsets to active Knowledge IDs. This is called
   * once by the application composition root after catalog hydration; the
   * preview source never imports product data or a demo graph itself.
   */
  bindKnowledgeNodeIds(nodeIds: readonly string[]) {
    this.knowledgeNodeIds = Array.from(new Set(nodeIds)).sort();
  }

  private withSubset(person: FollowedPerson): FollowedPerson {
    if (person.sharedKnowledgeIds) return person;
    if (person.visibility === "private") return { ...person, sharedKnowledgeIds: [] };
    if (!this.knowledgeNodeIds.length) return person;
    const count = Math.min(person.sharedKnowledgeCount, this.knowledgeNodeIds.length);
    const start = hashPerson(person.id) % Math.max(1, this.knowledgeNodeIds.length);
    // A small shared core makes side-by-side comparison legible; the rest is a
    // deterministic per-person sample. It is preview state only.
    const core = this.knowledgeNodeIds.filter((_, index) => index % 41 === 0).slice(0, 4);
    const ids = [...core].slice(0, count);
    const seen = new Set(ids);
    for (let offset = 0; offset < this.knowledgeNodeIds.length * 2 && ids.length < count; offset += 1) {
      const id = this.knowledgeNodeIds[(start + offset * 37) % this.knowledgeNodeIds.length];
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    const statuses: Record<string, "learned" | "learning"> = {};
    ids.forEach((id, index) => { statuses[id] = index % 6 === 0 ? "learning" : "learned"; });
    return { ...person, sharedKnowledgeIds: ids, sharedKnowledgeStatuses: statuses };
  }

  async listFollowed(_ownerId: string): Promise<readonly FollowedPerson[]> {
    return sampleFollowedPeople.map((person) => this.withSubset(person));
  }

  async getPerson(_ownerId: string, personId: string): Promise<FollowedPerson | null> {
    const person = sampleFollowedPeople.find((candidate) => candidate.id === personId);
    return person ? this.withSubset(person) : null;
  }

  async follow(_ownerId: string, _personId: string): Promise<void> {
    throw new PreviewReadOnlyError("follow");
  }

  async unfollow(_ownerId: string, _personId: string): Promise<void> {
    throw new PreviewReadOnlyError("unfollow");
  }

  async setVisibility(_ownerId: string, _personId: string, _visibility: PersonVisibility): Promise<void> {
    throw new PreviewReadOnlyError("setVisibility");
  }
}

function hashPerson(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
