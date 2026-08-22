import type { UserKnowledgeRecord } from "./types";

export interface UserKnowledgeRepository {
  getUserKnowledge(userId: string): UserKnowledgeRecord[];
  subscribe(listener: () => void): () => void;
}
