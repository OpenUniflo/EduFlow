import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { demoGlobalKnowledgeGraph } from "../src/demo/knowledge/demoGlobalKnowledgeGraph.fixture";
import { demoKnowledgeDomains } from "../src/demo/domains/demoDomains.fixture";
import { demoDomainAssignments } from "../src/demo/domains/demoDomainAssignments.fixture";
import { agenticAiRuntime } from "../src/demo/courses/agenticAiRuntime.seed";
import { goldenAgenticAiRuntime } from "../src/demo/scenarios/agenticAiBook/goldenCourse.seed";
import { pythonEngineeringRuntime } from "../src/demo/courses/pythonEngineeringCourse.seed";
import { demoWorkflowTemplates } from "../src/demo/workflows/demoWorkflowTemplates";
import type { CourseRuntimeData } from "../src/features/course/runtime/courseRuntime";

function literal(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `'${text.split("'").join("''")}'`;
}

function insert(table: string, columns: string[], values: unknown[]) {
  return `insert into public.${table} (${columns.join(", ")}) values (${values.map(literal).join(", ")});`;
}

const lines = [
  "-- Generated from explicit Demo fixtures by `pnpm db:seed:generate`.",
  "-- Reset-friendly, deterministic, and intentionally contains no auth users or real personal data.",
  "begin;",
  "set constraints all deferred;",
  ""
];

for (const node of demoGlobalKnowledgeGraph.nodes) {
  lines.push(insert("knowledge_nodes", [
    "id", "title", "description", "node_type", "mastery_criteria", "scope", "owner_id", "provenance",
    "current_revision_id", "status", "superseded_by", "split_from", "merged_from", "tags", "metadata", "created_at", "updated_at"
  ], [
    node.id, node.title, node.description, node.type, node.masteryCriteria, node.scope, node.ownerId, node.provenance,
    node.currentRevisionId, node.status, node.supersededBy, node.splitFrom, node.mergedFrom, node.tags, node.metadata,
    node.createdAt, node.updatedAt
  ]));
}

for (const revision of demoGlobalKnowledgeGraph.revisions) {
  lines.push(insert("knowledge_node_revisions", [
    "id", "node_id", "version", "title", "description", "node_type", "mastery_criteria", "created_by", "created_at", "previous_revision_id", "change_reason"
  ], [
    revision.id, revision.nodeId, revision.version, revision.title, revision.description, revision.type, revision.masteryCriteria,
    revision.createdBy, revision.createdAt, revision.previousRevisionId, revision.changeReason
  ]));
}

for (const edge of demoGlobalKnowledgeGraph.edges) {
  const [source, target] = edge.relation === "related"
    ? [edge.source, edge.target].sort((left, right) => left.localeCompare(right))
    : [edge.source, edge.target];
  lines.push(insert("knowledge_edges", [
    "id", "source_node_id", "target_node_id", "relation", "reason", "prerequisite_strength", "associative_strength"
  ], [
    edge.id, source, target, edge.relation, edge.reason,
    edge.relation === "prerequisite" ? edge.strength : undefined,
    edge.relation === "prerequisite" ? undefined : edge.strength
  ]));
}

for (const domain of demoKnowledgeDomains) {
  lines.push(insert("knowledge_domains", ["id", "name", "description", "canonical_color", "status", "created_by", "created_at", "updated_by", "updated_at"], [
    domain.id, domain.name, domain.description, domain.canonicalColor, domain.status, domain.createdBy, domain.createdAt, domain.updatedBy, domain.updatedAt
  ]));
}

const globalNodeIds = new Set(demoGlobalKnowledgeGraph.nodes.map((node) => node.id));
for (const assignment of demoDomainAssignments.filter((item) => globalNodeIds.has(item.nodeId))) {
  lines.push(insert("domain_assignments", ["node_id", "domain_id", "source", "confidence", "pinned", "assigned_by", "assigned_at"], [
    assignment.nodeId, assignment.domainId, assignment.source, assignment.confidence, assignment.pinned, assignment.assignedBy, assignment.assignedAt
  ]));
}

for (const template of demoWorkflowTemplates) {
  lines.push(insert("workflow_templates", ["id", "name", "description", "definition"], [template.id, template.name, template.description, template]));
}

