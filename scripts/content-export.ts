import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { CONTENT_SNAPSHOT_HEADER } from "./content-import";
import { assertLocalSupabaseUrl } from "./local-supabase";

export const CONTENT_SNAPSHOT_DIRECTORY = "content-snapshots";

export type ContentColumn = { name: string; type: string };
export type ContentRow = Record<string, string | null>;
export type ContentTableData = {
  table: string;
  columns: ContentColumn[];
  primaryKey: string[];
  rows: ContentRow[];
};
export type StorageObject = { bucket: string; path: string };
export type ContentExport = {
  generatedAt: string;
  sql: string;
  tables: ContentTableData[];
  storageObjects: StorageObject[];
};
export type ContentQuery = (sql: string) => string;

type TableSpec = {
  table: string;
  where: (courseIds: string[]) => string;
  excludedColumns?: string[];
  redactedColumns?: Record<string, string>;
};

// Product content only. Each table is ordered by primary key before export.
// Tables that hold user/learner state, auth profiles, personal routes, workflow
// runs/threads, assistant sessions, jobs or derived embeddings are intentionally
// absent and documented in the export summary.
export const CONTENT_TABLES: TableSpec[] = [
  {
    table: "courses",
    where: () => "author_user_id is null and owner_user_id is null",
    excludedColumns: ["author_user_id", "owner_user_id", "creation_brief_message_id"]
  },
  { table: "workflow_templates", where: () => "true" },
  { table: "knowledge_domains", where: () => "true", redactedColumns: { created_by: "global-admin-demo", updated_by: "global-admin-demo" } },
  {
    table: "knowledge_nodes",
    where: () => "owner_id is null and scope = 'global'",
    excludedColumns: ["owner_id"]
  },
  {
    table: "knowledge_node_revisions",
    where: () => "node_id in (select id from public.knowledge_nodes where owner_id is null and scope = 'global')",
    excludedColumns: ["created_by"]
  },
  {
    table: "knowledge_edges",
    where: () => "source_node_id in (select id from public.knowledge_nodes where owner_id is null and scope = 'global')"
      + " and target_node_id in (select id from public.knowledge_nodes where owner_id is null and scope = 'global')"
  },
  {
    table: "knowledge_edge_actions",
    where: () => "node_id in (select id from public.knowledge_nodes where owner_id is null and scope = 'global')"
  },
  {
    table: "mastery_criteria",
    where: () => "knowledge_id in (select id from public.knowledge_nodes where owner_id is null and scope = 'global')"
  },
  {
    table: "domain_assignments",
    where: () => "node_id in (select id from public.knowledge_nodes where owner_id is null and scope = 'global')",
    excludedColumns: ["assigned_by"]
  },
  { table: "course_curricula", where: courseFilter("course_id") },
  { table: "curriculum_chapters", where: courseFilter("course_id") },
  { table: "curriculum_lessons", where: courseFilter("course_id") },
  { table: "curriculum_coverages", where: courseFilter("course_id") },
  { table: "curriculum_sequences", where: courseFilter("course_id") },
  { table: "chapter_outcomes", where: courseFilter("course_id") },
  { table: "final_projects", where: courseFilter("course_id") },
  { table: "course_assignments", where: courseFilter("course_id") },
  { table: "assignment_coverages", where: courseFilter("course_id") },
  { table: "assignment_dependencies", where: courseFilter("course_id") },
  { table: "assignment_outcome_compositions", where: courseFilter("course_id") },
  { table: "final_project_outcome_compositions", where: courseFilter("course_id") },
  {
    table: "materials",
    where: courseFilter("course_id"),
    excludedColumns: ["uploaded_by"]
  },
  { table: "material_segments", where: courseFilter("course_id") },
  { table: "material_knowledge_coverages", where: courseFilter("course_id") },
  { table: "micro_learning_paths", where: (courseIds) => `course_id is null or ${courseFilter("course_id")(courseIds)}` },
  { table: "micro_units", where: microPathFilter("path_id") },
  { table: "micro_steps", where: microUnitFilter("unit_id") },
  { table: "micro_step_criteria", where: microStepFilter("step_id") },
  {
    table: "h5p_contents",
    where: () => "created_by is null",
    excludedColumns: ["created_by"]
  },
  { table: "course_action_bindings", where: courseFilter("course_id") }
];

function quoteLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function courseFilter(column: string) {
  return (courseIds: string[]) => `${column} in (${courseIds.map(quoteLiteral).join(", ")})`;
}

function microPathFilter(column: string) {
  return (courseIds: string[]) => `${column} in (select id from public.micro_learning_paths where course_id is null or course_id in (${courseIds.map(quoteLiteral).join(", ")}))`;
}

function microUnitFilter(column: string) {
  return (courseIds: string[]) => `${column} in (select u.id from public.micro_units u join public.micro_learning_paths p on p.id = u.path_id where p.course_id is null or p.course_id in (${courseIds.map(quoteLiteral).join(", ")}))`;
}

function microStepFilter(column: string) {
  return (courseIds: string[]) => `${column} in (select s.id from public.micro_steps s join public.micro_units u on u.id = s.unit_id join public.micro_learning_paths p on p.id = u.path_id where p.course_id is null or p.course_id in (${courseIds.map(quoteLiteral).join(", ")}))`;
}

function dockerContainer() {
  return process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_EduFlow";
}

function dockerPsql(sql: string, container: string) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: `${sql}\n`, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Local content export query failed (exit ${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function defaultQuery(sql: string): string {
  return dockerPsql(`set time zone 'UTC'; set datestyle to 'ISO, YMD';\n${sql};`, dockerContainer());
}

function parseJson<T>(value: string, description: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Local content export received malformed JSON for ${description}`);
  }
}

function readSchema(query: ContentQuery, tables: string[]) {
  const tableList = tables.map(quoteLiteral).join(", ");
  const columns = parseJson<{ table: string; column: string; type: string }[]>(
    query(`select coalesce(json_agg(json_build_object('table', table_name, 'column', column_name, 'type', data_type) order by table_name, ordinal_position), '[]'::json)::text
      from information_schema.columns
      where table_schema = 'public' and table_name in (${tableList})`),
    "column metadata"
  );
  const primaryKeys = parseJson<{ table: string; column: string; ord: number }[]>(
    query(`select coalesce(json_agg(json_build_object('table', t.relname, 'column', a.attname, 'ord', k.ord) order by t.relname, k.ord), '[]'::json)::text
      from pg_index i
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      join unnest(i.indkey) with ordinality as k(attnum, ord) on true
      join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
      where n.nspname = 'public' and i.indisprimary and t.relname in (${tableList})`),
    "primary keys"
  );
  return { columns, primaryKeys };
}

function readTable(query: ContentQuery, spec: TableSpec, columns: ContentColumn[], primaryKey: string[], courseIds: string[]) {
  const selectColumns = columns.map((column) => `'${column.name}', "${column.name}"::text`).join(", ");
  const orderBy = primaryKey
    .map((name) => {
      const column = columns.find((item) => item.name === name);
      const quoted = `"${name}"`;
      return column && /^(text|character varying|character)$/.test(column.type) ? `${quoted} collate "C"` : quoted;
    })
    .join(", ");
  const rows = parseJson<ContentRow[]>(
    query(`select coalesce(json_agg(json_build_object(${selectColumns}) order by ${orderBy}), '[]'::json)::text
      from public."${spec.table}"
      where ${spec.where(courseIds)}`),
    `public.${spec.table}`
  );
  return { table: spec.table, columns, primaryKey, rows };
}

function timestampSlug(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function quoteString(value: string) {
  const needsEscape = /[\\\u0000-\u001f\u007f]/.test(value);
  if (!needsEscape) return `'${value.replace(/'/g, "''")}'`;
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\u0008/g, "\\b")
    .replace(/\u000c/g, "\\f")
    .replace(/\u000b/g, "\\v")
    .replace(/[\u0000-\u0007\u000e-\u001f\u007f]/g, (character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`);
  return `E'${escaped}'`;
}

const NUMERIC_TYPES = new Set(["smallint", "integer", "bigint", "numeric", "real", "double precision", "decimal"]);
const BOOLEAN_TYPES = new Set(["boolean"]);

export function sqlLiteral(value: string | null, type: string) {
  if (value === null) return "NULL";
  if (NUMERIC_TYPES.has(type)) {
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
      throw new Error(`Cannot export non-numeric value ${JSON.stringify(value)} for ${type}`);
    }
    return value;
  }
  if (BOOLEAN_TYPES.has(type)) {
    if (value !== "true" && value !== "false") throw new Error(`Cannot export non-boolean value ${JSON.stringify(value)} for ${type}`);
    return value;
  }
  return quoteString(value);
}


function compareRows(left: ContentRow, right: ContentRow, table: Pick<ContentTableData, "columns" | "primaryKey">) {
  for (const name of table.primaryKey) {
    const column = table.columns.find((item) => item.name === name);
    const leftValue = left[name] ?? "";
    const rightValue = right[name] ?? "";
    const comparison = column && NUMERIC_TYPES.has(column.type)
      ? Number(leftValue) - Number(rightValue)
      : leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function renderContentSnapshot(tables: ContentTableData[], generatedAt: Date | string): string {
  const timestamp = typeof generatedAt === "string" ? generatedAt : generatedAt.toISOString();
  const lines = [
    CONTENT_SNAPSHOT_HEADER,
    `-- Generated by pnpm content:export from Local Supabase at ${timestamp}.`,
    "-- Product content only: users, learner state, personal routes, submissions, runs and sessions are excluded.",
    "begin;",
    "set constraints all deferred;",
    ""
  ];
  for (const table of tables) {
    lines.push(`-- public.${table.table}: ${table.rows.length} row${table.rows.length === 1 ? "" : "s"}`);
    if (table.rows.length === 0) {
      lines.push("");
      continue;
    }
    const columns = table.columns.map((column) => column.name);
    const updateColumns = table.columns
      .map((column) => column.name)
      .filter((name) => !table.primaryKey.includes(name));
    const rows = [...table.rows].sort((left, right) => compareRows(left, right, table));
    for (const row of rows) {
      const values = table.columns.map((column) => sqlLiteral(row[column.name] ?? null, column.type));
      const conflict = table.primaryKey.join(", ");
      const conflictAction = updateColumns.length > 0
        ? `do update set ${updateColumns.map((name) => `${name} = excluded.${name}`).join(", ")}`
        : "do nothing";
      lines.push(`insert into public.${table.table} (${columns.join(", ")}) values (${values.join(", ")}) on conflict (${conflict}) ${conflictAction};`);
    }
    lines.push("");
  }
  lines.push("commit;", "");
  return lines.join("\n");
}

function readStorageObjects(tables: ContentTableData[]): StorageObject[] {
  const objects: StorageObject[] = [];
  const materials = tables.find((table) => table.table === "materials");
  const h5p = tables.find((table) => table.table === "h5p_contents");
  for (const row of materials?.rows ?? []) {
    if (row.storage_path) objects.push({ bucket: "course-materials", path: row.storage_path });
  }
  for (const row of h5p?.rows ?? []) {
    if (row.storage_path) objects.push({ bucket: "micro-h5p", path: row.storage_path });
  }
  return objects;
}

export function buildContentSnapshot(options: { supabaseUrl: string; query?: ContentQuery; now?: Date }): ContentExport {
  const url = assertLocalSupabaseUrl(options.supabaseUrl);
  const query = options.query ?? ((sql: string) => defaultQuery(sql));
  const generatedAt = (options.now ?? new Date()).toISOString();
  const courseIds = parseJson<string[]>(
    query(`select coalesce(json_agg(id order by id collate "C"), '[]'::json)::text from public.courses where author_user_id is null and owner_user_id is null`),
    "product Courses"
  );
  if (courseIds.length === 0) throw new Error(`Local Supabase ${url} contains no product Courses to export`);
  const schema = readSchema(query, CONTENT_TABLES.map((spec) => spec.table));
  const tables = CONTENT_TABLES.map((spec) => {
    const excluded = new Set(spec.excludedColumns ?? []);
    const columns = schema.columns
      .filter((column) => column.table === spec.table && !excluded.has(column.column))
      .map((column) => ({ name: column.column, type: column.type }));
    const primaryKey = schema.primaryKeys
      .filter((column) => column.table === spec.table)
      .sort((left, right) => left.ord - right.ord)
      .map((column) => column.column);
    if (columns.length === 0) throw new Error(`Local Supabase has no exportable columns for public.${spec.table}`);
    if (primaryKey.length === 0) throw new Error(`Local Supabase has no primary key for public.${spec.table}`);
    const data = readTable(query, spec, columns, primaryKey, courseIds);
    for (const row of data.rows) {
      for (const [column, replacement] of Object.entries(spec.redactedColumns ?? {})) {
        if (row[column] !== null && row[column] !== undefined) row[column] = replacement;
      }
    }
    return data;
  });
  return {
    generatedAt,
    sql: renderContentSnapshot(tables, generatedAt),
    tables,
    storageObjects: readStorageObjects(tables)
  };
}

export function writeContentSnapshot(snapshot: ContentExport, directory = resolve(process.cwd(), CONTENT_SNAPSHOT_DIRECTORY)) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `eduflow-content-${timestampSlug(new Date(snapshot.generatedAt))}.sql`);
  writeFileSync(path, snapshot.sql);
  return path;
}

export function replayContentSnapshotInRollback(sql: string, options: { supabaseUrl: string; container?: string; run?: (sql: string) => string }) {
  assertLocalSupabaseUrl(options.supabaseUrl);
  if (!/^-- EduFlow content snapshot/m.test(sql) || !/\ncommit;\s*$/.test(sql)) {
    throw new Error("Refusing to replay an unrecognized content snapshot");
  }
  const replay = sql.replace(/\ncommit;\s*$/, "\nselect 'content snapshot replay ok' as replay;\nrollback;");
  const run = options.run ?? ((value: string) => dockerPsql(`set time zone 'UTC'; set datestyle to 'ISO, YMD';\n${value};`, options.container ?? dockerContainer()));
  return run(replay);
}

function argumentValue(argv: string[], name: string) {
  for (const [index, argument] of argv.entries()) {
    if (argument.startsWith(`${name}=`)) return argument.slice(name.length + 1);
    if (argument === name) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${name} requires a value`);
      return value;
    }
  }
  return undefined;
}

