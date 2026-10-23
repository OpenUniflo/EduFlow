/**
 * Local-only cleanup for pre-R10 workflow canvas data (implementation plan 5.0 / M10).
 *
 * Deletes workflow definitions, editor documents, revisions, runs and their steps/events/jobs,
 * threads, checkpoints and workflow-scoped memory. Keeps user connections (`workflow_private.p4_catalog`),
 * Vault secrets, workspace configuration (variables) and all course/learning data, then rewrites
 * `workflow_templates` from the current fixtures with unchanged ids.
 *
 * Defaults to a read-only preflight; pass --apply to delete. Refuses any non-local Supabase target.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { courseWorkflowTemplates } from "../../../src/demo/workflow/courseWorkflowTemplates";
import { productWorkflowTemplates } from "../../../src/demo/workflow/productWorkflowTemplates";
import { workspaceWorkflowExamples } from "../../../src/demo/workflow/workspaceWorkflowTemplates";

process.loadEnvFile(".env.local");
const url = new URL(process.env.SUPABASE_URL!);
assert.equal(url.hostname, "127.0.0.1", "Local Supabase only");
assert.equal(url.port, "54321", "Local Supabase only");
const apply = process.argv.includes("--apply");

function sql(query: string): string {
  return execFileSync("docker", ["exec", "-i", process.env.WORKFLOW_LOCAL_DB_CONTAINER ?? "supabase_db_EduFlow", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: query, encoding: "utf8" }).trim();
}
function exists(schema: string, table: string): boolean {
  return sql(`select to_regclass('${schema}.${table}') is not null;`) === "t";
}
function count(table: string, where = "true"): number {
  if (!exists("public", table)) return 0;
  return Number(sql(`select count(*) from public."${table}" where ${where};`));
}
function checkpointCount(table: string): number {
  return exists("workflow_checkpoints", table) ? Number(sql(`select count(*) from workflow_checkpoints."${table}";`)) : 0;
}

const publicTables = ["workflow_v2_definitions", "workflow_editor_documents", "workflow_revisions", "workflow_live_runs", "workflow_run_steps", "workflow_run_events", "workflow_run_jobs", "workflow_run_tombstones", "workflow_run_evidence_receipts", "workflow_execution_threads", "workflow_idempotency", "workflow_migration_reports"];
const before = Object.fromEntries(publicTables.map(table => [table, count(table)]));
const checkpoints = Object.fromEntries(["checkpoints", "checkpoint_blobs", "checkpoint_writes"].map(table => [`workflow_checkpoints.${table}`, checkpointCount(table)]));
const memoryRows = exists("workflow_memory", "store") ? Number(sql("select count(*) from workflow_memory.store where split_part(prefix,'.',3) like 'w-%';")) : 0;
const receiptRows = count("workflow_run_evidence_receipts");
const externalRunReferences = sql(`select coalesce(json_agg(distinct conrelid::regclass::text),'[]') from pg_constraint where contype='f' and confrelid='public.workflow_live_runs'::regclass and conrelid::regclass::text not like 'workflow%';`);

const preflight = { mode: apply ? "apply" : "dry-run", target: `${url.hostname}:${url.port}`, before, checkpoints, workflowScopedMemoryRows: memoryRows, evidenceReceipts: receiptRows, externalRunReferenceTables: JSON.parse(externalRunReferences) };

if (receiptRows > 0) {
  console.error(JSON.stringify({ ...preflight, blocked: "workflow_run_evidence_receipts reference runs that would be deleted; stop and report before deleting learning evidence" }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(preflight, null, 2));
if (!apply) {
  console.log(JSON.stringify({ note: "dry run only; pass --apply to delete legacy workflow canvas data and rewrite templates" }));
  process.exit(0);
}

// Child rows first; existing cascades still leave explicit deletes for auditability.
const statements = [
  "delete from public.workflow_run_steps", "delete from public.workflow_run_events", "delete from public.workflow_run_jobs",
  "delete from public.workflow_run_tombstones", "delete from public.workflow_live_runs", "delete from public.workflow_idempotency",
  "delete from public.workflow_execution_threads", "delete from public.workflow_editor_documents", "delete from public.workflow_revisions",
  "delete from public.workflow_v2_definitions", ...(exists("public", "workflow_migration_reports") ? ["delete from public.workflow_migration_reports"] : []),
  ...(exists("workflow_checkpoints", "checkpoints") ? ["delete from workflow_checkpoints.checkpoints"] : []),
  ...(exists("workflow_memory", "store") ? ["delete from workflow_memory.store where split_part(prefix,'.',3) like 'w-%'"] : []),
];
sql(`begin;\n${statements.map(statement => `${statement};`).join("\n")}\ncommit;`);

const after = Object.fromEntries(publicTables.filter(table => exists("public", table)).map(table => [table, count(table)]));
assert.equal(after.workflow_v2_definitions ?? 0, 0);
assert.equal(after.workflow_editor_documents ?? 0, 0);
assert.equal(after.workflow_revisions ?? 0, 0);
assert.equal(after.workflow_live_runs ?? 0, 0);
assert.equal(after.workflow_execution_threads ?? 0, 0);

// Rewrite templates from current fixtures; ids are unchanged so course references keep working.
const templates = [...courseWorkflowTemplates, ...workspaceWorkflowExamples().map(item => item.definition), ...productWorkflowTemplates().map(item => item.definition)];
const admin = createClient(url.href, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const saved = await admin.from("workflow_templates").upsert(templates.map(definition => ({ id: definition.workflowId, name: definition.name, description: definition.description, definition })));
assert.ifError(saved.error);
const templateCount = Number(sql("select count(*) from public.workflow_templates;"));
const providers = exists("workflow_private", "p4_catalog") ? Number(sql("select count(*) from workflow_private.p4_catalog;")) : 0;
const variables = count("workflow_workspace_configuration");
console.log(JSON.stringify({ applied: true, deleted: Object.fromEntries(Object.entries(before).map(([table, value]) => [table, value])), after, templates: templateCount, preserved: { connections: providers, variableConfigurations: variables }, note: "connections, Vault secrets, variable defaults, courses and learning data were not touched" }));
