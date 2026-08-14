import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const REPO = join(import.meta.dirname, "../..");
const OUTPUT = join(REPO, "phase4.2-acceptance");
const SCRIPT = join(import.meta.dirname, "phase4_2.ts");

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, SCRIPT, ...args], { cwd: REPO, env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Phase 4.2 live run exited with ${code}`)));
  });
}

type Report = {
  ownerId: string;
  source: { parsingJobId: string };
  generated: { candidateCount: number; relationCount: number };
  evaluation: { metrics: { expectedNodeRecall: number; spuriousNodeRate: number } };
  calls: { llmRequestCount: number; promptTokens: number };
};

function stats(values: number[], includeRange = false) {
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1], ...(includeRange ? { range: sorted[sorted.length - 1] - sorted[0] } : {}) };
}

mkdirSync(OUTPUT, { recursive: true });
const jobArgumentIndex = process.argv.indexOf("--job-id");
const ownerArgumentIndex = process.argv.indexOf("--owner-id");
const existing = jobArgumentIndex >= 0 && ownerArgumentIndex >= 0
  ? ["--job-id", process.argv[jobArgumentIndex + 1], "--owner-id", process.argv[ownerArgumentIndex + 1]]
  : undefined;
await run([...(existing ?? ["--keep"]), "--run-index", "1"]);
const first = JSON.parse(readFileSync(join(OUTPUT, "run-1.json"), "utf8")) as Report;
for (let index = 2; index <= 3; index += 1) {
  await run(["--job-id", first.source.parsingJobId, "--owner-id", first.ownerId, "--run-index", String(index)]);
}
const reports = [1, 2, 3].map((index) => JSON.parse(readFileSync(join(OUTPUT, `run-${index}.json`), "utf8")) as Report);
const summary = {
  runCount: reports.length,
  policy: "evaluation-only; all runs retained; no voting or best-run selection",
  nodeCount: stats(reports.map((report) => report.generated.candidateCount), true),
  edgeCount: stats(reports.map((report) => report.generated.relationCount), true),
  nodeRecall: stats(reports.map((report) => report.evaluation.metrics.expectedNodeRecall)),
  spuriousRate: stats(reports.map((report) => report.evaluation.metrics.spuriousNodeRate)),
  llmRequestCount: stats(reports.map((report) => report.calls.llmRequestCount)),
  promptTokens: stats(reports.map((report) => report.calls.promptTokens))
};
writeFileSync(join(OUTPUT, "stability-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
