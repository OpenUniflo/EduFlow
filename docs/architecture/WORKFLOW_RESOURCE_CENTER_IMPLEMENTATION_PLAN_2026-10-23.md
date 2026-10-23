# 工作流资源中心与节点配置改造 · 实施计划（2026-10-23）

状态：**实施中（M0–M4 已完成并提交）。** 本文是 [改造方案](WORKFLOW_RESOURCE_CENTER_AND_NODE_CONFIG_PLAN_2026-10-23.md) 的执行版：方案回答"做成什么样、为什么"，本文回答"按什么顺序、改哪些文件、怎样算做完"。两者冲突时以方案为准，并在第 9 节「偏差记录」登记。

设计稿：Design 画布「EduFlow 工作流画布改造」（https://claude.ai/artifact/F6AEviLALhRyPYuncBbs6b ）。每个阶段列出了对应画板，实现时以画板为视觉依据。

---

## 0. 给接手智能体的使用说明

1. **先读**：本文第 1–3 节 → 改造方案全文 → 仓库根目录 `AGENTS.md` 的「Workflow Module Boundaries」「Backend and Data Runtime」「Hosted Deployment Discipline」「Frontend Project Structure」。
2. **找到当前阶段**：看第 8 节「进度跟踪」中第一个不是 `done` 的阶段。阶段之间的依赖见第 4 节；不要跳过前置阶段。
3. **一个阶段一次提交**（必要时拆成若干小提交，但不要跨阶段混合）。提交信息格式：`feat(workflow): <阶段编号> <一句话>`，例如 `feat(workflow): M2 openai-compatible provider in worker`。
4. **每个阶段结束前**必须跑完第 2.2 节的门禁命令，并在第 8 节把状态改为 `done`、填写提交号和备注。门禁失败不得标 `done`。
5. **遇到方案没写到的情况**：优先选与现有代码一致、改动最小的做法，在第 9 节登记偏差；涉及第 1.4 节「待确认决策」或会改变数据语义时，停下来问用户。
6. **不要做的事**：除 M14 的 Python 编译入口外不新增 Vercel Function，且总数不得超过 12；除 M13 的一个前向迁移外不写数据库迁移；不改 LangGraph State 语义；不为旧版 `core.llm` / `core.tool` 写兼容运行或自动转换；不引入新的重量级前端依赖；不把 Demo 数据作为生产回退；不 `reset` 或自动迁移 Hosted 数据库。
7. 所有面向用户的文案用中文；代码风格匹配所在文件（本 Feature 的 TSX 文件普遍是紧凑单行风格，新文件可以正常换行，但不要重排旧文件）。

---

## 1. 基线与决策

### 1.1 代码基线

- 分支 `feat/workflow`，基线提交 `ff3b9db`（"fix(workflow): repair local MCP discovery and simplify connection UX"）。
- 若开始时基线已前进，先 `git log --oneline ff3b9db..HEAD -- src/features/workflow services/workflow api/_lib/workflowV2.ts` 看清变化，再核对第 3 节代码地图是否仍成立。

### 1.2 已定决策（来自改造方案第 8 节）

| 编号 | 结论 |
| --- | --- |
| D1=A / D2=A | 共享 Runtime 环境 + 每用户连接；连接版本不可变，节点显式升级 |
| R2=B | 资源中心只做编辑器内 L3 悬窗，不新增路由 |
| R5=A | 模型节点先声明输入参数，提示词只引用参数名 |
| R6 | 节点「运行数据」来自历史中选中的那次运行 |
| R7 | 画布铺满，控件/侧面板/抽屉/悬窗都浮在画布上（四级浮层） |
| R8 | 一个供应商一份凭据，可启用多个模型；添加时可拉取 `/models` 勾选 |
| R1=B | 用户自建多套变量环境（参考 Apifox），与平台运行环境解耦；顶栏切换，Run 冻结所选环境 → M13 |
| R3 | 不分新旧版本：`core.llm`、`core.tool` 只保留最新定义（typeVersion 2），旧版直接废弃，只保留编译报错 `NODE_VERSION_RETIRED` 作防线，不做重建或转换 → M10、M11 |
| R4=A | 仅 `localFixtures` 环境允许 `http://localhost` 模型/API → M2 |
| R9 | 工具参数按 Schema 逐行、表单式填写，可绑定变量或按类型填固定值 → M8、M11 |
| R10 | 本地与 Hosted 中改造前的工作流画布数据（定义、编辑器文档、修订、Run、Thread、检查点等）直接清理，不保留、不做兼容；**保留**用户建立的模型/API/MCP 连接与 Vault 凭据、变量默认值、课程与学习数据 → 第 5.0 节、M10、M12 |
| R11 | 工作流后端（Python Compiler + Worker + watchdog）从 Vercel 项目 `edu-flow-workflow` 合并进 `edu-flow`，合并验证通过后删除 `edu-flow-workflow` → M14 |
| R12 | 平台运行环境是公共基础设施，对所有登录用户开放：Hosted 使用现有的 `access: "authenticated"`（不能同时写 `ownerIds`）。代码规定这种环境**不能携带平台的模型、连接器、工具、变量或函数**（`registry.py` 约 83–85 行、`operations.py` 约 104–108 行），用户通过资源中心建立自己的连接来使用模型和工具。Hosted 原有的平台 DeepSeek / DeepWiki 移除 → M14 |
| R13 | 平台运行环境对用户不可见：界面不出现运行环境的选择、名称或标识；每个部署只配置一个平台运行环境，前端自动使用；用户唯一可见的"环境"是变量环境。开发者约束：调整平台运行环境只改内容不改标识（用户的连接和函数按"用户 + 运行环境标识"存放） → M4、M5、M7、M14 |

### 1.3 环境事实（影响验收方式）

| 环境 | 事实 | 对验收的影响 |
| --- | --- | --- |
| 本地 | DeepSeek 配置在 `.env.local`：`LLM_PROVIDER`、`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`。`pnpm workflow:local`（`scripts/workflow/local/start-local.mjs`）把 `LLM_API_KEY` 作为 `LLM_PROVIDER_KEY` 传给 Worker，供本地环境配置 `services/workflow/examples/local-environments.json` 中的**平台模型**（ref `deepseek`、模型 `deepseek-flash`）使用；数据库 `p4_catalog` 里没有它 | **本地验收全自动，不需要用户填写**：①现有模型节点直接用平台模型；②需要「用户连接」的验收（OpenAI 兼容、`deepseek` 类型、多模型、版本升级）由本地专用脚本从 `.env.local` 读取 `LLM_*` 并通过本地 API 创建连接；③「添加模型」对话框的界面流程用本地假 OpenAI 兼容端点 + 测试 Key 验收。智能体不在浏览器表单里输入真实 Key，脚本与日志不打印 Key。清理旧工作流数据不影响平台模型 |
| 本地 | 没有 Ollama | 本地 `http://localhost` 模型只做单元测试，不做 Live Run 验收 |
| 本地 | 平台环境自带 Everything MCP（`services/workflow/examples/local-environments.json`） | MCP 工具验收用它 |
| Hosted | 平台环境里列着 DeepSeek（`deepseek-flash`），但 10-23 冒烟时模型节点报 `NODE_EXECUTION_FAILED`；按 R12 改为公共环境后平台模型会被移除 | Hosted 的模型相关验收**由用户人工完成**，结果填写到第 8 节「人工验收」表；智能体不做、也不把它当作门禁 |
| Hosted | 平台运行环境目前只对 `ownerIds` 中列出的用户开放 | 按 R12 改为对所有登录用户开放（M14） |
| Hosted | 现状：前端 + API 在 `edu-flow`；工作流后端在 `edu-flow-workflow`（FastAPI Compiler 为 Function，Worker/watchdog 为 Daemon，均在运行）。M14 之后只剩 `edu-flow` | M14 完成前 Hosted 冒烟仍走 `edu-flow-workflow`；完成后只发布 `edu-flow` |
| Hosted | 都是开发版本，可随时重启、重新部署，不需要兼容 | 合并、清理、迁移不设维护窗口，但删除数据和删除项目前仍需用户确认 |
| Hosted | Sandbox 不可用（函数节点报 `SANDBOX_UNAVAILABLE`，watchdog 持续报 `SANDBOX_REAP_FAILED`） | Hosted 运行验收只用不需要 Sandbox 的节点（如 `core.transform`）；Sandbox 问题单独排查，不在本计划范围 |

### 1.4 待确认决策

目前没有。实施中如果遇到会改变数据语义、或方案没有覆盖的产品问题，停下来问用户，并在第 9 节登记。

---

## 2. 全局约束与门禁

### 2.1 约束

- **依赖**：只用 pnpm；Worker 侧用 uv。`langchain-openai` 已在 `services/workflow/uv.lock` 中，只需在 `pyproject.toml` 显式声明，`uv lock` 后不应改变安装包集合。
- **Function 预算**：`edu-flow` 的 Function 数量必须始终 ≤ 12（Hobby 上限）。所有 API 改动放在 `api/_lib/workflowV2.ts` 已有的 `extensions` / `configuration` 分支里。M14 新增 Python 编译入口的同时把 `api/health.ts` 移出入口，总数保持 12，之后没有余量。
- **数据**：只有 M13 写一个前向迁移（变量环境）。其余新增字段都在 jsonb 内，只放宽校验。已执行过的迁移不得修改；Hosted 按 AGENTS 纪律逐个应用。
- **秘密**：凭据只进 Vault；测试响应预览要先 `assert_no_secrets` 再截断；前端不得显示或回传 Key。
- **模块边界**：纯函数放 `src/features/workflow/domain/v2/`，不得 import React、`src/app`、`src/demo`、浏览器存储。
- **画布稳定**：任何面板开关、宽度拖拽、Tab 切换、运行选择都不得触发 React Flow 重新布局、`fitView` 或视口变化。
- **兼容**：不为改造前的工作流数据做兼容（R10，直接清理）。仍保留一道防线：编译遇到旧版 `core.llm` / `core.tool` 报 `NODE_VERSION_RETIRED`，防止通过导入 JSON 或残留数据带入旧定义。不做「按新版重建」界面。
- **生成文件**：`supabase/seed.sql` 由 `pnpm db:seed:generate`（`scripts/generate-supabase-seed.ts`）从演示夹具生成，**不得手改**；改模板后重新生成。
- **破坏性操作**：任何删除数据的操作都要先确认目标环境；本地脚本必须拒绝非本地 Supabase URL；Hosted 上的清理必须在执行前向用户确认目标项目与删除范围。

### 2.2 门禁命令

每个阶段结束必须全部通过（与该阶段无关的项也要跑，防止回归）：

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

```bash
pnpm build
```

```bash
pnpm test:workflow:worker
```

```bash
pnpm test:workflow
```

```bash
pnpm workflow:check-layout
```

```bash
pnpm audit:client-secrets
```

`test:workflow:worker` 是 Worker 的 pytest（等价于 CI 中的 `uv run pytest -q`）；`test:workflow` 是工作流固定离线回归；`workflow:check-layout` 校验工作流脚本目录约定。

涉及前端界面的阶段（M4–M11、M13）还要用 `pnpm workflow:local` 启动本地全套服务，用浏览器在 1440、768、390 三档宽度打开一个工作流，确认无控制台错误、无横向滚动，并对照设计稿截图检查。涉及 Worker 的阶段（M2、M10、M11、M13）还要跑 `pnpm test:workflow:local-smoke` 和一次本地 Live Run（模型用 `.env.local` 中的 DeepSeek，见第 1.3 节）。

---

## 3. 代码地图与关键事实

### 3.1 代码地图（基线 `ff3b9db`）

