import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AssistantContextSnapshot } from "../../src/features/assistant/assistantContract.js";
import { allRows, dataOrThrow } from "./query.js";
import { planLearningGoal } from "./goalPlanningService.js";
import { resolveGoalPlan, type GoalLanguageResolver } from "./goalPlanResolution.js";
import { readNavigationDecision } from "./navigationDecision.js";
import { ApiError } from "./http.js";
import { summarizeAssignmentAttempts, type PerformanceOutcome } from "../../src/shared/learning/assignmentAttempt.js";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
const optionalText = (row: Row, key: string) => row[key] == null ? undefined : String(row[key]);
const limitText = (value: unknown, length = 1200) => typeof value === "string" ? value.slice(0, length) : value;

export async function roleFor(client: SupabaseClient, user: User) {
  const result = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return String(dataOrThrow(result.data as Row | null, result.error, "Assistant profile lookup")?.role ?? "student");
}

export async function readableCourse(client: SupabaseClient, user: User, courseId: string) {
  const result = await client.from("courses").select("id,title,subtitle,description,target_outcome,lifecycle,generation_status").eq("id", courseId).maybeSingle();
  const course = dataOrThrow(result.data as Row | null, result.error, "Assistant Course lookup");
  if (!course) return null;
  if (text(course, "lifecycle") === "published" || ["teacher", "admin"].includes(await roleFor(client, user))) return course;
  return null;
}

export async function microDisplayTitles(client: SupabaseClient, nodeIds: string[], courseId?: string) {
  const ids = [...new Set(nodeIds.filter(Boolean))];
  const titles = new Map<string, string>();
  if (!ids.length) return titles;
  const result = await client.from("micro_learning_paths")
    .select("knowledge_id,title,course_id")
    .eq("status", "published")
    .eq("mode", "learn")
    .limit(2000);
  const allRows = dataOrThrow(result.data as Row[] | null, result.error, "Assistant Micro display titles");
  const rows = allRows.filter((row) => ids.includes(text(row, "knowledge_id")));
  for (const id of ids) {
    const matches = rows.filter((row) => text(row, "knowledge_id") === id);
    const preferred = (courseId ? matches.find((row) => text(row, "course_id") === courseId) : undefined)
      ?? matches.find((row) => row.course_id == null)
      ?? matches[0];
    if (preferred) titles.set(id, text(preferred, "title"));
  }
  return titles;
}

