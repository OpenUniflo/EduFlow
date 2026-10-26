# Workflow 队列推送执行

状态：正式运行方式（2026-10-26 切换）。Vercel Preview/Production 不再有常驻 `worker`/`watchdog` Daemon；Run 由 Vercel Queues push 消息触发当前部署的 `api/workflow-run-consumer.py` 执行。本文替代原 `WORKFLOW_QUEUE_PUSH_SPIKE.md` 的可行性验证记录。

相关文档：[Hosted 部署与运维](WORKFLOW_HOSTED_RUNBOOK.md)、[Hosted 切换交接](WORKFLOW_HOSTED_SWITCH_HANDOFF.md)、[Runtime Contract](WORKFLOW_STATEGRAPH_RUNTIME_CONTRACT.md)。

## 1. 目标与运行模式

- **Vercel 只有队列模式**：`VERCEL_ENV=preview|production` 时 `resolveWorkflowRunnerMode()` 恒为 `queue`；即使环境里残留 `WORKFLOW_RUNNER_MODE=daemon` 也不会在 Vercel 启动 Daemon。
- **本地保留 Daemon**：`pnpm workflow:local`（无 `VERCEL_ENV`）仍启动 Compiler、Worker、Watchdog 和 5173 前端；本地可用 `WORKFLOW_RUNNER_MODE=queue|daemon` 显式选择。
- **数据库是权威**：`workflow_live_runs`、`workflow_run_jobs`、`workflow_execution_threads`、官方 checkpoint/Store 决定排队、租约、等待和终态。队列消息只含 `{ "runId": "..." }`，不携带 State、输入、凭据或产品实体。
- **Preview 用自己的代码执行**：消息由接收它的部署消费；Preview 的 Compiler、API 与 consumer 来自同一 Preview commit，不再有“Preview 编译、Production Worker 执行”的版本错配。
- **额度只在有运行时消耗**：没有常驻进程轮询；消费者只在收到运行/等待/超时消息时启动。一次 Run 会额外产生一条延迟 75 秒的队列超时检查消息。
- **单次函数上限 300 秒**：`api/workflow-run-consumer.py` 的 `maxDuration` 为 300；图执行预算默认 250 秒（可调上限 270 秒），为认领、`finish`、有界清理和冷启动留出余量。

## 2. 入队、发送失败与幂等

`workflow_v2_enqueue`、`workflow_v2_resume`、`p5_start` 仍先在一个数据库事务里写 Run、幂等记录和 `workflow_run_jobs`；随后 `api/_lib/workflowV2.ts` 调用 `dispatchQueuedWorkflow()`：

1. 发送主消息 `{ runId }`，`idempotencyKey: run:<runId>`。
2. 主消息成功后发送延迟超时检查 `{ runId, kind: "timeout" }`，`delaySeconds: 75`、`retentionSeconds: 3600`、`idempotencyKey: run:<runId>:timeout`。延迟检查失败只记录警告，不影响已接受的 Run；下一次活动仍会做有界 sweep。

主消息发送失败时返回 `503 WORKFLOW_QUEUE_DISPATCH_FAILED`，**不删除数据库中的 queued Run**。调用方用同一个 `Idempotency-Key` 重试；重放路径会把仍在 `queued` 的 Run 再次 publish，Vercel 按幂等键去重。重复投递由 `claim_run` 收敛：

- `queued` → `running`，递增 fencing token、写 30 秒租约和 `run.started`；
- 已 `running` 且租约有效 → `kind=running`，消费者直接 ack，不执行第二次；
- 终态/`continued`/`waiting` 的重复消息只做 ack 或等待调度；
- stale `running` 租约（函数被平台杀死）→ `claim_run` 封为 `WORKER_LOST`，不重新执行。

## 3. 消费者与 Function 预算

`api/workflow-run-consumer.py` 是文件式 Python Function，通过 `vercel.json` 的 `experimentalTriggers` 订阅 `workflow-runs`，没有公网 URL。它使用官方 Python SDK 的 `accept_and_handle` 接收回调，并调用 `eduflow_workflow.queue_consumer`。

文件式 Function 没有生成的 Python subscriber 元数据；`queue/v2beta` 由平台按 Function 路径派生 consumer group（`sanitizeConsumerName("api/workflow-run-consumer.py")` = `api_Sworkflow-run-consumer_Dpy`），因此 `@subscribe` 必须钉住同一个 group，否则消息会重试。

为保持 Hobby 12 个 Function 预算：

- 原 `api/course-intent.ts`、`api/course-mapping.ts` 合并进现有 `api/course.ts`（按 resource 分派），公网路径由 rewrite 保留。
- 新增消费者后总数为 **9 TS + 2 Python = 11**，留 1 个名额给后续 Assistant 边界；没有新增 `api/` 顶层入口。