| 区域 | 路径 | 现状要点 |
| --- | --- | --- |
| 领域类型 | `src/features/workflow/domain/v2/types.ts` | `WorkflowNodeV2 = { id, label, type, typeVersion, config, inputs: Record<string, Binding>, writes: Record<outputKey, statePointer> }`；`WorkflowVariable` 无 `description` |
| 领域工厂 | `domain/v2/factory.ts` | `createNodeV2("core.llm")` 生成 v1：`inputs.messages`、`writes {messages, pendingCalls}` |
| 节点清单 | `domain/v2/authoring.ts` | `authoringNodeTypes`、`nodeAuthoring`、`createAuthoringNode`、`graphAtPath` 等 |
| 连接引用 | `domain/v2/connectionReferences.ts` | 已有 `connectionReferences(def)`、`connectionUpdates`、`applyConnectionUpdates`、`unresolvedCapabilities`、`applyCapabilityBindings`（含测试） |
| 校验 | `domain/v2/schema.ts`、`validation.ts` | zod 定义校验与草稿校验 |
| 控制器 | `application/v2/useWorkflowV2Controller.ts` | 暴露 `steps`、`history`、`threads`、`selectRun`、`selectThread`、`observedRunId` |
| 前端预览 | `application/v2/frontendPreview.ts` | 前端模拟执行，需识别 v2 模型节点 |
| API 客户端 | `repository/v2/WorkflowApiV2.ts` | `extensions(environmentRef)`、`extensions POST`、`configuration()`、`saveConfiguration()`、`steps(runId)` |
| 编辑器主体 | `editor/v2/LiveWorkflowEditor.tsx`（528 行，单行很长） | 画布、Inspector、Tab（State/连接/执行/导出）、`panelWide`、`historyOpen`、历史栏 `wf-history-dock`、`viewingRun` |
| 绑定编辑 | `editor/v2/BindingFields.tsx` | 「读取/写入」段；`compatible()`、`types()`、`options()` 可复用；工具节点 `arguments` 用 `SchemaForm` 编辑字面量 |
| 处理段 | `editor/v2/ProcessingFields.tsx`、`FunctionExecutionFields.tsx`、`RouterFields.tsx`、`GraphRuntimeFields.tsx`、`NodePolicyFields.tsx` | 各节点类型的处理配置 |
| 消息编辑 | `editor/v2/MessageComposer.tsx` | v1 模型节点 messages 编辑 |
| 资源相关 | `editor/v2/WorkflowConnections.tsx`、`EnvironmentVariables.tsx`、`EnvironmentPanel.tsx`、`CapabilityBindingPanel.tsx`、`ConnectionVersionPanel.tsx`、`connectionDraft.ts` | 连接表单、变量、能力绑定、版本 |
| State | `editor/v2/StateFields.tsx` | State 字段编辑 + 工作流说明 + 限制 + MCP 发现 |
| 运行展示 | `editor/v2/ExecutionDetails.tsx`、`RunOutput.tsx`、`ReadableRunOutput`、`ExecutionBubbles.tsx` | 运行详情与气泡 |
| 样式 | `editor/v2/workflowV2.css` | `--wf-*` 色板；`.wf-v2-canvas{position:absolute;inset:0}`；`.wf-v2-inspector`、`.wf-history-dock`、≤900/≤600 响应式规则 |
| API | `api/_lib/workflowV2.ts` | `extensions`：GET/POST 透传 Worker `/v1/extensions`；`configuration`：GET/PUT，zod 校验变量 |
| Worker 注册表 | `services/workflow/src/eduflow_workflow/registry.py` | `NODE_DESCRIPTORS`：`core.llm` 输入 `{messages}`、输出 `{messages, toolCalls}`；`core.tool` 输入 `{arguments: object}`；`core.function` 输入任意对象 |
| Worker 编译 | `compiler.py` | `binding_check`、`binding_schema_check`、`_validate_definition`、`validate_structure`、`compile_definition` |
| Worker 运行 | `runtime.py` | `model_adapter`（固定 `ChatDeepSeek`）、`llm()`、`_process_node()`（llm/tool/function 分支） |
| Worker 连接 | `extensions.py` | `catalog_operation`（含 test，DeepSeek 已请求 `/models` 但丢弃结果）、连接校验白名单 `http/deepseek/mcp-http`、`hydrate_connections` |
| Worker 出站 | `tools.py` | `safe_http_url`；私网仅在 `env.localFixtures is True` 且 `WORKFLOW_ALLOW_LOCAL_FIXTURES=1` 时允许 |
| Worker 测试 | `services/workflow/tests/` | pytest + pytest-asyncio；CI 在 `.github/workflows/ci.yml` 跑 `uv run pytest -q` |

### 3.2 影响实施的关键事实

- **F1** `node.writes` 是「输出项 → State 指针」的映射（如 `{ messages: "/messages" }`）。输出表直接编辑 `writes`，「更新方式」从 `definition.state.reducers[field]` 读取，不在节点上存。
- **F2** 已有 `connectionReferences(def)`。改造方案里的 `resourceReferences` 不新建，改为**扩展** `connectionReferences` 返回 `modelRef`、`graphPath`（若尚无）。
- **F3** `core.tool` 目前只有一个输入 `arguments`（对象），前端用 `SchemaForm` 编辑整个字面量。R9 要求按参数逐行填写，因此 M11 把 `core.tool` 改为 typeVersion 2：输入按参数拆开，运行时再拼回对象。
- **F4** `core.function` 运行时收到的是按 key 解析好的 `resolved` 字典，天然适合「参数名 ｜ 取值」表格。
- **F5** `WorkflowStepV2` 有 `input`、`output`、`stateVersionBefore/After`，但**没有 State 快照**。因此「运行数据 → State 变化」在 P0 只能展示"写入值"（由 `output` + `writes` 推出）。设计稿中的"之前 → 之后"对比降级为 P1，见第 9 节偏差 V1。
- **F6** 控制器已暴露当前观察运行的 `steps`；前端预览有自己的 `PreviewStep`。`nodeRunData` 需同时接受两种来源。
- **F7** DeepSeek 连接测试已经请求 `https://api.deepseek.com/models`，只需把结果返回。
- **F8** 变量 key 规则是 `/^[A-Z][A-Z0-9_]*$/`，最长 80；变量保存会做 `workflowSecretProjection` 检查，`description` 也要过同一检查。
- **F9** 变量取值发生在 Worker：`registry.py · environment()`（约 98–110 行）通过 `workflow_private.environment_variables(owner)` 读配置，按运行环境 ref 取 `overrides`，结果和 `configurationRevision` 冻结进 Run 的 `registry_snapshot`；`server.py`（约 188–191 行）恢复检查点时用冻结值。API 侧 `configuration` PUT 目前要求覆盖键是可用运行环境（`workflowV2.ts` 约 151 行）。
- **F10** 使用旧版 `core.llm` / `core.tool` 的定义存在于 `src/demo/workflow/productWorkflowTemplates.ts`（`model()`、`toolField()` 两个构造函数显式写了旧版结构，及其测试）、`src/demo/workflow/workspaceWorkflowTemplates.ts`、`src/demo/workflow/scenarios/*.json`、`domain/v2/authoringExamples.ts`、`LiveWorkflowEditor.tsx` 中的 loop 模板。`supabase/seed.sql` 是这些夹具的生成产物。
- **F11** 模板在运行时来自数据库表 `workflow_templates`（`api/_lib/workflowV2.ts` 约 120–169 行读取）。本地由 `pnpm db:seed:generate` 生成的种子和 `scripts/workflow/local/refresh-local-workspace.ts`（只允许本地，带 `--batch=` 与 `--apply`）写入；Hosted 中的模板行需要单独同步。「社区问题分流」是产品模板 `product-community-triage`。
- **F12** Hosted 现有两个 Vercel 项目（ADR 0006）：`edu-flow`（`prj_po8NNFg8tIXZJnanYCDR8uxGnpDz`，Vite 前端 + 12 个 `api/*.ts` 入口，已到 Hobby 上限）与 `edu-flow-workflow`（`prj_tDaQ3riDUpFHggr8rtBye9jJcFyd`，`services/workflow/vercel.json`：`main.py` FastAPI Function + `worker`/`watchdog` 两个 Daemon，镜像来自 `services/workflow/Dockerfile`）。`edu-flow` 通过 `api/_lib/workflowV2Protocol.ts · workflowCompiler()` 调用后端，地址与令牌来自环境变量 `WORKFLOW_COMPILER_URL`（目前为 `https://edu-flow-workflow.vercel.app`）和 `WORKFLOW_INTERNAL_TOKEN`。后端所需环境变量见 [运维手册](WORKFLOW_HOSTED_RUNBOOK.md)「环境和秘密」一节。M14 把后端合并进 `edu-flow`。
- **F14** 2026-10-23 合并可行性验证（临时项目，验证后已删除）：根项目一次构建即可产出前端、12 个 Function（11 TS + 1 Python）和 Daemon 镜像；Python 入口能启动并返回后端自己的 `UNAUTHORIZED / Service identity required`；**Daemon 只在生产部署运行**，预览部署不创建 Daemon；Daemon 实例在线但其输出日志当时未能查到（未确认）。构建约 3.5 分钟；Python 版本不固定（入口函数默认 3.12、镜像 3.13，曾出现 3.14）。
- **F15** `workflowCompiler()` 用 `new URL(path, WORKFLOW_COMPILER_URL)` 拼地址，`path` 以 `/` 开头（如 `/v1/extensions`），会丢弃 base URL 中的路径前缀；后端 FastAPI 路由在根路径 `/v1/...`。合并到 `/api/workflow-compiler` 下需要同时改客户端拼接和服务端挂载路径。
- **F16** `/api/health` 只被本地工具使用（`build/local-api-vite-plugin.ts`、`scripts/verify-local-backend.ts`），仓库内没有 Hosted 调用方。
- **F17** 运行环境目前在界面上多处可见：`LiveWorkflowEditor.tsx` 顶栏的 `aria-label="运行环境"` 下拉、`EnvironmentPanel.tsx` 的「当前环境」下拉与共享环境说明、`pages/WorkflowCreateDialog.tsx`、`CapabilityBindingPanel.tsx`、`ConnectionVersionPanel.tsx`、`diagnostics.ts` 中的文案，以及 `LiveWorkflowEditor.tsx` 的 `wf-v2-env-notice` 提示条。`useWorkflowV2Controller.ts` 在没有选择时默认取环境列表第一项（约 135 行）。R13 要求全部去掉或改写。
- **F13** 工作流相关表：`workflow_v2_definitions`、`workflow_editor_documents`、`workflow_revisions`、`workflow_runs`、`workflow_run_steps`、`workflow_run_events`、`workflow_run_jobs`、`workflow_run_tombstones`、`workflow_run_evidence_receipts`、`workflow_live_runs`、`workflow_execution_threads`、`workflow_idempotency`、`workflow_migration_reports`、`workflow_templates`、`workflow_workspace_configuration`，以及 `workflow_private`（含 `p4_catalog`）、`workflow_checkpoints`、`workflow_memory` 等 schema。清理范围见第 5.0 节。

---

## 4. 阶段总览

```
M0 基线确认
 ├─ M1 领域纯函数 ──────────────┬─ M7 数据/资源/运行面板
 │                              ├─ M8 统一节点面板 ── M9 运行数据与调试悬窗
 │                              └─ M10 core.llm v2（前端部分）
 ├─ M2 Worker 供应商与测试回显 ─┬─ M6 模型供应商总览与添加模型
 │                              └─ M10 core.llm v2（Worker 部分）
 ├─ M3 API 引用查询与变量说明 ── M5 资源中心悬窗 ─┬─ M6
 │                                                └─ M13 变量环境
 └─ M4 画布浮层外壳 ──────────── M5、M7、M8
M8 ── M11 core.tool v2 表单式参数
M0 ── M14 工作流后端合并进 edu-flow（与功能阶段互不依赖，必须在 M12 之前完成）
M12 收尾与验收（依赖以上全部）
```

