/**
 * Read-only Local Supabase report for fake model endpoints.
 *
 * Run: pnpm exec tsx scripts/workflow/local/report-fake-endpoints.ts
 * Refuses any non-local target. It never prints credentials and never writes database rows.
 */
process.loadEnvFile(".env.local");
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const url = new URL(process.env.SUPABASE_URL!);
assert.equal(url.hostname, "127.0.0.1", "Local Supabase only");
assert.equal(url.port, "54321", "Local Supabase only");
const container = process.env.WORKFLOW_LOCAL_DB_CONTAINER ?? "supabase_db_EduFlow";

function sql(query: string): string {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", query], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

function json(query: string): unknown[] {
  const value = sql(query);
  return value ? JSON.parse(value) as unknown[] : [];
}

const fakeText = `(fake_openai|fake-openai|mock_openai|127\\.0\\.0\\.1:56121|localhost:56121)`;

const connections = json(`select coalesce(json_agg(json_build_object(
  'ref', ref, 'version', version, 'disabled', disabled,
  'name', content->>'name', 'baseUrl', content->>'baseUrl',
  'models', content->'modelRefs') order by ref, version), '[]'::json)
  from workflow_private.p4_catalog
  where ref ~* 'fake|mock' or coalesce(content->>'baseUrl','') ~ '${fakeText}';`);

const revisions = json(`select coalesce(json_agg(json_build_object(
  'workflowId', workflow_id, 'revision', revision) order by workflow_id, revision), '[]'::json)
  from public.workflow_revisions
  where definition::text ~* '${fakeText}';`);

const templates = json(`select coalesce(json_agg(json_build_object('templateId', id, 'name', name) order by id), '[]'::json)
  from public.workflow_templates where definition::text ~* '${fakeText}';`);

const runs = json(`select coalesce(json_agg(json_build_object(
  'runId', run_id, 'workflowId', workflow_id, 'revision', revision, 'environmentRef', environment_ref) order by created_at desc), '[]'::json)
  from public.workflow_live_runs where registry_snapshot::text ~* '${fakeText}';`);

const result = {
  target: `${url.hostname}:${url.port}`,
  readOnly: true,
  connections,
  workflowRevisions: revisions,
  workflowTemplates: templates,
  liveRuns: runs,
  note: "Read-only report. Rebind the affected workflows in the editor or use a reviewed Local-only cleanup; no rows were changed.",
};
console.log(JSON.stringify(result, null, 2));
