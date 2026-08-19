import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase } from "./_lib/supabase.js";
import { ApiError, handleApi, json, methodNotAllowed } from "./_lib/http.js";
import { dataOrThrow } from "./_lib/query.js";

type Row = Record<string, unknown>;
type Definition = { id: string; name: string; description: string } & Record<string, unknown>;
type Run = { id: string; workflowId: string; workflowTemplateId: string; courseId?: string; assignmentId?: string; workflowName: string; createdAt: string; status: string; nodeCount: number; outputSummary: string; finalState: Record<string, unknown>; nodes: unknown[] };
const MAX_RUN_HISTORY = 20;

function newestRuns(workflowId: string, runs: Run[]) {
  if (runs.some((run) => run.workflowId !== workflowId)) {
    throw new ApiError(400, "invalid_workflow_run", "Workflow run history key must match workflowId");
  }
  return [...runs]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    .slice(0, MAX_RUN_HISTORY);
}

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  const { client, user } = await createUserSupabase(request);
  if (request.method === "GET") {
    const [templatesResult, definitionsResult, stateResult, runsResult] = await Promise.all([
      createServerSupabase().from("workflow_templates").select("definition").order("id"),
      client.from("user_workflow_definitions").select("definition").eq("owner_user_id", user.id).order("updated_at", { ascending: false }),
      client.from("user_workflow_state").select("*").eq("owner_user_id", user.id).maybeSingle(),
      client.from("workflow_runs").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
    ]);
    const templates = dataOrThrow(templatesResult.data as Row[] | null, templatesResult.error, "WorkflowTemplate query").map((row) => row.definition as Definition);
    const definitions = dataOrThrow(definitionsResult.data as Row[] | null, definitionsResult.error, "WorkflowDefinition query").map((row) => row.definition as Definition);
    const state = dataOrThrow(stateResult.data as Row | null, stateResult.error, "Workflow state query");
    const runHistory: Record<string, Run[]> = {};
    dataOrThrow(runsResult.data as Row[] | null, runsResult.error, "WorkflowRun query").forEach((row) => {
      const workflowId = String(row.workflow_id);
      const run: Run = {
        id: String(row.id), workflowId, workflowTemplateId: String(row.workflow_template_id),
        courseId: row.course_id == null ? undefined : String(row.course_id), assignmentId: row.assignment_id == null ? undefined : String(row.assignment_id),
        workflowName: String(row.workflow_name), createdAt: String(row.created_at), status: String(row.status),
        nodeCount: Number(row.node_count), outputSummary: String(row.output_summary), finalState: row.final_state as Record<string, unknown>, nodes: row.nodes as unknown[]
      };
      runHistory[workflowId] = [...(runHistory[workflowId] ?? []), run];
    });
    json(response, 200, {
      state: {
        workflows: [...definitions, ...templates], activeTemplateId: state?.active_template_id ?? undefined,
        workflowDescription: state?.workflow_description ?? undefined, schemaSaved: state?.schema_saved ?? false,
        nodePositions: state?.node_positions ?? {}, stateValues: state?.state_values ?? {}, runHistory
      },
      settings: state?.settings ?? null,
      builtinWorkflowIds: templates.map((item) => item.id)
    });
    return;
  }
  if (request.method === "PUT") {
    const body = request.body as { state?: { workflows?: Definition[]; activeTemplateId?: string; workflowDescription?: string; schemaSaved?: boolean; nodePositions?: unknown; stateValues?: unknown; runHistory?: Record<string, Run[]> }; settings?: unknown; builtinWorkflowIds?: string[] };
    if (!body?.state || !Array.isArray(body.state.workflows)) throw new ApiError(400, "invalid_workflow_state", "Workflow state is required");
    const builtinIds = new Set(body.builtinWorkflowIds ?? []);
    const custom = body.state.workflows.filter((definition) => !builtinIds.has(definition.id));
    const existing = await client.from("user_workflow_definitions").select("id").eq("owner_user_id", user.id);
    const existingRows = dataOrThrow(existing.data as Array<{ id: string }> | null, existing.error, "WorkflowDefinition identity query");
    const customIds = new Set(custom.map((definition) => definition.id));
    const removedIds = existingRows.map((row) => row.id).filter((id) => !customIds.has(id));
    if (removedIds.length) {
      const result = await client.from("user_workflow_definitions").delete().eq("owner_user_id", user.id).in("id", removedIds);
      dataOrThrow(result.data, result.error, "WorkflowDefinition delete");
    }
    if (custom.length) {
      const result = await client.from("user_workflow_definitions").upsert(custom.map((definition) => ({
        owner_user_id: user.id, id: definition.id, name: definition.name, description: definition.description,
        definition, updated_at: new Date().toISOString()
      })));
      dataOrThrow(result.data, result.error, "WorkflowDefinition update");
    }
    const stateResult = await client.from("user_workflow_state").upsert({
      owner_user_id: user.id, active_template_id: body.state.activeTemplateId ?? null,
      workflow_description: body.state.workflowDescription ?? null, schema_saved: body.state.schemaSaved ?? false,
      node_positions: body.state.nodePositions ?? {}, state_values: body.state.stateValues ?? {}, settings: body.settings ?? {}, updated_at: new Date().toISOString()
    });
    dataOrThrow(stateResult.data, stateResult.error, "Workflow state update");
    const runHistory = Object.entries(body.state.runHistory ?? {}).map(([workflowId, runs]) => ({
      workflowId,
      runs: newestRuns(workflowId, runs)
    }));
    const runs = runHistory.flatMap((entry) => entry.runs);
    if (runs.length) {
      const result = await client.from("workflow_runs").upsert(runs.map((run) => ({
        owner_user_id: user.id, id: run.id, workflow_id: run.workflowId, workflow_template_id: run.workflowTemplateId,
        course_id: run.courseId ?? null, assignment_id: run.assignmentId ?? null, workflow_name: run.workflowName,
        created_at: run.createdAt, status: run.status, node_count: run.nodeCount, output_summary: run.outputSummary,
        final_state: run.finalState, nodes: run.nodes
      })));
      dataOrThrow(result.data, result.error, "WorkflowRun update");
    }
    for (const { workflowId } of runHistory) {
      const existing = await client.from("workflow_runs").select("id")
        .eq("owner_user_id", user.id).eq("workflow_id", workflowId)
        .order("created_at", { ascending: false }).order("id", { ascending: false });
      const obsoleteIds = dataOrThrow(existing.data as Array<{ id: string }> | null, existing.error, "WorkflowRun prune query")
        .slice(MAX_RUN_HISTORY)
        .map((row) => row.id);
      if (obsoleteIds.length) {
        const result = await client.from("workflow_runs").delete()
          .eq("owner_user_id", user.id).eq("workflow_id", workflowId).in("id", obsoleteIds);
        dataOrThrow(result.data, result.error, "WorkflowRun prune");
      }
    }
    json(response, 200, { ok: true });
    return;
  }
  return methodNotAllowed(response, ["GET", "PUT"]);
});
