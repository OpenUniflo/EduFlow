# Workflow Hosted 部署与运维

本部署按用户要求仅使用 Vercel 与 Supabase。配置和容量决策见 [ADR 0006](decisions/0006-workflow-p6-hosted.md)（历史 P6 记录）；自 M14 起单一 Vercel 项目的部署决定见 [ADR 0007](decisions/0007-workflow-backend-in-main-project.md)，能力与历史验收限制见 [当前交付摘要](../acceptance/DELIVERY_STATUS.md)。执行新验收须检查实际部署与就绪状态，不能以某次 READY 或 Local 测试代替。

当前兼容发布对为7b65执行器：A `dpl_BQPdKjWiXZV95xWgwGZZM1BMo441`、B `dpl_jQ1dsHSgfTrAS253RygGeFu3byYk`，正常入口指向B；主前端为`dpl_DbSCNySXWbvQiBqbHA1Q6phQBs2T`。完整675文件manifest、实际Function12+1和各Daemon身份分别留证。8566及400b是历史证据/恢复范围，不把旧身份改写成新执行器。

## 部署和版本

- 主应用：`edu-flow`，前端、认证 Node API、Python Compiler Function 与独立 `worker`/`watchdog` Daemons 同属这一个项目（M14，[ADR 0007](decisions/0007-workflow-backend-in-main-project.md)）。每次部署核对真实 Function 产物，最多12个（11 个 TypeScript 入口 + `api/workflow-compiler.py`）。Daemons 公共 Beta 当前仅 Production 运行，不能声称 Preview 同等可用；原 `edu-flow-workflow` 项目在合并部署验收通过并由用户确认后删除。
- Supabase `uyljtdbvlivxniililay`，session pooler SSL，受限 `workflow_worker`；数据库是队列、State、官方 checkpoint/Store 和共享发现目录权威。不得用开发机进程或临时磁盘补 Hosted 运行。
- 使用 pnpm/uv 锁文件。Vercel CLI 部署在**仓库根**执行（`--cwd` 仓库根，`--local-config <root>/vercel.json`）；不要再用 `--cwd services/workflow`，否则既缺根配置也会误判项目路由。核对实际 `/api/workflow-compiler` 的认证 capabilities、真实 Function 数量与 Worker/watchdog 实例，不能只看部署状态。
- 部署配置只有仓库根 `vercel.json`：Python Compiler Function（`api/workflow-compiler.py`，`includeFiles: services/workflow/src/**`，`maxDuration` 120）、`/api/workflow-compiler/:path*` 改写，以及 `worker`/`watchdog` Daemons（`root: services/workflow`、`entrypoint: Dockerfile`、sin1 各 1 实例、1Gi 内存、660s/15s 终止宽限）都在此声明。Python 依赖来自根 `requirements.txt`，由 `scripts/workflow/export-requirements.mjs` 从 `services/workflow/uv.lock` 生成并由 `pnpm test:workflow` 检查漂移；根 `.python-version` 固定 `3.13`。不要手改 `requirements.txt`，也不要把 `services/workflow` 当作独立 Vercel 项目部署（其 `vercel.json` 已删除）。Hosted 不再提供 `api/health.ts` 的 `/api/health`；仓库内只有本地工具使用它。保留清单包含源码散列、deployment ID、执行器 digest、镜像 digest、迁移清单、环境/发现目录修订。SDK 或受执行器指纹覆盖的代码变化使旧检查点不兼容，不静默改写旧快照。

## 环境和秘密

`edu-flow` 必须配置 `WORKFLOW_DEPLOYMENT_MODE=hosted`、`WORKFLOW_DATABASE_URL`、`WORKFLOW_INTERNAL_TOKEN`、`WORKFLOW_ENVIRONMENTS_JSON`、`WORKFLOW_SANDBOX_BACKEND=vercel`、固定 `WORKFLOW_SANDBOX_IMAGE`，以及可信目录引用的提供方/工具秘密；同一项目的服务端配置同一内部令牌。Production 仍需配置 `WORKFLOW_COMPILER_URL=https://<edu-flow 生产域名>/api/workflow-compiler`；Preview 自动使用本次部署的 `https://$VERCEL_URL/api/workflow-compiler`，不需要配置 `WORKFLOW_COMPILER_URL`。Preview 与 Production 共用 Hosted 数据库。内部令牌至少32字符，禁止放入 VITE 变量。

