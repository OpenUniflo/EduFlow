# Hosted 切换交接：队列推送执行（2026-10-26）

状态：`feat/workflow` 已完成队列推送运行、删除 Vercel Daemon、补齐有界 watchdog 缺口与文档更新；本次不新增 Hosted 迁移，也不执行 Hosted SQL。Preview 由本次推送触发，真实运行验收由仓库所有者完成。下文的 Preview 证据在推送后读回。

## 1. 目标与现状

| 项 | 值 |
| --- | --- |
| Vercel 项目 | `edu-flow`（`prj_po8NNFg8tIXZJnanYCDR8uxGnpDz`，team `july-nanas-projects`） |
| 生产域名 | `https://edu-flow-six-phi.vercel.app` |
| Hosted Supabase | KnowledgeAtlas `uyljtdbvlivxniililay` |
| 执行方式 | Vercel Queues push；数据库写入 Run 后发送仅含 `runId` 的消息，由当前部署的 `api/workflow-run-consumer.py` 认领执行 |
| 常驻进程 | 无 `worker`/`watchdog` Daemon；`vercel.json` 不再声明 `daemons` |
| Function 数量 | 11（9 个 TypeScript + `workflow-compiler.py` + `workflow-run-consumer.py`） |
| 已应用迁移 | `20261026120000_workflow_queue_claim_by_run.sql`（`claim_run`、`expire_wait`、`seal_run`），不得改写 |
| 本次新增迁移 | 无 |

- 每个 Preview 用自己的 Compiler、API 和 queue consumer 执行自己收到的消息；不再依赖 Production Worker。
- 额度消耗只在队列消息或运行活动时发生；没有常驻进程空转。
- 单次函数上限 300 秒；图执行预算默认 250 秒（可调到 270 秒），超时明确封存为 `RUN_TIMEOUT`。

## 2. `edu-flow` 的 Production 环境变量

以下只列名称和用途；**值由用户填写，不要提交到仓库**。

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `WORKFLOW_DEPLOYMENT_MODE` | 是 | `hosted` |
| `WORKFLOW_DATABASE_URL` | 是 | Hosted Supabase session pooler，`workflow_worker` 受限用户，`sslmode=require/verify-ca/verify-full` |
| `WORKFLOW_ENVIRONMENTS_JSON` | 是 | 用第 3 节的单一公共环境 JSON；`ref` 保持 `hosted` |
| `WORKFLOW_SANDBOX_BACKEND` | 是 | `vercel` |
| `WORKFLOW_SANDBOX_IMAGE` | 是 | 形如 `registry/image@sha256:<64 hex>` 的固定沙箱镜像 |
| `WORKFLOW_INTERNAL_TOKEN` | 是 | API、Compiler 与消费者共享的内部身份；至少 32 字符 |
| `WORKFLOW_COMPILER_URL` | 不再需要 | 仅本地/非 Vercel 环境使用；Vercel 部署自动调用本次部署的 `https://$VERCEL_URL/api/workflow-compiler` |
| `WORKFLOW_QUEUE_FUNCTION_BUDGET_SECONDS` | 可选 | 默认 250，允许 30–270；用于给 300 秒函数限制留出 finish/清理余量 |
| `WORKFLOW_RUNNER_MODE` | 不再需要 | Vercel 上强制 queue；该变量只在本地开发选择 `queue`/`daemon` |

`WORKFLOW_ALLOW_LOCAL_FIXTURES` 不得设置为 `1`；`assert_hosted_configuration()` 会 fail closed。

## 3. 公共运行环境 JSON（替换 `WORKFLOW_ENVIRONMENTS_JSON`）

```json
{
  "environments": [
    {
      "ref": "hosted",
      "name": "公共环境",
      "access": "authenticated",
      "capabilities": [],
      "providers": [],
      "connectors": [],
      "tools": [],
      "variables": [],
      "functions": []
    }
  ]
}
```

规则（`services/workflow/src/eduflow_workflow/operations.py · assert_hosted_configuration`）：只能有一个或多个 `access:"authenticated"` 公共环境时，不得带 `ownerIds`、`providers`、`connectors`、`tools`、`variables`、`functions`、`localFixtures`；`ref` 一经使用不再修改（用户连接与函数按“用户 + 运行环境标识”存放，改标识会失联）。平台 DeepSeek/DeepWiki 不再提供，所有连接由用户在资源中心自建。

## 4. 发布与验证

