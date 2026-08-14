import type { CourseMaterial } from "@/features/material/parsing/types";
import type { KnowledgeGenerationResult } from "./types";

export type PreparedKnowledgeGeneration = { runId: string; courseId: string; material: CourseMaterial };

export interface KnowledgeGenerationRepository {
  prepare(input: { parsingJobId: string; ownerId: string; provider: string; model: string; promptVersion: string; schemaVersions: string[] }): Promise<PreparedKnowledgeGeneration>;
  persist(runId: string, result: KnowledgeGenerationResult): Promise<void>;
  fail(runId: string, error: unknown): Promise<void>;
}
