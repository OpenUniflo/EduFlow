// Maintained offline regression entry. No phase catalog, live service or Hosted target.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
if (process.argv.length !== 2) throw Error('This command runs the fixed offline suite; it accepts no live-target or phase arguments.');
const python = path => ['uv', 'run', '--project', 'services/workflow', '--frozen', 'python', `tests/workflow-integration/contracts/${path}`];
const commands = [
  ['node', 'scripts/workflow/export-requirements.mjs', '--check'],
  ['node', 'scripts/workflow/checks/check-layout.mjs'],
  ['pnpm', 'test'],
  ['uv', 'run', '--project', 'services/workflow', '--frozen', 'pytest', '-c', 'services/workflow/pyproject.toml', 'services/workflow/tests', '-q'],
  python('schema_differential.py'), python('hash_differential.py'),
  python('langgraph_parallel_interrupts.py'), python('langgraph_execution_policies.py'),
  python('langgraph_checkpoints_store.py'), python('model_stream_completion.py'),
];
for (const [command, ...args] of commands) {
  console.log(`\n${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, UV_OFFLINE: '1', WORKFLOW_TEST_LOCAL_DB: '0' },
  });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message ?? `Check failed (${result.status ?? result.signal}); remaining checks were not run.`);
    process.exit(1);
  }
}
console.log('\nPASS: 10 offline regression commands; no Hosted/browser acceptance claim.');
