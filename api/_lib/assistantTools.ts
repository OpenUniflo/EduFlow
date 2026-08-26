import type { SupabaseClient, User } from "@supabase/supabase-js";
import { tool } from "ai";
import { z } from "zod";
import type { AssistantContextSnapshot } from "../../src/features/assistant/assistantContract.js";
import { dataOrThrow } from "./query.js";
import { planLearningGoal } from "./goalPlanningService.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
const optionalText = (row: Row, key: string) => row[key] == null ? undefined : String(row[key]);
const limitText = (value: unknown, length = 1200) => typeof value === "string" ? value.slice(0, length) : value;

async function roleFor(client: SupabaseClient, user: User) {
  const result = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return String(dataOrThrow(result.data as Row | null, result.error, "Assistant profile lookup")?.role ?? "student");
}

async function readableCourse(client: SupabaseClient, user: User, courseId: string) {
  const result = await client.from("courses").select("id,title,subtitle,description,target_outcome,lifecycle,generation_status").eq("id", courseId).maybeSingle();
  const course = dataOrThrow(result.data as Row | null, result.error, "Assistant Course lookup");
  if (!course) return null;
  if (text(course, "lifecycle") === "published" || ["teacher", "admin"].includes(await roleFor(client, user))) return course;
  return null;
}

