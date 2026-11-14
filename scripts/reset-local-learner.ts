import { execFile } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { assertLocalSupabaseUrl } from "./local-supabase";

const execFileAsync = promisify(execFile);

/** Every direct learner-owned table deleted by the local reset function. */
export const LEARNER_RESET_TABLES = [
  "assignment_ai_evaluations",
  "capability_state_proposals",
  "evidence_units",
  "capability_diagnosis_runs",
  "micro_step_attempts",
  "edge_action_runs",
  "learning_events",
  "performance_results",
  "learning_attempts",
  "user_micro_unit_progress",
  "user_micro_path_progress",
  "user_material_states",
  "user_assignment_states",
  "user_knowledge_states",
  "user_course_states",
  "navigation_decisions",
  "personal_course_route_versions",
  "personal_course_routes",
  "user_evidence_sources",
  "knowledge_evidence",
  "assistant_sessions"
] as const;

/** Indirect learning tables and Storage objects covered by the same function. */
export const LEARNER_RESET_INDIRECT_TABLES = ["assistant_messages", "storage:user-evidence"] as const;

/** User-authored products and workflows are intentionally preserved. */
export const PRESERVED_USER_TABLES = [
  "courses",
  "course_mapping_runs",
  "knowledge_generation_runs",
  "user_workflow_definitions",
  "user_workflow_state",
  "workflow_editor_documents",
  "workflow_execution_threads",
  "workflow_idempotency",
  "workflow_live_runs",
  "workflow_revisions",
  "workflow_run_evidence_receipts",
  "workflow_run_tombstones",
  "workflow_run_evaluations",
  "workflow_runs",
  "workflow_migration_reports",
  "workflow_v2_definitions",
  "workflow_variable_environments",
  "workflow_evaluation_configs",
  "workflow_workspace_configuration",
  "workflow_private.p4_catalog",
  "workflow_private.p5_audit",
  "workflow_private.p5_requests",
  // Short-lived server-only OAuth state; expires on its own and cascades with auth.users.
  "mcp_oauth_flows"
] as const;

type ResetArgs = {
  emails: string[];
  allLocalUsers: boolean;
  execute: boolean;
};

type CountRow = { table: string; userId?: string; rows: number };
type ResetResult = { execute: boolean; counts: CountRow[]; remaining: CountRow[]; storagePaths: Array<{ userId: string; path: string }> };

export function assertLocalResetTarget(value: string) {
  return assertLocalSupabaseUrl(value);
}

export function parseResetArgs(argv: string[]): ResetArgs {
  const emails: string[] = [];
  let allLocalUsers = false;
  let execute = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--email") {
      const value = argv[index + 1]?.trim().toLowerCase();
      if (!value) throw new Error("--email requires an email address");
      emails.push(value);
      index += 1;
      continue;
    }
    if (arg === "--all-local-users") { allLocalUsers = true; continue; }
    if (arg === "--yes") { execute = true; continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (allLocalUsers && emails.length) throw new Error("Use either --all-local-users or --email, not both");
  if (!allLocalUsers && !emails.length) throw new Error("Pass --email <address> (repeatable) or --all-local-users");
  return { emails: [...new Set(emails)], allLocalUsers, execute };
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function listAllUsers(server: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const result = await server.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    users.push(...result.data.users);
    if (result.data.users.length < 1000) return users;
  }
}

async function resolveUsers(server: SupabaseClient, args: ResetArgs) {
  const users = await listAllUsers(server);
  const byEmail = new Map<string, User>();
  for (const user of users) {
    const email = user.email?.trim().toLowerCase();
    if (!email) continue;
    if (byEmail.has(email)) throw new Error(`Duplicate local auth user for ${email}`);
    byEmail.set(email, user);
  }
  const selected = args.allLocalUsers
    ? users
    : args.emails.map((email) => {
        const user = byEmail.get(email);
        if (!user) throw new Error(`No local auth user for ${email}`);
        return user;
      });
  if (!selected.length) throw new Error("No local auth users matched");
  for (const user of selected) {
    if (!user.email?.trim()) throw new Error(`Local auth user ${user.id} has no email; refusing to print an identifier-only target`);
  }
  return selected.map((user) => ({ id: user.id, email: user.email!.trim().toLowerCase() }));
}

function countsFor(result: ResetResult, table: string, userId: string) {
  return result.counts.filter((row) => row.table === table && row.userId === userId)
    .reduce((total, row) => total + Number(row.rows), 0);
}