| 阶段 | 名称 | 对应方案分期 | 依赖 | 估时 | 画板 |
| --- | --- | --- | --- | --- | --- |
| M0 | 基线确认 | — | — | 0.25 天 | — |
| M1 | 领域纯函数与类型 | 横跨 | M0 | 1 天 | — |
| M2 | Worker：openai-compatible 与测试回显 | P0-B | M0 | 1.5 天 | — |
| M3 | API：引用查询与变量说明 | P0-A2 | M1 | 0.5 天 | — |
| M4 | 画布浮层外壳 | P0-A1 | M0 | 1.5 天 | 画布总览 |
| M5 | 资源中心悬窗（迁移现有能力 + 变量表） | P0-A1 | M3、M4 | 1.5 天 | 资源中心 · 变量 |
| M6 | 模型供应商总览与添加模型 | P0-A2、P0-B | M2、M5 | 1.5 天 | 模型供应商总览、添加模型 |
| M7 | 数据 / 资源 / 运行侧面板 | P0-A2 | M1、M4 | 1 天 | 侧面板 · 数据 |
| M8 | 统一节点面板 | P0-C | M1、M4 | 2 天 | 节点面板 · 模型 / 函数 |
| M9 | 运行数据 Tab 与展开调试悬窗 | P0-C | M8 | 1.5 天 | 运行数据 + 历史抽屉、节点展开调试 |
| M10 | 新版 `core.llm` 参数式提示词，旧版废弃 | P0-D | M1、M2、M8 | 2.5 天 | 节点面板 · 模型 |
| M11 | 新版 `core.tool` 表单式参数，旧版废弃 | P0-E | M8 | 1.5 天 | 节点面板 · 工具（表单式参数） |
| M13 | 变量环境（迁移 + API + Worker + 顶栏 + 变量表） | P0-F | M3、M5 | 2 天 | 画布总览（顶栏「变量」下拉）、资源中心 · 变量（变量环境标签页）、运行数据 + 历史抽屉 |
| M14 | 工作流后端合并进 `edu-flow`，删除 `edu-flow-workflow` | — | M0 | 1 天 | — |
| M12 | 收尾、清理与端到端验收 | — | 以上全部 | 0.75 天 | 全部 |

合计约 20 天。M14 不改产品功能，建议在 M0 之后尽早做，让后续 Hosted 冒烟都基于合并后的结构。比方案第 7 节各期之和多出的部分是基线确认（M0）、单独拆出的领域层（M1）、API（M3）和收尾验收（M12），以本表为准。M2 与 M4 可以并行；M13 与 M6–M11 互不依赖，可在 M5 之后任意时间插入；其余按依赖顺序执行。M12 放在最后。

---

## 5. 阶段详情

每个阶段包含：目标、任务清单、接口与实现要点、测试、验收、完成定义。任务清单中的路径都相对仓库根目录。

### 5.0 旧工作流数据清理规范（R10）

M10 在本地执行一次、M12 在 Hosted 执行一次，规则相同：

- **删除**：所有用户的工作流定义与编辑器数据（`workflow_v2_definitions`、`workflow_editor_documents`、`workflow_revisions`）、全部运行数据（`workflow_runs`、`workflow_run_steps`、`workflow_run_events`、`workflow_run_jobs`、`workflow_run_tombstones`、`workflow_live_runs`、`workflow_idempotency`）、会话与检查点（`workflow_execution_threads`、`workflow_checkpoints` 下的表、`workflow_memory` 中按工作流作用域的数据）、`workflow_migration_reports`。
- **保留**：`workflow_private.p4_catalog`（模型/API/MCP/函数连接）与对应 Vault 凭据、`workflow_workspace_configuration` 中的变量默认值、课程/学习/用户数据。
- **重建**：`workflow_templates` 用新版模板覆盖写入（模板 id 不变，课程中引用的 `workflowTemplateId` 继续有效）。
- **先查后删**：执行前列出每张表要删除的行数，并检查 `workflow_run_evidence_receipts` 及学习侧证据是否引用了将被删除的 Run；如有引用，停下来报告给用户，不擅自删除学习证据。
- **执行方式**：写成一个只读预检 + 显式 `--apply` 的脚本，放在 `scripts/workflow/local/`（本地，复用 `refresh-local-workspace.ts` 的本地 URL 守卫）。Hosted 不跑本地脚本，执行等价 SQL，执行前把预检结果和 SQL 给用户确认。不使用 `pnpm db:reset`（会清空整个本地库，包括用户建立的连接、Vault 凭据与验收账号；平台 DeepSeek 在 `.env.local` 中，不受影响）。
- **顺序**：先删除依赖方（steps/events/jobs → runs → threads/检查点 → 编辑器文档/修订 → 定义），或依赖已有的外键级联；以实际外键为准，先读迁移确认。

### M0 基线确认

**目标**：确认接手时的代码与本计划一致，记录偏差。

- [ ] 确认分支和基线提交（第 1.1 节）。
- [ ] 跑一遍第 2.2 节门禁，记录基线是否全绿；如果基线本身就有失败项，在第 9 节登记，后续阶段只要求"不新增失败"。
- [ ] 逐条核对第 3.1、3.2 节，有出入就更新本文。
- [ ] 用 `pnpm workflow:local` 启动本地全套服务，从模板 `product-community-triage`（社区问题分流）新建一个工作流，截图作为改造前对照（保存在 scratchpad，不提交）。
- [ ] 确认本地平台 DeepSeek 可用：环境目录中能看到 `deepseek` / `deepseek-flash`，用模板新建的工作流能跑通一次含模型节点的 Live Run（Key 由 `start-local.mjs` 从 `.env.local` 的 `LLM_API_KEY` 注入），记录到第 8 节。

**完成定义**：第 8 节 M0 填写基线门禁结果。

### M1 领域纯函数与类型

**目标**：一次性补齐后续所有 UI 和 Worker 契约需要的类型与纯函数，全部带单元测试，不改任何界面。

**任务**

- [ ] `src/features/workflow/domain/v2/types.ts`
  - `WorkflowVariable` 增加 `description?: string`。
  - `WorkflowConfiguration` 增加 `environments: VariableEnvironment[]`、`defaultEnvironmentId: string | null`（M13 之前 API 不返回时按 `[]` / `null` 处理）。
  - 新增：
    ```ts
    export type VariableEnvironment = { id: string; name: string };
    export type ToolConfigV2 = { toolRef: string; contractDigest: string };
    export type PromptSegment = { type: "text"; text: string } | { type: "param"; name: string; format?: "text" | "json" };
    export type PromptMessageV2 = { role: "user" | "assistant"; content: PromptSegment[] };
    export type LlmConfigV2 = { providerRef: string; modelRef: string; modelParameters: Record<string, JsonValue>; allowedToolRefs: string[]; prompt: { system: PromptSegment[]; messages: PromptMessageV2[] } };
    export type ConnectionTestResult = { ok: boolean; elapsedMs?: number; status?: number; preview?: string; models?: string[]; tools?: { name: string; description?: string }[]; error?: { code: string; message: string } };
    export type ResourceReferenceRow = { workflowId: string; workflowName: string; revision: number; graphPath: string[]; nodeId: string; nodeLabel: string; version?: number; modelRef?: string; variableKey?: string };
    ```
- [ ] `domain/v2/schema.ts`：为 `PromptSegment`、`LlmConfigV2` 增加 zod schema（参数名 `/^[A-Za-z_][A-Za-z0-9_]{0,63}$/`，`history` 保留）。
- [ ] 新文件 `domain/v2/dataFlow.ts`（含 `dataFlow.test.ts`）：
  - `stateFieldProducers(def): Map<string, string[]>`：遍历 `nodes[].writes` 的值（State 指针取第一段），返回字段 → 节点 id 列表；子图按 `graphPath` 递归，键用 `scopeKey`。
  - `stateFieldConsumers(def): Map<string, string[]>`：遍历 `nodes[].inputs` 中 `source: "state"` 的绑定、`core.router` 的 predicate、`outputBindings`。
  - `variableReferences(def): { key, nodeId, graphPath }[]`：所有 `source: "environment"` 的绑定和 predicate。
  - `defaultParamName(binding, taken: Set<string>): string`：取 pointer 最后一段（去掉 `[]`、转义），不合法字符替换为 `_`，与 `taken` 冲突时加 `_2`、`_3`；字面量返回 `value`。
- [ ] 扩展 `domain/v2/connectionReferences.ts`：`ConnectionReference` 增加 `modelRef?: string`（来自 `core.llm` 的 `config.modelRef`）。补充对应测试；不改变现有调用方行为。
- [ ] 新文件 `domain/v2/runData.ts`（含测试）：
  ```ts
  export type NodeRunData = { runId: string; stepId: string; status: string; input?: JsonValue; output?: JsonValue; writes: { field: string; pointer: string; value: JsonValue | undefined; reducer: string }[]; elapsedMs?: number; stepIndex: number };
  export function nodeRunData(def: WorkflowDefinitionV2, steps: readonly { stepId: string; runId: string; nodeId: string; status: string; input?: JsonValue; output?: JsonValue; startedAt?: string; finishedAt?: string; graphPath?: string[] }[], nodeId: string, graphPath?: string[]): NodeRunData | null;
  ```
  - 同一节点多次执行（循环）时取最后一次，并在返回值里带 `invocationCount`。
  - `writes[].value` 从 `output` 按 `node.writes` 的输出项取值；`reducer` 来自 `definition.state.reducers`，缺省为 `"replace"`。
- [ ] 新文件 `domain/v2/promptAuthoring.ts`（含测试）：
  - `renderPromptPreview(prompt, params: Record<string, JsonValue | undefined>)`：与 Worker 渲染规则一致（见 M10），用于前端预览和单测对照。
  - `promptParamUsage(prompt): Set<string>`、`renameParam(config, inputs, from, to)`。
- [ ] 新文件 `domain/v2/nodeVersions.ts`（含测试）：
  - `CURRENT_TYPE_VERSIONS = { "core.llm": 2, "core.tool": 2 }`，其他类型为 1。
  - `isRetiredNode(node): boolean`：类型在表中且 `typeVersion` 小于当前版本。只用于前端校验给出 `NODE_VERSION_RETIRED` 诊断（例如导入旧 JSON 时），不做重建或转换。
- [ ] 新文件 `domain/v2/toolParams.ts`（含测试）：
  - `toolParamRows(inputSchema, inputs)`：按 `inputSchema.properties` 生成 `{name, title, description, schema, required, binding?}[]`，保持 Schema 中的属性顺序。
  - `assembleToolArguments(inputs, resolved)`：与 Worker 组装规则一致，供前端预览使用。
  - `reconcileToolInputs(oldSchema, newSchema, inputs)`：工具升级时返回 `{inputs, added: string[], removed: string[], newlyRequired: string[]}`。

**测试**：每个新函数至少覆盖正常、空定义、子图、冲突/非法输入四类用例。

**验收**：`pnpm test` 新增用例全部通过；没有任何 `editor/` 文件改动。

### M2 Worker：openai-compatible 与测试回显

**目标**：Worker 支持一个供应商多个模型的 OpenAI 兼容连接，测试返回可展示的结果。

**任务**

