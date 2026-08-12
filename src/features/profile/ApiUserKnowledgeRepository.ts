import type { UserKnowledgeRepository } from "./UserKnowledgeRepository";
import type { UserKnowledgeRecord } from "./types";

export class ApiUserKnowledgeRepository implements UserKnowledgeRepository {
  private records: UserKnowledgeRecord[] = [];

  hydrate(records: UserKnowledgeRecord[]) {
    this.records = structuredClone(records);
  }

  getUserKnowledge() {
    return structuredClone(this.records);
  }
}
