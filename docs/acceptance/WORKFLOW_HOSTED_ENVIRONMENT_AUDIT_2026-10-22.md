# Workflow Hosted 环境审计（2026-10-22）

本审计只读核对 Hosted 的 Supabase 项目、迁移历史、Vercel 项目/部署、实际执行器与 Function 预算。没有部署、没有迁移、没有写数据库、没有读取秘密值。

## 结论

**审计结论：只读审计门通过，可以部署 Preview；部署后的 Hosted 冒烟发现 Sandbox 与模型节点阻塞，Hosted 技术门未通过，不能执行模板内容迁移。**

- Supabase 迁移历史与仓库**完全一致**：117 条、最新 `20261021165505`、digest `4abc4c45617385b0d7194785d52104f0`。
- Hosted Worker 与 Sandbox 已实际工作：最近 Run `79d06ba2…` 成功，环境 revision `66fb60ce…`，registry digest `9a8a3cbe…`，执行后端为 Vercel 固定镜像 `eduflow-isolated@sha256:fb27a073…`。
- 前端最新 Preview `dpl_9Sr9LtFa8…`、Worker 最新 Production `dpl_Dy382C45…` 均 READY。
- **四套产品模板尚未投放到 Hosted**：`workflow_templates` 只有 16 条历史模板，`product-tech-brief`、`product-dependency-health`、`product-community-triage`、`product-content-review` 均不存在。
- **Function 预算已到上限**：前端 12 个顶层 `api/*.ts` 入口 = Hobby 每部署 12 个上限；Worker 部署为 1 个 `out/fastapi` Lambda。不得再新增顶层 API Function。
- 当前 Vercel 插件身份无权读取项目级 env/logs（403 scope），因此**未**核对 `WORKFLOW_ENVIRONMENTS_JSON` 当前值、当前环境 revision 或运行日志；这是审计边界，不是已通过项。
- Hosted 中没有 Local 验收账号（精确查询结果 0）；共享库未被 Local seed 污染。

## 1. Supabase

| 项 | 结果 |
| --- | --- |
| 项目 | `uyljtdbvlivxniililay`（KnowledgeAtlas），ACTIVE_HEALTHY，PostgreSQL 17.6，ap-southeast-1 |
| 迁移 | 117 条；最新 `20261021165505_course_assignment_workflow_input_upsert`；本地与 Hosted digest 一致 |
| 本地验收账号 | 精确查询 `student@local.test` / `admin@local.test` 数量 = 0 |
| 模板 | 16 条历史模板；四套产品模板缺失 |
| 工作流定义 | 5 |
| Live Runs | 47（46 success / 1 cancelled）；最近成功 run `79d06ba2…` |
| Threads / Run events | 62 / 1051 |
| Workspace configuration | 0 行（环境目录来自 Worker 的 `WORKFLOW_ENVIRONMENTS_JSON`，不是该表） |

## 2. Vercel 部署身份

| 项目 | 最新 READY 部署 | 源提交 | 目标 | 备注 |
| --- | --- | --- | --- | --- |
| `edu-flow-workflow`（FastAPI Worker） | `dpl_Dy382C45Aho8ZyfUdXY8G7YMYBzn` | `c3cb2a4`（docs: Hosted 环境提示修复） | production，`edu-flow-workflow.vercel.app` | 1 个 `out/fastapi` Lambda；`maxDuration:120`；`sin1`；Docker worker/watchdog 配置 |
| `edu-flow`（Vite 前端） | `dpl_9Sr9LtFa8Qz68XPGFpJjPAuKZNVp` | `1ff4c74`（Hosted 环境 Run 验收） | preview（`target:null`） | 别名 `edu-flow-git-feat-workflow-july-nanas-projects.vercel.app`；主站 production 未提升 |

- `edu-flow-workflow` 部署文件树：`out/fastapi` 唯一 Lambda；Worker 配置在 `services/workflow/vercel.json`，包含 `worker`/`watchdog` Docker services、1Gi、660s/15s。
- `edu-flow` 顶层 API：12 个文件，正好占满 Hobby 12 Function 预算；API 共享库在 `api/_lib`，不是独立入口。
- `dpl_9Sr9…` 的文件树接口返回 `File tree not found`（git 部署不提供该树）；因此前端生成产物计数只能先以源码入口 12/12 记录，下一次 Preview 构建必须用真实生成产物复核。
- 前端 Preview URL 返回 200；Worker 公共根路径/`/health` 返回 401，符合内部身份边界，不据此判定失败。