- [ ] `services/workflow/pyproject.toml`：显式声明 `langchain-openai`（版本范围与 `uv.lock` 中已锁定版本一致），`uv lock` 后确认 `uv.lock` 中包集合不变。
- [ ] `extensions.py` 连接校验（约第 72 行起）：
  - 类型白名单加入 `openai-compatible`；允许字段 `type, name, baseUrl, modelRefs, credentialHeader, description, secretRef`。
  - `baseUrl` 必须是 https；当环境 `localFixtures` 为真且进程允许本地夹具时，才允许 `http://localhost` / `127.0.0.1`，此时可以没有凭据（R4=A）。用 `safe_http_url` 做 SSRF 检查；URL 中带用户名或密码直接拒绝。
  - `modelRefs`：1–50 项，每项 1–200 字符，匹配 `^[\w.:\/-]+$`，去重。
  - `description`：所有类型可选，≤500。
  - DeepSeek：模型名从固定两项放宽为同一模式校验；`baseUrl` 仍固定官方地址。
- [ ] `extensions.py · catalog_operation` 的 test 分支统一返回 `ConnectionTestResult`：
  - 模型类（deepseek、openai-compatible）：`GET {baseUrl}/models`，超时 10 秒，解析 `data[].id`，排序去重，最多 200 项 → `{ok, elapsedMs, models}`。
  - HTTP：保留响应体，先 `assert_no_secrets`，再截断到 4096 字节 → `{ok, status, elapsedMs, preview}`。
  - MCP：返回已发现工具的 `name`、`description` → `{ok, elapsedMs, tools}`。
  - 失败时返回 `{ok:false, error:{code, message}}`，不抛出带凭据的信息。
- [ ] `hydrate_connections`：`openai-compatible` 注入 `env.providers`，形如 `{ref, name, modelRefs, baseUrl, secretRef?, adapter: "openai"}`；DeepSeek 补 `adapter: "deepseek"`。
- [ ] `runtime.py · model_adapter`：按 `provider["adapter"]` 分流；`openai` 走 `ChatOpenAI(model, base_url, api_key, max_tokens, http_async_client=<与工具调用相同出站限制的客户端>)`。无凭据（本地）时传占位 key。
- [ ] 编译期：`core.llm` 的 `modelRef` 必须在所选连接版本的 `modelRefs` 中，否则报 `MODEL_NOT_ENABLED`。本阶段 `core.llm` 仍是旧版，M10 换成新版后这条校验继续生效。

**测试**（`services/workflow/tests/`，新文件 `test_extensions_providers.py`）

- 合法/非法 `openai-compatible` 连接（https、本地 http、私网地址、URL 带凭据、模型名非法、超过 50 项）。
- `/models` 解析（正常、空、非 JSON、超时）。
- HTTP 测试预览脱敏与截断。
- `model_adapter` 分流（用假 provider，不发真实请求）。
- DeepSeek 连接回归：现有 `test_runtime.py` 全部通过。

- [ ] 新增本地专用脚本 `scripts/workflow/local/seed-model-connections.ts`：
  - 只允许本地 Supabase（复用 `refresh-local-workspace.ts` 的 URL 守卫：主机 `127.0.0.1`、端口 `54321`），否则在读取任何秘密前退出。
  - 从 `.env.local` 读取 `LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY`（`LLM_PROVIDER` 仅用于命名），用本地验收账号登录后，通过本地 `extensions` API 创建或更新两个连接：一个 `openai-compatible`（Base URL 取 `LLM_BASE_URL`，`modelRefs` 至少含 `LLM_MODEL`），一个 `deepseek` 类型。连接 ref 固定（例如 `local-env-openai`、`local-env-deepseek`），重复执行时发布新版本而不是重复创建。
  - 默认只打印计划（不调用写接口），`--apply` 才执行；任何输出与错误信息都不得包含 Key。
- [ ] 新增本地假 OpenAI 兼容端点 `tests/workflow-integration/fake-openai/server.mjs`（Node 内置 `http`，监听 `127.0.0.1` 随机端口），实现 `GET /models` 和最小的 `POST /chat/completions`，只接受固定测试 Key `test-key-local`，供界面流程和单元测试使用。

**验收**：`pnpm test:workflow:worker` 全绿；`seed-model-connections.ts --apply` 创建的 `openai-compatible` 连接测试能拉到模型列表，并用它跑通一次 Live Run；脚本创建的 `deepseek` 类型连接回归通过；环境配置里的平台 DeepSeek 照常可用；对假端点的连接测试返回其模型列表（本地 `localFixtures` 允许 `http://127.0.0.1`）。全部无需用户输入（记录在第 8 节备注）。本地 `http://localhost` 通道只靠单元测试覆盖（本地没有 Ollama）。

### M3 API：引用查询与变量说明

**目标**：前端能查到"谁在用这个资源/变量"，变量可带说明。

**任务**

- [ ] `api/_lib/workflowV2.ts`
  - `extensions` 分支：`GET ?view=references&ref=<connectionRef>` 用用户 client（遵守 RLS）读取当前用户所有未归档工作流的**当前定义**，递归子图，复用前端同款逻辑（在 API 侧实现等价的纯函数，放在 `api/_lib/` 的非入口文件中），返回 `ResourceReferenceRow[]`（含 `version`、`modelRef`）。
  - `configuration` 分支：`GET ?view=references` 返回所有变量 key 的 `ResourceReferenceRow[]`（含 `variableKey`）。
  - `configuration` PUT 的 zod：变量对象增加 `description: z.string().max(300).optional()`，并纳入 `workflowSecretProjection` 检查。
  - `extensions` POST 的 test 响应：原样透传 Worker 新字段。
- [ ] `src/features/workflow/repository/v2/WorkflowApiV2.ts`：新增 `extensionReferences(ref, environmentRef)`、`variableReferences()`；`extensions` test 的返回类型改为 `ConnectionTestResult`。
- [ ] 确认没有在 `api/` 顶层新增文件；构建后检查 `edu-flow` 的 Function 数量不超过 12（Hobby 上限）。

**测试**：`WorkflowApiV2.test.ts` 补请求路径与解析用例；API 侧纯函数补单测（子图、归档工作流排除、他人工作流不可见由 RLS 保证，单测用构造数据）。

**验收**：门禁通过；Function 数量与基线一致（记录数字）。

### M4 画布浮层外壳

**目标**：不改任何配置内容，只把编辑器外壳改成方案 2.1 的四级浮层。对应画板「画布总览 · 浮动控件」。

**任务**

- [ ] `editor/v2/LiveWorkflowEditor.tsx`
  - 右上 Tab 文案改为「数据 ｜ 资源 ｜ 运行 ｜ 导出」（内部 tab id 可以不改，避免牵连）。
  - Inspector（`.wf-v2-inspector`）改为浮动卡片：`position:absolute; right:12px; top:<胶囊下方>; bottom:12px`，圆角 16、阴影，画布在其下方不变形。
  - 拖拽改宽：左边缘手柄，范围 360–720，宽度写入 `localStorage` 键 `eduflow.workflow.inspectorWidth`（读写包 try/catch）；现有 `panelWide` 按钮改为 640 快捷切换。State 面板默认 640。
  - 历史栏 `wf-history-dock` 改为浮动抽屉：收起时是左下角一行状态；展开时是浮在画布上的圆角面板，最高 40vh，右侧避开打开的 L2 面板和助手入口；列表内容和点击逻辑（`selectRun`、`selectThread`、`preview.select`）保持不变。
  - 查看历史运行时（`viewingRun` 为真）在画布顶部显示提示条「正在查看历史运行 · <时间> · <状态>。节点面板显示这次运行的数据。［回到编辑］」，复用 `.wf-history-banner`。
  - 左下视图工具（适应画布 / 可读视图 / 缩放 / 小地图 / 执行气泡）在抽屉展开时隐藏。
  - 去掉顶栏的「运行环境」下拉（R13，F17），位置留给 M13 的「变量环境」下拉；`wf-v2-env-notice` 提示条改为只在工作流服务不可用时显示，文案不提运行环境（例如"工作流服务暂时不可用，暂时无法校验和运行"）。控制器继续自动使用环境列表第一项。
- [ ] `editor/v2/workflowV2.css`：新增/改写 `.wf-v2-inspector`、`.wf-history-dock`、拖拽手柄样式；≤900px 时 L2 面板宽度 `calc(100% - 58px)` 覆盖画布；≤600px 时抽屉全宽。不改 `--wf-*` 色板。
- [ ] 新增一个只读工具函数（放 `editor/v2/panelWidth.ts`）：`clampPanelWidth(value, min, max)`，带测试。

**验收**

- 打开/关闭/拖宽任何面板、展开/收起抽屉、切换历史运行，React Flow 视口坐标不变（在浏览器里读 `.react-flow__viewport` 的 transform 前后对比）。
- 1440/768/390 三档无横向滚动、无控制台错误。
- 现有 vitest（`RunOutput.test.tsx`、`ExecutionDetails.test.tsx` 等）全部通过。

### M5 资源中心悬窗（迁移现有能力 + 变量表）

**目标**：资源中心成为 L3 悬窗，先把现有 API、MCP、DeepSeek、函数、变量原样迁入；变量改成表格。对应画板「资源中心 · 变量」。

**任务**

- [ ] 新目录 `src/features/workflow/resources/`：
  - `ResourceCenterDialog.tsx`：悬窗外壳（四周 40px、背景压暗、Esc 关闭、焦点陷阱、`role="dialog"`）；头部：标题、说明、关闭（不显示运行环境，R13；`environmentRef` 只作为内部参数传入）；左侧分类导航（模型供应商 / API / MCP 服务 / 函数 / 变量，带数量）；右侧内容区。对外接口：
    ```ts
    type ResourceCenterProps = { open: boolean; environmentRef: string; initialSection?: "providers" | "apis" | "mcp" | "functions" | "variables"; intent?: { kind: "create"; section: string; onCreated: (ref: string, version: number) => void }; onClose: () => void };
    ```
  - `ApiResource.tsx`、`McpResource.tsx`、`FunctionResource.tsx`：从 `WorkflowConnections.tsx` 拆出现有表单与列表，行为不变；详情区加「测试」与「引用」（引用调用 M3 接口）。
  - `ProviderResource.tsx`：本阶段先放现有 DeepSeek 表单（M6 替换为总览）。
  - `VariableTable.tsx`：列为 名称 · 类型 · 默认值 · 说明 · 引用 · 删除；新增行；整表保存（带 `baseRevision`，409 时提示刷新）；`description` 字段。表格上方预留变量环境标签页的位置，本阶段只有「默认值」一个标签（M13 补齐）；不再提供"按运行环境覆盖"的编辑（R13；旧覆盖值在 M13 迁移中清空）。
  - `ResourceTestPanel.tsx`：展示 `ConnectionTestResult`（状态、耗时、预览/模型/工具）。
  - `ResourceReferences.tsx`：展示 `ResourceReferenceRow[]`，点击后关闭悬窗、切换到该工作流（若不是当前工作流则跳转编辑器路由）并定位节点。
  - `resourceModel.ts`（含测试）：`groupCatalogByRef(entries)` 按 `ref` 聚合版本；`latestVersion`；`mergeDiscoveredModels(enabled, discovered)`。
- [ ] `editor/v2/LiveWorkflowEditor.tsx`：挂载 `ResourceCenterDialog`；所有原先"新建连接"入口改为 `open({ intent: create })`，创建完成后回填到当前节点草稿（进入撤销栈）。
- [ ] 迁移完成后删除 `editor/v2/WorkflowConnections.tsx`、`EnvironmentVariables.tsx`；`connectionDraft.ts` 及其测试保留并被新组件引用。

