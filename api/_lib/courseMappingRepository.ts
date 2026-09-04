import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseMappingRepository, PreparedCourseMapping } from "../../src/features/course/mapping/repository.js";
import type { CourseMappingPlan } from "../../src/features/course/mapping/mappingPlan.js";
import type { CourseRuntimeData } from "../../src/features/course/runtime/courseRuntime.js";
import type { KnowledgeEdge, KnowledgeNode } from "../../src/features/knowledge/types.js";

type Row = Record<string, unknown>;
const rows = (result: { data: unknown; error: { code?: string } | null }, label: string) => {
  if (result.error || !Array.isArray(result.data)) throw new Error(`${label} failed: ${result.error?.code ?? "missing-data"}`);
  return result.data as Row[];
};
const text = (row: Row, key: string) => String(row[key]);
const optionalText = (row: Row, key: string) => row[key] == null ? undefined : String(row[key]);
const number = (row: Row, key: string) => Number(row[key]);
const safeFailure = (error: unknown) => (error instanceof Error ? error.message : "Unknown course mapping failure").replace(/(?:\/[\w. -]+)+/g, "<internal-path>").slice(0, 1000);

export class SupabaseCourseMappingRepository implements CourseMappingRepository {
  constructor(private readonly server: SupabaseClient) {}

