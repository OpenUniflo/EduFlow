import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createOptionalUserSupabase, createServerSupabase, createUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
const optionalText = (row: Row, key: string) => row[key] == null ? undefined : String(row[key]);
const number = (row: Row, key: string) => Number(row[key]);

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method === "POST") {
    const { client, user } = await createUserSupabase(request);
    const body = request.body as { title?: string; description?: string; targetOutcome?: string; accentColor?: string };
    const title = body.title?.trim(); const targetOutcome = body.targetOutcome?.trim();
    if (!title) throw new ApiError(400, "invalid_course", "title is required");
    const profile = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const profileRow = dataOrThrow(profile.data as Row | null, profile.error, "Course creation role lookup");
    if (!profileRow || !["teacher", "admin"].includes(text(profileRow, "role"))) throw new ApiError(403, "course_creation_forbidden", "Only teachers may create courses");
    const id = `course-${crypto.randomUUID()}`; const chapterId = `${id}:chapter:1`; const lessonId = `${id}:lesson:1`; const server = createServerSupabase();
    const createdAt = new Date().toISOString();
    const courseWrite = await server.from("courses").insert({ id, title, description: body.description?.trim() || title, target_outcome: targetOutcome || null, accent_color: body.accentColor?.trim() || "#7d6ee7", generation_status: "draft", lifecycle: "draft", author_user_id: user.id, revision: "draft-1", created_at: createdAt, updated_at: createdAt }).select("id").maybeSingle();
    dataOrThrow(courseWrite.data as Row | null, courseWrite.error, "Course creation write");
    const curriculumWrite = await server.from("course_curricula").insert({ course_id: id, id: `${id}:curriculum`, generation_mode: "manual" }); dataOrThrow(curriculumWrite.data, curriculumWrite.error, "Curriculum creation write");
    const chapterWrite = await server.from("curriculum_chapters").insert({ course_id: id, id: chapterId, title: "开始设计", description: "先添加本篇章的原子 Knowledge、课件和实训。", display_order: 0, color: body.accentColor?.trim() || "#7d6ee7", outcome: targetOutcome || "" }); dataOrThrow(chapterWrite.data, chapterWrite.error, "Chapter creation write");
    const lessonWrite = await server.from("curriculum_lessons").insert({ course_id: id, id: lessonId, chapter_id: chapterId, title: "课程起点", display_order: 0 }); dataOrThrow(lessonWrite.data, lessonWrite.error, "Lesson creation write");
    json(response, 201, { courseId: id }); return;
  }
  if (request.method === "PATCH") {
    const { client, user } = await createUserSupabase(request);
    const body = request.body as { courseId?: string; lifecycle?: string };
    if (!body.courseId || !["draft", "published", "archived"].includes(String(body.lifecycle))) throw new ApiError(400, "invalid_course_lifecycle", "courseId and a valid lifecycle are required");
    const profile = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const profileRow = dataOrThrow(profile.data as Row | null, profile.error, "Course lifecycle role lookup");
    if (!profileRow || !["teacher", "admin"].includes(text(profileRow, "role"))) throw new ApiError(403, "course_lifecycle_forbidden", "Only teachers may change course lifecycle");
    if (body.lifecycle === "published") {
      const coverageResult = await client.from("curriculum_coverages").select("node_id").eq("course_id", body.courseId);
      const coverages = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Course publish route lookup");
      const coveredNodeIds = [...new Set(coverages.map((row) => text(row, "node_id")))];
      if (!coveredNodeIds.length) throw new ApiError(422, "course_learning_route_required", "A Published Course requires at least one active Knowledge route");
      const knowledgeResult = await client.from("knowledge_nodes").select("id").in("id", coveredNodeIds).eq("status", "active");
      const activeNodes = dataOrThrow(knowledgeResult.data as Row[] | null, knowledgeResult.error, "Course publish Knowledge lookup");
      if (!activeNodes.length) throw new ApiError(422, "course_learning_route_required", "A Published Course requires at least one active Knowledge route");
    }
    const write = await client.from("courses").update({ lifecycle: body.lifecycle, updated_at: new Date().toISOString() }).eq("id", body.courseId).select("id,lifecycle").maybeSingle();
    const row = dataOrThrow(write.data as Row | null, write.error, "Course lifecycle update");
    if (!row) throw new ApiError(404, "course_not_found", "Course not found");
    json(response, 200, { courseId: text(row, "id"), lifecycle: text(row, "lifecycle") }); return;
  }
  if (request.method !== "GET") return methodNotAllowed(response, ["GET", "POST", "PATCH"]);
  const { client, user } = await createOptionalUserSupabase(request);
  const courseId = typeof request.query.id === "string" ? request.query.id : undefined;
  const queries = await Promise.all([
    client.from("courses").select("*").order("id"),
    client.from("course_curricula").select("*").order("course_id"),
    client.from("curriculum_chapters").select("*").order("course_id").order("display_order"),
    client.from("curriculum_lessons").select("*").order("course_id").order("display_order"),
    client.from("curriculum_coverages").select("*").order("course_id").order("lesson_id").order("display_order"),
    client.from("curriculum_sequences").select("*").order("course_id").order("id"),
    client.from("course_assignments").select("*").order("course_id").order("display_order"),
    client.from("assignment_coverages").select("*").order("course_id").order("id"),
    client.from("assignment_dependencies").select("*").order("course_id").order("id"),
    client.from("chapter_outcomes").select("*").order("course_id").order("id"),
    client.from("assignment_outcome_compositions").select("*").order("course_id").order("id"),
    client.from("final_projects").select("*").order("course_id").order("id"),
    client.from("final_project_outcome_compositions").select("*").order("course_id").order("id"),
    client.from("materials").select("*").order("course_id").order("lesson_id").order("display_order"),
    client.from("material_segments").select("*").order("course_id").order("material_id").order("display_order"),
    client.from("material_knowledge_coverages").select("*").order("course_id").order("id"),
    client.from("course_target_knowledge").select("*").order("course_id").order("knowledge_id")
  ]);
  const [courseRows, curriculumRows, chapterRows, lessonRows, coverageRows, sequenceRows, assignmentRows, assignmentCoverageRows, assignmentDependencyRows, chapterOutcomeRows, assignmentOutcomeRows, finalProjectRows, finalProjectOutcomeRows, materialRows, segmentRows, materialCoverageRows, targetKnowledgeRows] = queries.map((result, index) => dataOrThrow(result.data as Row[] | null, result.error, `Course query ${index + 1}`));
  const signedUrlByPath = new Map<string, string>();
  await Promise.all(materialRows.flatMap((row) => {
    const path = optionalText(row, "storage_path");
    if (!path) return [];
    return [client.storage.from("course-materials").createSignedUrl(path, 3600).then(({ data, error }) => {
      if (error || !data) throw new Error(`Material signed URL failed: ${error?.message ?? path}`);
      signedUrlByPath.set(path, data.signedUrl);
    })];
  }));

  const profileResult = user ? await client.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null, error: null };
  const profile = dataOrThrow(profileResult.data as Row | null, profileResult.error, "Course role lookup");
  const canManage = profile && ["teacher", "admin"].includes(text(profile, "role"));
  const readableCourseRows = canManage ? courseRows : courseRows.filter((row) => text(row, "lifecycle") === "published");
  const runtimes = readableCourseRows.map((courseRow) => {
    const id = text(courseRow, "id");
    const curriculumRow = curriculumRows.find((row) => text(row, "course_id") === id);
    if (!curriculumRow) throw new Error(`Course ${id} has no curriculum`);
    const materials = materialRows.filter((row) => text(row, "course_id") === id).map((row) => {
      const materialId = text(row, "id");
      const path = optionalText(row, "storage_path");
      const pageCount = row.page_count == null ? undefined : number(row, "page_count");
      return {
        id: materialId, courseId: id, lessonId: text(row, "lesson_id"), order: number(row, "display_order"),
        title: text(row, "title"), description: optionalText(row, "description"), type: ["pptx", "docx"].includes(text(row, "material_type")) ? "document" : text(row, "material_type"),
        source: path && pageCount ? { kind: "pdf", url: signedUrlByPath.get(path), pageCount } : undefined,
        duration: optionalText(row, "duration"),
        segments: segmentRows.filter((segment) => text(segment, "course_id") === id && text(segment, "material_id") === materialId).map((segment) => ({
          id: text(segment, "id"), order: number(segment, "display_order"), page: segment.page == null ? undefined : number(segment, "page"),
          title: optionalText(segment, "title"), section: optionalText(segment, "section"), content: segment.content ?? undefined
        }))
      };
    });
    return {
      course: { id, title: text(courseRow, "title"), subtitle: optionalText(courseRow, "subtitle"), description: text(courseRow, "description"), targetOutcome: optionalText(courseRow, "target_outcome"), accentColor: optionalText(courseRow, "accent_color"), generationStatus: text(courseRow, "generation_status"), lifecycle: text(courseRow, "lifecycle"), courseType: (optionalText(courseRow, "course_type") ?? "standard"), ownerUserId: optionalText(courseRow, "owner_user_id"), sourceCourseId: optionalText(courseRow, "source_course_id") },
      curriculum: { id: text(curriculumRow, "id"), courseId: id, generationMode: text(curriculumRow, "generation_mode"), requestedChapterCount: curriculumRow.requested_chapter_count == null ? undefined : number(curriculumRow, "requested_chapter_count"), sourceStructureId: optionalText(curriculumRow, "source_structure_id") },
      chapters: chapterRows.filter((row) => text(row, "course_id") === id).map((row) => ({ id: text(row, "id"), courseId: id, title: text(row, "title"), description: text(row, "description"), order: number(row, "display_order"), color: text(row, "color"), outcome: text(row, "outcome") })),
      lessons: lessonRows.filter((row) => text(row, "course_id") === id).map((row) => ({ id: text(row, "id"), courseId: id, chapterId: text(row, "chapter_id"), title: text(row, "title"), order: number(row, "display_order") })),
      curriculumCoverages: coverageRows.filter((row) => text(row, "course_id") === id).map((row) => ({ id: text(row, "id"), courseId: id, lessonId: text(row, "lesson_id"), nodeId: text(row, "node_id"), role: text(row, "role"), order: number(row, "display_order") })),
      curriculumSequences: sequenceRows.filter((row) => text(row, "course_id") === id).map((row) => ({ id: text(row, "id"), courseId: id, sourceLessonId: text(row, "source_lesson_id"), targetLessonId: text(row, "target_lesson_id") })),
      assignments: assignmentRows.filter((row) => text(row, "course_id") === id).map((row) => ({ id: text(row, "id"), courseId: id, order: number(row, "display_order"), title: text(row, "title"), description: text(row, "description"), requirements: row.requirements, expectedOutput: text(row, "expected_output"), acceptanceCriteria: row.acceptance_criteria, mode: text(row, "mode"), workflowTemplateId: optionalText(row, "workflow_template_id"), estimatedMinutes: row.estimated_minutes == null ? undefined : number(row, "estimated_minutes"), projectContribution: optionalText(row, "project_contribution"), experience: row.experience ?? undefined, inheritedOutputs: row.inherited_outputs ?? [], dependencyRationale: optionalText(row, "dependency_rationale") })),
      assignmentCoverages: assignmentCoverageRows.filter((row) => text(row, "course_id") === id).map((row) => ({ id: text(row, "id"), assignmentId: text(row, "assignment_id"), nodeId: text(row, "node_id"), role: text(row, "role"), required: Boolean(row.required) })),
      assignmentDependencies: assignmentDependencyRows.filter((row) => text(row, "course_id") === id).map((row) => ({ id: text(row, "id"), courseId: id, sourceAssignmentId: text(row, "source_assignment_id"), targetAssignmentId: text(row, "target_assignment_id"), strength: text(row, "strength") })),
      chapterOutcomes: chapterOutcomeRows.filter((row) => text(row, "course_id") === id).map((row) => ({ id: text(row, "id"), courseId: id, chapterId: text(row, "chapter_id"), title: text(row, "title") })),
      assignmentOutcomeCompositions: assignmentOutcomeRows.filter((row) => text(row, "course_id") === id).map((row) => ({ id: text(row, "id"), assignmentId: text(row, "assignment_id"), outcomeId: text(row, "outcome_id") })),
      finalProjects: finalProjectRows.filter((row) => text(row, "course_id") === id).map((row) => ({ id: text(row, "id"), courseId: id, title: text(row, "title"), description: text(row, "description") })),
      finalProjectOutcomeCompositions: finalProjectOutcomeRows.filter((row) => text(row, "course_id") === id).map((row) => ({ id: text(row, "id"), finalProjectId: text(row, "final_project_id"), outcomeId: text(row, "outcome_id") })),
      materials,
      materialKnowledgeCoverages: materialCoverageRows.filter((row) => text(row, "course_id") === id).map((row) => ({ id: text(row, "id"), materialId: text(row, "material_id"), segmentId: text(row, "segment_id"), nodeId: text(row, "node_id"), role: text(row, "role") })),
      targetKnowledge: targetKnowledgeRows.filter((row) => text(row, "course_id") === id).map((row) => ({ courseId: id, nodeId: text(row, "knowledge_id"), required: Boolean(row.required) })),
      revision: text(courseRow, "revision")
    };
  });
  if (courseId) {
    const runtime = runtimes.find((item) => item.course.id === courseId);
    if (!runtime) throw new ApiError(404, "course_not_found", "Course not found");
    json(response, 200, { course: runtime });
    return;
  }
  json(response, 200, { courses: runtimes });
});