**验收**

- 在节点里点「在资源中心新建」→ 新建 DeepSeek → 关闭后节点已选中新连接，全程不刷新页面。
- 变量表保存、冲突提示正确；说明字段持久化；资源中心任何位置都不出现运行环境。
- 门禁通过。

### M6 模型供应商总览与添加模型

**目标**：实现方案 2.2 的模型供应商总览和添加模型对话框。对应画板「模型供应商总览」「添加模型」。

**任务**

- [ ] `resources/ProviderOverview.tsx`
  - 顶部说明、搜索（按供应商名/模型名过滤）、「+ 添加模型」。
  - 供应商卡片：首字母图标、名称、类型、版本、地址、凭据状态、被几个工作流使用（M3 引用数按 workflowId 去重）、最近测试状态；操作：测试连接、编辑、⋯（停用、版本历史、引用）。
  - 模型表：模型 · 来源（`modelRefs` 中的显示"已启用"，来源列显示"从 /models 拉取"或"手动添加"——来源只在本次会话内记录，刷新后统一显示"已启用"即可）· 引用节点数 · 启用开关。
  - 「新发现」：最近一次测试返回、但不在 `modelRefs` 中的模型，仅存于组件状态。
  - 开关改动暂存；卡片底部出现确认条「将发布 vN+1，正在使用 vN 的节点不受影响［放弃］［保存为 vN+1］」，保存即 POST 新版本（`modelRefs` 至少保留 1 个，否则禁用保存并提示）。
  - 本地供应商标「仅本地开发可用」；平台提供的供应商只读卡片，标"由平台管理凭据"，只在平台运行环境带有平台模型时出现（本地有，Hosted 公共环境没有）。
- [ ] `resources/AddModelDialog.tsx`（叠在资源中心之上）
  - 「新供应商 / 添加到已有供应商」切换。
  - 预设网格：DeepSeek（创建 `deepseek` 类型）、OpenAI（`https://api.openai.com/v1`）、通义千问（`https://dashscope.aliyuncs.com/compatible-mode/v1`）、Kimi（`https://api.moonshot.cn/v1`）、本地 Ollama（`http://localhost:11434/v1`，仅本地环境显示）、自定义 OpenAI 兼容（空地址）。预设常量放 `resources/providerPresets.ts`，只负责预填，接手时请再核对一次各家官方文档中的地址。
  - 名称、Base URL、API Key（password，只写）、「测试连接」→ 显示 `ConnectionTestResult`。
  - 「启用的模型」：测试拉取的列表勾选 + 搜索 + 手动输入；至少选 1 个才能保存。
  - 底部汇总「将创建供应商「X」v1，启用 N 个模型」或「将发布「X」vN+1，新增 N 个模型」。
- [ ] 节点侧：模型下拉只列所选供应商当前版本的 `modelRefs`；供应商有新版本时「处理」段顶部显示「已有 vN+1，本节点使用 vN ·［升级］」，升级写入草稿并进入撤销栈（复用 `connectionUpdates` / `applyConnectionUpdates`）。
- [ ] 画布右上胶囊旁显示「N 个资源有新版本」提示（数量来自 `connectionUpdates`），点击打开「资源」侧面板。

**测试**：`resourceModel.test.ts` 覆盖暂存、合并、至少 1 个模型；`ProviderOverview` 用 Testing Library 覆盖开关暂存与保存请求体。

**验收**（本地，无需用户输入）：
- 界面流程：打开「添加模型」→ 选「自定义 OpenAI 兼容」→ Base URL 填假端点地址、API Key 填 `test-key-local` → 测试连接拉到假端点的模型列表 → 勾选 2 个保存 → 节点模型下拉只出现这 2 个；再启用第 3 个模型发布新版本，看到受影响节点，点「升级」可撤销。
- 真实模型：资源中心能看到 `seed-model-connections.ts` 创建的两个 DeepSeek 连接，「测试连接」拉到真实模型列表，节点选用后跑通一次 Live Run。
- 「本地 Ollama」预设只验证它在本地环境显示、在非本地环境不显示（不做连接测试）。

### M7 数据 / 资源 / 运行侧面板

**目标**：流程层三个 L2 面板按方案 2.3 改造。对应画板「侧面板 · 数据」。

**任务**

- [ ] `editor/v2/StateFields.tsx` → 表格视图：字段 · 类型 · 初始值 · 更新方式 · 写入节点 · 读取节点（来自 M1 `stateFieldProducers/Consumers`，点击节点名在画布定位，用现有选中逻辑，不改视口以外的东西）；展开行编辑类型、初始值、更新方式、说明（说明写入 State Schema 字段的 `description`），自定义 Reducer 在行内「高级」；无读写的字段提示"可以删除"。
- [ ] 把工作流说明、运行限制、"发现 MCP 工具"按钮从 `StateFields` 移到「主流程 ⚙」图设置（`GraphRuntimeFields.tsx` 或现有图设置组件）。
- [ ] `editor/v2/EnvironmentPanel.tsx` → "本流程资源"：`connectionReferences` 列表（可用 / 有新版本 / 已停用）+ `CapabilityBindingPanel` + 本流程用到的变量（`variableReferences`）只读值 + 「打开资源中心」。去掉「当前环境」下拉和共享环境说明（R13，F17）；`CapabilityBindingPanel.tsx`、`ConnectionVersionPanel.tsx`、`diagnostics.ts`、`pages/WorkflowCreateDialog.tsx` 中提到运行环境的选择或文案一并去掉或改写。
- [ ] 「运行」面板：沿用 `ExecutionDetails`，确保它跟随历史抽屉选中的运行；抽屉只做列表与切换。

**验收**：数据表"写入/读取节点"两列与定义一致（M1 单测已覆盖，这里做一次 UI 冒烟）；用 `product-community-triage` 模板新建的工作流中所有字段显示正确；`git grep -n "运行环境" src/features/workflow` 只剩注释或测试中的内部说明，界面上任何位置都看不到运行环境。

### M8 统一节点面板

**目标**：所有节点共用「配置 ｜ 运行数据」骨架，输入/输出为表格 + 变量选择器。对应画板「节点面板 · 模型」「节点面板 · 函数」（本阶段模型和工具节点仍是旧版定义，提示词编辑在 M10，工具表单在 M11）。

**任务**

- [ ] 新 `editor/v2/NodePanel.tsx`：头部（类型图标、可改名标题、类型徽标、展开调试、⋯、关闭）；Tab「配置 ｜ 运行数据」（运行数据 Tab 在 M9 实现，本阶段先隐藏）；配置区四段（输入 / 处理 / 输出 / 高级），段标题带序号与计数，可折叠（折叠状态不持久化）；底部（单步测试、运行到此节点、配置完整度）。处理段由调用方传入 `renderProcessing`。
- [ ] 新 `editor/v2/VariablePicker.tsx`：
  - 分组：启动输入（`inputSchema`）、「<节点名> 的输出」（按 `stateFieldProducers` 分组的 State 字段）、共享 State（无写入节点的字段）、环境变量（当前环境变量 + 其类型）、固定值…。
  - 可展开嵌套属性：来自 Schema；另外可接收 `samples?: Record<string, JsonValue>`（M9 接入），只来自样例的标"样例推断，未声明类型"。
  - 类型不兼容置灰并写原因（从 `BindingFields.tsx` 抽出 `types/compatible/typeLabel` 到 `editor/v2/bindingTypes.ts` 复用）。
  - 搜索；键盘可操作（上下键、回车、Esc）。
  - 输出 `Binding`；"固定值…"打开现有 `SchemaForm`/`JsonField`。
- [ ] 新 `editor/v2/NodeParamsTable.tsx`，两种模式：
  - **声明模式**（模型、代码函数、转换等）：表头「参数名 ｜ 取值 · 参数名默认同字段名」；一行一个 `inputs` 项；新增参数时参数名用 `defaultParamName`；参数名可编辑（节点内唯一、合法性校验）；可删除。
  - **Schema 模式**（工具、已注册函数）：行由 Schema 生成（`toolParamRows`），参数名只读，显示标题、说明、类型和"必填"；不能增删；必填未填时行内标红。
  - 每行「取值」可在「变量 / 固定值」之间切换：变量用 `VariablePicker`；固定值按参数子 Schema 渲染行内控件——string 文本框（长文本自动变多行）、number/integer 数字框、boolean 开关、enum 下拉、object/array 折叠子表单（复用 `SchemaForm`）。固定值写成 `{ source: "literal", value }`。
  - 本阶段工具节点仍是旧版（单个 `arguments`），先用 Schema 模式以只读方式显示并提示"将在 M11 切换为新版"；不要为旧版写新的编辑逻辑。
- [ ] 新 `editor/v2/NodeOutputsTable.tsx`：表头「输出项 ｜ 写入 State 字段 ｜ 更新」；行来自节点输出 Schema 的键；「写入 State 字段」用 `VariablePicker` 的 State 模式或「新建字段」（创建 State 字段 + 写入映射，一次撤销）；更新方式只读显示 reducer；未写入显示「不写入 · 选择字段」；段底「下游读取 X：<节点>」。
- [ ] 新建工具/函数/模型节点时，在输出段顶部显示一次性提示"把结果保存为 State 字段"，字段名默认节点标签 slug。
- [ ] `editor/v2/BindingFields.tsx`：读取/写入逻辑拆入上面两个表格；原始 JSON Pointer、JSON 绑定编辑移到「高级」段；文件可保留为"高级"子组件。
- [ ] `editor/v2/ProcessingFields.tsx` 及各 `*Fields.tsx`：只负责「处理」段。逐个节点类型接入 `NodePanel`：start、end、transform、router、tool、tool_dispatch、function、llm、memory、progress、subgraph、control.*。start/end 等没有输入或输出的段直接不渲染。
- [ ] 旧版节点（`isRetiredNode`）只走诊断：问题列表显示 `NODE_VERSION_RETIRED`，节点面板显示一行说明「此节点是旧版本，请删除后重新添加」。不做重建按钮（R10 下旧数据会被清理，这里只防导入）。
- [ ] `LiveWorkflowEditor.tsx`：Inspector 内容替换为 `NodePanel`。

**测试**：`VariablePicker`（分组、置灰、搜索、键盘）、`NodeParamsTable`（默认名、重名、固定输入只读）、`NodeOutputsTable`（新建字段一次撤销）组件测试；`BindingFields.test.ts` 迁移后保持通过。

**验收**：用 `product-community-triage` 模板新建的工作流，**不打开任何「高级」段**就能重新连好全部读写；所有节点类型面板结构一致（逐个截图核对）；类型不兼容选项置灰并给出原因。

### M9 运行数据 Tab 与展开调试悬窗

**目标**：节点「运行数据」跟随历史选中运行；L3 三栏调试悬窗。对应画板「运行数据 + 历史抽屉」「节点展开调试」。

**任务**

- [ ] 新 `editor/v2/NodeRunDataTab.tsx`：调用 M1 `nodeRunData(definition, steps, nodeId, graphPath)`（`steps` 来自控制器；前端预览时来自 `PreviewStep`，写一个适配函数）。
  - 顶部来源条：状态 · 来自运行 <时间> · 第 N 步 · 耗时 ·「在历史中查看」（展开抽屉并滚动到该运行）。
  - 输入、输出用现有 `ReadableRunOutput` 渲染为键值表。
  - 「写入 State」：字段 · 写入值 · 更新方式（P0 不显示"之前"值，见偏差 V1）。
  - 节点未参与时显示"本次运行未经过此节点"；无运行记录时 Tab 不显示。
  - 底部「用这组输入单步测试」（调用现有 `NodeTestPanel` 的单步测试，预填该输入）、「复制 JSON」。
