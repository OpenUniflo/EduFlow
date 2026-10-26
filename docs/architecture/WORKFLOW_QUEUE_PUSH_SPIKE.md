# Workflow Queue Push Spike（2026-10-26）

状态：`spike/workflow-queue` 可行性验证，不是完整迁移。Hosted Supabase 尚未应用本分支新增迁移，
真实 Preview 运行需要先由仓库所有者审阅并应用迁移。

## 目标

用 Vercel Queues push 模式替代常驻 `worker` Daemon 执行单次 Workflow Run：

- 没有运行时零常驻消耗；每个 Preview 用自己的部署代码执行。
- 消息只含 `{ "runId": "..." }`，数据库仍是排队/租约/终态权威。
- 本地 `pnpm workflow:local` 继续使用 Daemon 模式，行为不变。

## 运行模式开关

`api/_lib/workflowQueue.ts`：

- `VERCEL_ENV=preview|production` 默认 `queue`。
- 非 Vercel 环境（本地）默认 `daemon`。
- `WORKFLOW_RUNNER_MODE=queue|daemon` 可显式覆盖，用于回滚/演练。

`daemon` 模式保留原有 `/v1/runner-status` 心跳门禁；`queue` 模式跳过该门禁，因为没有常驻
Worker 需要心跳。Queue 模式只跳过“是否在线”，编译/验证仍然调用本部署的
`/api/workflow-compiler`。

## 入队与发送失败

`workflow_v2_enqueue`、`workflow_v2_resume`、`p5_start` 仍然先写
`workflow_live_runs` + `workflow_run_jobs`（PGMQ 记录保留给旧 Worker/恢复路径），随后
`api/_lib/workflowV2.ts` 调用 `@vercel/queue` 的 `send("workflow-runs", { runId })`。

发送失败时返回 `503 WORKFLOW_QUEUE_DISPATCH_FAILED`，**不删除数据库中的 queued Run**。
调用方用同一个 `Idempotency-Key` 重试；重放路径会把仍在 `queued` 的 Run 再次 publish，
`idempotencyKey: run:<runId>` 保证重复 publish 被 Vercel 去重。这样不会出现“数据库有记录但
消息永久丢失”的静默卡死。

## 消费者与 Function 名额

`api/workflow-run-consumer.py` 是普通文件式 Python Function，通过 `vercel.json` 的
`experimentalTriggers` 订阅 `workflow-runs`，没有公网 URL。它使用官方 Python SDK 的
`accept_and_handle` 接收回调，并调用 `eduflow_workflow.queue_consumer`。

为保持 Hobby 12 个 Function 预算：

- 原 `api/course-intent.ts`、`api/course-mapping.ts` 合并进现有 `api/course.ts`（按 resource
  分派），公网路径由 rewrite 保留。
- 新增消费者后总数为 **9 TS + 2 Python = 11**，留 1 个名额给后续 Assistant 边界。

## 只领取指定 Run

新增 forward migration
`supabase/migrations/20261026120000_workflow_queue_claim_by_run.sql`：

- `workflow_private.claim_run(p_run uuid, p_worker text)`：只领取指定 Run；`queued` 时递增
  fencing token、写租约、`run.started`，返回与 `claim` 相同形状的 claim。
- `workflow_private.expire_wait(p_run uuid)`：延迟消息到期后把仍在等待的 Run/Thread 标记为
  `WAIT_EXPIRED`，幂等。
- `workflow_private.seal_run(...)`：内部辅助，封闭 stale lease / 等待过期；不授予
  `workflow_worker` 直接执行。
- 权限：`SECURITY DEFINER`、`search_path=''`，仅 `workflow_worker` 可执行 `claim_run` /
  `expire_wait`；`anon`/`authenticated` 无权限。

消费者**不调用**通用 `claim`，因此不会领取 Hosted 库中其它部署或 4 条旧 queued Run。

## 幂等与重复投递

- `claim_run` 只把 `queued` 改成 `running`；第二次投递看到 `running` 且租约有效时返回
  `kind=running`，消费者直接 ack，不执行第二次。
- 终态/`continued`/`waiting` 的重复消息同样 ack 或只做等待调度。
- stale `running` 租约（函数被杀）在下次投递时由 `claim_run` 封闭为 `WORKER_LOST`，不重新
  执行。
- 消息重复、函数超时、部署滚动都由这套“先 claim 指定 Run，再执行”的边界收敛。

## 暂停与延迟唤醒

`RunPaused` 时消费者调用现有 `pause_run`，然后向 `workflow-runs` 发送带 `delay` 的
`{ runId, kind: "wait" }`。延迟消息到期后：

- 仍等待且已到期：`expire_wait` 标记 `WAIT_EXPIRED`。
- 已恢复/终态：ack，无副作用。
- 发送失败：handler 抛错，Vercel 重投；重投路径从 `wait_expires_at` 重算剩余时间再发。

## 300 秒上限

`api/workflow-run-consumer.py` 的 `maxDuration` 为 300s；消费者默认预算
`WORKFLOW_QUEUE_FUNCTION_BUDGET_SECONDS=270`（可调，上限 290）。`execute_claim` 同时：

- 把 `RunExecution.deadline` 收敛到函数预算；
- 用 `asyncio.wait_for` 包围 `run_graph()`；
- 超时转换为 `RUN_TIMEOUT` 并调用 `finish(...failed)`，让 Run 进入明确终态，而不是一直
  `running`。

**已知限制**：超过 300s 的长运行不能靠单次函数完成。后续工作需要把长 Workflow 拆成可续跑的
Step/Checkpoint 边界（每次消费执行一段并重新入队），或迁移到支持更长执行的产品；本次不实现。

## Watchdog 缺口（本次不迁移）

没有 `watchdog` 后缺少：

- `QUEUE_TIMEOUT`：queued 超过 60s 的 Run 不会被自动封闭；
- `p5_sweep`：Thread/Checkpoint 保留期、过期等待、清理批量不会推进；
- Sandbox VM 回收 `reap()`；
- 全局 `WORKER_LOST` / 超时巡检。

本 spike 的补偿：

- 消费者每次收到消息时，`claim_run` 会封闭 stale `running` 租约（`WORKER_LOST`）；
- 延迟消息 + `expire_wait` 处理等待过期；
- 每次消费只在函数内做这一条 Run 的检查，不扫描全库。

建议后续把低频 watchdog 放到一个 Cron Function（例如每分钟一次、只处理有界批次），或在每次
消费时顺带做有界 `p5_sweep`；不要恢复成 5 秒常驻 Daemon 轮询。

## 本地验证

- `WORKFLOW_TEST_LOCAL_DB=1` 的 `claim_run` / stale lease / wait expiry / 权限 pytest 通过。
- `pnpm workflow:local` 栈（compiler + worker + watchdog + 5173）重启后，用真实 DeepSeek
  `deepseek-flash` 跑通一次 Run：状态 `success`，输出 `pong`，函数自身计时约 2.9s，
  3 个 step（start/model/end）。
- 说明：本地仍是 daemon 模式，证明抽取 `execute_claim` 没有破坏旧 Worker；队列消费者本身需要
  Preview 部署 + Hosted 迁移后才能做端到端验证。

## Preview 证据（待填）

- Deployment ID / URL：
- Function 数量证据：
- Queue consumer 调用日志 / duration：
- Active CPU：待用 Vercel Observability 或消费者日志中的 `durationMs` 补充；模型等待是 I/O，
  Active CPU 预计明显低于墙钟时长。
