import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCourseMaterial } from "../../src/features/material/parsing/schema.js";
import { normalizeKnowledgeSurface } from "../../src/features/knowledge/generation/normalization.js";
import type { KnowledgeGenerationRepository, PreparedKnowledgeGeneration } from "../../src/features/knowledge/generation/repository.js";
import type { KnowledgeGenerationResult } from "../../src/features/knowledge/generation/types.js";

const CHAPTER_COLORS = ["#6f85ff", "#31b7a8", "#f09c55", "#a579e8", "#df6f89"];

function stableId(prefix: string, ...parts: string[]) {
  return `${prefix}-${createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 24)}`;
}

function safeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown knowledge generation failure";
  return message.replace(/(?:\/[\w. -]+)+/g, "<internal-path>").slice(0, 1000);
}

type ParsingJobRow = { id: string; course_id: string; material_id: string; status: string; normalized_artifact_path: string | null };

export class SupabaseKnowledgeGenerationRepository implements KnowledgeGenerationRepository {
  constructor(private readonly server: SupabaseClient) {}

  async prepare(input: { parsingJobId: string; ownerId: string; provider: string; model: string; promptVersion: string; schemaVersions: string[] }): Promise<PreparedKnowledgeGeneration> {
    const jobResult = await this.server.from("material_parsing_jobs").select("id, course_id, material_id, status, normalized_artifact_path").eq("id", input.parsingJobId).maybeSingle();
    if (jobResult.error) throw new Error(`Knowledge generation parsing job query failed: ${jobResult.error.code}`);
    const job = jobResult.data as ParsingJobRow | null;
    if (!job || job.status !== "completed" || !job.normalized_artifact_path) throw new Error("Knowledge generation requires a completed CourseMaterial parsing job");
    const [courseResult, materialCountResult, assignmentCountResult, curriculumResult] = await Promise.all([
      this.server.from("courses").select("id, generation_status").eq("id", job.course_id).maybeSingle(),
      this.server.from("materials").select("id", { count: "exact", head: true }).eq("course_id", job.course_id),
      this.server.from("course_assignments").select("id", { count: "exact", head: true }).eq("course_id", job.course_id),
      this.server.from("course_curricula").select("id").eq("course_id", job.course_id).maybeSingle()
    ]);
    if (courseResult.error || !courseResult.data) throw new Error("Knowledge generation Course does not exist");
    if (materialCountResult.error || materialCountResult.count !== 1) throw new Error("Knowledge generation currently requires a single-material draft Course");
    if (assignmentCountResult.error || assignmentCountResult.count !== 0) throw new Error("Knowledge generation cannot replace a Course that already has Assignments");
    if (curriculumResult.error || !curriculumResult.data) throw new Error("Knowledge generation Course has no draft curriculum");
    const artifact = await this.server.storage.from("material-parser-artifacts").download(job.normalized_artifact_path);
    if (artifact.error || !artifact.data) throw new Error(`CourseMaterial artifact download failed: ${artifact.error?.message ?? "missing artifact"}`);
    const material = parseCourseMaterial(JSON.parse(await artifact.data.text()) as unknown);
    if (material.sourceMaterialId !== job.material_id) throw new Error("CourseMaterial artifact belongs to another Material");
    const runResult = await this.server.from("knowledge_generation_runs").insert({
      course_id: job.course_id, material_id: job.material_id, owner_user_id: input.ownerId, status: "running",
      provider: input.provider, model: input.model, prompt_version: input.promptVersion, schema_versions: input.schemaVersions
    }).select("id").single();
    if (runResult.error || !runResult.data) throw new Error(`Knowledge generation run insert failed: ${runResult.error?.code ?? "unknown"}`);
    const courseUpdate = await this.server.from("courses").update({ generation_status: "parsed" }).eq("id", job.course_id);
    if (courseUpdate.error) {
      await this.fail(String(runResult.data.id), new Error(`Course generation status update failed: ${courseUpdate.error.code}`));
      throw new Error(`Course generation status update failed: ${courseUpdate.error.code}`);
    }
    return { runId: String(runResult.data.id), courseId: job.course_id, material };
  }