- [ ] 默认运行：未选中历史时取最近一次运行（`history[0]`）；切换历史后所有节点面板同步。
- [ ] `VariablePicker` 接入样例：从当前运行各节点 `output` 生成 `samples`，用于嵌套属性推断。
- [ ] 新 `editor/v2/NodeDebugDialog.tsx`：L3 悬窗，三栏 1fr / 1.25fr / 1fr。
  - 左「可用数据」：启动输入、上游节点输出、环境变量的实际值（来自所选运行），树形展开；可拖动。
  - 中：与 `NodePanel` 相同的配置四段（复用组件，不复制逻辑）。
  - 右：输出与写入 State。
  - 顶部运行选择下拉、「收回侧面板」、关闭。
  - 拖放：拖到已有参数行 → 重新绑定；拖到空行 → 新增参数（`defaultParamName`）。用原生 HTML5 拖放，不引入拖放库；同时提供键盘替代（在左栏选中字段后按「绑定到…」菜单）。
- [ ] 「固定这组输入」按钮**不实现**（P1）。

**验收**：在历史中切换两次运行，各节点「运行数据」同步变化；调试悬窗中拖放绑定后关闭悬窗，侧面板显示新绑定且可撤销。

### M10 新版 `core.llm` 参数式提示词，旧版废弃

**目标**：方案 3.3 全量落地。对应画板「节点面板 · 模型」。

**Worker 任务**

- [ ] `registry.py`：`core.llm` 的 descriptor 改为 typeVersion 2：config 含 `prompt`；inputs 为开放对象（参数 + 可选 `history`，`history` 类型为 MESSAGES）；outputs `{messages, toolCalls, text}`。**删除**旧版 descriptor。若 descriptor 工具函数不支持 typeVersion，给 `descriptor()` 增加 `version` 参数。
- [ ] `compiler.py`：遇到 `core.llm` typeVersion 1 返回 `NODE_VERSION_RETIRED`（error，带 nodeId、graphPath），不再走其他校验。
- [ ] `compiler.py`：新版校验
  - `prompt.messages` 至少 1 条；分段类型合法。
  - 参数名合法、唯一；`history` 只能是 messages 类型。
  - 每个参数绑定走 `binding_check` / `binding_schema_check`，来源限 input/state/environment（或 literal）；环境变量 key 必须存在。
  - 每个 `param` 分段引用的参数必须已在 `inputs` 声明，否则 `PROMPT_PARAM_UNDECLARED`（带 nodeId 与分段位置 pointer，如 `/config/prompt/messages/0/content/2`）。
  - 未被引用的参数产生 warning `PROMPT_PARAM_UNUSED`。
  - `modelRef` 已启用检查（M2 已加）。
  - 预估渲染长度计入 `maxInputBytes`。
- [ ] `runtime.py · llm`：改为只处理新版——解析参数；渲染规则：`format:"text"` 时字符串原样、数字/布尔转字符串、对象/列表 `json.dumps(ensure_ascii=False)`；`format:"json"` 一律 `json.dumps`；缺失值按该参数绑定的 `onMissing`。组装 `[system?] + history? + prompt.messages`；输出补 `text`（最后一条 assistant 的纯文本）。
- [ ] 测试 `tests/test_llm_v2.py`：渲染（缺失、JSON、环境变量、数字）、编译诊断定位、旧版报 `NODE_VERSION_RETIRED`、`text` 输出写入。现有用到旧版模型节点的 Worker 测试改写为新版，不保留旧版用例。

**前端任务**

- [ ] `domain/v2/factory.ts`：`createNodeV2("core.llm")` 生成新版：`typeVersion: 2`、`config.prompt = { system: [], messages: [{ role: "user", content: [] }] }`、`inputs: {}`、`writes: { text: "/answer" }`（若 State 无 `answer` 字段则提示创建）。
- [ ] `domain/v2/schema.ts`、`validation.ts`：`core.llm` 按新版校验；旧版交给 `isRetiredNode` 在前端给出同样的 `NODE_VERSION_RETIRED` 诊断。
- [ ] 新 `editor/v2/PromptEditor.tsx`：System 一栏；User/Assistant 消息增删、角色切换；分段编辑（contentEditable 上的受控实现，或文本 + chip 混排的自研轻量实现，不引入富文本框架）；输入 `{{` 或点「引用参数」弹出本节点参数列表；参数 chip 不可拆分，可切换 `text/json`；引用未声明参数时提供"添加为参数"（打开 `VariablePicker`）；参数重命名时联动（M1 `renameParam`）。
- [ ] 模型节点「处理」段：供应商（含版本与升级提示）→ 模型（仅已启用）→ `PromptEditor` → 参数摘要（温度 / top_p / 思考开关，点「参数」展开，字段与 Worker 白名单对齐）。输入段增加「对话历史」选择（写入 `inputs.history`）。
- [ ] 删除 `editor/v2/MessageComposer.tsx`、`domain/v2/messageAuthoring.ts` 中只服务旧版 messages 编辑的部分（`git grep` 确认无其他引用；仍被其他节点使用的函数保留）。
- [ ] `application/v2/frontendPreview.ts`：按新版模型节点，用 `renderPromptPreview` 生成预览输入，沿用 `previewOutput`。
- [ ] 模板与夹具（事实 F10）：`LiveWorkflowEditor` 中的 loop 模板、`domain/v2/authoringExamples.ts`、`src/demo/workflow/productWorkflowTemplates.ts`（改 `model()`）、`workspaceWorkflowTemplates.ts`、`scenarios/*.json` 中的模型节点改写为新版；`templateCapabilities`、`productWorkflowTemplates.test.ts` 同步；然后运行 `pnpm db:seed:generate` 重新生成 `supabase/seed.sql`（不要手改）。`seed.sql` 只用于本地，不要对 Hosted 执行。
- [ ] 本地数据清理（第 5.0 节）：新增 `scripts/workflow/local/clean-legacy-workflows.ts`（预检默认只读，`--apply` 才删除，拒绝非本地 URL），在本地执行，然后用 `refresh-local-workspace.ts` 或重新导入种子同步新模板。M11 完成后如有新残留，再跑一次。执行前后的行数记录到第 8 节。

**验收**：System 与 User 中引用来自 State 和环境变量的参数，用本地 DeepSeek 跑通 Live Run；`text` 写入文本字段；引用未声明参数时编译诊断能定位到节点和分段并在面板中高亮；本地清理后工作流库只剩新建与模板数据，平台 DeepSeek 与用户建立的连接仍在且可用；导入一份含旧版模型节点的 JSON 时报 `NODE_VERSION_RETIRED`。

### M11 新版 `core.tool` 表单式参数，旧版废弃

**目标**：方案 3.5 落地，工具参数按 Schema 逐行表单式填写。对应画板「节点面板 · 工具（表单式参数）」：参数列显示名称、必填星号、说明与类型；取值列按类型渲染控件；右侧「变量 ｜ 固定值」分段切换；对象参数展开子表单（子字段只能填固定值）；处理段顶部是工具新版本的升级提示。

**Worker 任务**

- [ ] `registry.py`：`core.tool` 的 descriptor 改为 typeVersion 2：inputs 为开放对象（键为工具参数名）；outputs `{result}`。删除旧版 descriptor。
- [ ] `compiler.py`：旧版返回 `NODE_VERSION_RETIRED`；新版检查 `inputs` 的键都属于 `tool.inputSchema.properties`（否则 `TOOL_ARGUMENT_UNKNOWN`）、必填参数都有绑定（否则 `TOOL_ARGUMENT_REQUIRED`，pointer 指向 `/inputs/<name>`）；字面量按参数子 Schema 校验；变量绑定的目标类型取参数子 Schema（扩展现有 `binding_schema_check` 的 `target_schema` 参数）。
- [ ] `runtime.py · _process_node`（`core.tool` 分支，约 324 行）：用 `resolved` 按键组装 `arguments`（值为缺失且参数可选时不放入），再走原有 `self.tools(...)`。
- [ ] 测试 `tests/test_tool_v2.py`：组装（可选参数省略、嵌套对象字面量、变量与字面量混合）、编译诊断、旧版报错。

**前端任务**

- [ ] `domain/v2/factory.ts`：`createNodeV2("core.tool")` 生成 `typeVersion: 2`、`inputs: {}`。
- [ ] 工具节点「处理」段只选工具；选定后输入表进入 Schema 模式（M8），行来自 `toolParamRows`；切换到另一个工具时用 `reconcileToolInputs` 保留同名参数的绑定。
- [ ] 工具升级（连接或工具版本变化）：升级提示列出新增必填和被删除的参数，确认后应用 `reconcileToolInputs` 的结果（一次撤销）。
- [ ] `application/v2/frontendPreview.ts`：用 `assembleToolArguments` 组装预览参数。
- [ ] 模板与夹具中的工具节点改写为新版（同 M10 的文件清单，`productWorkflowTemplates.ts` 改 `toolField()`），重新生成 `seed.sql`，本地再跑一次清理脚本与模板同步。

**验收**（本地）：`product-community-triage` 模板中的 HTTP 工具节点（HN 公共接口）和一个 Everything MCP 工具，不写任何 JSON，只按表单填参数（混合固定值与变量）跑通 Live Run；必填参数缺失时编译诊断定位到具体参数行；对象类型参数可以用子表单填写；导入含旧版工具节点的 JSON 时报 `NODE_VERSION_RETIRED`。如果本机无法访问外网，HTTP 工具改用 `pnpm test:workflow:services` 启动的 wiremock（需要 Docker），在第 8 节注明。

### M13 变量环境

**目标**：方案 2.6、3.2 落地：用户自建多套变量环境，顶栏切换，Run 冻结所选环境。对应画板「画布总览」（顶栏绿色「变量」下拉）、「资源中心 · 变量」（环境标签页、⋯ 操作菜单、覆盖值高亮与「↺ 清除覆盖」）、「运行数据 + 历史抽屉」（每条运行的变量环境标识）。

**数据库**

- [ ] 新迁移 `supabase/migrations/<UTC 时间戳>_workflow_variable_environments.sql`（用 `supabase migration new workflow_variable_environments` 生成文件名）：
  - `alter table public.workflow_workspace_configuration add column environments jsonb not null default '[]'::jsonb check (jsonb_typeof(environments)='array'), add column default_environment_id text null;`
  - 数据处理（同一事务）：旧的按运行环境覆盖的值不保留（R10）——把每个变量的 `overrides` 置为 `{}`，保留变量的 `key`、`value`（默认值）和其他字段；`environments` 为空数组，`revision` 加 1。不做"运行环境 → 变量环境"的转换。
  - `create or replace function workflow_private.environment_variables(p_owner uuid)`：返回值增加 `environments`、`default_environment_id`；权限语句与原函数一致。
- [ ] 本地用 `supabase migration up --local` 增量应用并验证迁移（不要 `pnpm db:reset`，见 5.0）；在第 8 节记录。Hosted 应用时机见 M12。

**API**（`api/_lib/workflowV2.ts`）

- [ ] `configuration` GET 返回 `{revision, variables, environments, defaultEnvironmentId}`。
- [ ] `configuration` PUT 的 zod：`environments` 最多 20 个，`id` 匹配 `^[a-z0-9][a-z0-9_-]{0,39}$`、唯一，`name` 1–40、唯一；`defaultEnvironmentId` 为 null 或已存在的 id；每个变量的 `overrides` 键必须是已存在的 id。删除原先"覆盖键必须是可用运行环境"的检查（约 151 行）。`name` 也过 `workflowSecretProjection`。
- [ ] 创建 Run 的请求体接受可选 `variableEnvironmentId`；不存在时 400 `VARIABLE_ENVIRONMENT_NOT_FOUND`；转交 Worker。课程实训发起的运行不传，由 Worker 用默认环境。
- [ ] Run 详情与列表返回 `variableEnvironment: {id, name} | null`（从冻结快照读取；如果 Run 列表接口不读快照，在 Worker 写 Run 时把它放进 Run 已有的 jsonb 元数据字段，先核查现有字段再决定，并在第 9 节登记做法）。

