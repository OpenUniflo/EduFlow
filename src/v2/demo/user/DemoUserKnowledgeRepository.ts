import { demoUserKnowledge } from "../../profile/demoUserKnowledge";
import type { UserKnowledgeRepository } from "../../profile/UserKnowledgeRepository";

const SECONDARY_USER_RECORDS = demoUserKnowledge
  .filter((record) => ["PY01", "PY06", "PY18", "T11"].includes(record.nodeId))
  .map((record, index) => ({ ...record, status: index < 2 ? "mastered" as const : "learning" as const, mastery: index < 2 ? 85 : 35 + index * 5 }));

export class DemoUserKnowledgeRepository implements UserKnowledgeRepository {
  getUserKnowledge(userId: string) {
    return userId === "student@knowledge-atlas.local" ? demoUserKnowledge.map((record) => ({ ...record })) : SECONDARY_USER_RECORDS.map((record) => ({ ...record }));
  }
}