平台运行环境（R12/R13）：每个部署只配置一个 `access: "authenticated"` 的公共环境，不写 `ownerIds`，且不得包含 `providers`/`connectors`/`tools`/`variables`/`functions`；所有登录用户通过资源中心建立自己的连接。公共环境只改内容、不改 `ref`（用户连接与函数按“用户 + 运行环境标识”存放，改标识会失联），平台 DeepSeek / DeepWiki 不再提供；界面上不出现运行环境选择。

JSON环境只授予明确 owner UUID、HTTPS目的地和许可工具/模型。不得复制 Local 通配 owner、回环 fixture 或 fixture 密钥。普通值、Secret 引用、Context、学习身份保持独立。托管连接的密码经 Vault 写入；浏览器不能读取秘密。环境/权限/工具目录变化会更新修订，旧 Thread 的继续/分支需要重新授权和编译，不能绕过不兼容保护。

Vercel Daemon 使用平台定期轮换的 `VERCEL_OIDC_TOKEN_FILE`，官方 SDK 每次读取；镜像构建不消费平台/业务秘密。发布源、静态资源和 Function 产物都检查 `.env*`、私有验收目录及本地 Supabase 临时数据；不要把“未进入静态包”等同“未上传部署源”。

## 迁移和发布

1. 对账目标 ref、仓库与 Hosted 迁移历史；共享库不 reset，Preview build 不自动迁移。
2. 备份并列出保护对象。旧 Legacy 工作流先归档，再执行退役迁移；归档保留完整 JSON+SHA，不是运行 fallback。只增量应用仓库原始 SQL；已应用版本不得改写。
3. 先应用向前兼容迁移，确认认证 API、官方 Saver/Store 同事务及回滚；再发布兼容候选。初次/不兼容升级先停止验收新提交，等待已执行 Run 排空；等待 Thread 保留原身份，不强行升级。
4. 前端、API、Compiler 与 Daemon 现在同属一次 `edu-flow` 部署，不再有跨项目成对发布；仍按候选→排空→提升处理，并读回同一部署的 Function 数量与 Worker/watchdog 实例。`/ready` 为服务身份接口，须数据库、当前 digest 的 Worker/watchdog 和 Sandbox 均通过；`/health` 只是存活检查。
5. 发布后读回真实部署与实例、迁移、Function数量、普通认证运行和深链刷新。保留原失败与复验证据。

回退只选择已验证且 schema/执行器兼容的 deployment。Vercel promotion/rollback 会同时更新同一项目的 Daemons。Worker实现SIGTERM后停止领取、尝试完成当前工作，配置660秒；但本轮真实带活跃计算promote仍出现WORKER_LOST，平台退出根因未确认，不能把该配置当活跃无损保证。schema 采用向前修复，不能把应用回退当数据库回退。无兼容二进制时保留历史并明确拒绝继续。

日常发布仍必须使用受控维护窗口：暂停所有目标用户的 start/next/resume/branch 提交，让既有 queued/running 自然终态，保留 waiting。历史验收只覆盖两个授权 owner，不能推广为开放流量下的安全保证。操作员须核对目标项目、Production READY 候选和实际部署身份；使用受限角色查询全局 queued/running，任一非零或读取失败均不得提升。候选先不切换域名构建，通过排空、就绪和执行器兼容性检查后才允许平台提升，发布后读回实际 Worker/watchdog 实例。

原 P6 部署、preflight、提升和就绪脚本绑定历史项目 ID、私密文件和故障演练配置，现已[归档](../../artifacts/archive/runtime-naming-20261021/files/scripts/workflow/operations)。仓库当前没有通用自动发布入口；归档脚本仅供追溯，不应直接用于新发布。恢复自动化需先显式配置目标身份、凭据来源和维护约束并重新验收，不能以裸 promote 绕过上述检查。
这是操作员暂停提交前提下的保守维护流程，不是原子admission gate；计数检查和平台切换间存在竞态。因此不承诺开放流量、多用户不断提交时自动安全发布；要开放该承诺，必须先实现覆盖start/next/resume/branch的原子维护闸并独立验收。失联按既有显式恢复协议处理，不自动重做外部写。