1. 由用户把 `feat/workflow` 合入生产分支并推送，或以受控方式 `vercel --prod`；本次任务不执行 `--prod`。
2. 读回证据：
   - 部署 `readyState=READY`、target=production；
   - Function 数量 11，`vercel.json`/部署产物没有 `daemons`；
   - `api/workflow-run-consumer.py` 带 `queue/v2beta` 触发器、topic `workflow-runs`、`maxDuration` 300；
   - `/api/workflow-compiler/health` 与认证 capabilities 正常；
   - 普通登录账号可打开编辑器、资源中心、校验与运行。
3. Hosted 冒烟（由用户执行）：
   - 资源中心变量环境保存/刷新；
   - 编译校验；
   - 真实 DeepSeek Run 成功，数据库中 worker 为 `queue:...`，由该部署的消费者执行；
   - 运行超过预算时进入 failed + `RUN_TIMEOUT`，不长期停在 running。
4. 旧项目 `edu-flow-workflow` 不再需要承接当前运行；删除与否由用户确认，本次任务不删除项目。

## 4.1 Preview 运行时证据（2026-10-26）

- commit：`bb89bbf02847937a7fcb578f1d13b28d64702aa5`（`feat/workflow`）。
- GitHub Deployment：`7332374098`，state `success`（`vercel[bot]`）。
- 部署 URL：`https://edu-flow-p852e92aw-july-nanas-projects.vercel.app`；分支别名：`https://edu-flow-git-feat-workflow-july-nanas-projects.vercel.app`（两者 ETag 一致）。
- Vercel CLI 当前登录 token 已过期，未能读取 `dpl_...` 控制面 ID；上列 GitHub Deployment ID 与部署 URL hash `p852e92aw` 是本轮可读回的部署身份。
- Function 数量：仓库 `api/` 为 **11** 个物理入口（9 TS + `workflow-compiler.py` + `workflow-run-consumer.py`）；`tests/courseCreatorArchitecture.test.ts` 断言 11。Preview 实测 9 个 TS 入口均由 Function 处理（401/405/500 JSON，不是 SPA HTML），`/api/workflow-compiler/health` 返回 401 JSON；consumer 无公网入口（POST 405 / SPA fallback）。
- `daemons`：`vercel.json` 不再声明；该 Preview 成功构建自上述 commit。Vercel 控制面构建日志原文因 CLI token 过期未读取，未把本地 `vercel build` 的 2.2GB 依赖错误当作部署失败。
- 前端产物包含本轮文案：`运行已排队超过 30 秒`、`运行超过时长上限`、`排队超时`，证明部署执行的是本轮代码。
- 公网冒烟：`GET /` 200；`/api/workflow-compiler/health` 401 JSON；`/api/assistant`、`/api/workflows?resource=capabilities`、`/api/materials`、`/api/material-parsing-jobs` 401 JSON；`/api/course`、`/api/domains`、`/api/knowledge`、`/api/learner` 405 JSON；`/api/course-intent` 401、`/api/course-mapping` 500（Preview 缺 LLM 变量，属环境差异）。
- 真实 Hosted 模型运行由仓库所有者执行；本次不登录、不填/打印 API Key。

## 5. 回滚

- 回退只选择已验证且 schema/执行器兼容的 deployment；Vercel promotion/rollback 只切换 Function 代码，不再有 Daemons 需要同步。
- 数据库只向前修复，不回滚迁移；`20261026120000_workflow_queue_claim_by_run.sql` 已在 Hosted 应用。
- 滚动期间在途消息可能由旧/新部署消费；`claim_run` 只领取命名 Run，有效租约不会被第二次执行，stale 租约由 `claim_run`/`watchdog` 封闭。
- 若 Compiler rewrite 子路径在 Hosted 被折叠（404/405），按 ADR 0007 调整为读取原始路径头的入口实现，并登记问题。

## 6. 已知限制与后续

- 超过 300 秒的长运行不能靠单次函数完成；本次不做分步续跑。后续需要把长 Workflow 拆成可续跑的 Step/Checkpoint 边界（每次消费执行一段并重新入队），或迁移到支持更长执行的产品。
- 长时间完全没有队列活动时，过期 Thread/Store/临时请求清理、遗留 sandbox 回收会延后到下一次活动；当前没有 Hobby 可用的每分钟 Cron，故不依赖 Cron 补洞。
- Hosted 中 10-26 08:22–08:24 的 4 条旧 queued Run 没有队列消息；它们不会被专门删除/改写，第一次队列活动（运行结束或 75 秒延迟 timeout 检查）触发有界 `watchdog` 后，预期被封为 failed + `QUEUE_TIMEOUT`（前提是其 Thread 仍为 active/waiting）。若 Thread 已不满足条件，则保持原状等待人工核对；若期间完全没有活动，会继续显示 queued 直到下一次活动。