async function searchKnowledge(client: SupabaseClient, query: string) {
  const result = await client.from("knowledge_nodes").select("id,title,description,node_type,scope,status,tags").eq("status", "active").limit(300);
  const rows = dataOrThrow(result.data as Row[] | null, result.error, "Assistant Knowledge search");
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.map((row) => {
    const haystack = [row.title, row.description, ...(Array.isArray(row.tags) ? row.tags : [])].join(" ").toLocaleLowerCase();
    return { row, score: terms.reduce((sum, term) => sum + (String(row.title).toLocaleLowerCase().includes(term) ? 3 : haystack.includes(term) ? 1 : 0), 0) };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || text(a.row, "id").localeCompare(text(b.row, "id"))).slice(0, 8).map(({ row }) => ({
    id: text(row, "id"), title: text(row, "title"), description: limitText(row.description, 500), type: text(row, "node_type"), scope: text(row, "scope")
  }));
}

async function getKnowledge(client: SupabaseClient, nodeId: string) {
  const nodeResult = await client.from("knowledge_nodes").select("id,title,description,node_type,scope,status,mastery_criteria,tags").eq("id", nodeId).eq("status", "active").maybeSingle();
  const node = dataOrThrow(nodeResult.data as Row | null, nodeResult.error, "Assistant Knowledge lookup");
  if (!node) return null;
  return { id: text(node, "id"), title: text(node, "title"), description: limitText(node.description), type: text(node, "node_type"), scope: text(node, "scope"), masteryCriteria: node.mastery_criteria, tags: node.tags ?? [] };
}

async function getKnowledgeNeighbors(client: SupabaseClient, nodeId: string) {
  if (!await getKnowledge(client, nodeId)) return null;
  const edgeResult = await client.from("knowledge_edges").select("id,source_node_id,target_node_id,relation,reason,prerequisite_strength,associative_strength").or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`).eq("lifecycle_status", "active").limit(60);
  const edges = dataOrThrow(edgeResult.data as Row[] | null, edgeResult.error, "Assistant Knowledge neighbor lookup");
  const ids = [...new Set(edges.flatMap((edge) => [text(edge, "source_node_id"), text(edge, "target_node_id")]).filter((id) => id !== nodeId))];
  const nodeResult = ids.length ? await client.from("knowledge_nodes").select("id,title").in("id", ids).eq("status", "active") : { data: [], error: null };
  const nodes = dataOrThrow(nodeResult.data as Row[] | null, nodeResult.error, "Assistant neighbor node lookup");
  const titleById = new Map(nodes.map((node) => [text(node, "id"), text(node, "title")]));
  return edges.filter((edge) => titleById.has(text(edge, "source_node_id") === nodeId ? text(edge, "target_node_id") : text(edge, "source_node_id"))).map((edge) => ({
    id: text(edge, "id"), sourceId: text(edge, "source_node_id"), sourceTitle: text(edge, "source_node_id") === nodeId ? undefined : titleById.get(text(edge, "source_node_id")),
    targetId: text(edge, "target_node_id"), targetTitle: text(edge, "target_node_id") === nodeId ? undefined : titleById.get(text(edge, "target_node_id")), relation: text(edge, "relation"), reason: limitText(edge.reason, 500)
  }));
}

async function searchCourses(client: SupabaseClient, user: User, query: string) {
  const result = await client.from("courses").select("id,title,subtitle,description,target_outcome,lifecycle,generation_status").limit(200);
  let rows = dataOrThrow(result.data as Row[] | null, result.error, "Assistant Course search");
  if (!["teacher", "admin"].includes(await roleFor(client, user))) rows = rows.filter((row) => text(row, "lifecycle") === "published");
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.map((row) => ({ row, score: terms.reduce((sum, term) => sum + ([row.title, row.subtitle, row.description, row.target_outcome].join(" ").toLocaleLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || text(a.row, "id").localeCompare(text(b.row, "id"))).slice(0, 8)
    .map(({ row }) => ({ id: text(row, "id"), title: text(row, "title"), description: limitText(row.description, 500), targetOutcome: optionalText(row, "target_outcome"), lifecycle: text(row, "lifecycle") }));
}

async function getCourseContext(client: SupabaseClient, user: User, courseId: string, knowledgeId?: string) {
  const course = await readableCourse(client, user, courseId);
  if (!course) return null;
  const [chaptersResult, lessonsResult, coverageResult, sequenceResult] = await Promise.all([
    client.from("curriculum_chapters").select("id,title,description,display_order,outcome").eq("course_id", courseId).order("display_order"),
    client.from("curriculum_lessons").select("id,chapter_id,title,display_order").eq("course_id", courseId).order("display_order"),
    client.from("curriculum_coverages").select("id,lesson_id,node_id,role,display_order").eq("course_id", courseId).order("display_order"),
    client.from("curriculum_sequences").select("id,source_lesson_id,target_lesson_id").eq("course_id", courseId)
  ]);
  const chapters = dataOrThrow(chaptersResult.data as Row[] | null, chaptersResult.error, "Assistant Chapter lookup");
  const lessons = dataOrThrow(lessonsResult.data as Row[] | null, lessonsResult.error, "Assistant Lesson lookup");
  let coverages = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Assistant CurriculumCoverage lookup");
  const sequences = dataOrThrow(sequenceResult.data as Row[] | null, sequenceResult.error, "Assistant CurriculumSequence lookup");
  if (knowledgeId) coverages = coverages.filter((coverage) => text(coverage, "node_id") === knowledgeId);
  const nodeIds = [...new Set(coverages.map((coverage) => text(coverage, "node_id")))].slice(0, 100);
  const nodesResult = nodeIds.length ? await client.from("knowledge_nodes").select("id,title,description,status").in("id", nodeIds).eq("status", "active") : { data: [], error: null };
  const nodes = dataOrThrow(nodesResult.data as Row[] | null, nodesResult.error, "Assistant Course Knowledge lookup");
  return {
    course: { id: text(course, "id"), title: text(course, "title"), description: limitText(course.description), targetOutcome: optionalText(course, "target_outcome"), lifecycle: text(course, "lifecycle") },
    chapters: chapters.map((row) => ({ id: text(row, "id"), title: text(row, "title"), order: Number(row.display_order), outcome: optionalText(row, "outcome") })),
    lessons: lessons.map((row) => ({ id: text(row, "id"), chapterId: text(row, "chapter_id"), title: text(row, "title"), order: Number(row.display_order) })),
    curriculumCoverage: coverages.slice(0, 100).map((row) => ({ lessonId: text(row, "lesson_id"), nodeId: text(row, "node_id"), role: text(row, "role"), order: Number(row.display_order) })),
    knowledge: nodes.map((row) => ({ id: text(row, "id"), title: text(row, "title"), description: limitText(row.description, 500) })),
    curriculumSequence: sequences.map((row) => ({ sourceLessonId: text(row, "source_lesson_id"), targetLessonId: text(row, "target_lesson_id"), relationKind: "curriculum-sequence-not-knowledge-edge" }))
  };
}

async function getMaterialContext(client: SupabaseClient, user: User, courseId: string, materialId: string, segmentId?: string) {
  if (!await readableCourse(client, user, courseId)) return null;
  const materialResult = await client.from("materials").select("id,course_id,lesson_id,title,description,material_type").eq("course_id", courseId).eq("id", materialId).maybeSingle();
  const material = dataOrThrow(materialResult.data as Row | null, materialResult.error, "Assistant Material lookup");
  if (!material) return null;
  let segmentQuery = client.from("material_segments").select("id,display_order,page,title,section,content").eq("course_id", courseId).eq("material_id", materialId).order("display_order");
  if (segmentId) segmentQuery = segmentQuery.eq("id", segmentId);
  const segmentResult = await segmentQuery.limit(segmentId ? 1 : 12);
  const segments = dataOrThrow(segmentResult.data as Row[] | null, segmentResult.error, "Assistant MaterialSegment lookup");
  if (segmentId && !segments.length) return null;
  const ids = segments.map((segment) => text(segment, "id"));
  const coverageResult = ids.length ? await client.from("material_knowledge_coverages").select("segment_id,node_id,role").eq("course_id", courseId).eq("material_id", materialId).in("segment_id", ids) : { data: [], error: null };
  const coverage = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Assistant MaterialKnowledgeCoverage lookup");
  const nodeIds = [...new Set(coverage.map((row) => text(row, "node_id")))];
  const nodesResult = nodeIds.length ? await client.from("knowledge_nodes").select("id,title,description").in("id", nodeIds).eq("status", "active") : { data: [], error: null };
  const nodes = dataOrThrow(nodesResult.data as Row[] | null, nodesResult.error, "Assistant Material Knowledge lookup");
  return {
    material: { id: text(material, "id"), courseId, lessonId: text(material, "lesson_id"), title: text(material, "title"), description: optionalText(material, "description"), type: text(material, "material_type") },
    segments: segments.map((row) => ({ id: text(row, "id"), order: Number(row.display_order), page: row.page == null ? undefined : Number(row.page), title: optionalText(row, "title"), section: optionalText(row, "section"), contentExcerpt: row.content == null ? undefined : JSON.stringify(row.content).slice(0, 6_000) })),
    knowledgeCoverage: coverage.map((row) => ({ segmentId: text(row, "segment_id"), nodeId: text(row, "node_id"), role: text(row, "role") })),
    knowledge: nodes.map((row) => ({ id: text(row, "id"), title: text(row, "title"), description: limitText(row.description, 500) }))
  };
}

async function searchMaterialContent(client: SupabaseClient, user: User, courseId: string, materialId: string, query: string) {
  if (!await readableCourse(client, user, courseId)) return null;
  const material = await client.from("materials").select("id,title").eq("course_id", courseId).eq("id", materialId).maybeSingle();
  const materialRow = dataOrThrow(material.data as Row | null, material.error, "Assistant Material search ownership lookup");
  if (!materialRow) return null;
  const result = await client.from("material_segments").select("id,display_order,page,title,section,content").eq("course_id", courseId).eq("material_id", materialId).order("display_order").limit(500);
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return dataOrThrow(result.data as Row[] | null, result.error, "Assistant Material content search").map((row) => {
    const serialized = [row.title, row.section, JSON.stringify(row.content ?? "")].join(" ");
    const haystack = serialized.toLocaleLowerCase();
    return { row, serialized, score: terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0) };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || Number(a.row.display_order) - Number(b.row.display_order)).slice(0, 8).map(({ row, serialized }) => ({ id: text(row, "id"), order: Number(row.display_order), page: row.page == null ? undefined : Number(row.page), title: optionalText(row, "title"), excerpt: serialized.slice(0, 1_500) }));
}

async function getAssignmentContext(client: SupabaseClient, user: User, courseId: string, assignmentId: string) {
  if (!await readableCourse(client, user, courseId)) return null;
  const assignmentResult = await client.from("course_assignments").select("id,title,description,requirements,expected_output,acceptance_criteria,mode,workflow_template_id,estimated_minutes").eq("course_id", courseId).eq("id", assignmentId).maybeSingle();
  const assignment = dataOrThrow(assignmentResult.data as Row | null, assignmentResult.error, "Assistant Assignment lookup");
  if (!assignment) return null;
  const [coverageResult, dependencyResult] = await Promise.all([
    client.from("assignment_coverages").select("node_id,role,required").eq("course_id", courseId).eq("assignment_id", assignmentId),
    client.from("assignment_dependencies").select("source_assignment_id,strength").eq("course_id", courseId).eq("target_assignment_id", assignmentId)
  ]);
  const coverage = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Assistant AssignmentCoverage lookup");
  const dependencies = dataOrThrow(dependencyResult.data as Row[] | null, dependencyResult.error, "Assistant AssignmentDependency lookup");
  const nodeIds = coverage.map((row) => text(row, "node_id"));
  const nodesResult = nodeIds.length ? await client.from("knowledge_nodes").select("id,title").in("id", nodeIds).eq("status", "active") : { data: [], error: null };
  const nodes = dataOrThrow(nodesResult.data as Row[] | null, nodesResult.error, "Assistant Assignment Knowledge lookup");
  return { assignment: { id: text(assignment, "id"), courseId, title: text(assignment, "title"), description: limitText(assignment.description), requirements: assignment.requirements, expectedOutput: text(assignment, "expected_output"), acceptanceCriteria: assignment.acceptance_criteria, mode: text(assignment, "mode"), workflowTemplateId: optionalText(assignment, "workflow_template_id"), estimatedMinutes: assignment.estimated_minutes == null ? undefined : Number(assignment.estimated_minutes) }, knowledgeCoverage: coverage, knowledge: nodes, directAssignmentDependencies: dependencies, distinction: "AssignmentDependency is a course teaching/execution prerequisite and is not a KnowledgeEdge." };
}

async function getMicroContext(client: SupabaseClient, pathId: string, unitId?: string, stepId?: string) {
  const pathResult = await client.from("micro_learning_paths").select("id,knowledge_id,course_id,scope,title,description,mode,estimated_minutes,required,status").eq("id", pathId).eq("status", "published").maybeSingle();
  const path = dataOrThrow(pathResult.data as Row | null, pathResult.error, "Assistant Micro path lookup");
  if (!path) return null;
  const unitsResult = await client.from("micro_units").select("id,title,description,position,estimated_minutes,required").eq("path_id", pathId).order("position");
  let units = dataOrThrow(unitsResult.data as Row[] | null, unitsResult.error, "Assistant Micro unit lookup");
  if (unitId) units = units.filter((unit) => text(unit, "id") === unitId);
  const unitIds = units.map((unit) => text(unit, "id"));
  const stepsResult = unitIds.length ? await client.from("micro_steps").select("id,unit_id,position,kind,title,content,success_feedback,retry_feedback").in("unit_id", unitIds).order("position") : { data: [], error: null };
  let steps = dataOrThrow(stepsResult.data as Row[] | null, stepsResult.error, "Assistant Micro step lookup");
  if (stepId) steps = steps.filter((step) => text(step, "id") === stepId);
  if ((unitId && !units.length) || (stepId && !steps.length)) return null;
  return { path: { id: text(path, "id"), knowledgeId: text(path, "knowledge_id"), courseId: optionalText(path, "course_id"), title: text(path, "title"), description: optionalText(path, "description"), mode: text(path, "mode") }, units, steps: steps.map((step) => ({ id: text(step, "id"), unitId: text(step, "unit_id"), position: Number(step.position), kind: text(step, "kind"), title: text(step, "title"), content: limitText(step.content, 2_000), successFeedback: optionalText(step, "success_feedback"), retryFeedback: optionalText(step, "retry_feedback") })), integrity: "Assistant explanations and hints do not mutate answers, grading, or completion." };
}

async function getLearnerState(client: SupabaseClient, user: User, nodeId?: string, courseId?: string) {
  let knowledgeQuery = client.from("user_knowledge_states").select("node_id,status,mastery,mastery_origin,updated_at").eq("user_id", user.id);
  if (nodeId) knowledgeQuery = knowledgeQuery.eq("node_id", nodeId);
  let courseQuery = client.from("user_course_states").select("course_id,is_active,recent_lesson_id,updated_at").eq("user_id", user.id);
  if (courseId) courseQuery = courseQuery.eq("course_id", courseId);
  const [knowledgeResult, courseResult] = await Promise.all([knowledgeQuery.limit(100), courseQuery.limit(100)]);
  return {
    knowledgeStates: dataOrThrow(knowledgeResult.data as Row[] | null, knowledgeResult.error, "Assistant learner Knowledge lookup").map((row) => ({ nodeId: text(row, "node_id"), status: text(row, "status"), mastery: row.mastery == null ? undefined : Number(row.mastery), updatedAt: text(row, "updated_at") })),
    courseStates: dataOrThrow(courseResult.data as Row[] | null, courseResult.error, "Assistant learner Course lookup").map((row) => ({ courseId: text(row, "course_id"), isActive: Boolean(row.is_active), recentLessonId: optionalText(row, "recent_lesson_id"), updatedAt: text(row, "updated_at") })),
    distinction: "Course progress/membership and Learner Knowledge state are separate product facts."
  };
}

function safe<T>(execute: () => Promise<T>) {
  return execute().catch((error) => ({ error: { code: "tool_failed", message: error instanceof Error ? error.message : "Tool failed" } }));
}

export function createAssistantTools(client: SupabaseClient, user: User, context: AssistantContextSnapshot) {
  const id = z.string().trim().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
  return {
    planLearningGoal: tool({ description: "Resolve a learner Goal to real visible Knowledge, factual prerequisite closure, and deterministic existing-Course coverage/gaps. You may first search Knowledge and suggest candidate IDs, but this tool revalidates every ID. This tool never creates a Course or chooses a formal Next Action.", inputSchema: z.object({ goalText: z.string().trim().min(1).max(1000), candidateKnowledgeIds: z.array(id).max(20).optional() }), execute: ({ goalText, candidateKnowledgeIds }: { goalText: string; candidateKnowledgeIds?: string[] }) => safe(() => planLearningGoal(client, goalText, candidateKnowledgeIds)) }),
    searchKnowledge: tool({ description: "Search visible active EduFlow Knowledge by title, description, or tags.", inputSchema: z.object({ query: z.string().trim().min(1).max(300) }), execute: ({ query }: { query: string }) => safe(() => searchKnowledge(client, query)) }),
    getKnowledge: tool({ description: "Read one visible active KnowledgeNode by stable ID.", inputSchema: z.object({ nodeId: id }), execute: ({ nodeId }: { nodeId: string }) => safe(() => getKnowledge(client, nodeId)) }),
    getKnowledgeNeighbors: tool({ description: "Read factual prerequisite, enables, and related KnowledgeEdges for one visible KnowledgeNode.", inputSchema: z.object({ nodeId: id }), execute: ({ nodeId }: { nodeId: string }) => safe(() => getKnowledgeNeighbors(client, nodeId)) }),
    searchCourses: tool({ description: "Search Courses readable by the authenticated user.", inputSchema: z.object({ query: z.string().trim().min(1).max(300) }), execute: ({ query }: { query: string }) => safe(() => searchCourses(client, user, query)) }),
    getCourseContext: tool({ description: "Read a Course route, curriculum order, and covered Knowledge. CurriculumSequence is explicitly not a KnowledgeEdge.", inputSchema: z.object({ courseId: id, knowledgeId: id.optional() }), execute: ({ courseId, knowledgeId }: { courseId: string; knowledgeId?: string }) => safe(() => getCourseContext(client, user, courseId, knowledgeId)) }),
    getMaterialContext: tool({ description: "Read a Course-owned Material and optional current Segment with authoritative MaterialKnowledgeCoverage.", inputSchema: z.object({ courseId: id, materialId: id, segmentId: id.optional() }), execute: ({ courseId, materialId, segmentId }: { courseId: string; materialId: string; segmentId?: string }) => safe(() => getMaterialContext(client, user, courseId, materialId, segmentId)) }),
    searchMaterialContent: tool({ description: "Deterministically search content inside one readable Course Material without vector search.", inputSchema: z.object({ courseId: id, materialId: id, query: z.string().trim().min(1).max(300) }), execute: ({ courseId, materialId, query }: { courseId: string; materialId: string; query: string }) => safe(() => searchMaterialContent(client, user, courseId, materialId, query)) }),
    getAssignmentContext: tool({ description: "Read one Course-owned Assignment, its Knowledge coverage, and direct Assignment dependencies.", inputSchema: z.object({ courseId: id, assignmentId: id }), execute: ({ courseId, assignmentId }: { courseId: string; assignmentId: string }) => safe(() => getAssignmentContext(client, user, courseId, assignmentId)) }),
    getMicroContext: tool({ description: "Read a published Micro Learning path and optional current Unit/Step for explanation or hints only.", inputSchema: z.object({ pathId: id, unitId: id.optional(), stepId: id.optional() }), execute: ({ pathId, unitId, stepId }: { pathId: string; unitId?: string; stepId?: string }) => safe(() => getMicroContext(client, pathId, unitId, stepId)) }),
    getLearnerState: tool({ description: "Read only the authenticated learner's real Knowledge and Course state.", inputSchema: z.object({ nodeId: id.optional(), courseId: id.optional() }), execute: ({ nodeId, courseId }: { nodeId?: string; courseId?: string }) => safe(() => getLearnerState(client, user, nodeId, courseId)) }),
    getCurrentContext: tool({ description: "Resolve the current page's explicit EduFlow entity identities using authoritative product data.", inputSchema: z.object({}), execute: () => safe(async () => ({
      identity: context,
      knowledge: context.knowledgeId ? await getKnowledge(client, context.knowledgeId) : undefined,
      course: context.courseId ? await getCourseContext(client, user, context.courseId, context.knowledgeId) : undefined,
      material: context.courseId && context.materialId ? await getMaterialContext(client, user, context.courseId, context.materialId, context.segmentId) : undefined,
      assignment: context.courseId && context.assignmentId ? await getAssignmentContext(client, user, context.courseId, context.assignmentId) : undefined,
      micro: context.microPathId ? await getMicroContext(client, context.microPathId, context.microUnitId, context.microStepId) : undefined,
      learner: await getLearnerState(client, user, context.knowledgeId, context.courseId)
    })) })
  };
}
