import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDemoApplicationServices } from "@/demo/services/createDemoApplicationServices";
import type { LearningProgressRepository } from "@/features/learning/progress/LearningProgressRepository";
import type { WorkflowRunRecord } from "@/features/workflow/runtime/types";
import { attachWorkflowAssignmentMetadata, completeWorkflowAssignmentRun, resolveWorkflowAssignmentContext } from "./workflowAssignmentIntegration";

const applicationServices = createDemoApplicationServices();

function record(context?: { courseId: string; assignmentId: string }): WorkflowRunRecord {
  const base: WorkflowRunRecord = { id: "run", workflowId: "agent-loop", workflowTemplateId: "agent-loop", workflowName: "Run", createdAt: "now", status: "success", nodeCount: 0, outputSummary: "ok", finalState: {}, nodes: [] };
  return context ? { ...base, ...context } : base;
}

describe("Workflow Assignment application integration", () => {
  it("accepts only explicit Course/Assignment/Template relationships", () => {
    const repository = applicationServices.courseRepository;
    const runtime = repository.getCourse("python-engineering")!;
    const shared = runtime.assignments.filter((item) => item.workflowTemplateId === "agent-loop");
    expect(shared.length).toBeGreaterThan(1);
    const validA = resolveWorkflowAssignmentContext(repository, "agent-loop", `?courseId=${runtime.course.id}&assignmentId=${shared[0].id}`);
    const validB = resolveWorkflowAssignmentContext(repository, "agent-loop", `?courseId=${runtime.course.id}&assignmentId=${shared[1].id}`);
    expect(validA).toEqual({ courseId: runtime.course.id, assignmentId: shared[0].id, workflowTemplateId: "agent-loop" });
    expect(validB).toEqual({ courseId: runtime.course.id, assignmentId: shared[1].id, workflowTemplateId: "agent-loop" });
    expect(validA?.assignmentId).not.toBe(validB?.assignmentId);
    expect(resolveWorkflowAssignmentContext(repository, "minimal", `?courseId=${runtime.course.id}&assignmentId=${shared[0].id}`)).toBeNull();
    expect(resolveWorkflowAssignmentContext(repository, "agent-loop", `?courseId=${runtime.course.id}&assignmentId=missing`)).toBeNull();
    expect(resolveWorkflowAssignmentContext(repository, "agent-loop", "")).toBeNull();
  });

  it("independent runs complete nothing and shared templates complete exactly the launched Assignment", () => {
    const updates = vi.fn();
    const masteryUpdates = vi.fn();
    const repository = { updateAssignmentState: updates, updateKnowledgeMastery: masteryUpdates } as unknown as LearningProgressRepository;
    expect(completeWorkflowAssignmentRun(repository, "user", record())).toBe(false);
    expect(updates).not.toHaveBeenCalled();
    completeWorkflowAssignmentRun(repository, "user", record({ courseId: "course", assignmentId: "assignment-a" }));
    expect(updates).toHaveBeenCalledOnce();
    expect(updates).toHaveBeenCalledWith("user", "course", "assignment-a", { assignmentId: "assignment-a", status: "completed", progress: 100 });
    expect(masteryUpdates).not.toHaveBeenCalled();
  });

  it("attaches only validated matching Application metadata to Run History", () => {
    const base = record();
    const contextA = { courseId: "course", assignmentId: "assignment-a", workflowTemplateId: "agent-loop" };
    const contextB = { courseId: "course", assignmentId: "assignment-b", workflowTemplateId: "agent-loop" };
    expect(attachWorkflowAssignmentMetadata(base, null)).toBe(base);
    expect(attachWorkflowAssignmentMetadata(base, { ...contextA, workflowTemplateId: "minimal" })).toBe(base);
    expect(attachWorkflowAssignmentMetadata(base, null)).not.toHaveProperty("assignmentId");
    expect(attachWorkflowAssignmentMetadata(base, contextA)).toMatchObject({ workflowTemplateId: "agent-loop", courseId: "course", assignmentId: "assignment-a" });
    expect(attachWorkflowAssignmentMetadata(base, contextB)).toMatchObject({ workflowTemplateId: "agent-loop", courseId: "course", assignmentId: "assignment-b" });
  });

  it("loads authenticated built-in templates through the server client while keeping user state user-scoped", () => {
    const source = readFileSync(join(process.cwd(), "api/workflows.ts"), "utf8");
    expect(source).toContain('import { createServerSupabase, createUserSupabase } from "./_lib/supabase.js"');
    expect(source).toContain('const { user } = await createUserSupabase(request)');
    expect(source).toContain('const server = createServerSupabase()');
    expect(source).toContain('server.from("workflow_templates").select("definition").order("id")');
    expect(source).toContain('server.from("user_workflow_definitions").select("definition").eq("owner_user_id", user.id)');
    expect(source).toContain('server.from("workflow_runs").select("*").eq("owner_user_id", user.id)');
  });
});
