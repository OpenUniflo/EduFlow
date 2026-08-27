import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createOptionalUserSupabase, createServerSupabase, createUserSupabase } from "../_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "../_lib/http.js";
import { dataOrThrow } from "../_lib/query.js";
import { parseAssistantStructuredContent } from "../../src/features/assistant/assistantContract.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
const optionalText = (row: Row, key: string) => row[key] == null ? undefined : String(row[key]);
const number = (row: Row, key: string) => Number(row[key]);

async function validatePersistedCourseForPublish(client: ReturnType<typeof createServerSupabase>, courseId: string) {
  const tables = ["courses", "course_curricula", "curriculum_chapters", "curriculum_lessons", "curriculum_coverages", "course_target_knowledge", "curriculum_sequences", "course_assignments", "assignment_coverages", "assignment_dependencies", "materials", "material_segments", "material_knowledge_coverages"] as const;
  const results = await Promise.all(tables.map((table) => client.from(table).select("*").eq(table === "courses" ? "id" : "course_id", courseId)));
  const rows = new Map(tables.map((table, index) => [table, dataOrThrow(results[index].data as Row[] | null, results[index].error, `Course publish ${table} validation`)]));
  const course = rows.get("courses")![0]; const curricula = rows.get("course_curricula")!; const chapters = rows.get("curriculum_chapters")!; const lessons = rows.get("curriculum_lessons")!; const coverages = rows.get("curriculum_coverages")!;
  if (!course || curricula.length !== 1 || !chapters.length || !lessons.length || !coverages.length) throw new ApiError(422, "course_structure_invalid", "课程结构尚不完整，暂时无法完成创建。");
  const chapterIds = new Set(chapters.map((row) => text(row, "id"))); const lessonIds = new Set(lessons.map((row) => text(row, "id"))); const coveredIds = new Set(coverages.map((row) => text(row, "node_id")));
  if (lessons.some((row) => !chapterIds.has(text(row, "chapter_id"))) || coverages.some((row) => !lessonIds.has(text(row, "lesson_id")))) throw new ApiError(422, "course_structure_invalid", "课程结构包含失效关系，暂时无法完成创建。");
  const knowledgeResult = await client.from("knowledge_nodes").select("id").in("id", [...coveredIds]).eq("status", "active");
  const activeIds = new Set(dataOrThrow(knowledgeResult.data as Row[] | null, knowledgeResult.error, "Course publish Knowledge validation").map((row) => text(row, "id")));
  if (activeIds.size !== coveredIds.size) throw new ApiError(422, "course_knowledge_invalid", "课程包含不可用的学习内容，暂时无法完成创建。");
  const targets = rows.get("course_target_knowledge")!;
  if (optionalText(course, "course_type") === "personal" && (!targets.length || targets.some((row) => !coveredIds.has(text(row, "knowledge_id"))))) throw new ApiError(422, "course_target_invalid", "个人课程的核心目标无效。");
  const assignmentIds = new Set(rows.get("course_assignments")!.map((row) => text(row, "id"))); const materialIds = new Set(rows.get("materials")!.map((row) => text(row, "id"))); const segmentPairs = new Set(rows.get("material_segments")!.map((row) => `${text(row, "material_id")}:${text(row, "id")}`));
  if (rows.get("assignment_coverages")!.some((row) => !assignmentIds.has(text(row, "assignment_id")) || !coveredIds.has(text(row, "node_id")))) throw new ApiError(422, "course_assignment_invalid", "课程实践任务包含失效关系。");
  if (rows.get("material_knowledge_coverages")!.some((row) => !materialIds.has(text(row, "material_id")) || !segmentPairs.has(`${text(row, "material_id")}:${text(row, "segment_id")}`) || !coveredIds.has(text(row, "node_id")))) throw new ApiError(422, "course_material_invalid", "课程学习资料包含失效关系。");
  const dependencyRows = rows.get("assignment_dependencies")!; const dependencies = new Map<string, string[]>();
  dependencyRows.forEach((row) => { const source = text(row, "source_assignment_id"); const target = text(row, "target_assignment_id"); if (!assignmentIds.has(source) || !assignmentIds.has(target) || source === target) throw new ApiError(422, "course_assignment_invalid", "课程实践任务依赖无效。"); dependencies.set(source, [...(dependencies.get(source) ?? []), target]); });
  const visiting = new Set<string>(); const visited = new Set<string>();
  function visit(id: string) { if (visiting.has(id)) throw new ApiError(422, "course_assignment_cycle", "课程实践任务依赖不能形成循环。"); if (visited.has(id)) return; visiting.add(id); (dependencies.get(id) ?? []).forEach(visit); visiting.delete(id); visited.add(id); }
  assignmentIds.forEach(visit);
  const materialCovered = new Set(rows.get("material_knowledge_coverages")!.map((row) => text(row, "node_id"))).size;
  const assignmentCovered = new Set(rows.get("assignment_coverages")!.map((row) => text(row, "node_id"))).size;
  return { valid: true, knowledgeCount: coveredIds.size, materialCovered, assignmentCovered, warnings: { missingMaterial: coveredIds.size - materialCovered, missingAssignment: coveredIds.size - assignmentCovered, microCoverageAvailable: false } };
}

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method === "POST") {
    const { client, user } = await createUserSupabase(request);
    const body = request.body as { title?: string; description?: string; targetOutcome?: string; accentColor?: string; creationBriefMessageId?: string; requirements?: { goal?: string; referenceCourseId?: string }; scope?: { targetKnowledgeIds?: string[]; prerequisiteKnowledgeIds?: string[]; optionalKnowledgeIds?: string[] }; curriculum?: { chapters?: Array<{ id?: string; title?: string; knowledgeIds?: string[] }> } };
    if (body.creationBriefMessageId) {
      const messageResult = await client.from("assistant_messages").select("structured_content,session_id").eq("id", body.creationBriefMessageId).maybeSingle();
      const messageRow = dataOrThrow(messageResult.data as Row | null, messageResult.error, "Course Creation Brief lookup");
      if (!messageRow) throw new ApiError(404, "course_creation_brief_not_found", "Course Creation Brief not found");
      const sessionResult = await client.from("assistant_sessions").select("id").eq("id", text(messageRow, "session_id")).eq("user_id", user.id).maybeSingle();
      if (!dataOrThrow(sessionResult.data as Row | null, sessionResult.error, "Course Creation Brief ownership lookup")) throw new ApiError(404, "course_creation_brief_not_found", "Course Creation Brief not found");
      let brief;
      try { brief = parseAssistantStructuredContent(messageRow.structured_content); }
      catch { throw new ApiError(409, "invalid_course_creation_brief", "Course Creation Brief is invalid"); }
      if (brief?.type !== "course_creation_brief") throw new ApiError(409, "course_creation_brief_required", "The timeline item is not a Course Creation Brief");
      const goal = body.requirements?.goal?.trim() ?? "";
      const targetKnowledgeIds = [...new Set(body.scope?.targetKnowledgeIds ?? [])];
      const prerequisiteKnowledgeIds = [...new Set(body.scope?.prerequisiteKnowledgeIds ?? [])];
      const optionalKnowledgeIds = [...new Set(body.scope?.optionalKnowledgeIds ?? [])];
      const scopeIds = [...new Set([...prerequisiteKnowledgeIds, ...optionalKnowledgeIds, ...targetKnowledgeIds])];
      const chapters = body.curriculum?.chapters ?? [];
      if (!goal || goal.length > 1000 || !targetKnowledgeIds.length || !chapters.length || chapters.length > 20) throw new ApiError(400, "invalid_course_creator_design", "Confirmed requirements, target Knowledge, and curriculum Chapters are required");
      const placedIds = chapters.flatMap((chapter) => Array.isArray(chapter.knowledgeIds) ? chapter.knowledgeIds : []);
      if (placedIds.length !== new Set(placedIds).size || placedIds.length !== scopeIds.length || scopeIds.some((id) => !placedIds.includes(id))) throw new ApiError(400, "invalid_course_creator_structure", "Curriculum placement must contain every scoped Knowledge exactly once");
      if (chapters.some((chapter) => !chapter.title?.trim() || !chapter.knowledgeIds?.length)) throw new ApiError(400, "invalid_course_creator_structure", "Every Chapter requires a title and Knowledge placement");
      const [knowledgeResult, edgeResult] = await Promise.all([
        client.from("knowledge_nodes").select("id").in("id", scopeIds).eq("status", "active"),
        client.from("knowledge_edges").select("source_node_id,target_node_id,relation").eq("relation", "prerequisite").eq("lifecycle_status", "active")
      ]);
      const visibleIds = new Set(dataOrThrow(knowledgeResult.data as Row[] | null, knowledgeResult.error, "Course Creator Knowledge validation").map((row) => text(row, "id")));
      if (visibleIds.size !== scopeIds.length) throw new ApiError(422, "course_creator_knowledge_unavailable", "Course scope includes unavailable Knowledge");
      const edgeRows = dataOrThrow(edgeResult.data as Row[] | null, edgeResult.error, "Course Creator prerequisite validation");
      const byTarget = new Map<string, string[]>();
      edgeRows.forEach((row) => byTarget.set(text(row, "target_node_id"), [...(byTarget.get(text(row, "target_node_id")) ?? []), text(row, "source_node_id")]));
      const factual = new Set<string>();
      function visit(nodeId: string, visiting = new Set<string>()) {
        if (visiting.has(nodeId)) return;
        const next = new Set(visiting); next.add(nodeId);
        (byTarget.get(nodeId) ?? []).forEach((sourceId) => { factual.add(sourceId); visit(sourceId, next); });
      }
      targetKnowledgeIds.forEach((id) => visit(id));
      if (prerequisiteKnowledgeIds.some((id) => !factual.has(id))) throw new ApiError(422, "invalid_course_creator_prerequisite", "Prerequisite labels must come from factual KnowledgeEdges");
      if ([...factual].some((id) => !targetKnowledgeIds.includes(id) && !prerequisiteKnowledgeIds.includes(id))) throw new ApiError(422, "incomplete_course_creator_prerequisite", "Course scope must include the factual prerequisite closure");
      const sourceCourseId = body.requirements?.referenceCourseId?.trim() || brief.sourceCourseId;
      if (sourceCourseId !== brief.sourceCourseId) throw new ApiError(422, "invalid_course_creator_reference", "Reference Course must come from the owned Course Creation Brief");
      const result = await createServerSupabase().rpc("create_personal_course_draft_for_brief", {
        p_owner_user_id: user.id, p_creation_brief_message_id: body.creationBriefMessageId, p_goal_text: goal, p_source_course_id: sourceCourseId ?? null,
        p_target_knowledge_ids: targetKnowledgeIds,
        p_chapters: chapters.map((chapter) => ({ title: chapter.title!.trim(), knowledgeIds: chapter.knowledgeIds }))
      });
      const rows = dataOrThrow(result.data as Row[] | null, result.error, "Personal Course Draft creation");
      if (!rows[0]) throw new ApiError(500, "course_draft_creation_failed", "Course Draft was not created");
      json(response, 201, { courseId: text(rows[0], "course_id"), lifecycle: text(rows[0], "lifecycle") }); return;
    }
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
    const [profile, courseResult] = await Promise.all([
      client.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      client.from("courses").select("id,lifecycle,course_type,owner_user_id").eq("id", body.courseId).maybeSingle()
    ]);
    const profileRow = dataOrThrow(profile.data as Row | null, profile.error, "Course lifecycle role lookup");
    const courseRow = dataOrThrow(courseResult.data as Row | null, courseResult.error, "Course lifecycle ownership lookup");
    if (!courseRow) throw new ApiError(404, "course_not_found", "Course not found");
    const manager = Boolean(profileRow && ["teacher", "admin"].includes(text(profileRow, "role")));
    const courseType = optionalText(courseRow, "course_type") ?? "standard";
    const personalOwner = courseType === "personal" && optionalText(courseRow, "owner_user_id") === user.id;
    if (!(manager && courseType === "standard") && !personalOwner) throw new ApiError(403, "course_lifecycle_forbidden", "Course lifecycle permission is required");
    const server = createServerSupabase();
    if (body.lifecycle === "published") await validatePersistedCourseForPublish(server, body.courseId);
    const write = await server.from("courses").update({ lifecycle: body.lifecycle, generation_status: body.lifecycle === "published" ? "ready" : undefined, updated_at: new Date().toISOString() }).eq("id", body.courseId).select("id,lifecycle").maybeSingle();
    const row = dataOrThrow(write.data as Row | null, write.error, "Course lifecycle update");
    if (!row) throw new ApiError(404, "course_not_found", "Course not found");
    if (body.lifecycle === "published" && personalOwner) {
      const membership = await server.from("user_course_states").upsert({ user_id: user.id, course_id: body.courseId, is_active: true, updated_at: new Date().toISOString() });
      dataOrThrow(membership.data, membership.error, "Personal Course membership activation");
    }
    json(response, 200, { courseId: text(row, "id"), lifecycle: text(row, "lifecycle") }); return;
  }
  if (request.method !== "GET") return methodNotAllowed(response, ["GET", "POST", "PATCH"]);
  const publishCheckCourseId = typeof request.query.publishCheckCourseId === "string" ? request.query.publishCheckCourseId : undefined;
  if (publishCheckCourseId) {
    const { client, user } = await createUserSupabase(request);
    const courseResult = await client.from("courses").select("id,course_type,owner_user_id").eq("id", publishCheckCourseId).maybeSingle();
    const course = dataOrThrow(courseResult.data as Row | null, courseResult.error, "Course publish check ownership");
    if (!course || (optionalText(course, "course_type") === "personal" && optionalText(course, "owner_user_id") !== user.id)) throw new ApiError(404, "course_not_found", "Course not found");
    json(response, 200, { validation: await validatePersistedCourseForPublish(createServerSupabase(), publishCheckCourseId) });
    return;
  }
  const { client, user } = await createOptionalUserSupabase(request);
  const courseId = typeof request.query.id === "string" ? request.query.id : undefined;
  const creationBriefMessageId = typeof request.query.creationBriefMessageId === "string" ? request.query.creationBriefMessageId : undefined;
  if (creationBriefMessageId && !user) throw new ApiError(401, "authentication_required", "Authentication is required");
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
  const readableCourseRows = canManage ? courseRows : courseRows.filter((row) => text(row, "lifecycle") === "published" || (user && text(row, "course_type") === "personal" && optionalText(row, "owner_user_id") === user.id));
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
  if (creationBriefMessageId) {
    const ownedRow = readableCourseRows.find((row) => optionalText(row, "creation_brief_message_id") === creationBriefMessageId && optionalText(row, "owner_user_id") === user!.id);
    const runtime = ownedRow ? runtimes.find((item) => item.course.id === text(ownedRow, "id")) : undefined;
    if (!runtime) throw new ApiError(404, "course_creation_not_found", "No Course has been created from this Brief");
    json(response, 200, { course: runtime, courseId: runtime.course.id, lifecycle: runtime.course.lifecycle });
    return;
  }
  json(response, 200, { courses: runtimes });
});