`execute_claim` 是 Daemon Worker 与队列消费者共用的执行边界；调用方负责 claim，`execute_claim` 负责 heartbeat、`RunExecution`、`finish`、暂停和失败收敛。消费者预算：

| 配置 | 默认 | 允许范围 | 作用 |
| --- | --- | --- | --- |
| `maxDuration` | 300s | 300s（Hobby 上限） | 函数硬上限 |
| 图执行预算 | 250s | 30–270s（`WORKFLOW_QUEUE_FUNCTION_BUDGET_SECONDS`） | `asyncio.wait_for` 与 `RunExecution.deadline` 的双重约束 |

## 4. 暂停与等待

`RunPaused` 时消费者调用现有 `pause_run`，然后向 `workflow-runs` 发送 `{ runId, kind: "wait" }` 延迟消息。到期后：

- 仍等待且已到期：`expire_wait` 标记 `WAIT_EXPIRED`；
- 已恢复/终态：ack，无副作用；
- 发送失败：handler 抛错，Vercel 重投；重投路径从 `wait_expires_at` 重算剩余时间再发。

## 5. 300 秒与明确失败

`execute_claim` 在队列模式下：

- 把 `RunExecution.deadline` 收敛到函数预算；
- 用 `asyncio.wait_for` 包围 `run_graph()`；
- 超时转换为 `RUN_TIMEOUT`，并调用 `finish(... failed, error)` 持久化 `code=RUN_TIMEOUT`、`reason=timeout`、`effect=unknown`。

前端把 `RUN_TIMEOUT` 显示为“运行超过时长上限”，把 `QUEUE_TIMEOUT` 显示为“排队超时”，不会一直停留在“运行中”。超过 300 秒的长运行仍需后续的分步续跑；本次不实现，见 §9。

## 6. Watchdog 缺口：现在由谁、在什么时候处理

没有常驻 watchdog 后，所有维护都收敛到“有队列消息或运行活动”时执行，且每一步都有界、幂等、可重试。

| 缺口 | 现在由谁/何时处理 | 有界与幂等 | 已知局限 |
| --- | --- | --- | --- |
| 排队超时 `QUEUE_TIMEOUT` | 入队时发送 75 秒延迟 `kind=timeout` 消息；消费者调用一次 `workflow_private.watchdog()`。正常 Run 结束后的维护也会调用。 | `watchdog` 每批最多 128 个 Thread，跳过被锁行；已终态 Run 不再改。 | 如果主消息和延迟消息都丢失且之后完全没有活动，queued Run 会等到下一次活动才被封。 |
| 失联运行（lease 过期）封存 | 重投时 `claim_run` 发现 `running` 且租约过期，封为 `WORKER_LOST`；任意活动触发的 `watchdog` 也会封 stale lease。 | 行锁 + fencing token；重复投递只 ack。 | 无重投且无后续活动时，封存延后到下一次活动。 |
| `p5_sweep` / Thread 保留清理 | 消费者在正常 Run 结束、`sealed`/`expired`、延迟 timeout 检查时调用 `p5_sweep()`；`watchdog` 也清理 7 天前的 closed/expired Thread。 | 每个集合最多 128 行，`for update skip locked`；失败下次重试。 | 长时间无活动时清理延后；不是按墙钟保证 7 天。 |
| Sandbox `reap` | 每次 Run 的 Sandbox context 自身先 stop 再 destroy；消费者维护再调用一次 `reap()`，清理 stopped/failed 的遗留 VM。 | `reap` 每轮最多检查 20 个、删除 5 个、4 秒超时；404/410 幂等。 | 遗留 VM 会保留到下一次活动；不创建新 VM 做探测。 |
| 等待超时 | `RunPaused` 时发送 `kind=wait` 延迟消息；到期由 `expire_wait` 标记 `WAIT_EXPIRED`。`watchdog`/`claim_run` 也会处理已到期等待。 | `expire_wait` 幂等；已恢复/终态只 ack。 | 等待消息丢失且无其他活动时，到期检查延后到下一次活动。 |
| 取消与总超时 | `claim_run`/`watchdog` 处理取消；`watchdog` 按 `policy.timeoutMs` 和累计 compute 封 `RUN_TIMEOUT`；函数自身预算兜底。 | 行锁 + 终态不可复活；重复事件去重。 | 平台杀死函数且没有重投时，下一次活动才会封存。 |
| 旧 queued Run（无队列消息） | 不专门处理；第一次队列活动触发的 `watchdog` 按 60 秒阈值封为 `QUEUE_TIMEOUT`。 | 已终态不再修改。 | 完全没有活动时仍显示 queued。 |

`watchdog()` 与 `p5_sweep()` 都是现有 SQL 函数，`workflow_worker` 已有执行权限；本次**没有新增迁移**。维护调用失败时的语义：