  async prepare(input: { courseId: string; ownerId: string; targetOutcome?: string; provider: string; model: string; promptVersion: string; schemaVersions: string[] }): Promise<PreparedCourseMapping> {
    const [courseResult, curriculumResult, chapterResult, lessonResult, coverageResult, sequenceResult, materialResult, segmentResult, generationResult, templateResult] = await Promise.all([
      this.server.from("courses").select("*").eq("id", input.courseId).maybeSingle(),
      this.server.from("course_curricula").select("*").eq("course_id", input.courseId).maybeSingle(),
      this.server.from("curriculum_chapters").select("*").eq("course_id", input.courseId).order("display_order"),
      this.server.from("curriculum_lessons").select("*").eq("course_id", input.courseId).order("display_order"),
      this.server.from("curriculum_coverages").select("*").eq("course_id", input.courseId).order("lesson_id").order("display_order"),
      this.server.from("curriculum_sequences").select("*").eq("course_id", input.courseId).order("id"),
      this.server.from("materials").select("*").eq("course_id", input.courseId).order("display_order"),
      this.server.from("material_segments").select("*").eq("course_id", input.courseId).order("material_id").order("display_order"),
      this.server.from("knowledge_generation_runs").select("id, owner_user_id, status").eq("course_id", input.courseId).eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      this.server.from("workflow_templates").select("id, name, description").order("id")
    ]);
    if (courseResult.error || !courseResult.data || !["curriculum-generated", "ready"].includes(courseResult.data.generation_status)) throw new Error("Course mapping requires a generated Course");
    if (generationResult.error || !generationResult.data || generationResult.data.owner_user_id !== input.ownerId) throw new Error("Course mapping requires the owning Phase 4.2 generation result");
    if (curriculumResult.error || !curriculumResult.data) throw new Error("Course mapping requires a Course curriculum");
    const targetOutcome = input.targetOutcome?.trim() || optionalText(courseResult.data, "target_outcome")?.trim();
    if (!targetOutcome) throw new Error("Course mapping requires a persisted targetOutcome");
    if (input.targetOutcome?.trim() && input.targetOutcome.trim() !== optionalText(courseResult.data, "target_outcome")?.trim()) {
      const outcomeUpdate = await this.server.from("courses").update({ target_outcome: targetOutcome }).eq("id", input.courseId);
      if (outcomeUpdate.error) throw new Error(`Course target outcome persistence failed: ${outcomeUpdate.error.code}`);
    }
    const chapters = rows(chapterResult, "Chapter query");
    const lessons = rows(lessonResult, "Lesson query");
    const coverages = rows(coverageResult, "CurriculumCoverage query");
    const sequences = rows(sequenceResult, "CurriculumSequence query");
    const materials = rows(materialResult, "Material query");
    const segments = rows(segmentResult, "MaterialSegment query");
    const nodeIds = Array.from(new Set(coverages.map((row) => text(row, "node_id"))));
    if (!nodeIds.length) throw new Error("Course mapping requires curriculum Knowledge coverage");
    const [nodeResult, edgeResult] = await Promise.all([
      this.server.from("knowledge_nodes").select("*").in("id", nodeIds),
      this.server.from("knowledge_edges").select("*").eq("lifecycle_status", "active").in("source_node_id", nodeIds)
    ]);
    const knowledgeNodes = rows(nodeResult, "KnowledgeNode query").map((row): KnowledgeNode => ({ id: text(row, "id"), title: text(row, "title"), description: text(row, "description"), type: text(row, "node_type") as KnowledgeNode["type"], masteryCriteria: row.mastery_criteria as string[], scope: text(row, "scope") as KnowledgeNode["scope"], ownerId: optionalText(row, "owner_id"), provenance: row.provenance as KnowledgeNode["provenance"], currentRevisionId: text(row, "current_revision_id"), status: text(row, "status") as KnowledgeNode["status"], metadata: row.metadata as Record<string, unknown> | undefined }));
    const nodeSet = new Set(nodeIds);
    const knowledgeEdges = rows(edgeResult, "KnowledgeEdge query").filter((row) => nodeSet.has(text(row, "target_node_id"))).map((row) => ({ id: text(row, "id"), source: text(row, "source_node_id"), target: text(row, "target_node_id"), relation: text(row, "relation"), reason: text(row, "reason"), strength: text(row, "relation") === "prerequisite" ? text(row, "prerequisite_strength") : number(row, "associative_strength"), provenance: row.provenance }) as KnowledgeEdge);
    const courseId = input.courseId;
    const runtime: CourseRuntimeData = {
      course: { id: courseId, title: text(courseResult.data, "title"), description: text(courseResult.data, "description"), targetOutcome, generationStatus: text(courseResult.data, "generation_status") as CourseRuntimeData["course"]["generationStatus"] },
      curriculum: { id: text(curriculumResult.data, "id"), courseId, generationMode: text(curriculumResult.data, "generation_mode") as CourseRuntimeData["curriculum"]["generationMode"] },
      chapters: chapters.map((row) => ({ id: text(row, "id"), courseId, title: text(row, "title"), description: text(row, "description"), order: number(row, "display_order"), color: text(row, "color"), outcome: text(row, "outcome") })),
      lessons: lessons.map((row) => ({ id: text(row, "id"), courseId, chapterId: text(row, "chapter_id"), title: text(row, "title"), order: number(row, "display_order") })),
      curriculumCoverages: coverages.map((row) => ({ id: text(row, "id"), courseId, lessonId: text(row, "lesson_id"), nodeId: text(row, "node_id"), role: text(row, "role") as CourseRuntimeData["curriculumCoverages"][number]["role"], order: number(row, "display_order") })),
      curriculumSequences: sequences.map((row) => ({ id: text(row, "id"), courseId, sourceLessonId: text(row, "source_lesson_id"), targetLessonId: text(row, "target_lesson_id") })),
      assignments: [], assignmentCoverages: [], assignmentDependencies: [], chapterOutcomes: [], assignmentOutcomeCompositions: [], finalProjects: [], finalProjectOutcomeCompositions: [],
      materials: materials.map((row) => { const materialId = text(row, "id"); const type = text(row, "material_type"); return { id: materialId, courseId, order: number(row, "display_order"), title: text(row, "title"), type: (["pptx", "docx"].includes(type) ? "document" : type) as CourseRuntimeData["materials"][number]["type"], segments: segments.filter((segment) => text(segment, "material_id") === materialId).map((segment) => ({ id: text(segment, "id"), order: number(segment, "display_order"), page: segment.page == null ? undefined : number(segment, "page"), title: optionalText(segment, "title"), section: optionalText(segment, "section") })) }; }),
      materialKnowledgeCoverages: [], revision: text(courseResult.data, "revision")
    };
    const run = await this.server.from("course_mapping_runs").insert({ course_id: courseId, owner_user_id: input.ownerId, input_revision: runtime.revision, status: "running", provider: input.provider, model: input.model, prompt_version: input.promptVersion, schema_versions: input.schemaVersions }).select("id").single();
    if (run.error || !run.data) throw new Error(`Course mapping run insert failed: ${run.error?.code ?? "unknown"}`);
    return { runId: String(run.data.id), runtime, knowledgeNodes, knowledgeEdges, workflowTemplates: rows(templateResult, "Workflow template query").map((row) => ({ id: text(row, "id"), title: text(row, "name"), description: optionalText(row, "description") })) };
  }

  async persist(runId: string, plan: CourseMappingPlan) {
    const result = await this.server.rpc("persist_course_mapping", { target_run_id: runId, payload: plan });
    if (result.error) throw new Error(`Course mapping persistence failed: ${result.error.code}`);
  }

  async fail(runId: string, error: unknown) {
    await this.server.from("course_mapping_runs").update({ status: "failed", error_code: "course_mapping_failed", error_message: safeFailure(error), completed_at: new Date().toISOString() }).eq("id", runId).eq("status", "running");
  }
}
