import type { UserKnowledgeRepository } from "./UserKnowledgeRepository";
import type { UserKnowledgeRecord } from "./types";

export class ApiUserKnowledgeRepository implements UserKnowledgeRepository {
  private records: UserKnowledgeRecord[] = [];
  private listeners = new Set<() => void>();

  hydrate(records: UserKnowledgeRecord[]) {
    this.records = structuredClone(records);
    this.listeners.forEach((listener) => listener());
  }

  getUserKnowledge() {
    return structuredClone(this.records);
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}
