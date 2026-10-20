# Workflow Architecture

The pre-release Legacy Workflow editor, canned simulation, migration UI/API and Legacy storage have been retired. `/workflows` and `/workflows/:workflowId` now use one V2 library and editor. The current workspace implementation and acceptance scope are recorded in [Unified Workspace](architecture/WORKFLOW_UNIFIED_WORKSPACE.md). Earlier M1 acceptance reports and ADR 0003 remain historical evidence, not current UI descriptions.

## Deployment and acceptance scope

The supported deployment uses Vercel and Supabase with an authenticated Python compiler/executor, independent Worker/watchdog, official PostgreSQL checkpoints/Store and queue authority. Hosted Sandbox and Local Docker adapt the same bounded code contract. Exact operational procedures and supported combinations are defined in the [Hosted runbook](architecture/WORKFLOW_HOSTED_RUNBOOK.md), [runtime contract](architecture/WORKFLOW_STATEGRAPH_RUNTIME_CONTRACT.md) and [deployment decision](architecture/decisions/0006-workflow-p6-hosted.md).

Historical Hosted acceptance covers a bounded Production configuration, not current live health, Preview readiness, multi-day uptime or open-traffic zero-loss deployment. Releases require a controlled maintenance window and a fail-closed preflight. See [delivery scope and limitations](acceptance/DELIVERY_STATUS.md).

## Boundaries

- `domain/v2`: pure Definition, EditorDocument, Binding, Run/Step/Event DTOs, validation and factories.
- `repository/v2/WorkflowApiV2`: authenticated API boundary. No browser table access.
- `application/v2/useWorkflowV2Controller`: draft/revision concurrency, undo, immutable submissions, idempotency, session recovery, polling and history.
- `editor/v2`: the sole React Flow editor, node processing forms, Read/Process/Write binding forms, execution bubbles/details, State, environment variables, node tests and history.
- `pages`: library and route loading. Unknown identities render load/not-found states, never a Demo fallback.
- `api/workflows.ts`: one Function entrypoint. Shared handler supports definitions/layout, templates, environments/configuration, tools, validation, node tests, Runs/Steps/Events/artifacts.
- `services/workflow`: server-side Python LangGraph compiler/executor, provider/MCP/HTTP adapters, fenced jobs and watchdog.

Course/Assignment identity is authenticated and revalidated at the application/API boundary, frozen into Run metadata, and stripped from runtime claims. Success alone never completes an Assignment or grants mastery.

## Definition, editor and presentation state

The V2 Definition is the sole executable authority. `inputs`, `config` and `writes` render as Read, Process and Write. The EditorDocument separately owns node coordinates and visual routing. Selection, panel state, bubble offsets/collapse, viewport and history viewing remain presentation state. Visual changes do not change execution topology or re-fit the camera.

History uses the actual execution revision and layout. Viewing a historical snapshot is read-only and never replaces the current editing draft. Step identity includes Run, step, invocation and attempt; loops and retries are not collapsed into a mutable result per node.

## Persistence and cleanup

Definitions/revisions, layout, formal Runs, Steps and Events use owner-scoped persisted tables and server-authorized APIs. Formal history remains bounded to 20 Runs per owner/workflow. Legacy `workflow_runs`, `user_workflow_definitions`, `user_workflow_state` and `workflow_migration_reports` were removed by forward migration. Applied migrations were not rewritten. Browser keys `knowledge-atlas.workflow-state.v2` and `knowledge-atlas.workflow-settings.v2` are removed and never read by the runtime.

The shared `workflow_templates` catalog now contains V2 starting drafts. Their stable IDs remain valid CourseAssignment references. They contain no canned successful output or pretend implementation of a Course task. Using a template is an explicit authenticated action that creates an owner-private V2 definition. Concrete Course starting templates live under `src/demo/workflow` and enter the product through database seeds, never a production fallback.

## Environment and node testing

