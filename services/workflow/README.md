# Workflow V2 StateGraph service

The server compiles EduFlow Definition `2.0` to Python LangGraph. The TypeScript API authenticates users and persists immutable revisions; Python executes queued runs through Vercel Queues push on Vercel and through the local worker/watchdog under `pnpm workflow:local`. Supported capabilities include parallel/subgraph/checkpoint recovery, ordinary-node interrupts, versioned functions, isolated code, reducers, managed connections, execution policies, streaming, multi-turn Threads, scoped Store and history branches. See the [runtime contract](../../docs/architecture/WORKFLOW_STATEGRAPH_RUNTIME_CONTRACT.md), [execution ADR](../../docs/architecture/decisions/0004-workflow-p4-local-execution.md), [stream/state ADR](../../docs/architecture/decisions/0005-workflow-p5-stream-memory-history.md), and [delivery limits](../../docs/acceptance/DELIVERY_STATUS.md).

## Install and verify

```bash
docker pull python@sha256:f6a589d43c42b9e7f7dc67a12d37132491f362859a5d750607710cc56da3bc72
docker pull node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
cd services/workflow
uv sync --frozen
uv run pytest -q
cd ../..
node scripts/workflow/export-requirements.mjs --check
WORKFLOW_TEST_LOCAL_DB=1 uv run --project services/workflow --frozen pytest -q services/workflow/tests
```

The last command runs from the repository root, requires the running Local Supabase database and its ignored Local runtime fixture, and executes rollback-only SQL checks. It never resets a database or starts/stops shared workers. Ordinary tests need Docker with the two pinned images, but neither database nor model credentials. User code is run only in restricted ephemeral containers, with no host mounts or credentials. `uv.lock` pins the actual SDK versions; CI prepares the same image digests.

## Local complete service

From the repository root, after applying pending forward migrations:

```bash
node scripts/workflow/local/start-local.mjs
```

The launcher starts the compiler on `127.0.0.1:18110`, Worker, independent watchdog, and the Vite/API server. WireMock must already be available on `127.0.0.1:18080`. The example configuration is an explicit Local fixture adapter, never a production fallback. The launcher injects credentials from `.env.local`, creates a password for the restricted `workflow_worker` database role, and writes ignored private runtime files. Credentials must not persist in Workflow JSON, browser storage or acceptance reports. The P4 connection panel accepts a transient password field through the authenticated API and stores it encrypted in Supabase Vault; only the worker/consumer resolves active references.

Processes may also be started independently:

```bash
uv run --project services/workflow eduflow-workflow compiler --port 18110
uv run --project services/workflow eduflow-workflow worker
uv run --project services/workflow eduflow-workflow watchdog
```

Required server environment variables:

| Variable | Use |
| --- | --- |
| `WORKFLOW_DATABASE_URL` | Worker-only connection for the restricted role |
| `WORKFLOW_INTERNAL_TOKEN` | Shared API/compiler service identity |
| `WORKFLOW_ENVIRONMENTS_FILE` | Absolute path to trusted operator-owned environment JSON |
| `WORKFLOW_CATALOG_FILE` | Absolute path to authorized discovery catalog shared by compiler/Worker processes |
| `WORKFLOW_ALLOW_LOCAL_FIXTURES` | Set `1` only for explicitly configured Local fixture environments |
| `WORKFLOW_COMPILER_URL` | TypeScript API's internal compiler URL |
| provider/tool Secret references | Environment-variable names registered by trusted configuration |
| `WORKFLOW_REDACT_FIELDS` | API projection field names; defaults to email, phone, address, ssn |

The Local launcher uses `.env.local` server references (`LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`); it does not copy the key into the environment catalog. Supported models come from the authorized runtime configuration. A model reference alone does not prove a successful model Run; real-provider evidence and independent readback are recorded separately in the P3/P4/P5 acceptance reports.

The environment file grants `ownerIds`, provider/model references, tools, connectors, network destinations and limits. `ownerIds: ["*"]` in the example is only for the isolated Local acceptance catalog. Hosted configuration must explicitly define its authorized owners. P4 owners may configure their own permitted HTTP/DeepSeek/MCP-HTTP connections through validated APIs. The server validates destinations, schemas, effects and ownership; user configuration cannot introduce host commands or authority. Remote HTTP/MCP destination checks remain active, and private fixture access is explicitly Local-only.

The provider SDK supports trusted operator-configured `HTTP_PROXY`, `HTTPS_PROXY` and `ALL_PROXY` values, including SOCKS through the locked `httpx[socks]` dependency. Provider initialization and tool-binding failures are reported as `MODEL_ADAPTER_FAILED` without logging keys or proxy credentials. Offline SDK construction under a synthetic SOCKS environment is tested separately from real model acceptance. Registered HTTP/MCP tools retain `trust_env=False`, destination checks, pinned DNS and denied redirects; provider proxy configuration cannot bypass their network policy.