## 3. 实际执行器与 Sandbox

最近成功 Run 的冻结 registry 摘要：

| 字段 | 值 |
| --- | --- |
| Run | `79d06ba2-02de-4836-8d3a-fc522c4d8565` |
| Environment ref | `hosted` |
| Environment revision | `66fb60ce64000f0562e27bb942a8d96d9f2bdea693b456635d6abc9648b79dc6` |
| Registry digest | `9a8a3cbeba592affd4bb6236a2b83403b9b4cf5938e1ce390f5548ac4ad0b584` |
| Configuration revision | `0` |
| Execution backend | `vercel` + `eduflow-isolated@sha256:fb27a073a37b616e9f7e0a69d161ff9b6217d28409b1e0ca5b2298de2653314b` |
| 工具数 | 2 |

这证明 Hosted Worker、数据库队列/Thread 和 Vercel Sandbox 路径实际执行过；不等于四套产品模板或真实模型/公开工具已在 Hosted 验证。

## 4. 权限与未核对项

以下读取被 Vercel 团队 scope 403 拒绝，未读取任何值：

- `get_project`（项目设置）
- `filter_project_envs`（环境变量）
- `get_runtime_errors` / 部署事件日志
- 无法直接确认当前 `WORKFLOW_ENVIRONMENTS_JSON` 的 owner 范围、当前 environment revision、Worker/watchdog 实时实例数与最新日志。

**处理方式**：不把项目 READY 当作环境配置已通过；部署后用普通认证 API 读回环境目录与 capabilities，先认证 API 冒烟，再浏览器验收。若需要核对 env/日志，先完成 Vercel 团队授权；不要通过读取秘密或打印 env 值绕过。

## 5. 单元门与下一步

1. **Hosted 部署门**：当前审计通过；可部署 Worker/前端 Preview，不设维护窗口、不 reset 共享库、不自动迁库。
2. **函数预算门**：前端保持 12 个顶层 API 入口，不新增 Function；下个 Preview 生成产物必须复核 ≤12。
3. **四场景技术门**：先认证 API + 浏览器；产品模板内容尚不存在，技术路径需要直接定义或经批准的内容投放策略。
4. **模板内容迁移**：只能在四场景 Hosted 技术验收通过后执行一条仅 INSERT 四套 `workflow_templates` 的迁移；本次审计未执行。
5. **清理**：审计未创建 Hosted 数据；不删除既有 5 个定义、47 个 Run、16 个模板或任何用户数据。

## 6. 证据来源

- Supabase MCP：`get_project`、`list_migrations`、`execute_sql`（只读聚合/摘要）。
- Vercel MCP：`list_projects`、`list_deployments`、`get_deployment`、`list_deployment_files`、`list_aliases`、`get_auth_user`。
- 本地：`git show/merge-base`、`api/` 入口计数、`services/workflow/vercel.json`。
- 未使用：部署、迁移、数据库写、秘密读取、环境变量导出。

## 7. 2026-10-23 部署与 Hosted 冒烟结果

### 7.1 部署

- 已将 `5ecf96a` 推送到 `origin/feat/workflow`；前端 Preview `dpl_8ZDWpavXLsGiq6oLeBK3PUtansT3` 构建 READY，URL `edu-flow-95gvfuppl-july-nanas-projects.vercel.app` 返回 200。
- Worker 未随本次 push 触发新部署，最新 Production 仍为 `dpl_Dy382C45…`（commit `c3cb2a4`）；本次前端改动不要求 Worker 代码更新。
- 前端顶层 API 入口仍为 12/12；未新增 Function。

### 7.2 Hosted 认证与环境

- Hosted 测试管理员登录成功；`/api/workflows?resource=environments` 返回 `hosted` 环境，名称 `Hosted · P6`，provider `deepseek`/`deepseek-flash`，connector `deepwiki`。
- 冒烟期间环境 revision：`805f77bcf4521a1174e720036fd3a7ab49868cb09bf57d6610103a0a9d9a7e07`。
- 四套产品模板仍不存在；没有执行模板 INSERT 迁移。