  async persist(runId: string, result: KnowledgeGenerationResult) {
    const generatedAt = new Date().toISOString();
    const nodeIdByCandidate = new Map(result.candidates.map((candidate) => [candidate.id, stableId("uk", result.ownerId, result.courseId, result.sourceMaterialId, normalizeKnowledgeSurface(candidate.canonicalTitle))]));
    const provenance = (sourceRefs: typeof result.candidates[number]["sourceRefs"]) => [{
      sourceType: "material", sourceId: result.sourceMaterialId, courseId: result.courseId, materialId: result.sourceMaterialId,
      generationRunId: runId, discoveredAt: generatedAt,
      sourceLocations: sourceRefs.map((source) => ({ rawBlockId: source.rawBlockId, ordinal: source.ordinal, sectionPath: source.sectionPath, ...(source.page === undefined ? {} : { page: source.page }), ...(source.slide === undefined ? {} : { slide: source.slide }) }))
    }];
    const nodes = result.candidates.map((candidate) => {
      const id = nodeIdByCandidate.get(candidate.id) as string;
      return { id, revisionId: `${id}-r1`, title: candidate.canonicalTitle, description: candidate.description, type: candidate.type,
        masteryCriteria: candidate.masteryCriteria, provenance: provenance(candidate.sourceRefs), metadata: { aliases: candidate.aliases, generationRunId: runId } };
    });
    const relations = result.relations.map((relation) => {
      const originalSource = nodeIdByCandidate.get(relation.sourceCandidateId) as string;
      const originalTarget = nodeIdByCandidate.get(relation.targetCandidateId) as string;
      const [source, target] = relation.relation === "related" ? [originalSource, originalTarget].sort() : [originalSource, originalTarget];
      return { id: stableId("ke", relation.relation, source, target), source, target, relation: relation.relation,
        strength: relation.strength, reason: relation.reason, provenance: provenance(relation.sourceRefs) };
    });
    const chapters: Array<Record<string, unknown>> = [];
    const lessons: Array<Record<string, unknown>> = [];
    const coverages: Array<Record<string, unknown>> = [];
    let lessonOrder = 0;
    result.curriculum.chapters.forEach((chapter, chapterOrder) => {
      const chapterId = stableId("kg-ch", result.courseId, result.sourceMaterialId, chapter.id, String(chapterOrder));
      chapters.push({ id: chapterId, title: chapter.title, description: chapter.description, outcome: chapter.outcome, order: chapterOrder, color: CHAPTER_COLORS[chapterOrder % CHAPTER_COLORS.length] });
      chapter.lessons.forEach((lesson, localLessonOrder) => {
        const lessonId = stableId("kg-ls", result.courseId, result.sourceMaterialId, chapter.id, lesson.id, String(localLessonOrder));
        lessons.push({ id: lessonId, chapterId, title: lesson.title, order: lessonOrder });
        lesson.coverages.forEach((coverage, coverageOrder) => coverages.push({
          id: stableId("kg-cv", result.courseId, lessonId, coverage.candidateId, coverage.role), lessonId,
          nodeId: nodeIdByCandidate.get(coverage.candidateId), role: coverage.role, order: coverageOrder
        }));
        lessonOrder += 1;
      });
    });
    const rpc = await this.server.rpc("persist_knowledge_generation", { target_run_id: runId, payload: {
      nodes, relations, chapters, lessons, coverages, duplicateCount: result.duplicateCount, executions: result.executions
    } });
    if (rpc.error) throw new Error(`Knowledge generation persistence failed: ${rpc.error.code}`);
  }

  async fail(runId: string, error: unknown) {
    const result = await this.server.from("knowledge_generation_runs").update({
      status: "failed", error_code: "knowledge_generation_failed", error_message: safeFailure(error), completed_at: new Date().toISOString()
    }).eq("id", runId).eq("status", "running");
    if (result.error) console.error("Knowledge generation failure status update failed", result.error.code);
  }
}