历史受控故障演练使用 grace-zero 与 stopped 候选验证失联和恢复；这些不是日常发布配置。重新演练必须明确目标、维护窗口与恢复候选，读回平台真实部署及实例，再记录停止和恢复时间；构建时间不计作停止时间。恢复正常配置后仍须检查队列终态和就绪，660 秒退出宽限不是活跃运行无损保证。

内部身份轮换后还需撤销本轮旧不可变HTTP部署，避免旧URL继续接受旧身份；不要删除无关主应用历史。恢复所需匹配旧检查点的镜像按digest另存，恢复时注入新凭据。迁移维持向前兼容，不回滚共享库。

## 监测与处置

`edu-flow` 项目的 Logs 是本交付的运维告警接收位置，source=`daemon`；没有宣称已向任何人发送邮件/消息或配置外部值班平台。CLI64可查询 `logs --project edu-flow --query 'source == "daemon"'`；旧CLI58不支持这一来源。构建日志与运行日志同项目查看。

- 新受限连接设置连接5秒、TCP未确认数据20秒，专用角色statement timeout15秒、lock timeout3秒；官方Saver/Store使用同一角色。watchdog每批最多处理128个到期/取消/失联Thread，清理每集合最多128行，跳过被锁行，下次tick继续；不扫描无限活跃Thread。
- Worker每5秒续租/信号，空队列每3秒轮询；watchdog每5秒巡检租约/生命周期；VM回收是独立异步子任务，每轮最多检查20对象/尝试删除5个（404/410也计次数），4秒超时、失败固定SANDBOX_REAP_FAILED并停止续健康信号，不阻断数据库巡检。健康信号20秒到期。进程自动重启不等于Run自动接管。
- 受限 `p6_metrics` 只返回队列/运行/等待计数、最旧排队秒数及服务健康，不返回产品内容。watchdog对 Worker陈旧、排队超过40秒发固定JSON告警，每种30秒最多一条；存储与回收失败有独立错误信号。
- 官方Sandbox context先stop再destroy；watchdog对刚停止实例留5秒宽限，避免与正常cleanup争用。重复删除404/410幂等。仅对已有有效纯代码结果、cleanup404/410且再次确认目标已不存在/已deleted的情况保留结果；任何500、仍running或确认失败仍失败。
- Sandbox诊断仅含阶段、异常类、cause类、数字HTTP状态、随机diagnostic ID、关联Run/Step，禁止原始SDK异常文本、凭据或代码/输入进入运维日志。失败记录继续存在产品Run事件中。
- 队列积压先检查Worker、lease、连接数、供应方延迟与Hobby配额，不增加无界并发。数据库连接不足恢复后由watchdog封闭过期lease；不要重置队列或直接重做外部写。
- `WORKER_LOST`仅显式恢复检查点并沿用累计预算。未知外部效果先核对实际目标计数/回执；已prepare分支也要在正式执行前再验，不因重试/分支绕过。
- SDK节点deadline同样受外部效果约束：声明可能写外部的工具节点超时按unknown处理，不能经retry或错误handler转为安全重做。受控计数首轮曾实际重复写入3次，修复与同用例复验必须保留；代码/只读节点的许可超时策略单独验证。
- Vercel Daemon缩放覆盖会跨部署保留；使用平台已文档化的配置发布/控制台操作，验收停止后核对实际Worker=1、watchdog=1和配置宽限值，不能据此推断无损排空。不得把取消构建当停止已运行Daemon。

## 备份、恢复与轮换

完整相关备份包含 public/auth、workflow_private、workflow_checkpoints、workflow_memory、workflow_archive、PGMQ真实消息/metadata，以及迁移/角色权限与环境引用。CLI默认dump可能不包含扩展动态表；必须显式核验，不只保存迁移前的Legacy数据。本轮另用单MVCC SQL快照补齐34张工作流/PGMQ表，与基线schema/auth一起恢复并逐表比对，再经官方Saver/Store反序列化和产品资格检查。

