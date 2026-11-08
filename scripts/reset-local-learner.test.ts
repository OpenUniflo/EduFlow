import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_ONLY_SUPABASE_ERROR } from "./local-supabase";
import {
  assertLocalResetTarget,
  LEARNER_RESET_INDIRECT_TABLES,
  LEARNER_RESET_TABLES,
  parseResetArgs,
  PRESERVED_USER_TABLES
} from "./reset-local-learner";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

async function migrationSql() {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  return (await Promise.all(files.map((file) => readFile(join(migrationsDir, file), "utf8")))).join("\n");
}

function createdTables(sql: string) {
  const output: Array<{ table: string; body: string }> = [];
  for (const match of sql.matchAll(/create table(?: if not exists)?\s+(?:(public|workflow_private)\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*;/gi)) {
    output.push({ table: match[1] === "workflow_private" ? `workflow_private.${match[2]}` : match[2], body: match[3] });
  }
  return output;
}

describe("reset-local-learner local guard", () => {
  it("rejects a hosted Supabase URL before any client is created", () => {
    expect(() => assertLocalResetTarget("https://example.supabase.co")).toThrow(LOCAL_ONLY_SUPABASE_ERROR);
    expect(() => assertLocalResetTarget("http://127.0.0.1:54322")).toThrow(LOCAL_ONLY_SUPABASE_ERROR);
    expect(assertLocalResetTarget("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
  });
});

describe("reset-local-learner arguments", () => {
  it("defaults to a dry run and accepts repeatable emails", () => {
    expect(parseResetArgs(["--email", "A@x.test", "--email", "b@x.test"])).toEqual({ emails: ["a@x.test", "b@x.test"], allLocalUsers: false, execute: false });
  });

  it("requires an explicit --yes to execute", () => {
    expect(parseResetArgs(["--all-local-users"]).execute).toBe(false);
    expect(parseResetArgs(["--all-local-users", "--yes"]).execute).toBe(true);
  });

  it("rejects ambiguous or unknown input", () => {
    expect(() => parseResetArgs([])).toThrow();
    expect(() => parseResetArgs(["--all-local-users", "--email", "a@x.test"])).toThrow();
    expect(() => parseResetArgs(["--email"])).toThrow();
    expect(() => parseResetArgs(["--drop-everything"])).toThrow();
  });
});

describe("reset-local-learner table inventory", () => {
  it("classifies every migration table with a direct user_id", async () => {
    const sql = await migrationSql();
    const direct = createdTables(sql)
      .filter(({ body }) => /\b(user_id|learner_user_id)\b/i.test(body))
      .map(({ table }) => table)
      .sort();
    expect(direct).toEqual([...LEARNER_RESET_TABLES].sort());
  });

  it("classifies every owner_user_id table as a preserved user work/workflow table", async () => {
    const sql = await migrationSql();
    const owned = createdTables(sql)
      .filter(({ body }) => /\bowner_user_id\b/i.test(body))
      .map(({ table }) => table)
      .sort();
    expect(owned.every((table) => (PRESERVED_USER_TABLES as readonly string[]).includes(table))).toBe(true);
  });

  it("keeps the local-only DB function and indirect ownership in sync with the tested list", async () => {
    const sql = await readFile(join(process.cwd(), "scripts", "reset-local-learner.sql"), "utf8");
    for (const table of [...LEARNER_RESET_TABLES, ...LEARNER_RESET_INDIRECT_TABLES].filter((table) => !table.startsWith("storage:"))) {
      expect(sql).toContain(`'${table}'`);
    }
    expect(sql).toContain("storage:user-evidence");
  });

  it("never ships the local-only reset function as a migration", async () => {
    const files = await readdir(migrationsDir);
    expect(files).not.toContain("20261110120000_reset_local_learner.sql");
    const sql = await migrationSql();
    expect(sql).not.toContain("reset_local_learner");
  });

  it("never includes product content or user works/workflows", () => {
    const all = [...LEARNER_RESET_TABLES, ...LEARNER_RESET_INDIRECT_TABLES];
    for (const product of ["courses", "knowledge_nodes", "materials", "micro_learning_paths", "micro_units", "micro_steps", "workflow_v2_definitions", "workflow_live_runs", "user_workflow_definitions"]) {
      expect(all).not.toContain(product);
    }
  });
});
