import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createConnection } from "node:net";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

process.loadEnvFile(resolve(".env.local"));
const supabaseUrl = new URL(process.env.SUPABASE_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(supabaseUrl.hostname) || supabaseUrl.port !== "54321") throw new Error("This launcher only targets Local Supabase on port 54321.");
// Refuse a duplicate launcher before rotating the Worker password or private configuration.
for (const port of [18110, 5173]) {
  const occupied = await new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
  });
  if (occupied) throw new Error(`Local port ${port} is already in use. Use pnpm workflow:control to manage running Workflow services.`);
}
const outputDirectory = resolve(".acceptance/workflow-v2-m1");
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const password = randomBytes(24).toString("hex");
const internalToken = randomBytes(32).toString("hex");
const dbContainer = process.env.WORKFLOW_LOCAL_DB_CONTAINER ?? "supabase_db_EduFlow";
const initialized = spawnSync("docker", ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: `alter role workflow_worker password '${password}';\n`, encoding: "utf8" });
if (initialized.status !== 0) throw new Error("Cannot initialize the Local Workflow Worker database role; apply the Workflow V2 migration first.");
const configuration = JSON.parse(readFileSync("services/workflow/examples/local-environments.json", "utf8"));
configuration.environments[0].providers[0].modelRefs = [process.env.LLM_MODEL];
configuration.environments[0].providers[0].baseUrl = process.env.LLM_BASE_URL;
configuration.environments[0].connectors[0].allowedToolNames = ["echo", "get-sum"];
for (const tool of configuration.environments[0].tools) {
  if (tool.ref === "fixture_status") tool.inputSchema.properties.path.enum = ["fail/server-error", "fail/rate-limited", "fail/slow", "secure/orders/A1001", "secure/admin", "missing"];
}
const configurationPath = resolve(outputDirectory, "local-environments.json");
writeFileSync(configurationPath, JSON.stringify(configuration, null, 2), { mode: 0o600 });
const cacheDirectory = resolve(outputDirectory, "cache");
const pnpmHome = resolve(outputDirectory, "pnpm-home");
mkdirSync(cacheDirectory, { recursive: true, mode: 0o700 });
mkdirSync(pnpmHome, { recursive: true, mode: 0o700 });
const environment = {
  ...process.env,
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? cacheDirectory,
  PNPM_HOME: process.env.PNPM_HOME ?? pnpmHome,
  WORKFLOW_DATABASE_URL: `postgresql://workflow_worker:${password}@127.0.0.1:54322/postgres`,
  WORKFLOW_INTERNAL_TOKEN: internalToken,
  WORKFLOW_ENVIRONMENTS_FILE: configurationPath,
  WORKFLOW_CATALOG_FILE: resolve(outputDirectory, "catalog.json"),
  WORKFLOW_ALLOW_LOCAL_FIXTURES: "1",
  WORKFLOW_COMPILER_URL: "http://127.0.0.1:18110",
  LLM_PROVIDER_KEY: process.env.LLM_API_KEY,
  WORKFLOW_FIXTURE_TOOL_KEY: "tool-test-key",
};
// This ignored private file lets local acceptance perform controlled fault injection.
writeFileSync(resolve(outputDirectory, "runtime-private.json"), JSON.stringify({ databaseUrl: environment.WORKFLOW_DATABASE_URL, internalToken, configurationPath, catalogPath: environment.WORKFLOW_CATALOG_FILE }), { mode: 0o600 });
const processes = [];
function start(name, executable, args) {
  const child = spawn(executable, args, { env: environment, stdio: "inherit" });
  processes.push(child);
  console.log(`${name} started (pid ${child.pid})`);
  child.on("exit", code => console.log(`${name} exited (${code})`));
  return child.pid;
}
const pids = {
  compiler: start("Compiler", "uv", ["run", "--project", "services/workflow", "eduflow-workflow", "compiler", "--port", "18110"]),
  worker: start("Worker", "uv", ["run", "--project", "services/workflow", "eduflow-workflow", "worker"]),
  watchdog: start("Watchdog", "uv", ["run", "--project", "services/workflow", "eduflow-workflow", "watchdog"]),
  frontend: start("Frontend/API", "pnpm", ["dev", "--host", "127.0.0.1"]),
};
writeFileSync(resolve(outputDirectory, "processes.json"), JSON.stringify(pids), { mode: 0o600 });
function stop() { for (const child of processes) child.kill("SIGTERM"); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