export async function searchKnowledge(client: SupabaseClient, query: string) {
  const result = await client.from("knowledge_nodes").select("id,title,description,node_type,scope,status,tags").eq("status", "active").limit(300);
  const rows = dataOrThrow(result.data as Row[] | null, result.error, "Assistant Knowledge search");
  const displayTitles = await microDisplayTitles(client, rows.map((row) => text(row, "id")));
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.map((row) => {
    const haystack = [row.title, row.description, ...(Array.isArray(row.tags) ? row.tags : [])].join(" ").toLocaleLowerCase();
    return { row, score: terms.reduce((sum, term) => sum + (String(row.title).toLocaleLowerCase().includes(term) ? 3 : haystack.includes(term) ? 1 : 0), 0) };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || text(a.row, "id").localeCompare(text(b.row, "id"))).slice(0, 8).map(({ row }) => ({
    id: text(row, "id"), title: displayTitles.get(text(row, "id")) ?? text(row, "title"), formalTitle: text(row, "title"), description: limitText(row.description, 500), type: text(row, "node_type"), scope: text(row, "scope")
  }));
}

export async function getKnowledge(client: SupabaseClient, nodeId: string) {
  const nodeResult = await client.from("knowledge_nodes").select("id,title,description,node_type,scope,status,mastery_criteria,tags").eq("id", nodeId).eq("status", "active").maybeSingle();
  const node = dataOrThrow(nodeResult.data as Row | null, nodeResult.error, "Assistant Knowledge lookup");
  if (!node) return null;
  const displayTitle = (await microDisplayTitles(client, [nodeId])).get(nodeId) ?? text(node, "title");
  return { id: text(node, "id"), title: displayTitle, formalTitle: text(node, "title"), description: limitText(node.description), type: text(node, "node_type"), scope: text(node, "scope"), masteryCriteria: node.mastery_criteria, tags: node.tags ?? [] };
}

export async function getKnowledgeNeighbors(client: SupabaseClient, nodeId: string) {
  if (!await getKnowledge(client, nodeId)) return null;
  const edgeResult = await client.from("knowledge_edges").select("id,source_node_id,target_node_id,relation,reason,prerequisite_strength,associative_strength").or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`).eq("lifecycle_status", "active").limit(60);
  const edges = dataOrThrow(edgeResult.data as Row[] | null, edgeResult.error, "Assistant Knowledge neighbor lookup");
  const ids = [...new Set(edges.flatMap((edge) => [text(edge, "source_node_id"), text(edge, "target_node_id")]).filter((id) => id !== nodeId))];
  const nodeResult = ids.length ? await client.from("knowledge_nodes").select("id,title").in("id", ids).eq("status", "active") : { data: [], error: null };
  const nodes = dataOrThrow(nodeResult.data as Row[] | null, nodeResult.error, "Assistant neighbor node lookup");
  const displayTitles = await microDisplayTitles(client, nodes.map((node) => text(node, "id")));
  const titleById = new Map(nodes.map((node) => [text(node, "id"), displayTitles.get(text(node, "id")) ?? text(node, "title")]));
  return edges.filter((edge) => titleById.has(text(edge, "source_node_id") === nodeId ? text(edge, "target_node_id") : text(edge, "source_node_id"))).map((edge) => ({
    id: text(edge, "id"), sourceId: text(edge, "source_node_id"), sourceTitle: text(edge, "source_node_id") === nodeId ? undefined : titleById.get(text(edge, "source_node_id")),
    targetId: text(edge, "target_node_id"), targetTitle: text(edge, "target_node_id") === nodeId ? undefined : titleById.get(text(edge, "target_node_id")), relation: text(edge, "relation"), reason: limitText(edge.reason, 500)
  }));
}

export async function searchCourses(client: SupabaseClient, user: User, query: string) {
  const result = await client.from("courses").select("id,title,subtitle,description,target_outcome,lifecycle,generation_status").limit(200);
  let rows = dataOrThrow(result.data as Row[] | null, result.error, "Assistant Course search");
  if (!["teacher", "admin"].includes(await roleFor(client, user))) rows = rows.filter((row) => text(row, "lifecycle") === "published");
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.map((row) => ({ row, score: terms.reduce((sum, term) => sum + ([row.title, row.subtitle, row.description, row.target_outcome].join(" ").toLocaleLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || text(a.row, "id").localeCompare(text(b.row, "id"))).slice(0, 8)
    .map(({ row }) => ({ id: text(row, "id"), title: text(row, "title"), description: limitText(row.description, 500), targetOutcome: optionalText(row, "target_outcome"), lifecycle: text(row, "lifecycle") }));
}

export async function getCourseContext(client: SupabaseClient, user: User, courseId: string, knowledgeId?: string) {
  const course = await readableCourse(client, user, courseId);
  if (!course) return null;
  const [chaptersResult, lessonsResult, coverageResult, sequenceResult, assignmentsResult] = await Promise.all([
    client.from("curriculum_chapters").select("id,title,description,display_order,outcome").eq("course_id", courseId).order("display_order"),
    client.from("curriculum_lessons").select("id,chapter_id,title,display_order").eq("course_id", courseId).order("display_order"),
    client.from("curriculum_coverages").select("id,lesson_id,node_id,role,display_order").eq("course_id", courseId).order("display_order"),
    client.from("curriculum_sequences").select("id,source_lesson_id,target_lesson_id").eq("course_id", courseId),
    client.from("course_assignments").select("id,title,description,display_order").eq("course_id", courseId).order("display_order")
  ]);
  const chapters = dataOrThrow(chaptersResult.data as Row[] | null, chaptersResult.error, "Assistant Chapter lookup");
  const lessons = dataOrThrow(lessonsResult.data as Row[] | null, lessonsResult.error, "Assistant Lesson lookup");
  let coverages = dataOrThrow(coverageResult.data as Row[] | null, coverageResult.error, "Assistant CurriculumCoverage lookup");
  const sequences = dataOrThrow(sequenceResult.data as Row[] | null, sequenceResult.error, "Assistant CurriculumSequence lookup");
  const assignments = dataOrThrow(assignmentsResult.data as Row[] | null, assignmentsResult.error, "Assistant Course Assignment lookup");
  if (knowledgeId) coverages = coverages.filter((coverage) => text(coverage, "node_id") === knowledgeId);
  const nodeIds = [...new Set(coverages.map((coverage) => text(coverage, "node_id")))].slice(0, 100);
  const nodesResult = nodeIds.length ? await client.from("knowledge_nodes").select("id,title,description,status").in("id", nodeIds).eq("status", "active") : { data: [], error: null };
  const nodes = dataOrThrow(nodesResult.data as Row[] | null, nodesResult.error, "Assistant Course Knowledge lookup");
  const displayTitles = await microDisplayTitles(client, nodes.map((row) => text(row, "id")), courseId);
  return {
    course: { id: text(course, "id"), title: text(course, "title"), description: limitText(course.description), targetOutcome: optionalText(course, "target_outcome"), lifecycle: text(course, "lifecycle") },
    chapters: chapters.map((row) => ({ id: text(row, "id"), title: text(row, "title"), order: Number(row.display_order), outcome: optionalText(row, "outcome") })),
    lessons: lessons.map((row) => ({ id: text(row, "id"), chapterId: text(row, "chapter_id"), title: text(row, "title"), order: Number(row.display_order) })),
    curriculumCoverage: coverages.slice(0, 100).map((row) => ({ lessonId: text(row, "lesson_id"), nodeId: text(row, "node_id"), role: text(row, "role"), order: Number(row.display_order) })),
    knowledge: nodes.map((row) => ({ id: text(row, "id"), title: displayTitles.get(text(row, "id")) ?? text(row, "title"), formalTitle: text(row, "title"), description: limitText(row.description, 500) })),
    curriculumSequence: sequences.map((row) => ({ sourceLessonId: text(row, "source_lesson_id"), targetLessonId: text(row, "target_lesson_id"), relationKind: "curriculum-sequence-not-knowledge-edge" })),
    assignments: assignments.map((row) => ({ id: text(row, "id"), title: text(row, "title"), description: limitText(row.description, 500), order: Number(row.display_order) }))
  };
}

export async function searchMaterials(client: SupabaseClient, user: User, courseId: string, query: string) {
  if (!await readableCourse(client, user, courseId)) return null;
  const result = await client.from("materials").select("id,title,description,material_type").eq("course_id", courseId).order("display_order").limit(200);
  const rows = dataOrThrow(result.data as Row[] | null, result.error, "Assistant Material search");
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows
    .map((row) => {
      const haystack = [row.title, row.description].join(" ").toLocaleLowerCase();
      return { row, score: terms.reduce((sum, term) => sum + (String(row.title).toLocaleLowerCase().includes(term) ? 2 : haystack.includes(term) ? 1 : 0), 0) };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || text(left.row, "id").localeCompare(text(right.row, "id")))
    .slice(0, 6)
    .map(({ row }) => ({ id: text(row, "id"), title: text(row, "title"), description: limitText(row.description, 400), type: text(row, "material_type") }));
}

export async function getMaterialContext(client: SupabaseClient, user: User, courseId: string, materialId: string, segmentId?: string) {
  if (!await readableCourse(client, user, courseId)) return null;
  const materialResult = await client.from("materials").select("id,course_id,title,description,material_type").eq("course_id", courseId).eq("id", materialId).maybeSingle();
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
  const displayTitles = await microDisplayTitles(client, nodes.map((row) => text(row, "id")), courseId);
  return {
    material: { id: text(material, "id"), courseId, title: text(material, "title"), description: optionalText(material, "description"), type: text(material, "material_type") },
    segments: segments.map((row) => ({ id: text(row, "id"), order: Number(row.display_order), page: row.page == null ? undefined : Number(row.page), title: optionalText(row, "title"), section: optionalText(row, "section"), contentExcerpt: row.content == null ? undefined : JSON.stringify(row.content).slice(0, 6_000) })),
    knowledgeCoverage: coverage.map((row) => ({ segmentId: text(row, "segment_id"), nodeId: text(row, "node_id"), role: text(row, "role") })),
    knowledge: nodes.map((row) => ({ id: text(row, "id"), title: displayTitles.get(text(row, "id")) ?? text(row, "title"), formalTitle: text(row, "title"), description: limitText(row.description, 500) }))
  };
}

export async function searchMaterialContent(client: SupabaseClient, user: User, courseId: string, materialId: string, query: string) {
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

export async function getAssignmentContext(client: SupabaseClient, user: User, courseId: string, assignmentId: string) {
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
  const displayTitles = await microDisplayTitles(client, nodes.map((row) => text(row, "id")), courseId);
  const [attempts, stateResult] = await Promise.all([
    allRows(client.from("learning_attempts").select("id,attempt_number,submitted_at,withdrawn_at,withdrawal_source").eq("user_id", user.id).eq("course_id", courseId).eq("assignment_id", assignmentId).order("attempt_number", { ascending: false }), "Assistant Assignment Attempts"),
    client.from("user_assignment_states").select("status,submitted_at,accepted_at").eq("user_id", user.id).eq("course_id", courseId).eq("assignment_id", assignmentId).maybeSingle()
  ]);
  const attemptIds = attempts.map((row) => text(row, "id"));
  const resultRows: Row[] = [];
  for (let index = 0; index < attemptIds.length; index += 100) {
    const ids = attemptIds.slice(index, index + 100);
    const resultQuery = await client.from("performance_results").select("attempt_id,outcome,evaluator_kind,evaluated_at,version").in("attempt_id", ids).order("version", { ascending: false });
    resultRows.push(...dataOrThrow(resultQuery.data as Row[] | null, resultQuery.error, "Assistant Attempt results"));
  }
  const latestResult = new Map<string, Row>();
  for (const row of resultRows) if (!latestResult.has(text(row, "attempt_id"))) latestResult.set(text(row, "attempt_id"), row);
  const state = dataOrThrow(stateResult.data as Row | null, stateResult.error, "Assistant Assignment state");
  const mySubmissions = attempts.map((row) => ({
    attemptId: text(row, "id"), attemptNumber: Number(row.attempt_number), submittedAt: text(row, "submitted_at"),
    withdrawn: row.withdrawn_at != null,
    withdrawnAt: optionalText(row, "withdrawn_at"), withdrawalSource: optionalText(row, "withdrawal_source"),
    outcome: latestResult.has(text(row, "id")) ? optionalText(latestResult.get(text(row, "id"))!, "outcome") as PerformanceOutcome | undefined : undefined,
    evaluatorKind: latestResult.has(text(row, "id")) ? optionalText(latestResult.get(text(row, "id"))!, "evaluator_kind") : undefined
  }));
  return {
    assignment: { id: text(assignment, "id"), courseId, title: text(assignment, "title"), description: limitText(assignment.description), requirements: assignment.requirements, expectedOutput: text(assignment, "expected_output"), acceptanceCriteria: assignment.acceptance_criteria, mode: text(assignment, "mode"), workflowTemplateId: optionalText(assignment, "workflow_template_id"), estimatedMinutes: assignment.estimated_minutes == null ? undefined : Number(assignment.estimated_minutes) },
    knowledgeCoverage: coverage,
    knowledge: nodes.map((row) => ({ ...row, title: displayTitles.get(text(row, "id")) ?? text(row, "title") })),
    directAssignmentDependencies: dependencies,
    mySubmissions,
    submissionSummary: summarizeAssignmentAttempts(mySubmissions),
    assignmentState: state ? { status: text(state, "status"), submittedAt: optionalText(state, "submitted_at"), acceptedAt: optionalText(state, "accepted_at") } : undefined,
    distinction: "AssignmentDependency is a course teaching/execution prerequisite and is not a KnowledgeEdge. Use submissionSummary for counts; mySubmissions is the full owned record and every item has a withdrawn flag."
  };
}

export async function searchMicro(client: SupabaseClient, user: User, input: { query?: string; knowledgeId?: string; courseId?: string }) {
  let pathQuery = client.from("micro_learning_paths")
    .select("id,knowledge_id,course_id,title,description,estimated_minutes,mode,status,scope")
    .eq("status", "published").eq("mode", "learn").limit(300);
  if (input.knowledgeId) pathQuery = pathQuery.eq("knowledge_id", input.knowledgeId);
  const pathResult = await pathQuery;
  const pathRows = dataOrThrow(pathResult.data as Row[] | null, pathResult.error, "Assistant Micro search");
  const terms = (input.query ?? "").toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matched = pathRows.filter((row) => !terms.length || terms.every((term) => `${text(row, "title")} ${optionalText(row, "description") ?? ""}`.toLocaleLowerCase().includes(term)));
  const courseIds = [...new Set(matched.flatMap((row) => row.course_id == null ? [] : [text(row, "course_id")]))];
  const role = await roleFor(client, user);
  let courseRows: Row[] = [];
  if (courseIds.length) {
    const courseResult = await client.from("courses").select("id,title,lifecycle").in("id", courseIds);
    courseRows = dataOrThrow(courseResult.data as Row[] | null, courseResult.error, "Assistant Micro Course lookup");
  }
  const visibleCourses = new Map(courseRows
    .filter((row) => text(row, "lifecycle") === "published" || ["teacher", "admin"].includes(role))
    .map((row) => [text(row, "id"), text(row, "title")]));
  const currentCourseId = input.courseId;
  const visible = matched.filter((row) => row.course_id == null || visibleCourses.has(text(row, "course_id")));
  const nodeIds = [...new Set(visible.map((row) => text(row, "knowledge_id")))];
  let nodeRows: Row[] = [];
  if (nodeIds.length) {
    const nodeResult = await client.from("knowledge_nodes").select("id,title").in("id", nodeIds).eq("status", "active");
    nodeRows = dataOrThrow(nodeResult.data as Row[] | null, nodeResult.error, "Assistant Micro Knowledge lookup");
  }
  const knowledgeTitle = new Map(nodeRows.map((row) => [text(row, "id"), text(row, "title")]));
  visible.sort((left, right) => {
    const rank = (row: Row) => row.course_id != null && currentCourseId && text(row, "course_id") === currentCourseId ? 0 : row.course_id == null ? 1 : 2;
    return rank(left) - rank(right) || text(left, "title").localeCompare(text(right, "title")) || text(left, "id").localeCompare(text(right, "id"));
  });
  return {
    currentCourseId: currentCourseId ?? null,
    micros: visible.slice(0, 10).map((row) => {
      const courseId = optionalText(row, "course_id");
      return {
        pathId: text(row, "id"),
        knowledgeId: text(row, "knowledge_id"),
        knowledgeTitle: knowledgeTitle.get(text(row, "knowledge_id")) ?? text(row, "knowledge_id"),
        title: text(row, "title"),
        description: limitText(optionalText(row, "description")),
        estimatedMinutes: row.estimated_minutes == null ? undefined : Number(row.estimated_minutes),
        courseId,
        courseTitle: courseId ? visibleCourses.get(courseId) : "未归属课程",
        inCurrentCourse: Boolean(currentCourseId && courseId === currentCourseId),
        scope: text(row, "scope")
      };
    }),
    distinction: "This is the real 小练习 (Micro) catalog. A 动手任务 is a Course Assignment, not a Micro."
  };
}

export async function getMicroContext(client: SupabaseClient, user: User, pathId: string, unitId?: string, stepId?: string) {
  const pathResult = await client.from("micro_learning_paths").select("id,knowledge_id,course_id,scope,title,description,mode,estimated_minutes,required,status").eq("id", pathId).eq("status", "published").maybeSingle();
  const path = dataOrThrow(pathResult.data as Row | null, pathResult.error, "Assistant Micro path lookup");
  if (!path) return null;
  const pathCourseId = optionalText(path, "course_id");
  const pathCourse = pathCourseId ? await readableCourse(client, user, pathCourseId) : null;
  if (pathCourseId && !pathCourse) return null;
  const courseTitle = optionalText(pathCourse ?? {}, "title") ?? "未归属课程";
  const unitsResult = await client.from("micro_units").select("id,title,description,position,estimated_minutes,required").eq("path_id", pathId).order("position");
  let units = dataOrThrow(unitsResult.data as Row[] | null, unitsResult.error, "Assistant Micro unit lookup");
  if (unitId) units = units.filter((unit) => text(unit, "id") === unitId);
  const unitIds = units.map((unit) => text(unit, "id"));
  const stepsResult = unitIds.length ? await client.from("micro_steps").select("id,unit_id,position,kind,title,content,success_feedback,retry_feedback").in("unit_id", unitIds).order("position") : { data: [], error: null };
  let steps = dataOrThrow(stepsResult.data as Row[] | null, stepsResult.error, "Assistant Micro step lookup");
  if (stepId) steps = steps.filter((step) => text(step, "id") === stepId);
  if ((unitId && !units.length) || (stepId && !steps.length)) return null;
  return { path: { id: text(path, "id"), knowledgeId: text(path, "knowledge_id"), courseId: pathCourseId, courseTitle, title: text(path, "title"), description: optionalText(path, "description"), mode: text(path, "mode") }, units, steps: steps.map((step) => ({ id: text(step, "id"), unitId: text(step, "unit_id"), position: Number(step.position), kind: text(step, "kind"), title: text(step, "title"), content: limitText(step.content, 2_000), successFeedback: optionalText(step, "success_feedback"), retryFeedback: optionalText(step, "retry_feedback") })), integrity: "Assistant explanations and hints do not mutate answers, grading, or completion." };
}

export async function getLearnerState(client: SupabaseClient, user: User, nodeId?: string, courseId?: string) {
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

export async function listReadableCourses(client: SupabaseClient, user: User) {
  const result = await client.from("courses").select("id,title,subtitle,description,target_outcome,lifecycle,generation_status").limit(200);
  let rows = dataOrThrow(result.data as Row[] | null, result.error, "Assistant readable Courses");
  if (!["teacher", "admin"].includes(await roleFor(client, user))) rows = rows.filter((row) => text(row, "lifecycle") === "published");
  return rows.map((row) => ({ id: text(row, "id"), title: text(row, "title"), description: limitText(row.description, 500), lifecycle: text(row, "lifecycle") }));
}

export async function navigationForAssistant(client: SupabaseClient, user: User, context: AssistantContextSnapshot, courseId?: string) {
  const resolvedCourseId = courseId ?? context.courseId;
  if (!resolvedCourseId) {
    return {
      status: "course_required" as const,
      message: "No Course context is available. Ask the learner which Course they want to learn, or offer one of these readable Courses.",
      courses: await listReadableCourses(client, user)
    };
  }
  const course = await readableCourse(client, user, resolvedCourseId);
  if (!course) return { status: "course_not_available" as const, courseId: resolvedCourseId, message: "This Course is not visible to the authenticated learner." };
  let decision: Awaited<ReturnType<typeof readNavigationDecision>>;
  try {
    decision = await readNavigationDecision(client, user.id, resolvedCourseId);
  } catch (error) {
    if (error instanceof ApiError) return { status: "course_not_available" as const, courseId: resolvedCourseId, message: error.message };
    throw error;
  }
  const displayTitles = await microDisplayTitles(client, decision.path.map((item) => item.nodeId), resolvedCourseId);
  let nextTitle = displayTitles.get(decision.nextAction.nodeId ?? "") ?? decision.path.find((item) => item.nodeId === decision.nextAction.nodeId)?.title;
  if (decision.nextAction.resourceKind === "assignment" && decision.nextAction.resourceId) {
    const assignmentResult = await client.from("course_assignments").select("title").eq("course_id", resolvedCourseId).eq("id", decision.nextAction.resourceId).maybeSingle();
    const assignment = dataOrThrow(assignmentResult.data as Row | null, assignmentResult.error, "Assistant navigation Assignment title");
    if (assignment) nextTitle = text(assignment, "title");
  }
  return {
    status: "ready" as const,
    courseId: resolvedCourseId,
    courseTitle: text(course, "title"),
    decisionId: decision.decisionId,
    policyVersion: decision.policyVersion,
    nextActionSource: decision.nextActionSource,
    nextAction: { ...decision.nextAction, title: nextTitle },
    path: decision.path.map((item) => ({ ...item, title: displayTitles.get(item.nodeId) ?? item.title })),
    authority: "deterministic-navigation-engine"
  };
}

export async function planGoalForAssistant(
  client: SupabaseClient,
  goalText: string,
  candidateKnowledgeIds: string[] | undefined,
  resolver: GoalLanguageResolver | undefined,
  onGoalPlan: ((plan: Awaited<ReturnType<typeof planLearningGoal>>) => void) | undefined
) {
  if (candidateKnowledgeIds?.length) {
    const plan = await planLearningGoal(client, goalText, candidateKnowledgeIds);
    onGoalPlan?.(plan);
    return { status: plan.resolution.status, goalText, intentSummary: "", ...plan };
  }
  const resolved = await resolveGoalPlan(client, { goalText }, resolver);
  if (resolved.status === "needs_clarification") {
    return {
      status: resolved.status, goalText,
      intentSummary: resolved.language.intentSummary,
      clarificationQuestion: resolved.language.clarificationQuestion
    };
  }
  onGoalPlan?.(resolved.plan);
  return {
    status: resolved.status,
    goalText: resolved.language.primaryOutcome,
    intentSummary: resolved.language.intentSummary,
    ...resolved.plan,
    ...(resolved.status === "no_match" && "reason" in resolved.language ? { reason: resolved.language.reason } : {})
  };
}

