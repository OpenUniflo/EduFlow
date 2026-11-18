import { describe, expect, it, vi } from "vitest";
import { submitAssignmentFromAssistant } from "./assistantSubmission.js";

type Row = Record<string, unknown>;
function fakeClient(tables: Record<string, Row[]>, rpc: (name: string, args: Row) => unknown = () => ({ data: null, error: null })) {
  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return query; },
      is: (key: string, value: unknown) => { rows = rows.filter((row) => (value === null ? row[key] == null : row[key] === value)); return query; },
      limit: () => query,
      order: () => query,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: null }),
      upsert: async (value: Row) => ({ data: value, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: rows, error: null }))
    };
    return query;
  }
  return { from, rpc: async (name: string, args: Row) => rpc(name, args) } as never;
}

const baseTables = (): Record<string, Row[]> => ({
  courses: [{ id: "course", lifecycle: "published" }],
  course_assignments: [{ id: "task", course_id: "course", title: "任务", description: "说明", requirements: [], expected_output: "结果", acceptance_criteria: ["有证据"], experience: { type: "answer" }, mode: "instruction" }],
  assignment_coverages: [{ course_id: "course", assignment_id: "task", node_id: "node" }],
  assignment_dependencies: [],
  user_assignment_states: [{ user_id: "learner", course_id: "course", assignment_id: "task", status: "started" }],
  curriculum_coverages: [{ course_id: "course", node_id: "node" }],
  knowledge_nodes: [{ id: "node", status: "active" }],
  user_knowledge_states: [{ user_id: "learner", node_id: "node", status: "learned" }],
  performance_results: [{ id: "result", outcome: "pending", feedback: {}, evaluator_kind: "manual" }]
});

describe("assistant submission boundary", () => {
  it("rejects an attachment owned by another learner before writing an Attempt", async () => {
    const rpc = vi.fn();
    const tables = baseTables();
    tables.user_evidence_sources = [{ id: "11111111-1111-4111-8111-111111111111", user_id: "someone-else", parse_status: "ready", archived_at: null, source_sha256: "hash" }];
    const client = fakeClient(tables, rpc);
    await expect(submitAssignmentFromAssistant({
      client, server: client, user: { id: "learner" } as never,
      courseId: "course", assignmentId: "task", note: "我的结果",
      attachmentSourceIds: ["11111111-1111-4111-8111-111111111111"], idempotencyKey: "assistant-turn-task"
    })).rejects.toMatchObject({ status: 404, code: "practice_attachment_unavailable" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("writes the same immutable Attempt transaction after ownership passes", async () => {
    const rpc = vi.fn((name: string) => name === "record_conversation_assignment_attempt"
      ? { data: [{ attempt_id: "attempt", result_id: "result", outcome: "pending", duplicate: false }], error: null }
      : { data: [], error: null });
    const tables = baseTables();
    tables.user_evidence_sources = [{ id: "11111111-1111-4111-8111-111111111111", user_id: "learner", parse_status: "ready", archived_at: null, source_sha256: "hash" }];
    const client = fakeClient(tables, rpc);
    const result = await submitAssignmentFromAssistant({
      client, server: client, user: { id: "learner" } as never,
      courseId: "course", assignmentId: "task", note: "我的结果",
      attachmentSourceIds: ["11111111-1111-4111-8111-111111111111"], idempotencyKey: "assistant-turn-task"
    });
    expect(result).toMatchObject({ status: "submitted", attemptId: "attempt", duplicate: false });
    expect(rpc).toHaveBeenCalledWith("record_conversation_assignment_attempt", expect.objectContaining({
      p_learner_user_id: "learner", p_idempotency_key: "assistant-turn-task",
      p_response: expect.objectContaining({ submissionMode: "conversation", attachmentSourceIds: ["11111111-1111-4111-8111-111111111111"] })
    }));
  });
});