- 延迟 timeout 检查的 `watchdog` 失败会抛错，让 Vercel 重投，避免静默 ack 一个未封闭的超时；
- 正常 Run 结束后的 `p5_sweep`/`reap` 失败只记录 `workflow.queue.maintenance`，不改变已完成的 Run 结果；
- 所有维护都有 4–6 秒的 `asyncio.wait_for` 超时，不会无限占用函数。

为什么不用 Vercel Cron：Hobby 的 Cron 频率受限（官方文档：Hobby 每天级，不能依赖每分钟一次的 Cron），无法承担 60 秒排队超时和 5 秒级清理。延迟队列消息 + 运行结束 sweep 更贴近“有活动才消耗”，也不需要新增顶层 Function。参考 [Vercel Cron 用量与定价](https://vercel.com/docs/cron-jobs/usage-and-pricing)。

## 7. 旧排队运行

Hosted 中 10-26 08:22–08:24 有 4 条旧 queued Run，没有对应的 Vercel Queues 消息。切换后：

- 不会专门写代码删除或改写它们；
- 第一次队列活动（任意新 Run 结束后的维护，或 75 秒延迟 timeout 检查）会让 `watchdog` 按已有 60 秒排队阈值把它们封为 **failed + `QUEUE_TIMEOUT`**（前提是这些 Run 的 Thread 仍满足现有 watchdog 的 `active`/`waiting` 条件）；
- 它们不会阻塞新 Run，也不会被消费者误领取（消费者只 `claim_run` 消息里的 runId）；
- 没有专门代码删除或改写它们；若某条旧 Run 的 Thread 已不满足 watchdog 条件，则保持原状，等待人工核对；
- 如果 Hosted 长时间完全没有队列活动，它们会暂时保持 queued，这是“无活动延后清理”的同一已知局限。

## 8. 本地验证

- `pnpm workflow:local` 继续启动本地 Compiler、Worker、Watchdog 和 5173，行为不变；队列模式只在 Vercel 或显式 `WORKFLOW_RUNNER_MODE=queue` 时启用。
- `WORKFLOW_TEST_LOCAL_DB=1` 的 SQL 测试覆盖 `claim_run` 只领取指定 Run、stale lease → `WORKER_LOST`、`expire_wait`、权限和 `QUEUE_TIMEOUT` 封存。
- Python 单测覆盖延迟 timeout 只做有界 sweep、watchdog 失败重试、重复投递不执行、sealed lease ack、`RUN_TIMEOUT` 持久化。
- 真实 DeepSeek 本地 Run 记录见本次交付输出；不打印 API Key。

## 9. 已知限制与后续工作

1. **长运行分步续跑**：单次函数最多 300 秒。超过 300 秒的 Workflow 需要在 Step/Checkpoint 边界暂停并重新入队，下一次消费继续；本次不实现，记入后续工作。
2. **无活动时清理延后**：没有常驻 watchdog 和 Hobby 每分钟 Cron，过期 Thread/Store/遗留 sandbox 会等到下一次队列活动；这是有意的成本取舍。
3. **延迟检查是 best-effort**：主消息发送成功但延迟 timeout 消息发送失败时，只记录警告；后续活动仍会 sweep。
4. **单 Run 并发**：同一 owner 仍限制最多 2 个 running；`claim_run` 返回 `busy` 时消息按 `RetryAfter` 重投，不会绕过队列配额。
5. **Preview/Production 共库**：两个部署可能消费同一条消息；`claim_run` 的命名 Run + 租约 + fencing 保证只执行一次，但清理是全局有界的。

## 10. 历史可行性验证与本次 Preview

2026-10-26 的 spike 在 `spike/workflow-queue` 上验证了：Vercel Queues 触发、`claim_run` 指定 Run、真实 DeepSeek 执行成功、Function 11 个、queue 触发器落在真实产物上。

正式切换的 Preview：

- commit `bb89bbf02847937a7fcb578f1d13b28d64702aa5`；GitHub Deployment `7332374098`（success）；
- URL `https://edu-flow-p852e92aw-july-nanas-projects.vercel.app`，分支别名 `https://edu-flow-git-feat-workflow-july-nanas-projects.vercel.app`；
- 仓库 `api/` 11 个物理入口（9 TS + 2 Python），`vercel.json` 无 `daemons`；
- 前端产物含本轮 30 秒排队提示、`RUN_TIMEOUT`/`QUEUE_TIMEOUT` 文案；9 个 TS 入口与 Compiler 均返回 Function JSON，consumer 无公网入口；
- Hosted 真实模型运行由仓库所有者执行，本次不登录、不填/打印 API Key。

Vercel CLI 登录 token 已过期，未读取 `dpl_...` 控制面 ID 或构建日志原文；以上部署身份取自 GitHub Deployment 与公开 URL 读回。详见 [切换交接](WORKFLOW_HOSTED_SWITCH_HANDOFF.md)。
