import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { assertLocalSupabaseUrl } from "./local-supabase";

export const CONTENT_SNAPSHOT_DIRECTORY = "content-snapshots";
export const CONTENT_SNAPSHOT_HEADER = "-- EduFlow content snapshot";

export type ContentSnapshot = { path: string; sql: string; bytes: number };
export type SqlRunner = (sql: string, target: { url: string; container: string }) => void;

export function latestContentSnapshot(directory = resolve(process.cwd(), CONTENT_SNAPSHOT_DIRECTORY)): string {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    throw new Error(`Content snapshot directory not found: ${directory}`);
  }
  const candidates = entries
    .filter((name) => name.endsWith(".sql"))
    .map((name) => {
      const path = join(directory, name);
      return { name, path, modified: statSync(path).mtimeMs };
    })
    .sort((left, right) => right.modified - left.modified || right.name.localeCompare(left.name));
  if (candidates.length === 0) throw new Error(`No .sql content snapshot found in ${directory}`);
  return candidates[0].path;
}

export function readContentSnapshot(path: string): ContentSnapshot {
  const sql = readFileSync(path, "utf8");
  if (!sql.startsWith(CONTENT_SNAPSHOT_HEADER)) {
    throw new Error(`Refusing to import an unrecognized SQL file: ${path}`);
  }
  if (!/\binsert into public\./i.test(sql)) {
    throw new Error(`Content snapshot contains no product content inserts: ${path}`);
  }
  return { path, sql, bytes: Buffer.byteLength(sql) };
}

function dockerRunner(sql: string, target: { url: string; container: string }) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", target.container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Local content import failed (exit ${result.status}): ${result.stderr || result.stdout}`);
  }
}

export function importContentSnapshot(options: {
  supabaseUrl: string;
  file?: string;
  directory?: string;
  container?: string;
  run?: SqlRunner;
}): { snapshot: ContentSnapshot; url: string; container: string } {
  const url = assertLocalSupabaseUrl(options.supabaseUrl);
  const path = options.file ? resolve(process.cwd(), options.file) : latestContentSnapshot(options.directory);
  const snapshot = readContentSnapshot(path);
  const container = options.container ?? process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_EduFlow";
  const run = options.run ?? dockerRunner;
  run(snapshot.sql, { url, container });
  return { snapshot, url, container };
}

function argumentFile(argv: string[]) {
  for (const [index, argument] of argv.entries()) {
    if (argument.startsWith("--file=")) return argument.slice("--file=".length);
    if (argument === "--file") {
      const value = argv[index + 1];
      if (!value) throw new Error("--file requires a content snapshot path");
      return value;
    }
  }
  return undefined;
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI and unit tests inject SUPABASE_URL directly instead of relying on .env.local.
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) throw new Error("SUPABASE_URL is required");
  const { snapshot, container } = importContentSnapshot({ supabaseUrl, file: argumentFile(process.argv.slice(2)) });
  console.log(`Imported ${snapshot.path} (${(snapshot.bytes / 1024).toFixed(0)} KiB) into Local Supabase ${container}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