**Worker**

- [ ] `registry.py · environment(ref, owner, variable_environment_id=None)`：读取 `environments` 与 `default_environment_id`；有效 id = 传入值，否则默认环境，否则 None；`env["variables"] = {key: overrides.get(id, value)}`；`env["variableEnvironment"] = {id, name} | None`。`env["revision"]` 的摘要继续排除 `variables`，并同样排除 `variableEnvironment`。
- [ ] `server.py`：创建 Run 时把 `variableEnvironmentId` 传给 `registry.environment()`；冻结进 `registry_snapshot` 的内容增加 `variableEnvironment`；恢复检查点时与 `variables` 一样从冻结值恢复（约 188–191 行）。
- [ ] 测试：默认环境、指定环境、未覆盖回落、环境被删除后旧 Run 恢复仍用冻结值。

**前端**

- [ ] `domain/v2/types.ts`：`WorkflowRunV2` 增加 `variableEnvironment?: { id: string; name: string } | null`。
- [ ] `resources/VariableTable.tsx`：表格上方标签页 `默认值 ｜ <各环境> ｜ + 新建环境`；「默认值」标签编辑 `value`，环境标签编辑 `overrides[id]`，未覆盖显示灰色占位；每个环境的 ⋯：重命名、复制为新环境、设为默认、删除（确认对话框说明会删除其覆盖值）。名称、类型、说明对所有环境共享。整表一次保存。
- [ ] 新 `editor/v2/VariableEnvironmentSelect.tsx`：放在顶栏原「运行环境」下拉的位置（M4 已去掉）；选项为各变量环境和「仅默认值」，默认选中用户的默认环境；选择按工作流存 `localStorage` 键 `eduflow.workflow.variableEnvironment.<workflowId>`（try/catch）；所选环境被删除时回落到默认。
- [ ] `useWorkflowV2Controller.ts` / `WorkflowApiV2.createRun`：发起运行时传 `variableEnvironmentId`。
- [ ] 历史抽屉每条运行显示变量环境名称；「运行数据」来源条也显示。
- [ ] `VariablePicker` 的环境变量分组显示当前所选变量环境下的值。

**验收**：新建「开发」「正式」两个环境，给同一变量设不同值；切换顶栏后各跑一次，两次 Run 冻结的值与环境名不同；历史列表显示环境名；删除「开发」后其覆盖值消失，已有的「开发」Run 仍可只读查看并显示原环境名；课程实训发起的运行使用默认环境；迁移后原有变量的默认值保留、旧覆盖值被清空。以上都在本地验收；Hosted 在 M12 只做不含模型节点的冒烟。

### M14 工作流后端合并进 edu-flow

**目标**：Hosted 只保留一个 Vercel 项目 `edu-flow`，同时承载前端、TS API、Python Compiler Function 与 Worker/watchdog Daemon；删除 `edu-flow-workflow`。本地开发方式（`pnpm workflow:local`）不变。依据见事实 F12、F14–F16。

**代码与配置**

- [ ] 腾出 Function 名额：`git mv api/health.ts api/_handlers/health.ts`，把其中 `./_lib/` 引用改为 `../_lib/`；更新 `build/local-api-vite-plugin.ts` 与 `scripts/verify-local-backend.ts` 的 import（本地 `/api/health` 继续由 Vite 插件提供）。Hosted 不再提供 `/api/health`（仓库内无调用方，F16），在第 9 节登记。
- [ ] 新增 `api/workflow-compiler.py`：把 `services/workflow/src` 加入 `sys.path`，执行与 `services/workflow/main.py` 相同的 `assert_hosted_configuration()`，再把 `eduflow_workflow.server.app` 挂载到 `/api/workflow-compiler` 前缀下（例如外层 `FastAPI()` + `mount("/api/workflow-compiler", app)`），使 `/api/workflow-compiler/v1/...` 命中原有 `/v1/...` 路由。
- [ ] 根 `vercel.json`：
  - `functions` 增加 `"api/workflow-compiler.py": { "maxDuration": 120, "includeFiles": "services/workflow/src/**" }`。
  - `rewrites` 在通用 `/api/:path*` 规则**之前**加入 `{ "source": "/api/workflow-compiler/:path*", "destination": "/api/workflow-compiler" }`，并验证原始路径能传到 FastAPI（若 Vercel 改写后路径丢失，改为在入口中读取原始路径头，在第 9 节登记）。
  - 增加 `daemons`：从 `services/workflow/vercel.json` 原样搬入 `worker`、`watchdog` 两项，`root` 改为 `"services/workflow"`，保留 `entrypoint: "Dockerfile"`、命令、`sin1` 实例数 1、1Gi 内存与 660s / 15s 终止宽限。
- [ ] Python 依赖与版本：新增 `scripts/workflow/export-requirements.mjs`（或等价脚本），由 `services/workflow/uv.lock` 生成根目录 `requirements.txt`（`uv export --no-dev --frozen --no-hashes --no-emit-project`）；在 `pnpm test:workflow` 中加入一致性检查，防止锁文件与 `requirements.txt` 漂移。根目录加 `.python-version` 固定为 `3.13`，与 Docker 镜像一致。
- [ ] `api/_lib/workflowV2Protocol.ts · workflowCompiler()`：把地址拼接改为"base URL 路径 + 相对路径"（例如 `new URL(base.pathname.replace(/\/$/, "") + path, base)`），补单元测试覆盖带前缀与不带前缀两种 base URL（本地 `pnpm workflow:local` 仍指向独立运行的 Compiler，不能被破坏）。
- [ ] 删除 `services/workflow/vercel.json`；更新 `services/workflow/README.md`、[运维手册](WORKFLOW_HOSTED_RUNBOOK.md)（项目、环境变量、日志位置）；新增 ADR `docs/architecture/decisions/0007-workflow-backend-in-main-project.md`，说明取代 ADR 0006 中"两个项目"的部署决定及原因（F14）。
- [ ] 门禁全绿；本地 `pnpm workflow:local` + `pnpm test:workflow:local-smoke` 回归通过。

**Hosted 切换**（都是开发版本，可直接切换；每个对外操作前向用户说明）

- [ ] 列出 `edu-flow-workflow` 的环境变量**名称**（不解密、不读取值），与运维手册清单核对，交给用户在 `edu-flow` 的 Production 环境中逐项配置相同的值（`WORKFLOW_DEPLOYMENT_MODE`、`WORKFLOW_DATABASE_URL`、`WORKFLOW_INTERNAL_TOKEN`、`WORKFLOW_ENVIRONMENTS_JSON`、`WORKFLOW_SANDBOX_BACKEND`、`WORKFLOW_SANDBOX_IMAGE` 及可信目录引用的提供方/工具秘密）。值由用户复制，智能体不经手秘密。
- [ ] 公共运行环境（R12）：智能体按 `operations.py · assert_hosted_configuration()` 的规则起草新的 `WORKFLOW_ENVIRONMENTS_JSON` **结构**（不含任何秘密值）交给用户：一个 `access: "authenticated"` 的公共环境，不写 `ownerIds`，不含 `providers`/`connectors`/`tools`/`variables`/`functions`，保留现有环境的 `ref`（R13 开发者约束：标识不变，用户在该环境下建立的连接和函数才能继续使用）、名称、`limits`、`capabilities`；平台 DeepSeek / DeepWiki 移除；**整个配置只保留这一个环境**（R13：每个部署一个，前端自动使用）。由用户写入 `edu-flow` 的 Production 环境变量。环境修订变化后，旧会话的继续/分支需要重新编译（开发阶段可接受）。同时在运维手册中写明"平台运行环境只改内容、不改标识"。
- [ ] 用户把 `edu-flow` 的 `WORKFLOW_COMPILER_URL` 改为生产域名下的 `https://<edu-flow 生产域名>/api/workflow-compiler`（Production 与 Preview 都指向生产，因为 Worker 只在生产运行）；`WORKFLOW_INTERNAL_TOKEN` 保持不变。
- [ ] 发布 `edu-flow` 生产部署。验收：Function 数量 12；`vercel daemons list` 显示 `worker`、`watchdog` 各 1 个在线实例；Daemon 日志可在 `edu-flow` 的 Logs 中看到（验证时未确认的项，F14）；**一个从未被加入任何名单的普通登录账号**能直接打开编辑器、校验和运行工作流（界面上不出现运行环境），并能在资源中心建立自己的连接；一个 `core.transform` 流程能被 Worker 执行完成。
- [ ] 确认无误后，向用户确认再删除 Vercel 项目 `edu-flow-workflow`；删除前先在其项目设置中关闭 Daemon 或直接删除项目，确保同一时刻只有 `edu-flow` 的 Worker 在领取队列任务。删除后再跑一次上一步的验收。
- [ ] 第 8 节记录：两次部署 ID、Function 数量、Daemon 状态、删除时间。

**风险**：合并后前端每次生产发布都会重启 Worker（开发阶段可接受）；构建时间增加约 3–4 分钟；`edu-flow` 不再有任何 Function 余量。

### M12 收尾、清理与端到端验收

- [ ] 删除不再引用的代码（`git grep` 确认 `WorkflowConnections`、`EnvironmentVariables` 等无引用）。
- [ ] 更新改造方案文档状态为"已实施"，变更记录写明完成情况与偏差。
- [ ] 跑第 6 节端到端验收清单，逐项在第 8 节记录结果。
- [ ] Hosted 发布（前提：M14 已完成，后端已在 `edu-flow` 中），按 AGENTS「Hosted Deployment Discipline」：
  1. 确认目标 Supabase 项目、比对迁移历史。
  2. 按第 5.0 节在 Hosted 清理旧工作流数据：先给用户看预检行数、证据引用检查结果和将执行的 SQL，**得到确认后**再执行。
  3. 增量应用 M13 迁移。
  4. 把新版模板写入 Hosted 的 `workflow_templates`（只写模板行，id 不变；执行前同样给用户确认）。
  5. 发布 `edu-flow` **生产部署**（Worker/watchdog 只在生产部署运行，见 F14），用真实构建产物核对 Function 数量为 12；`vercel daemons list` 确认 `worker`、`watchdog` 在线。
  6. 冒烟（Sandbox 不可用，跳过函数节点运行；模型相关验收由用户人工完成，见第 8 节「人工验收」）：
     - 用已认证账号打开编辑器与资源中心；新建两个变量环境、编辑覆盖值并保存，刷新后仍在；顶栏可切换变量环境；工作流库中没有旧数据，模板列表是新版模板。
     - 编译校验（含表单式工具参数的必填校验）。
     - 用 入口 → 数据转换（`core.transform`，读取一个环境变量）→ 结束 的流程在两个变量环境下各跑一次，确认 Run 由 Worker 执行完成，并记录了不同的变量环境与值。
  7. 不要重置 Hosted 数据库，不要对 Hosted 执行 `seed.sql`。

---

## 6. 端到端验收清单

在**本地**、完成旧数据清理之后，先运行 `seed-model-connections.ts --apply` 从 `.env.local` 建好 DeepSeek 连接，再从模板 `product-community-triage`（社区问题分流：检索 → 函数整理 → 模型回答）新建一个工作流，依次执行。真实模型一律使用 `.env.local` 中的 DeepSeek；全程不需要用户输入。Hosted 只做 M12 第 6 步的冒烟，Hosted 的模型验收由用户人工完成。