export function formatExportSummary(snapshot: ContentExport, path: string) {
  const lines = [
    `Exported ${path} (${Buffer.byteLength(snapshot.sql)} bytes, ${snapshot.tables.reduce((sum, table) => sum + table.rows.length, 0)} rows).`,
    "",
    "| table | rows |",
    "|---|---:|",
    ...snapshot.tables.map((table) => `| public.${table.table} | ${table.rows.length} |`),
    "",
    "Excluded: auth.users/profiles; user_* learner state; personal routes/versions; learning attempts/events/results/evidence; assignment states; workflow runs/threads/revisions/editor/environments; assistant sessions/messages; domain proposals/candidates; material parsing jobs; knowledge generation runs/embeddings.",
    "",
    "Storage objects referenced but not exported:",
    ...(snapshot.storageObjects.length === 0
      ? ["- none"]
      : snapshot.storageObjects.map((object) => `- ${object.bucket}/${object.path}`))
  ];
  return lines.join("\n");
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI and unit tests inject SUPABASE_URL directly instead of relying on .env.local.
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) throw new Error("SUPABASE_URL is required");
  const argv = process.argv.slice(2);
  const directory = argumentValue(argv, "--out-dir");
  const snapshot = buildContentSnapshot({ supabaseUrl });
  const path = writeContentSnapshot(snapshot, directory ? resolve(process.cwd(), directory) : undefined);
  console.log(formatExportSummary(snapshot, path));
  if (argv.includes("--verify-import")) {
    replayContentSnapshotInRollback(snapshot.sql, { supabaseUrl, container: dockerContainer() });
    console.log("\nContent snapshot replay succeeded in a rolled-back transaction.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
