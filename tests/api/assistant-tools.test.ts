import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createAssistantTools } from "../../api/_lib/assistantTools";

type Row = Record<string, unknown>;

const rows: Record<string, Row[]> = {
  profiles: [{ id: "learner-a", role: "student" }],
  knowledge_nodes: [
    { id: "K-visible", title: "Visible Knowledge", description: "Readable", node_type: "conceptual", scope: "global", status: "active", tags: [] },
    { id: "K-neighbor", title: "Neighbor", description: "Related", node_type: "conceptual", scope: "global", status: "active", tags: [] }
  ],
  knowledge_edges: [{ id: "edge-1", source_node_id: "K-visible", target_node_id: "K-neighbor", relation: "prerequisite", reason: "A factual prerequisite", prerequisite_strength: "hard", associative_strength: null, lifecycle_status: "active" }],
  courses: [
    { id: "route-only", title: "Route-only Course", description: "No optional assets", lifecycle: "published", generation_status: "ready", target_outcome: "Understand the route" },
    { id: "other-course", title: "Other Course", description: "Other", lifecycle: "published", generation_status: "ready" }
  ],
  curriculum_chapters: [{ course_id: "route-only", id: "chapter-1", title: "Route", description: "Route", display_order: 0, outcome: "Understand" }],
  curriculum_lessons: [{ course_id: "route-only", id: "lesson-1", chapter_id: "chapter-1", title: "Lesson", display_order: 0 }],
  curriculum_coverages: [{ course_id: "route-only", id: "coverage-1", lesson_id: "lesson-1", node_id: "K-visible", role: "introduce", display_order: 0 }],
  curriculum_sequences: [{ course_id: "route-only", id: "sequence-1", source_lesson_id: "lesson-1", target_lesson_id: "lesson-2" }],
  materials: [
    { course_id: "route-only", id: "shared-material", lesson_id: "lesson-1", title: "Route Material", description: "Route", material_type: "article" },
    { course_id: "other-course", id: "shared-material", lesson_id: "other-lesson", title: "Other Material", description: "Other", material_type: "article" }
  ],
  material_segments: [
    { course_id: "route-only", material_id: "shared-material", id: "route-segment", display_order: 0, title: "Route Segment", content: { text: "route" } },
    { course_id: "other-course", material_id: "shared-material", id: "other-segment", display_order: 0, title: "Other Segment", content: { text: "other" } }
  ],
  material_knowledge_coverages: [{ course_id: "route-only", material_id: "shared-material", segment_id: "route-segment", node_id: "K-visible", role: "explain" }],
  user_knowledge_states: [
    { user_id: "learner-a", node_id: "K-visible", status: "learning", mastery: 20, updated_at: "2026-08-26T00:00:00Z" },
    { user_id: "learner-b", node_id: "K-neighbor", status: "mastered", mastery: 100, updated_at: "2026-08-26T00:00:00Z" }
  ],
  user_course_states: [
    { user_id: "learner-a", course_id: "route-only", is_active: true, recent_lesson_id: "lesson-1", updated_at: "2026-08-26T00:00:00Z" },
    { user_id: "learner-b", course_id: "other-course", is_active: true, recent_lesson_id: "other-lesson", updated_at: "2026-08-26T00:00:00Z" }
  ]
};

