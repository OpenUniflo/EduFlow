import type { SupabaseClient } from "@supabase/supabase-js";
import { nodeCardSummary } from "../../src/features/workflow/domain/v2/nodeSummary.js";
import { presentExecutionError } from "../../src/features/workflow/editor/v2/errorPresentation.js";
import type { WorkflowNodeV2 } from "../../src/features/workflow/domain/v2/types.js";

type Row = Record<string, unknown>;

export type AssistantWorkflowNode = { id: string; type: string; title: string; summary: string };
export type AssistantWorkflowContext = {
  workflowId: string;
  name: string;
  revision: number;
  archived: boolean;
  nodeCount: number;
  nodes: AssistantWorkflowNode[];
  truncated: boolean;
  selectedNode?: AssistantWorkflowNode;
  latestRun?: {
    runId: string;
    status: string;
    revision?: number;
    createdAt?: string;
    finishedAt?: string;
    error?: { title: string; message: string };
  };
};

function objectValue(value: unknown): Row | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : undefined;
}

function safeString(value: unknown, max = 240): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/** Read-only projection for the Assistant; never includes config values that can hold credentials. */
export function buildAssistantWorkflowContext(definition: unknown, latestRun: unknown, selectedNodeId?: string): AssistantWorkflowContext | null {
  const source = objectValue(definition);
  if (!source) return null;
  const workflowId = safeString(source.workflowId, 160);
  if (!workflowId) return null;
  const nodes = (Array.isArray(source.nodes) ? source.nodes : []).flatMap((value): AssistantWorkflowNode[] => {
    const node = objectValue(value);
    if (!node) return [];
    const id = safeString(node.id, 160);
    const type = safeString(node.type, 80);
    const title = safeString(node.label, 160) ?? id;
    if (!id || !type || !title) return [];
    let summary = type;
    try {
      summary = nodeCardSummary({
        id,
        label: title,
        type,
        typeVersion: typeof node.typeVersion === "number" ? node.typeVersion : 1,
        config: objectValue(node.config) ?? {},
        inputs: objectValue(node.inputs) ?? {},
        writes: objectValue(node.writes) ?? {}
      } as WorkflowNodeV2).text;
    } catch { /* a malformed node still contributes only its safe identity */ }
    return [{ id, type, title, summary }];
  });
  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) : undefined;
  const run = objectValue(latestRun);
  const runError = objectValue(run?.error);
  const presented = runError ? presentExecutionError({ ...runError, scope: "run" } as never) : undefined;
  return {
    workflowId,
    name: safeString(source.name, 160) ?? workflowId,
    revision: typeof source.revision === "number" && Number.isFinite(source.revision) ? source.revision : 0,
    archived: source.archived === true,
    nodeCount: nodes.length,
    nodes: nodes.slice(0, 100),
    truncated: nodes.length > 100,
    ...(selectedNode ? { selectedNode } : {}),
    ...(run ? {
      latestRun: {
        runId: String(run.run_id ?? ""),
        status: String(run.status ?? "unknown"),
        ...(typeof run.revision === "number" ? { revision: run.revision } : {}),
        ...(safeString(run.created_at) ? { createdAt: safeString(run.created_at) } : {}),
        ...(safeString(run.finished_at) ? { finishedAt: safeString(run.finished_at) } : {}),
        ...(presented ? { error: { title: presented.title, message: presented.message } } : {})
      }
    } : {})
  };
}

/**
 * Re-reads the Workflow from the authenticated owner's persisted revision and
 * the latest run. Browser context only supplies identities; product data is
 * always loaded server-side again.
 */
export async function readAssistantWorkflowContext(client: SupabaseClient, ownerId: string, workflowId: string, selectedNodeId?: string): Promise<AssistantWorkflowContext | null> {
  const head = await client.from("workflow_v2_definitions").select("current_revision,archived").eq("owner_user_id", ownerId).eq("workflow_id", workflowId).maybeSingle();
  const headRow = head.data as Row | null;
  if (head.error || !headRow) return null;
  const revision = typeof headRow.current_revision === "number" ? headRow.current_revision : Number(headRow.current_revision);
  if (!Number.isFinite(revision) || revision < 1) return null;
  const revisionResult = await client.from("workflow_revisions").select("definition").eq("owner_user_id", ownerId).eq("workflow_id", workflowId).eq("revision", revision).maybeSingle();
  const revisionRow = revisionResult.data as Row | null;
  if (revisionResult.error || !revisionRow) return null;
  const runResult = await client.from("workflow_live_runs").select("run_id,status,revision,created_at,finished_at,error").eq("owner_user_id", ownerId).eq("workflow_id", workflowId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return buildAssistantWorkflowContext(
    { ...(objectValue(revisionRow.definition) ?? {}), archived: headRow.archived === true, revision },
    runResult.error ? null : runResult.data,
    selectedNodeId
  );
}
