# ADR 0007：工作流后端合并进主项目 `edu-flow`

日期：2026-10-23。状态：代码与配置已实施；Hosted 项目切换、生产发布与删除 `edu-flow-workflow` 待用户确认后执行。

本 ADR 取代 [ADR 0006](0006-workflow-p6-hosted.md) 中“前端/认证 API 与 Python Compiler/Worker 分成两个 Vercel 项目”的部署决定。ADR 0006 的其他结论（仅用 Vercel + Supabase、受限 `workflow_worker`/SSL、Daemon 生产限制、Sandbox 隔离、验收与回退纪律）继续有效。

## 背景

ADR 0006 让 Python Compiler、Worker 与 watchdog 独立部署在 `edu-flow-workflow`，主项目 `edu-flow` 只承载前端与认证 Node API。该拆分带来：

- 两个项目的源码冻结、部署身份、环境变量和回退需要成对管理；Worker 版本与前端可能不一致。
- `api/_lib/workflowV2Protocol.ts · workflowCompiler()` 通过 `WORKFLOW_COMPILER_URL` 调用另一个域名；跨项目服务身份、日志与构建产物核对都更复杂。
- `edu-flow` 已用满 Hobby 的 12 个 Function，独立项目只是为 Python 入口保留空间。

2026-10-23 的合并可行性验证（事实 F14）在临时 Vercel 项目完成并删除：根项目一次构建可同时产出前端、12 个 Function（11 个 TypeScript + 1 个 Python）和 Daemon 镜像；Python 入口可以启动并返回后端自己的 `UNAUTHORIZED / Service identity required`；Daemon 只在生产部署运行。因此合并所需条件已经具备。

## 决定

Hosted 只保留 `edu-flow` 一个 Vercel 项目：

1. **Python Compiler 成为主项目的 Function**：新增 `api/workflow-compiler.py`。它把随 Function 打包的 `services/workflow/src` 加入 `sys.path`，执行与 `services/workflow/main.py` 相同的 `assert_hosted_configuration()`，再用外层 FastAPI 把既有认证 FastAPI app 挂载到 `/api/workflow-compiler` 前缀。`services/workflow` 仍是唯一实现来源；本地 `pnpm workflow:local`、测试与 Worker 镜像都不变。
2. **Function 预算保持 12**：`api/health.ts` 移入 `api/_handlers/health.ts`（Hosted 不再暴露 `/api/health`；仓库内只有本地 Vite 插件与本地验证脚本使用它）。新增 Python 入口后，顶层入口为 11 个 TypeScript + 1 个 Python = 12。`api/_handlers/`、`api/_lib/` 以下划线目录被 Vercel 排除，不占 Function 名额。
3. **根 `vercel.json` 成为唯一部署配置**：声明 `api/workflow-compiler.py`（`maxDuration` 120、`includeFiles: services/workflow/src/**`）、在通用 `/api/:path*` 之前加入 `/api/workflow-compiler/:path*` 改写，并把 `worker`/`watchdog` 两个 Daemon 从 `services/workflow/vercel.json` 搬入（`root: services/workflow`、`entrypoint: Dockerfile`、命令、sin1 各 1 实例、1Gi 内存、660s/15s 终止宽限不变）。`services/workflow/vercel.json` 删除，避免再次出现第二个部署入口。
4. **依赖由锁文件生成**：根 `requirements.txt` 由 `scripts/workflow/export-requirements.mjs` 从 `services/workflow/uv.lock` 生成（`uv export --no-dev --frozen --no-hashes --no-emit-project`），`pnpm test:workflow` 增加漂移检查；根 `.python-version` 固定 `3.13`，与 Docker 镜像一致，避免 Vercel 默认 Python 版本漂移。`requirements.txt` 不手改，锁文件仍是唯一权威。
5. **客户端支持带前缀的 base URL**：`workflowCompilerUrl()` 保留 base URL 的路径前缀再拼内部路径，因此 `WORKFLOW_COMPILER_URL=https://<edu-flow 域名>/api/workflow-compiler` 会请求 `/api/workflow-compiler/v1/...`，而根 base URL（本地独立 Compiler）行为不变。单测覆盖带/不带前缀、尾随斜杠与 query 三种情况。
6. **文档与运维同步**：`services/workflow/README.md` 与 `docs/architecture/WORKFLOW_HOSTED_RUNBOOK.md` 改为单项目拓扑；本项目删除 `api/health.ts` 对外入口后，Hosted 存活/就绪仍以 Compiler 内部 `/health`、`/ready` 与 Worker/watchdog 信号为准。

## 后果

- 单次发布即包含前端、TS API、Python Compiler 与 Daemon 镜像；前后端/Worker 版本天然对齐，减少成对回退。
- 构建时间增加约 3–4 分钟；前端每次生产发布都会重启 Worker（开发阶段可接受，历史活跃 Run 仍需显式恢复，不自动接管）。
- `edu-flow` 不再有 Function 余量，任何新 Function 必须先腾出名额；后续功能只能进入已有 handler 的分支。
- Hosted 环境变量改为在 `edu-flow` 的 Production 配置一份；`WORKFLOW_COMPILER_URL` 指向生产域名的 `/api/workflow-compiler`，`WORKFLOW_INTERNAL_TOKEN` 使用同一服务身份。平台运行环境仍只保留一个、标识不变（R12/R13）。
- 部署与日志只查 `edu-flow`：`vercel daemons list --project edu-flow`、`vercel logs --project edu-flow --query 'source == "daemon"'`。
- 本地开发、测试与 Worker 镜像路径不变；`requirements.txt` 只服务 Vercel Python runtime。

## 验证与未确认项

代码与配置门禁：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:workflow:worker`、`pnpm test:workflow`、`pnpm workflow:check-layout`、`pnpm audit:client-secrets`。

Hosted 切换验收必须包含（由 lead 与用户确认后执行）：

1. 真实构建产物的 Function 数量为 12；`vercel daemons list` 显示 `worker`、`watchdog` 各 1 个在线实例。
2. 一次**真实的认证 Compiler 调用**（例如 `POST /api/workflow-compiler/v1/document`），而不只是看到 401；用以确认 Vercel 改写后原始子路径确实到达 FastAPI，而非被折叠成 `/api/workflow-compiler`。若路径前缀丢失，需在入口读取平台提供的原始路径（或调整改写/入口），并在实施计划第 9 节登记偏差。
3. 普通登录账号（不在任何 owner 名单）可直接打开编辑器、校验并运行 `core.transform` 流程；界面不出现运行环境。
4. Daemon 日志出现在的 `edu-flow` Logs 中（F14 当时未能确认此项）。
5. 全部通过后再由用户确认删除 `edu-flow-workflow`，避免两个 Worker 同时领取队列任务。

## 被否方案

- **保持两个项目**：功能上可行，但需要长期成对管理版本、令牌、日志和回退；与 ADR 0006 之后单项目的前端发布节奏不符。
- **把 FastAPI 放在 `api/` 之外的独立目录并用 `builds` 自定义**：Vercel 仍按 Function 计费/计数，且增加配置漂移，不解决预算与版本一致性问题。
- **让 Worker 由前端请求内启动**：Daemon 有独立生命周期与终止宽限，不能塞进请求，安全与恢复语义都会退化。