### 7.3 自建只读公开连接与真实运行

为验证真实公开 HTTP 路径，测试管理员发布了 3 个只读、固定 URL 的临时连接（HN / StackExchange / npm，`s1-*-mvjqh4zu`），未写共享 Runtime。

| 用例 | Workflow | Run | 结果 |
| --- | --- | --- | --- |
| S1 技术简报（3 工具 + 隔离函数 + 模型） | `56668353-db4d-4aa1-b943-ebdbbe0aaa30` | `ccc24dd1-e963-4e63-ade9-6ffce7d1099a` | **failed** `SANDBOX_UNAVAILABLE`：`The hosted isolated execution environment is unavailable` |
| S4 内容事实核对（仅模型） | `13797634-9c70-44cd-9b1d-217518ba5680` | `85c8e7a4-2c24-441b-b604-036695603ed8` | **failed** `NODE_EXECUTION_FAILED`；start/prompt 完成，`review` 节点失败，错误为通用基础设施错误 |

S1 说明 Worker 能读取环境/工具目录并排队执行，但函数节点无法创建 Hosted Sandbox；S4 说明模型节点也未被 Hosted 验证。两者都不能由 READY 部署或既有 46 条 model-free Run 推断为已通过。

### 7.4 清理

- 删除上述 2 个临时 Workflow（`baseRevision=1`），返回 200。
- 禁用 3 个临时连接；未删除共享 Runtime、历史模板或任何既有用户数据。
- 未提升前端 Preview 到 production；未执行模板内容迁移。

### 7.5 阻塞与下一步

| 阻塞 | 证据 | 需要 |
| --- | --- | --- |
| Hosted Sandbox 不可用 | S1 run `ccc24dd1…` 的 `SANDBOX_UNAVAILABLE` | 核对 Worker env 的 `WORKFLOW_SANDBOX_IMAGE`、Vercel SDK/OIDC 与 Sandbox 配额；读取 env/log 需团队 scope 授权 |
| Hosted 模型节点失败 | S4 run `85c8e7a4…` 的 `NODE_EXECUTION_FAILED` | 核对 DeepSeek provider 凭据/egress 与 Worker 日志；不能把 provider 出现在目录当作可用 |
| 产品模板缺失 | `workflow_templates` 仍只有 16 条历史模板 | 四场景技术门通过后执行仅 INSERT 的内容迁移 |
| Function 预算满 | 前端 12/12 API 入口 | 保持不新增 Function；下个 Preview 仍复核生成产物 |

**因此当前准确分层结论是：Local S1–S4 技术路径通过；Hosted 部署与认证目录通过；Hosted S1/S4 真实运行失败（Sandbox/模型），Hosted 技术门未通过，模板内容迁移未执行。**

## 8. 2026-10-23 用户决定：先以 Local 验收为准

- 用户明确要求：**远程部署版本无法验收时，先保证 Local 验收通过**；不同用户的执行能力由用户登录后自行创建/配置，例如 DeepSeek Key 与模型。
- Worker 已重新以 Production 部署 `dpl_CrYMiVk1f24pGkwuNMav3DPTML6K`（commit `6a94040`）；重部署后最小 Sandbox smoke run `cd2fc9e2-c3da-469d-89c3-50f3f639d9a7` **success**，说明 Sandbox 创建路径已恢复。
- S4 模型节点在重部署后仍 `NODE_EXECUTION_FAILED`（run `e729f38a-620e-42bc-af32-69409f13353b`）；具体 provider 凭据/运行日志仍未定位。Hosted 四场景技术门不再作为当前阻塞，模板内容迁移继续暂停。
- Local 侧已验证自建执行能力：测试账号可创建加密 DeepSeek 连接 `my_deepseek_round22`，连接测试成功，环境显示 `origin=user`，并用该连接真实运行 workflow `ddada551…` / run `e44be04a…` 成功。UI 截图见 [round22-selfservice-deepseek.png](evidence/workflow-s1-round13/round22-selfservice-deepseek.png)。
- Hosted 临时 Workflow 已删除；Hosted 数据仍为 5 definitions / 47 live runs / 16 templates；未执行模板 INSERT 迁移，未提升前端 production。