MCP discovery uses the official SDK, filters operator-registered tool names, and records raw Schema digests. The catalog is replaced atomically and read by each process. Editing the trusted environment file changes its revision and revokes incompatible accepted runs at the next guarded boundary. Credentials are resolved at invocation, never captured by compilation. Unsupported MCP Schema keywords make the tool unavailable rather than silently weakening validation.

## Persistence and failure semantics

PGMQ records remain the durable local delivery mechanism. The API inserts the Run, idempotency reservation and job row in one database transaction. On Vercel, `api/_lib/workflowQueue.ts` then publishes a `runId`-only Vercel Queues message; the deployment's own consumer calls `claim_run`, which claims exactly that Run instead of the shared PGMQ rotation. The adapter adds run-specific fencing tokens and 30-second leases; heartbeat is 5 seconds. Local `pnpm workflow:local` keeps the independent watchdog that scans every 5 seconds and seals queue timeouts (60 seconds), expired leases, cancellation and total timeouts.

Hosted has no standing watchdog. A delayed queue-timeout message (75 seconds) and each finished Run call the same bounded `watchdog`/`p5_sweep` and sandbox `reap`; `claim_run` seals a stale lease on redelivery. This advances cleanup only while a Run is active, so long idle periods defer retention cleanup to the next activity.

State/Step/events and official checkpoints are coordinated with version checks and deduplicated task receipts. A persistence failure stops further graph execution. A Worker crash becomes `WORKER_LOST`; explicit checkpoint continuation uses remaining cumulative attempts and preserves committed results. Unknown external effects prohibit blind retries. A cancellation cannot undo an already issued remote request. Each tool batch is fully authorized and validated before invocation, then executed serially; a failure stops remaining calls without committing the batch State patch. Node retry is separate from Worker recovery.

P4 isolated calls have a container deadline and a second deadline enforced by the execution budget and the bounded watchdog sweep. Local development keeps Docker and the independent watchdog; Hosted uses pinned Vercel Sandbox microVMs. Node-result caching uses the official Worker-process cache, limited to 512 entries and whole-second TTL; restarting the Worker/consumer loses the cache. Permission checks, current task audit, concrete function output Schema and patch commits remain outside that cache. This is separate from the compilation-plan cache described below.

The Compiler keeps a bounded 64-entry `functools.lru_cache` of immutable graph plans keyed by the accepted `compileFingerprint` and topology tuple. Cached plans contain only stable node identities/types and outlet/target structure. Each Run revalidates its environment and binds a fresh LangGraph instance, node lookup, execution callbacks and State; no owner, Secret, client or mutable Run data enters the cache. Registry/SDK fingerprints produce separate entries. Worker telemetry records only aggregate hit/miss/size counters in the operator-owned `WORKFLOW_CACHE_INFO_FILE` (default: `WORKFLOW_CATALOG_FILE` plus `.cache-info.json`). The service-authenticated internal `GET /v1/cache-info` reads those counters after checking the Worker build identity; cache keys/contents are never exposed, and the pure Compiler performs no telemetry file writes.

Raw Input/State/Trace are inaccessible to browser Data API roles. The application API exposes authorized redacted projections and artifact references. Live runs default to `unverified`; success does not complete assignments or grant Knowledge mastery. Run history is limited to the newest 20 records per owner/workflow, with owner-scoped tombstones and independent idempotency retention. Active waiting checkpoints belong to Thread lifecycle rather than retained Run history.

This service's Local evidence does not establish Hosted readiness. Hosted deployment requires separate Worker supervision, internal network identity, Secret provisioning, migration/API/browser checks and actual Vercel Function-count evidence.

The internal `/v1/validate` preflight reports separate `checks.structure`,
`checks.environment`, and `checks.input`. Missing input is explicitly
`"unchecked"`; supplied input is checked against the input Schema and initial
State bindings without constructing a model SDK, executing a tool, saving a
revision, or enqueueing a Run. Browser draft preflight is owner-authorized at
`api/workflows?resource=validate`; execution still revalidates its immutable saved
revision and exact submitted input. Diagnostic scopes and JSON Pointers identify
input fields separately from definition configuration and environment readiness.
Tool display grouping comes only from operator catalog `group: "test" | "general"`
metadata. Missing metadata does not imply a group or expand tool permissions.

## P6 Hosted acceptance and operating boundaries

Model completion requires an explicit successful official SDK finish reason. Length, missing final reason, filtering and empty text without valid tool calls fail before computed output or result commit. Valid tool-only responses remain supported. Optional `modelParameters.thinking={"type":"enabled"|"disabled"}` is validated and passed through official `ChatDeepSeek.extra_body`; omission preserves provider defaults. The existing advanced node parameters editor can set it. Requested token caps and actual SDK usage are separate evidence.