function seedCourse(runtime: CourseRuntimeData) {
  const { course, curriculum } = runtime;
  lines.push(insert("courses", ["id", "title", "subtitle", "description", "target_outcome", "accent_color", "generation_status", "revision"], [course.id, course.title, course.subtitle, course.description, course.targetOutcome, course.accentColor, course.generationStatus ?? "ready", runtime.revision]));
  lines.push(insert("course_curricula", ["course_id", "id", "generation_mode", "requested_chapter_count", "source_structure_id"], [curriculum.courseId, curriculum.id, curriculum.generationMode, curriculum.requestedChapterCount, curriculum.sourceStructureId]));
  runtime.chapters.forEach((chapter) => lines.push(insert("curriculum_chapters", ["course_id", "id", "title", "description", "display_order", "color", "outcome"], [chapter.courseId, chapter.id, chapter.title, chapter.description, chapter.order, chapter.color, chapter.outcome])));
  runtime.lessons.forEach((lesson) => lines.push(insert("curriculum_lessons", ["course_id", "id", "chapter_id", "title", "display_order"], [lesson.courseId, lesson.id, lesson.chapterId, lesson.title, lesson.order])));
  runtime.curriculumCoverages.forEach((coverage) => lines.push(insert("curriculum_coverages", ["course_id", "id", "lesson_id", "node_id", "role", "display_order"], [coverage.courseId, coverage.id, coverage.lessonId, coverage.nodeId, coverage.role, coverage.order])));
  runtime.curriculumSequences.forEach((sequence) => lines.push(insert("curriculum_sequences", ["course_id", "id", "source_lesson_id", "target_lesson_id"], [sequence.courseId, sequence.id, sequence.sourceLessonId, sequence.targetLessonId])));
  runtime.assignments.forEach((assignment) => lines.push(insert("course_assignments", [
    "course_id", "id", "display_order", "title", "description", "requirements", "expected_output", "acceptance_criteria", "mode", "workflow_template_id", "estimated_minutes", "project_contribution", "experience", "inherited_outputs", "dependency_rationale"
  ], [
    assignment.courseId, assignment.id, assignment.order, assignment.title, assignment.description, assignment.requirements,
    assignment.expectedOutput, assignment.acceptanceCriteria, assignment.mode, assignment.workflowTemplateId, assignment.estimatedMinutes, assignment.projectContribution,
    assignment.experience, assignment.inheritedOutputs ?? [], assignment.dependencyRationale
  ])));
  runtime.assignmentCoverages.forEach((coverage) => lines.push(insert("assignment_coverages", ["course_id", "id", "assignment_id", "node_id", "role"], [runtime.course.id, coverage.id, coverage.assignmentId, coverage.nodeId, coverage.role])));
  runtime.assignmentDependencies.forEach((dependency) => lines.push(insert("assignment_dependencies", ["course_id", "id", "source_assignment_id", "target_assignment_id", "strength"], [dependency.courseId, dependency.id, dependency.sourceAssignmentId, dependency.targetAssignmentId, dependency.strength])));
  runtime.chapterOutcomes.forEach((outcome) => lines.push(insert("chapter_outcomes", ["course_id", "id", "chapter_id", "title"], [outcome.courseId, outcome.id, outcome.chapterId, outcome.title])));
  runtime.assignmentOutcomeCompositions.forEach((composition) => lines.push(insert("assignment_outcome_compositions", ["course_id", "id", "assignment_id", "outcome_id"], [runtime.course.id, composition.id, composition.assignmentId, composition.outcomeId])));
  runtime.finalProjects.forEach((project) => lines.push(insert("final_projects", ["course_id", "id", "title", "description"], [project.courseId, project.id, project.title, project.description])));
  runtime.finalProjectOutcomeCompositions.forEach((composition) => lines.push(insert("final_project_outcome_compositions", ["course_id", "id", "final_project_id", "outcome_id"], [runtime.course.id, composition.id, composition.finalProjectId, composition.outcomeId])));
  runtime.materials.forEach((material) => {
    const storagePath = material.source?.url.startsWith("/materials/") ? `shared/${material.source.url.slice("/materials/".length)}` : undefined;
    lines.push(insert("materials", ["course_id", "id", "lesson_id", "display_order", "title", "description", "material_type", "storage_path", "page_count", "duration"], [
      material.courseId, material.id, material.lessonId, material.order, material.title, material.description, material.type, storagePath, material.source?.pageCount, material.duration
    ]));
    material.segments.forEach((segment) => lines.push(insert("material_segments", ["course_id", "material_id", "id", "display_order", "page", "title", "section", "content"], [
      material.courseId, material.id, segment.id, segment.order, segment.page, segment.title, segment.section, segment.content
    ])));
  });
  runtime.materialKnowledgeCoverages.forEach((coverage) => lines.push(insert("material_knowledge_coverages", ["course_id", "id", "material_id", "segment_id", "node_id", "role"], [
    runtime.course.id, coverage.id, coverage.materialId, coverage.segmentId, coverage.nodeId, coverage.role
  ])));
}

[goldenAgenticAiRuntime, agenticAiRuntime, pythonEngineeringRuntime].forEach(seedCourse);
lines.push("", "commit;", "");

writeFileSync(resolve(process.cwd(), "supabase/seed.sql"), lines.join("\n"));
console.log(`Generated supabase/seed.sql with ${lines.length} statements/lines.`);
