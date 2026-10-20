// Read-only layout check: no credentials, network, model calls or data writes.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, resolve, relative, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const root = process.cwd();
const normal = path => path.split(sep).join('/');
const isArtifact = path => normal(relative(root, path)).startsWith('artifacts/');
const walk = path => existsSync(path) ? readdirSync(path).filter(name => !['node_modules', '.vercel', '.venv', '__pycache__', '.pytest_cache'].includes(name)).flatMap(name => {
  const file = resolve(path, name); return statSync(file).isDirectory() ? walk(file) : [file];
}) : [];
const failures = []; let imports = 0, links = 0, optionalArtifacts = 0;
for (const path of ['scripts/acceptance', 'tests/workflow-integration/acceptance']) {
  if (existsSync(path)) failures.push(`Retired source directory was recreated: ${path}`);
}
const required = [
  'docs/acceptance/README.md', 'docs/acceptance/DELIVERY_STATUS.md',
  'docs/acceptance/WORKFLOW_MANUAL_ACCEPTANCE_GUIDE.md', 'docs/acceptance/WORKFLOW_AGENT_SCENARIOS_GUIDE.md',
  'docs/acceptance/WORKFLOW_USER_REVIEW_2026-10-20.md',
  'docs/architecture/WORKFLOW_STATEGRAPH_RUNTIME_CONTRACT.md', 'docs/architecture/WORKFLOW_HOSTED_RUNBOOK.md',
  'tests/workflow-integration/contracts/schema_differential.py', 'tests/workflow-integration/contracts/hash_differential.py',
  'tests/workflow-integration/contracts/langgraph_parallel_interrupts.py', 'tests/workflow-integration/contracts/langgraph_execution_policies.py',
  'tests/workflow-integration/contracts/langgraph_checkpoints_store.py', 'tests/workflow-integration/contracts/model_stream_completion.py',
  'scripts/workflow/checks/test.mjs', 'src/demo/workflow/scenarios/parallel-model-reference.json',
];
for (const path of required) if (!existsSync(path)) failures.push(`Missing current maintained file: ${path}`);
const acceptanceFiles = new Set(['README.md', 'DELIVERY_STATUS.md', 'WORKFLOW_MANUAL_ACCEPTANCE_GUIDE.md', 'WORKFLOW_AGENT_SCENARIOS_GUIDE.md', 'WORKFLOW_USER_REVIEW_2026-10-20.md']);
for (const path of walk('docs/acceptance')) {
  const local = normal(relative(resolve('docs/acceptance'), path));
  if (!acceptanceFiles.has(local) && !local.startsWith('assets/workflow-user-review-20261020/')) failures.push(`Process document belongs in local archives: ${local}`);
}
const sourceRoots = ['scripts/workflow', 'tests/workflow-integration/contracts', 'tests/capability-fixtures', 'tests/browser', 'tests/workflow-integration/live', 'tests/workflow-integration/fixtures'];
const sources = [...sourceRoots.flatMap(walk), 'scripts/audit-hosted-route-facts.ts'].filter(path => ['.mjs', '.ts', '.tsx'].includes(extname(path)));
for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"]+)\1/g)) {
    const path = resolve(dirname(file), match[2]); imports++;
    if (isArtifact(path)) failures.push(`Maintained import depends on archive: ${file} -> ${match[2]}`);
    if (!existsSync(path) && !['.ts', '.tsx', '.js', '.mjs', '.json'].some(ext => existsSync(path + ext)) && !(path.endsWith('.js') && existsSync(path.slice(0, -3) + '.ts'))) failures.push(`Missing import: ${file} -> ${match[2]}`);
  }
  if (!file.endsWith('check-layout.mjs') && /scripts\/acceptance\/|tests\/workflow-integration\/acceptance\//.test(text)) failures.push(`Maintained source refers to retired scripts: ${file}`);
}
const docs = [...walk('docs'), ...walk('tests/workflow-integration'), ...walk('tests/capability-fixtures'), ...walk('tests/capability-integration'), 'README.md', 'services/workflow/README.md', 'scripts/workflow/README.md'].filter(path => extname(path) === '.md');
for (const file of docs) for (const match of readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
  const target = match[1].replace(/^<|>$/g, '').split('#')[0].replace(/:\d+$/, '');
  if (!target || /^[A-Za-z]+:/.test(target) || target.startsWith('/')) continue;
  const path = resolve(dirname(file), target); links++;
  if (isArtifact(path)) { optionalArtifacts++; continue; }
  if (!existsSync(path)) failures.push(`Missing document link: ${file} -> ${target}`);
}
const outputPaths = ['artifacts/checks/probe.json', 'artifacts/archive/probe.md', '.acceptance/processes.private.json', 'tsconfig.tsbuildinfo', 'tests/__pycache__/probe.pyc'];
const ignored = new Set(execFileSync('git', ['check-ignore', '--no-index', '--stdin'], { input: outputPaths.join('\n') + '\n', encoding: 'utf8' }).trim().split('\n'));
for (const path of outputPaths) if (!ignored.has(path)) failures.push(`Generated output is not ignored: ${path}`);
const trackedIgnored = execFileSync('git', ['ls-files', '-ci', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const path of trackedIgnored) failures.push(`Ignored file is still tracked: ${path}`);
const templateCheck = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], { input: '.env.example\ntests/workflow-integration/.env.example\n', encoding: 'utf8' });
if (![0, 1].includes(templateCheck.status) || templateCheck.stdout.trim()) failures.push('Environment template ignore check failed');
const commands = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
for (const [name, command] of Object.entries(commands)) if (/scripts\/acceptance\//.test(command)) failures.push(`Command uses retired phase scripts: ${name}`);
assert.equal(JSON.parse(readFileSync('src/demo/workflow/scenarios/parallel-model-reference.json', 'utf8')).definition.schemaVersion, '2.0');
console.log(JSON.stringify({ passed: !failures.length, trackedIgnoredFiles: trackedIgnored.length, requiredCurrentFiles: required.length, imports, links, optionalArtifactLinks: optionalArtifacts, failures }, null, 2));
if (failures.length) process.exitCode = 1;