function clientFor(errorTable?: string) {
  return { from(table: string) {
    let selected = [...(rows[table] ?? [])];
    const result = () => Promise.resolve({ data: errorTable === table ? null : selected, error: errorTable === table ? { code: "forced_failure", message: "forced failure" } : null });
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { selected = selected.filter((row) => row[key] === value); return builder; },
      in: (key: string, values: unknown[]) => { selected = selected.filter((row) => values.includes(row[key])); return builder; },
      or: (filter: string) => { const ids = [...filter.matchAll(/(?:source_node_id|target_node_id)\.eq\.([^,]+)/g)].map((match) => match[1]); selected = selected.filter((row) => ids.includes(String(row.source_node_id)) || ids.includes(String(row.target_node_id))); return builder; },
      order: () => builder,
      limit: (limit: number) => { selected = selected.slice(0, limit); return builder; },
      maybeSingle: () => result().then(({ data, error }) => ({ data: data?.[0] ?? null, error })),
      then: <TResult1 = { data: Row[] | null; error: { code: string; message: string } | null }, TResult2 = never>(onfulfilled?: ((value: { data: Row[] | null; error: { code: string; message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) => result().then(onfulfilled, onrejected)
    };
    return builder;
  } } as unknown as SupabaseClient;
}

const user = { id: "learner-a" } as User;
const context = { workspace: "material" as const, experienceMode: "learn" as const, courseId: "route-only", materialId: "shared-material", segmentId: "route-segment", knowledgeId: "K-visible" };

async function execute(client: SupabaseClient, name: keyof ReturnType<typeof createAssistantTools>, input: unknown) {
  const candidate = createAssistantTools(client, user, context)[name] as { execute: (input: unknown, options: unknown) => Promise<unknown> };
  return candidate.execute(input, { toolCallId: "test", messages: [] });
}

describe("Assistant read tool boundaries", () => {
  it("returns visible Knowledge and factual neighbors but not an unavailable node", async () => {
    expect(await execute(clientFor(), "getKnowledge", { nodeId: "K-visible" })).toMatchObject({ id: "K-visible", title: "Visible Knowledge" });
    expect(await execute(clientFor(), "getKnowledge", { nodeId: "K-private" })).toBeNull();
    expect(await execute(clientFor(), "getKnowledgeNeighbors", { nodeId: "K-visible" })).toEqual([expect.objectContaining({ relation: "prerequisite", targetId: "K-neighbor" })]);
  });

  it("plans a Goal through product logic and rejects an invented candidate identity", async () => {
    expect(await execute(clientFor(), "planLearningGoal", { goalText: "Understand visible Knowledge", candidateKnowledgeIds: ["K-visible"] })).toMatchObject({
      resolution: { status: "ready", targetKnowledge: [{ id: "K-visible" }] },
      matches: expect.arrayContaining([expect.objectContaining({ courseId: "route-only", targetCoverage: 1, recommendation: "use_existing" })])
    });
    expect(await execute(clientFor(), "planLearningGoal", { goalText: "Invented", candidateKnowledgeIds: ["K-invented"] })).toMatchObject({ resolution: { status: "no_match", targetKnowledge: [] } });
  });

  it("reads a structurally valid route-only Course without requiring optional assets", async () => {
    expect(await execute(clientFor(), "getCourseContext", { courseId: "route-only" })).toMatchObject({
      course: { id: "route-only" },
      curriculumCoverage: [{ nodeId: "K-visible", role: "introduce" }],
      curriculumSequence: [{ relationKind: "curriculum-sequence-not-knowledge-edge" }]
    });
  });

  it("keeps composite Material identity scoped to its owning Course", async () => {
    expect(await execute(clientFor(), "getMaterialContext", { courseId: "route-only", materialId: "shared-material", segmentId: "route-segment" })).toMatchObject({ material: { title: "Route Material" }, segments: [{ id: "route-segment" }] });
    expect(await execute(clientFor(), "getMaterialContext", { courseId: "route-only", materialId: "shared-material", segmentId: "other-segment" })).toBeNull();
  });

  it("cannot select another learner and returns only the authenticated user's state", async () => {
    expect(await execute(clientFor(), "getLearnerState", {})).toMatchObject({
      knowledgeStates: [{ nodeId: "K-visible" }],
      courseStates: [{ courseId: "route-only" }]
    });
  });

  it("turns a product-data failure into a bounded tool error", async () => {
    expect(await execute(clientFor("knowledge_nodes"), "searchKnowledge", { query: "Visible" })).toEqual({ error: { code: "tool_failed", message: expect.stringContaining("forced_failure") } });
  });
});