async function storageFiles(server: SupabaseClient, prefix: string): Promise<string[]> {
  const result = await server.storage.from("user-evidence").list(prefix, { limit: 1000 });
  if (result.error) throw result.error;
  const paths: string[] = [];
  for (const item of result.data) {
    const path = `${prefix}/${item.name}`;
    if (item.id) paths.push(path);
    else paths.push(...await storageFiles(server, path));
  }
  return paths;
}

async function removeStorage(server: SupabaseClient, paths: string[]) {
  if (!paths.length) return;
  const result = await server.storage.from("user-evidence").remove(paths);
  if (result.error) throw result.error;
}

/** The function lives in scripts/, not migrations, so it cannot be deployed to hosted. */
export async function ensureLocalResetFunction() {
  const sqlPath = join(process.cwd(), "scripts", "reset-local-learner.sql");
  await access(sqlPath);
  let container: string;
  try {
    const listed = await execFileAsync("docker", ["ps", "--filter", "publish=54322", "--format", "{{.Names}}"]);
    container = listed.stdout.split(/\s+/).filter(Boolean)[0] ?? "";
  } catch {
    throw new Error("Local Supabase database container is not reachable through Docker; start it with pnpm db:start");
  }
  if (!container) throw new Error("Local Supabase database container was not found on port 54322; start it with pnpm db:start");
  const remote = `/tmp/eduflow-reset-local-learner-${process.pid}.sql`;
  await execFileAsync("docker", ["cp", sqlPath, `${container}:${remote}`]);
  try {
    // psql executes the whole file, including the function body. `supabase db
    // query` wraps input in a prepared statement and cannot run this script.
    await execFileAsync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", remote], { maxBuffer: 10 * 1024 * 1024 });
  } finally {
    await execFileAsync("docker", ["exec", container, "rm", "-f", remote]).catch(() => undefined);
  }
}

async function main() {
  const args = parseResetArgs(process.argv.slice(2));
  const url = assertLocalResetTarget(required("SUPABASE_URL"));
  const server = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  await ensureLocalResetFunction();
  const users = await resolveUsers(server, args);
  const userIds = users.map((user) => user.id);
  const previewResponse = await server.rpc("reset_local_learner", { p_user_ids: userIds, p_execute: false });
  if (previewResponse.error) throw previewResponse.error;
  const preview = previewResponse.data as ResetResult;
  let result = preview;
  if (args.execute) {
    const executeResponse = await server.rpc("reset_local_learner", { p_user_ids: userIds, p_execute: true });
    if (executeResponse.error) throw executeResponse.error;
    result = executeResponse.data as ResetResult;
    for (const user of users) {
      const files = await storageFiles(server, user.id);
      await removeStorage(server, files);
      const remainingFiles = await storageFiles(server, user.id);
      if (remainingFiles.length) throw new Error(`Storage verification failed for ${user.email}: ${remainingFiles.length} file(s) remain`);
    }
  }

  const expectedTables = [...LEARNER_RESET_TABLES, ...LEARNER_RESET_INDIRECT_TABLES];

  console.log(args.execute ? "Local learner reset — EXECUTE" : "Local learner reset — DRY RUN (no rows deleted)");
  for (const user of users) {
    console.log(`\n${user.email}`);
    for (const table of expectedTables) {
      const value = table === "storage:user-evidence"
        ? result.storagePaths.filter((item) => item.userId === user.id).length
        : countsFor(result, table, user.id);
      console.log(`  ${table}\t${value}`);
    }
  }
  if (!args.execute) {
    console.log("\nNo rows were deleted. Re-run with --yes to execute.");
    return;
  }

  for (const user of users) {
    const remaining = expectedTables.reduce((total, table) => total + result.remaining.filter((row) => row.table === table && (!row.userId || row.userId === user.id)).reduce((sum, row) => sum + Number(row.rows), 0), 0);
    console.log(`\nremaining\t${user.email}\t${remaining}`);
    if (remaining !== 0) throw new Error(`Reset verification failed for ${user.email}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    if (error instanceof Error) console.error(error.message);
    else if (error && typeof error === "object") {
      const value = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
      console.error([value.message, value.code, value.details, value.hint].filter(Boolean).join(" | "));
    } else console.error(String(error));
    process.exitCode = 1;
  });
}
