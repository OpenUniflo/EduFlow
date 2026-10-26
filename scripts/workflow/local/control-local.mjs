import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, openSync } from "node:fs";
import { resolve } from "node:path";
process.loadEnvFile(resolve(".env.local"));
if (new URL(process.env.SUPABASE_URL).hostname !== "127.0.0.1") throw new Error("Local only");
const directory = resolve(".acceptance/workflow-v2-m1");
const privateConfig = JSON.parse(readFileSync(resolve(directory, "runtime-private.json"), "utf8"));
const pidsPath = resolve(directory, "processes.json");
const pids = JSON.parse(readFileSync(pidsPath, "utf8"));
const action = process.argv[2] ?? "restart";
const targets = process.argv.slice(3).length ? process.argv.slice(3) : ["compiler", "worker", "watchdog"];
if (!targets.every(name => ["compiler", "worker", "watchdog"].includes(name)) || !["start", "stop", "restart"].includes(action)) throw new Error("Invalid local control action");
let processRows = [];
try { processRows = execFileSync("ps", ["-axo", "pid,ppid,command"], { encoding: "utf8" }).split("\n"); } catch { /* ps may be unavailable in a sandbox */ }
for (const name of targets) {
  if (["restart", "stop"].includes(action)) {
    const pid = pids[name];
    for (const row of processRows) {
      const match = row.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (match && Number(match[2]) === pid && match[3].includes("eduflow-workflow") && match[3].endsWith(name + (name === "compiler" ? " --port 18110" : ""))) { try { process.kill(Number(match[1]), "SIGTERM"); } catch { /* already stopped */ } }
    }
    try { if (processRows.some(row => row.trim().startsWith(`${pid} `) && row.includes("eduflow-workflow"))) process.kill(pid, "SIGTERM"); } catch { /* already stopped */ }
    pids[name] = null;
  }
}
await new Promise(resolve => setTimeout(resolve, 500));
const environment = { ...process.env, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? resolve(directory, "cache"), PNPM_HOME: process.env.PNPM_HOME ?? resolve(directory, "pnpm-home"), no_proxy: "localhost,127.0.0.1,::1", NO_PROXY: "localhost,127.0.0.1,::1", WORKFLOW_FIXTURE_TOOL_REFS: "identity,order_lookup,fault_500,fault_429,fault_slow,fault_401,fault_403,fault_404,fixture_status,hn_ai_agents,hn_community_question,npm_zod,pypistats_langgraph,se_workflow,echo,get-sum,everything:echo,everything:get-sum", WORKFLOW_DATABASE_URL: privateConfig.databaseUrl, WORKFLOW_INTERNAL_TOKEN: privateConfig.internalToken, WORKFLOW_ENVIRONMENTS_FILE: privateConfig.configurationPath, WORKFLOW_CATALOG_FILE: privateConfig.catalogPath, WORKFLOW_HEALTH_DIRECTORY: directory, WORKFLOW_ALLOW_LOCAL_FIXTURES: "1", LLM_PROVIDER_KEY: process.env.LLM_API_KEY, WORKFLOW_FIXTURE_TOOL_KEY: "tool-test-key" };
for (const name of targets) {
  if (["restart", "start"].includes(action)) {
    const logfile = openSync(resolve(directory, `${name}.log`), "a", 0o600);
    const args = ["run", "--project", "services/workflow", "eduflow-workflow", name, ...(name === "compiler" ? ["--port", "18110"] : [])];
    const child = spawn("uv", args, { detached: true, env: environment, stdio: ["ignore", logfile, logfile] });
    pids[name] = child.pid; child.unref(); console.log(`${name} started (pid ${child.pid})`);
  } else console.log(`${name} stopped`);
}
writeFileSync(pidsPath, JSON.stringify(pids), { mode: 0o600 });