The configured Hosted target uses the user-authorized Vercel + Supabase topology. Historical bounded verification and current implementation are distinct from a new deployment health check; see [delivery scope and limitations](../../docs/acceptance/DELIVERY_STATUS.md).

Migrations are reconciled and incrementally applied before deployment, never reset or automatically applied by Preview builds. Production runtime content uses persisted data, explicit Hosted owners, server-side credentials and permission-checked external integrations. Local fixtures and wildcard grants are not a Hosted fallback.

Worker restart does not automatically take over a lost Run. Recovery is explicit, keeps cumulative budgets and committed State/Store, and rejects incompatible executors while retaining history. History branches do not rewind external writes or the current Store. An external write with an unknown outcome blocks blind retries and error-handler execution, including SDK-enforced node deadlines.

The existing frontend design is retained. Changes address actual Hosted findings in run selection, cancellation, interrupted recovery, stream visibility and editing failed nodes. No layout or styling redesign is part of P6.

Before signing a release, verify actual generated Function counts, authenticated APIs, browser flows, upgrade/drain/rollback, credential revocation, isolated backup restoration, bounded cleanup and the final stability window. Retention boundary tests do not establish seven days of continuous operation. See the [Hosted runbook](../../docs/architecture/WORKFLOW_HOSTED_RUNBOOK.md) for operator procedures.

## Hosted topology (one `edu-flow` project)

Per user instruction, Hosted uses only Vercel and Supabase. Since M14 ([ADR 0007](../../docs/architecture/decisions/0007-workflow-backend-in-main-project.md), which supersedes the two-project deployment decision in [ADR 0006](../../docs/architecture/decisions/0006-workflow-p6-hosted.md)) the Vite frontend, the authenticated TypeScript APIs, the Python Compiler Function and the Vercel Queues consumer all belong to the single `edu-flow` project. `api/workflow-compiler.py` adds this service's bundled `src` to `sys.path`, applies the same `assert_hosted_configuration()` as `main.py`, and mounts the authenticated FastAPI app under `/api/workflow-compiler`, so Hosted clients call `https://<edu-flow domain>/api/workflow-compiler/v1/...`. The retired `edu-flow-workflow` project is no longer part of the current runtime.

Hosted packaging is owned by the root `vercel.json`: it declares the Python Compiler Function (`maxDuration` 120, `includeFiles: services/workflow/src/**`), the queue consumer (`api/workflow-run-consumer.py`, `maxDuration` 300, `queue/v2beta` topic `workflow-runs`), and the `/api/workflow-compiler/:path*` rewrite. There are no Vercel Daemons. Dependencies are installed from the root `requirements.txt`, which is generated from `uv.lock` by `scripts/workflow/export-requirements.mjs` and checked by `pnpm test:workflow`; the root `.python-version` pins 3.13. Do not edit `requirements.txt` by hand, and keep the Function count at 11 (9 TypeScript entries plus `workflow-compiler.py` and `workflow-run-consumer.py`). Local development keeps `pnpm workflow:local`, the worker/watchdog CLI commands, and this service's Dockerfile unchanged.

Vercel execution is queue push; there are no Daemons. The restricted SSL session-pooler connection owns official checkpoints/Store; shared SQL signals/catalog replace ephemeral-file authority. Python/JavaScript execute in pinned, deny-all Vercel Sandbox microVMs with inner non-root cgroup/mount limits. Use `WORKFLOW_ENVIRONMENTS_JSON`, `WORKFLOW_DEPLOYMENT_MODE=hosted`, `WORKFLOW_SANDBOX_BACKEND=vercel` and pinned `WORKFLOW_SANDBOX_IMAGE`. Secrets stay server-side.

Deploy the repository root with the root `vercel.json`; never deploy this directory as an independent Vercel project. `/ready` is internally authenticated: Hosted checks DB and Sandbox (`executionMode: "queue"`), while local development also checks worker/watchdog signals. `/health` alone is only liveness. See the [Hosted runbook](../../docs/architecture/WORKFLOW_HOSTED_RUNBOOK.md). The [current delivery scope](../../docs/acceptance/DELIVERY_STATUS.md) preserves the limits of the historical acceptance; inspect `/ready` and the current deployment when performing new Hosted acceptance.

## 运行模块命名

`graph_control.py` 负责并行、子图、路由和图控制；`execution_policies.py` 负责函数、重试、超时和缓存；`session_memory_history.py` 负责流式模型、会话、Store 与历史操作。三者都是正式执行器依赖，连同对应回归测试纳入 Git。原阶段文件名已移除。

模块重命名及导入变更会更新源码计算的 executorDigest。发布必须遵循执行器兼容规则；不能把旧检查点自动认定为与新 digest 兼容。本次目录整理不会重启正在运行的服务或部署新执行器。