恢复仅针对隔离目标，禁止覆盖共享库。临时关闭FK触发器仅限明确命名的隔离库、完整事务内，不能用于Hosted日常写入。确认字段/主键/字节数据、父子checkpoint、State/历史/Store、queue/jobs一致后，再决定哪些排队任务可安全接收、哪些失联执行必须封闭并显式恢复。恢复不能盲重发外部写。

历史400b恢复镜像现有完整126620160字节离线归档，独立核验config/layer、整体SHA和解压diffID，并以禁止拉取、无网络、只读和去能力实际执行SDK资格。原8KB缺层导出判无效、仅留失败证据。物化后的Docker身份与原固定VCR来源分别记录。400b包含本轮后续修复的写超时策略缺陷，仅用于匹配旧快照的数据/官方SDK读回及另经审查的纯计算、只读流程，不能任意重放外部写；当前安全回退只选上述7b65兼容A/B，并先完成受控维护排空。未来备份须配当前应用镜像/manifest，不重写旧指纹。

Vault密文依赖源项目加密能力，跨项目恢复应从受控秘密保管处重新配置同语义连接和引用；不能声称复制密文就可解密。平台OIDC由新平台重新提供。外部提供方key、内部身份与数据库密码另行恢复，不放进公开证据。RPO只覆盖冻结快照内记录，RTO按实际恢复到一致可读状态测量，不宣称连续PITR或多日可用性。

轮换内部身份时配对更新前后端并发布；轮换DB密码时先排空、改角色密码/服务器秘密、发布并读回新连接，再验证旧值拒绝。旧请求必须确认原回执，不能因网络失败重复提交。轮换生产提供方key需要提供方授权及凭据管理，合成验收凭据不冒充真实提供方轮换。

## 验收客户端与平台校验

本轮大量自动验收请求曾触发平台`sys_dos_mitigation` challenge；平台控制面显示没有开启Attack Mode或自定义阻断规则。应用Run仍独立执行，提交响应不明时必须沿已记录的Thread/幂等身份查回，禁止重发。

优先使用官方`vercel curl`/项目现有automation身份；真实攻击模式的系统挑战可能仍保留，不能以关闭DDoS防护换取通过。正常headed Chrome自然完成平台JavaScript校验后，技术验收可用同origin浏览器原生fetch、正常应用Bearer作为HTTP传输。不得伪装UA、复制挑战cookie、解决验证码、换域或关闭防护；遇需人工处理的校验另记录。无背景体验继续普通UI，不用技术API传输代操作。

本地`p6-browser-fetch.mjs`仅是验收传输，不进入产品或Hosted运行依赖；它只允许canonical origin，临时凭据文件0600且finally删除。其他origin沿用其HTTPS传输，所有最终指标注明实际客户端。默认验收轮询降为1秒，无写操作自动重发。原curl403、既有身份无效尝试、浏览器自然恢复和原Run只读查回均保留。

## 保留与清理

Run最新20条与Thread/官方检查点生命周期分开；Thread最多20轮、7天，Store权限、TTL、CAS与配额不变。watchdog承担服务端清理，无开发机定时任务依赖。边界时间注入仅对精确自建UUID，不能冒称已连续观察7天。

验收结束按ledger精确删除自建临时workflow/thread/namespace/连接及Vault秘密；保留四个Hosted示例和其正常运行，不按名称模糊删除用户数据。临时受控外部计数/合成协议Vercel项目及专用SQL对象另行移除；它们只用于故障和脱敏证明，不能成为运行配置fallback。清理后重验保留例、受限权限、就绪状态和遗留VM=0，保留失败证据和清理前后结果。

历史验收使用的浏览器传输助手已经归档，不再作为当前运维入口。其余绑定 P6 现场的运维脚本也已退出维护目录；现行发布约束见本手册“迁移和发布”，当前没有通用自动发布脚本；目录收尾与测试范围见 [目录与测试规则](../acceptance/README.md)。