Ordinary workspace variables are owner-scoped, revisioned persisted configuration with shared defaults and authorized-environment overrides. Nodes reference them structurally with an environment Binding. They are distinct from State and managed model/tool credentials. A Run freezes ordinary variables and configuration revision in its registry snapshot; later variable edits do not replace a running Run's values. Connection authorization and credential revocation retain their existing fresh server checks.

A node test uses the same registry, compiler, binding resolution, executor, output validation and State reducers as formal execution, with isolated test input/State. It creates no formal Run, progress or evidence. Model/tool calls are real; external tool writes require explicit test confirmation. Per-node timeouts and bounded concurrency apply. Test State and results are not authoritative learner records.

## Execution scope and verification

Execution supports parallel edges/forks, all/any joins, Send, Command, conditional routing, deferred nodes, persisted subgraphs and checkpointed interrupts. Task, graph namespace and parent identity stay distinct. Static debug continuation is graph-wide and requires the current waits in one batch; business interrupts support partial responses. Functions, reducers, connections, execution policies, model/custom streaming, durable Store and independent history branches retain their current authorization, identity and external-effect guards. See the [runtime contract](architecture/WORKFLOW_STATEGRAPH_RUNTIME_CONTRACT.md), [execution ADR](architecture/decisions/0004-workflow-p4-local-execution.md) and [stream/state ADR](architecture/decisions/0005-workflow-p5-stream-memory-history.md).

Export produces a definition/layout document without credentials, not a standalone executable program. Existing subgraph execution and inspection do not imply the independent reusable subgraph canvas and per-invocation product history requested in the [open UX issues](acceptance/WORKFLOW_USER_REVIEW_2026-10-20.md).

- `pnpm test:workflow` runs maintained offline regressions without historical archives or private acceptance identities.
- `pnpm lint` and `pnpm build` check source and production output.
- [Local live API checks](../tests/workflow-integration/live/README.md) require explicit running services and isolated test data.
- Real browser and Hosted acceptance remain distinct from offline tests. Current operations use the [manual guide](acceptance/WORKFLOW_MANUAL_ACCEPTANCE_GUIDE.md); old stage reports are optional historical evidence.

## 本地开发版本交付与工作流重建

涉及画布交互、示例定义或执行契约变化的开发版本，交付时必须同步检查数据库模板和种子，并显式清理已批准本地账号的旧工作流。普通保存产生的流程修订不触发清理；页面加载、Preview 构建和 Hosted 环境不得调用该流程。

- `pnpm workflow:refresh:local --batch=<本次更新标识>`：只盘点 `.env.local` 中 LOCAL_STUDENT 账号的工作流、Thread 和 Run 数量。
- `pnpm workflow:refresh:local --batch=<本次更新标识> --apply`：按固定批次清单取消活动执行，经现有删除 API 清理该账号工作流，重建费用核算、节点提问与模型问答、订单并行前端演示三个示例。必须先应用本地迁移。模型引用来自该账号已授权环境；课程实训模板不替换成完整解答。
- 清单保存到 `artifacts/workflow/acceptance/evidence/workflow-refresh-<批次>.json`，记录目标身份、删除结果、新示例身份和隔离校验摘要。同一批次重跑只核对示例存在，不能再次清空账号或重复创建；中断后沿原清单继续。
- 清理仅允许 `127.0.0.1:54321`，保留账号、课程、学习数据、环境配置及其他账号工作流。官方检查点随所属 Thread 按身份删除，不能全表清空。独立验收应另建临时副本并精确清理。
- 必须完成主应用真实执行与演示分项验收、导航回归，并保留失败和复验记录。之后再将新示例地址交给用户；历史报告中的旧地址仅作为历史证据。



Current checks and documents must not read phase logs, archived source manifests or old Run identities as runtime input. Stage plans and candidate/retest histories are local archival materials; current contracts and ADRs remain in Git.
