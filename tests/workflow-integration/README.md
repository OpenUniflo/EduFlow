# EduFlow Integration Acceptance Fixtures

A LOCAL-ONLY starter kit for EduFlow PR3 (real LLM/tools), PR5 (Skills/Harness), and PR6 (deployment integration).
No DeepSeek key is included. All orders and API keys in fixtures are fictional.
This package prepares testing resources; it does **not** implement EduFlow's LangGraph compiler, execution worker, deployment endpoints, or secure production sandbox.

## Requirements
- macOS/Linux with Docker Desktop (or equivalent Docker Compose)
- Node.js (for MCP Everything/Inspector; prefer Node 22.19+)
- Python 3.10+ and curl
- Your DeepSeek API key (kept outside this folder)

## 1. Launch local mock API

```bash
docker compose up -d wiremock
bash scripts/smoke_test.sh
```

The API is bound to `http://127.0.0.1:18080` on your Mac only.
Example: `curl http://127.0.0.1:18080/orders/A1001`.
The mock API includes successful orders, 404, 429, 500, a four-second slow endpoint, tool auth tests, and a webhook receiver.
The WireMock request journal is available at `/__admin/requests` for local debugging.

## 2. Test DeepSeek Tool Calling (PR3)

Run these commands in a LOCAL terminal, not in a shared script or repository:

```bash
export DEEPSEEK_API_KEY='your-secret-key'
export DEEPSEEK_MODEL='deepseek-flash'    # or deepseek-v4-pro
python3 scripts/test_deepseek_tool_call.py
```

This performs actual metered DeepSeek requests to its API and an actual local WireMock tool request.
DeepSeek discontinued the legacy `deepseek-chat` and `deepseek-reasoner` model IDs in July 2026; use the current API docs/models.

## 3. MCP testing (PR3)

The official Everything MCP server is a protocol conformance fixture, not a useful production business tool:

Run these commands from `tests/workflow-integration/`. EduFlow requires pnpm;
`npx` uses npm and is rejected by the repository's `devEngines.packageManager` check.

```bash
pnpm dlx @modelcontextprotocol/server-everything@1.0.0
```

The default uses stdio and occupies the terminal. To open the graphical Inspector
with EduFlow's ready-to-use server configuration (from the repository root or this directory):

```bash
pnpm test:workflow:mcp
```

The startup script loads `mcp-inspector.json` as a read-only session. It shows
`eduflow-everything`, using `pnpm dlx @modelcontextprotocol/server-everything@1.0.0`.
Connect that server, list its tools, then call `echo` with
`{"message":"eduflow-mcp-acceptance"}` or `get-sum` with `{"a":17,"b":25}`.
Expected results: `Echo: eduflow-mcp-acceptance` and `The sum of 17 and 25 is 42.`

Launching Inspector without `--config` loads its personal catalog, whose built-in
sample servers use `npx`. Use `pnpm test:workflow:mcp` on each launch to load the
repository configuration. Edit `mcp-inspector.json` to change the project defaults.
The EduFlow Python Worker (not Vercel browser code) should ultimately be the MCP client.

Official sources:
- https://github.com/modelcontextprotocol/servers/tree/main/src/everything
- https://github.com/modelcontextprotocol/inspector

## 4. Local Skills (PR5)

Skills are under `skills/*/SKILL.md` following the Agent Skills format.
They are test fixtures authored for this package, not upstream third-party Skills.
They will not activate automatically: EduFlow/Deep Agents must be explicitly configured to load them.

Test the data analysis script without a model:

```bash
python3 skills/data-analysis/scripts/analyze.py \
  skills/data-analysis/assets/orders.csv outputs/analysis.json
cat outputs/analysis.json
```

Expected result: 3 rows, total 199.50 CNY.
Spec: https://agentskills.io/specification
Deep Agents: https://github.com/langchain-ai/deepagents

## 5. Optional local PostgreSQL for Checkpoint and Store (PR5)

You may instead reuse a separate/test Supabase Postgres database. Never point test fixtures at production user data.

```bash
docker compose --profile state up -d
```

Test database connection string (host-side):

`postgresql://eduflow_test:eduflow_local_only_change_me@127.0.0.1:15432/eduflow_runtime`

Change the test password with `POSTGRES_PASSWORD` *before first initialization*; if the database is already initialized, changing the env var alone does not rotate the existing DB password. Keep this local service off the public network. Configure the actual Python worker with the official `langgraph-checkpoint-postgres` PostgresSaver/PostgresStore; remember `.setup()` and scoped/multi-tenant access.

## 6. Deployment integration (PR6)

Once your EduFlow deployment API exists, call it with an independent client and test: valid token, missing token 401, valid token insufficient scope 403, user A vs user B isolation, version pinning and webhook callbacks.
**These tests cannot pass before the real EduFlow deployment API is implemented.**

`docs/ACCEPTANCE.md` contains the matrix.

## Stop

```bash
docker compose --profile state down
```

This leaves the optional database volume intact. Add `-v` ONLY if you deliberately want to delete test data.

## Production safety notes
- A local Docker container is not enough to safely execute arbitrary student-supplied code; use a hardened sandbox / stronger isolation and restrict network/file/credential access.
- Do not expose WireMock administrative endpoints or example authentication headers publicly.
- Never store provider API keys in the workflow JSON, frontend bundle, or Git repo. Use server-side secret references.
- A mock business tool endpoint is not an identity provider or authorization service.