1. 打开编辑器：画布铺满，四级浮层位置与设计稿一致；三档宽度无横向滚动。
2. 打开资源中心 → 添加模型 → 选「自定义 OpenAI 兼容」，Base URL 填本地假端点、Key 填 `test-key-local` → 测试连接拉到模型 → 勾选 2 个 → 保存；同时确认脚本创建的 DeepSeek 连接测试通过。后续步骤的模型节点使用 DeepSeek 连接。
3. 在模型节点中选这个供应商，模型下拉只出现已启用的 2 个。
4. 在资源中心启用第 3 个模型 → 发布 v2 → 画布出现"1 个资源有新版本"→ 节点处理段出现升级提示 → 升级 → 撤销 → 再升级。
5. 函数节点：不打开「高级」，用变量选择器把 `hits` 绑定到检索节点输出，把输出写入新建的 `summary` 字段。
6. 模型节点（v2）：声明 `question`、`topics`、`course` 三个参数（分别来自启动输入、节点输出、环境变量），在 System/User 提示词中引用；故意引用一个未声明参数，确认编译诊断定位正确，再修复。
7. 运行一次 → 打开历史抽屉 → 选中该运行 → 依次点三个节点，「运行数据」显示各自的输入、输出、写入值。
8. 在函数节点上打开展开调试悬窗，从左栏拖一个字段到中栏新增参数，关闭后侧面板可见并可撤销。
9. 数据（State）面板：写入/读取节点列正确；`messages` 等未使用字段有删除提示。
10. 变量表：新增带说明的变量；新建「开发」「正式」两个变量环境并分别设值；查看引用列。
11. 顶栏切换变量环境各跑一次：两次运行使用的值不同，历史抽屉显示各自的环境名。
12. 工具节点：选一个带必填参数的 HTTP 工具，按表单填参数（一个固定值、一个变量），不写 JSON 跑通；清空必填参数后校验能定位到该行。
13. 清理结果：工作流库中没有改造前的工作流和运行记录；平台 DeepSeek 照常可用，用户建立的连接与凭据仍在且测试通过；变量默认值仍在。通过 API 保存（或校验）一份含旧版模型节点的定义，诊断报 `NODE_VERSION_RETIRED`。
14. 全程检查：编辑器、资源中心、新建工作流、运行准备、诊断提示中都看不到"运行环境"；唯一出现的"环境"是顶栏和变量表中的变量环境。

---

## 7. 风险与应对

| 风险 | 应对 |
| --- | --- |
| `LiveWorkflowEditor.tsx` 单行极长、改动容易冲突 | 先把新组件做成独立文件，主文件只做挂载点替换；每阶段改动尽量集中在少数几处 |
| 浮层化导致视口跳动 | M4 验收专门比对 viewport transform；面板宽度变化不调用任何 React Flow API |
| OpenAI 兼容端点 `/models` 格式不统一 | 只解析 `data[].id`；解析失败时 `models: []` 并允许手动输入 |
| 提示词 chip 编辑器的光标/输入法问题 | 先实现"文本区 + 参数 chip 行内插入"的最小可用版本，输入法组合输入期间不做分段解析；问题记录到偏差 |
| 引用查询扫描全部定义性能差 | 只扫当前用户未归档工作流的当前修订；结果不缓存在服务端，前端按需请求 |
| 合并后 Compiler 路径前缀或改写不生效 | M14 先改 `workflowCompiler()` 拼接并加单测；Hosted 验收必须包含一次真实的认证 Compiler 调用，而不只是看到 401 |
| 合并切换期间两个项目的 Worker 同时领取任务 | M14 先确认新 Worker 在线，再关闭/删除 `edu-flow-workflow`；中间如有异常 Run，开发阶段直接作废 |
| Worker 版本与前端不匹配 | Worker 与前端同一次生产发布；前端对未知字段（如 `models`）做缺省处理 |
| 清理误删连接、凭据或学习证据 | 清理脚本按白名单表删除，`p4_catalog`、Vault、课程与学习表不在范围内；先预检行数与证据引用，Hosted 执行前由用户确认 |
| 手改 `seed.sql` 导致与夹具不一致 | 只改 `src/demo/workflow/` 夹具，再 `pnpm db:seed:generate` |
| 验收依赖本机没有的服务 | 模型统一用 `.env.local` 中的 DeepSeek；HTTP 工具优先用公共接口，无外网时用 wiremock（需 Docker）；Hosted 的模型验收由用户人工完成 |
| 平台运行环境标识被改动，用户连接"失联" | R13 开发者约束写入运维手册；M14 起草环境配置时沿用现有标识 |

---

## 8. 进度跟踪

接手智能体每完成一个阶段更新本表。状态：`todo` / `doing` / `done` / `blocked`。

| 阶段 | 状态 | 提交 | 门禁 | 备注 |
| --- | --- | --- | --- | --- |
| M0 | done | `2eb3c8a` | typecheck/lint/test/build 全绿；worker 需 `UV_CACHE_DIR`；`test:workflow` 需把宿主 `no_proxy` 的 `[::1]` 项去掉 | 基线 `ff3b9db`；基线 `check-layout` 因 `docs/acceptance` 仍跟踪过程文档而红，已归档到本地 `artifacts/archive/acceptance-process-20261023/`（不跟踪）并修正 2 处链接（偏差 V7）；本地 Live Run 用真实 DeepSeek 成功（模板「产品更新事实核对」，run `5bc98e1e`，模型节点 22s；截图在本地 `artifacts/workflow/m0-live-run-success-1440.png`） |
| M1 | done | `d9f98ca` | typecheck/lint/test 全绿；domain/v2 12 文件 108 用例 | 新增 dataFlow/runData/promptAuthoring/nodeVersions/toolParams 纯函数与 Prompt zod；`WorkflowConfiguration.environments/defaultEnvironmentId` 暂为可选，M13 收紧 |
| M2 | done | `6a5b3c9` | worker pytest 262 passed / 12 skipped；uv.lock `uv lock --check` 通过且包集合不变 | openai-compatible 校验与 test 回显、hydrate adapter、ChatOpenAI 分流、MODEL_NOT_ENABLED；新增本地 seed 脚本与假 OpenAI 端点；含偏差 V6（推理模型流式 guard 节流） |
| M3 | done | `d1da418` | typecheck/lint 全绿；api+repository 46 文件 403 用例；api 顶层入口仍 12 | `extensions?view=references`、`configuration?view=references`、变量 `description`；repository 返回 `{items}` 包裹（偏差 V9） |
| M4 | done | `cb5cf1b` | typecheck/lint/test/build 全绿；1440/768/390 无横向滚动、无控制台错误 | 胶囊改为 数据｜资源｜运行｜导出；Inspector 浮动卡片 + 360–720 拖宽（State 默认 640，宽度存 localStorage）；历史栏改浮动抽屉（展开时隐藏左下视图工具与 Controls/MiniMap）；去掉顶栏运行环境下拉；查看历史运行提示条；视口 transform 在开关面板/切换 Tab/拖宽/展开抽屉前后保持一致 |
| M5 | doing | | | 资源中心组件（`resources/` 新目录）并行实施中 |
| M6 | todo | | | |
| M7 | todo | | | |
| M8 | doing | | | 统一节点面板组件（新文件）并行实施中 |
| M9 | todo | | | |
| M10 | doing | | | Worker 部分（core.llm v2）并行实施中 |
| M11 | doing | | | Worker 部分（core.tool v2）并行实施中 |
| M13 | todo | | | |
| M14 | doing | | | 代码与配置部分并行实施中（Hosted 切换待用户确认） |
| M12 | todo | | | |
| M5 | todo | | | |
| M6 | todo | | | |
| M7 | todo | | | |
| M8 | todo | | | |
| M9 | todo | | | |
| M10 | todo | | | |
| M11 | todo | | | |
| M13 | todo | | | |
| M14 | todo | | | |
| M12 | todo | | | |

### 人工验收（用户填写）

Hosted 上需要模型的验收不由智能体执行，也不作为任何阶段的门禁。M12 完成后由用户在 Hosted 用自己在资源中心建立的模型连接人工验收，并在下表填写结果。

| 项目 | 操作 | 结果 | 日期 | 备注 |
| --- | --- | --- | --- | --- |
| 添加模型 | 资源中心 → 添加模型 → 测试连接拉到模型 → 勾选保存 | | | |
| 参数式提示词运行 | 模型节点引用 State 与环境变量参数，跑通一次 | | | |
| 变量环境 × 模型 | 两个变量环境下各跑一次，提示词中的变量值不同 | | | |
| 模型版本升级 | 启用新模型发布新版本，节点「升级」后运行 | | | |

## 9. 偏差记录

实施中偏离改造方案或设计稿时在此登记：编号、阶段、内容、原因、是否需要用户确认。

| 编号 | 阶段 | 偏差 | 原因 | 需确认 |
| --- | --- | --- | --- | --- |
| V1 | M9 | 「运行数据」中的 State 变化只显示写入值，不显示"之前"值 | Step 不携带 State 快照（事实 F5）；"之前 → 之后"需要读 checkpoint，列入 P1 | 否 |
| V2 | M8 | M8 到 M11 之间，工具节点输入表只读显示 | 工具节点要到 M11 才切换为新版（事实 F3）；M11 完成后此偏差消除 | 否 |
| V4 | M14 | Hosted 不再提供 `/api/health`，本地仍由 Vite 插件提供 | 为 Python 编译入口腾出 Function 名额；仓库内无 Hosted 调用方（F16） | 否 |
| V5 | M4、M5 | ~~设计稿顶栏仍有「Local acceptance」运行环境下拉，资源中心头部仍有运行环境选择~~ 已于 2026-10-24 从设计稿移除，偏差消除 | — | 否 |
| V3 | M13 | ~~设计稿缺变量环境标签页和顶栏下拉~~ 已于 2026-10-23 补齐，偏差消除 | — | 否 |
| V6 | M2、M10 | `session_memory_history.stream_model` 的租约/环境重校验由「每个流式 chunk」改为「最多每 0.5s 一次」 | 推理模型（deepseek-flash）单次响应 1000+ chunk；逐 chunk 重校验（每次打开多个数据库连接）使本地模型节点超过 120s 节点预算，本地 Live Run 在修复前失败、修复后 22s 成功；撤销仍在 0.5s 内生效。 | 否 |
| V7 | M0、M12 | 基线 `workflow:check-layout` 为红：`docs/acceptance` 下 5 份阶段过程文档与截图仍被 git 跟踪。已把过程材料移到本地 `artifacts/archive/acceptance-process-20261023/`（不跟踪）并修正 2 份架构文档中的链接 | 仓库既有约定要求过程材料放本地归档，跟踪状态与约定冲突，导致所有门禁无法执行；本地副本与 git 历史均可恢复 | 否 |
| V8 | M0、M2 | 沙箱环境事实：`uv` 需要 `UV_CACHE_DIR`（`~/.cache/uv` 不可写）；宿主 `no_proxy` 含 `[::1]` 会破坏 httpx 构造 | 属本机 harness 限制，非仓库缺陷；pytest 侧已用 `services/workflow/tests/conftest.py` 隔离，独立契约脚本仍需清代理运行 | 否 |
| V9 | M3 | `extensionReferences` / `variableReferences` 返回 `{ items: ResourceReferenceRow[] }` 包裹，而不是裸数组 | 与仓库其他 list 接口一致；M5 资源中心按此接线 | 否 |
