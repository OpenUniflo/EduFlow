# ADR 0003 Workflow V2 运行架构与契约

- Status: Accepted。Local M1 架构与体验整改技术验收完成，32 项/288 条体验条件、五条代理新手旅程及原 M1 回归已闭环，现移交真人走查。架构决策保持，人工验收未代行；证据见[整改执行报告](../../../artifacts/archive/document-history-20261020/files/docs/acceptance/WORKFLOW_V2_M1_UX_REPORT.md)。Hosted 未验收，M2/M3 为规划。
- Date: 2026-10-14
- Scope: [Issue 37](https://github.com/OpenUniflo/EduFlow/issues/37)，M1 至 M3。
- Design: [七类设计契约](../WORKFLOW_V2_DESIGN.md)
- Plan: [M1 实施与验收](../../../artifacts/archive/document-history-20261020/files/docs/architecture/WORKFLOW_V2_M1_PLAN.md)

## Context

本决策制定时，画布支持编辑与持久化，但 Runtime 是依赖 runOrder 的 Demo 定时模拟，Run 类型只表示成功。V2 要让实际图结构控制真实 LLM/工具调用，保留历史数据与课程入口，并逐步提供恢复、Harness 和发布能力。

历史 Issue 11 的最小 TypeScript Runtime 提案不能自动约束 Issue 37。实施前的 Python DeepSeek/WireMock 脚本与 MCP Inspector 测试只证明外部资源可用；本次 Local M1 已另行验证 EduFlow Compiler、Runtime、权限和真实浏览器链路。

现有 Vercel API 是请求入口，不能用浏览器生命周期或单个普通 API 请求承担长任务。仓库已有 Supabase 数据持久化和 Python parser 服务管理经验，但 Workflow Worker 必须独立，不能混入 parser 或 Global Assistant。

## Decision

以下为 M1 实施基线；具体依赖/部署适配随工作包 A 验证记录。接受设计不等于三个里程碑已完成。

### D1 自主 IR 与 Python LangGraph Worker

使用 EduFlow Definition V2 作为跨语言、版本化权威定义，通过 Python Compiler 转换为 LangGraph。TypeScript 保留画布、API 和应用集成。共享 JSON Schema/协议样例，避免维护两套独立执行语义。

2026-10-16 新手复验后的兼容补充：Compiler 对绑定的已声明根类型仅做确定不相交检查；未知类型不推断，运行时仍用现有 JSON Schema 校验。整个工具参数对象与单个字段不自动互转。节点输入准备失败可在 Run.error 附带 `nodeId/invocation/stage="input_resolution"/pointer`，定位其不可变执行定义；没有 Step 时不制造 Step 或 State/Event 证据。此为可选错误显示上下文，Definition/Binding/State、队列、幂等和部署协议不变。旧定义保留并重新诊断，旧错误不回填；无需数据库数据重写或新增迁移。旧通过证据的 Compiler/Runtime 依赖须按新源码重新验证。

优先 Python 的依据是现有真实链路验证资产和后续 Python Harness 集成方向；不主张 LangGraph JS 缺少所需能力。模型/工具协议、图执行、Schema 验证使用成熟库；EduFlow 仅实现产品编译、授权和数据适配。

### D2 定义与布局分离，Run 使用不可变快照

Definition revision、Editor revision、schemaVersion 和 publishedVersion 各自独立。节点稳定 ID 不因改名变化。布局不影响 semanticHash。结构编辑同时原子保存定义与布局，历史定义读取对应布局；纯拖动独立保存。Run 创建时冻结定义、环境非敏感修订和实际策略；运行期间编辑只影响新 Run。

草稿可以无效但可保存，Live 必须编译通过。不以当前 UI 的 schemaSaved 布尔值作为执行资格。

2026-10-15 的 M1 体验整改兼容增量保持该边界：表单只产生原类型数据，校验/保存/运行各自捕获快照，保存旧快照后继续存在的新编辑仍是草稿。历史画布使用与当前画布一致的显示路由降级，既有布局元数据不被降级显示改写。库分组仅从可信 head `provenance.libraryGroup` 投影 `test/general`，缺省未分类；分类不进入定义/布局、hash 或 Compiler，不赋予客户端 provenance 写权限，不能依据名称或模板推断。

### D3 节点结果通过受控包装器更新 State

节点执行器返回 output/outlet，由统一包装器验证并映射 State 写入。跨节点数据通过显式 State 字段传递；M1 不提供跨循环历史输出的隐式读取。

M1 允许串行有界工具循环和注册的 Reducer；统一 LLM/工具消息映射，并在 end 校验最终输出。M1 固定单次尝试，工具批次先全量参数校验、再顺序执行，运行时部分失败保留已发生副作用且不整批重放。M1 不提供用户自定义代码、并行、动态 Send 和子图。ReAct 以同一图原语组合，不建专用执行器。

### D4 持久 Run 与事件查询先于实时传输

Run 创建和任务入队事务性提交；浏览器只能创建/查询/取消，不能写 Live 状态、证据或 Verified。M1 采用持久事件游标轮询，之后可在同协议上增加 SSE。

Run 创建重新校验权限和编译指纹，独立 validate 结果不是执行授权。Worker 租约和 fencing 防止旧执行者提交；独立 watchdog 负责无 Worker、队列超时和租约过期收敛，不能依赖已退出 Worker；M1 Worker 丢失进入明确失败，不自动重放工具副作用。M2 用 LangGraph Checkpoint 提供恢复，Trace 和调试 State 快照不充当 Checkpoint。

### D5 运行基础设施与用户发布分层

API 复用现有工作流 Function 边界，长任务由独立 Worker 执行。M1 owner 隔离和服务端凭证引用必须完成；凭证/connector 由受信任运维配置，用户只选择授权目录，不纳入学员 Secret 管理产品；M3 才开放版本化 Deployment 与外部 Key/Webhook。

部署发布绑定不可变定义及依赖身份；环境/凭证可撤销。固定定义不保证外部 API 或模型响应永远相同，验收检查身份、路径、协议和受控结果。

### D6 非破坏性迁移与双读单写

识别 Legacy 载荷而不是根据 LocalStorage v2 字符串推定定义版本。保留原始定义及历史，迁移结果经过诊断/预览和显式保存，升级客户端的定义新写入采用 V2；迁移前 Legacy 编辑与非可信 Demo 历史使用限定兼容路径。旧整体 PUT 涉及 V2 时事务前整体拒绝。首次迁移通过 sourceDigest 与 null baseRevision 保护，模板副本 provenance 不授予课程执行权。旧客户端不能覆盖 V2，未知字段保留为 Legacy 附件。

迁移映射修订以 `mappingRevision` 标识，`migrationVersion=1` 的身份幂等规则保持。start/end 仅按明确拓扑映射；中间 output 不伪装为无出口的 end。用户再次显式预览尚未应用的报告时，保留原 migrationId、目标 workflowId、源快照和原始报告候选，用当前映射重新计算本次响应，并记录原报告身份与重算标识。已有 source guard 继续校验；已应用报告或并发 apply 返回的已应用报告仍使用原候选，重复 apply 返回原回执。新首修订审计实际确认的候选/hash，不静默修补历史已应用定义。

旧逻辑文案、展示代码、固定输出和 runOrder 不自动升级为 Live 语义。Secret 不因原始备份策略再次复制，重新绑定并轮换已暴露凭证。无法证明来源的旧 Run 标为 legacy_unknown。

### D7 以里程碑交付并独立评价

Codex 实施单元是 M1、M2、M3，内部可分提交并持续测试，不按六个原始 PR 强制中断。每个里程碑完成一个用户闭环并整体验收。

M1 采用三个实施角色：主智能体负责共享契约、前端和集成；执行链路工程师负责 API、数据和 Runtime；独立验收者模拟真实用户完成浏览器旅程，再核验 API/数据/Trace。验收者默认不修改生产代码，修复由负责人完成后交其复测。角色不按七类契约机械拆分，默认继承主智能体模型和推理强度，无需用户手工配置。文件所有权和共享环境操作统一协调，具体安排见 [M1 计划](../../../artifacts/archive/document-history-20261020/files/docs/architecture/WORKFLOW_V2_M1_PLAN.md)。本轮已按此分工完成 34 项验收、四条旅程及根级复核，证据见[正式报告](../../../artifacts/archive/document-history-20261020/files/docs/acceptance/WORKFLOW_V2_M1_REPORT.md)。

Demo/Live 表示执行来源，Verified 表示独立验证。Live success 不自动等于 Assignment 完成；Course/Assignment 关联由应用层在 Run 启动时验证冻结，不能成为 Runtime 输入。

## Consequences

收益：保留 EduFlow 数据与产品语义；复用 LangGraph；真实执行与画布一致；运行证据可追溯；迁移失败不会破坏原工作流；未来 Worker 后端可替换而不重写所有用户定义。

成本：新增独立 Worker 部署和服务间认证；维护 TS/Python 协议一致性；增加不可变修订、任务和事件存储；需要限制不支持的旧节点与代码；轮询增加短请求，需分页和退避。

既有 Runtime 接口将被新执行服务接口替代，Demo 使用适配器维持。数据库必须增量迁移，不能把生产旧载荷一次性重写后删除。现有最近 20 条历史规则继续保留，活跃任务单列；正式证据不能依赖即将淘汰的调试 Trace。M1 不新增正式 Evidence 消费者；迁移和清理前审计并保留既有引用。幂等 tombstone 在窗口内独立保留，已淘汰 Run 的同键重发不能再次执行。

## Alternatives and Deferred Options

| 方案 | 取舍 |
| --- | --- |
| LangGraph JS Worker | 同语言有利于共享类型、减少 Python 运维；现阶段优先复用 Python 验证与 Harness 方向，保留改选条件 |
| 浏览器直接执行图 | 无法满足凭证、安全、持久运行和可信证据边界，拒绝 |
| 在 Vercel 请求内完成整个图 | 生命周期与长任务恢复不匹配，不作为目标架构 |
| 直接保存 LangGraph 对象 | 与运行库版本耦合且无法作为稳定跨语言持久化格式，拒绝 |
| 每种 Agent 单独引擎 | 语义重复、难以调试组合，拒绝 |
| 全量 event sourcing | M1 无此需求；事件用于观察，关系记录拥有运行状态，Checkpoint 拥有恢复 |
| M1 引入 SSE | 可选优化，先完成可靠游标查询；不把 SSE 作为正确性前提 |
| M1 提供任意代码 Sandbox | 安全范围过大；先内置受信任函数，M2 隔离能力验收后开放 |
| 预先建设复杂队列平台 | 不预定 Redis/Temporal 等新基础设施；先评估现有 Postgres 的成熟任务组件 |

M1 Local 部署适配已选择 pgmq 持久队列、受限 workflow_worker PostgreSQL 角色和私有运行函数、bearer 服务身份、运维环境文件与环境变量 Secret 引用。Compiler、Worker 和 watchdog 使用独立进程。依赖固定在 services/workflow/uv.lock，实际 SDK 版本和执行器源码摘要进入 compileFingerprint；JavaScript 使用 pnpm-lock.yaml。模型引用从受信任配置读取，不根据节点名称推断。

最终锁定依赖包括 LangGraph 1.2.15、langchain-deepseek 1.1.1、langchain-core 1.6.10、MCP SDK 1.30.0、httpx 0.28.1（SOCKS 支持 socksio 1.0.0）、jsonschema 4.26.0、rfc8785 0.1.4、psycopg 3.3.6 和 FastAPI 0.143.0；TS 采用 Ajv 8.17.1 与 canonicalize 2.1.0。SDK 保留名称通过内部节点名称投影隔离，Domain/Legacy ID 与 Trace 不变；有界缓存仅保存纯图计划，每个 Run 重新授权并独立绑定。

生产 Worker 托管供应商和生产 Secret 后端尚未选择，Local 交付不代表 Hosted 已部署。2026-10-14 用户已确认本地配置使用轮换后的 Key，真实 DeepSeek HTTP、MCP 和两轮工具/三次模型调用均已通过独立浏览器验收；协议替身仅用于确定性故障测试，没有替代 M1-05/M1-25 的真实链路。

## Revisit Triggers

- Python 与现有运行部署成本明显高于 JS，或目标 Harness 经验证 JS 同等满足需求：重新评估 Runtime 语言，保留外部契约。
- Postgres 队列的吞吐/租约开销达到实测瓶颈：基于测量评估独立队列，不先假定迁移目标。
- 活跃 Run 轮询负载或调试延迟不满足产品需求：增加兼容的流式事件传输。
- M2 的恢复/并行暴露当前绑定或状态模型不足：增加 capability/版本，不静默改变 V2 已发布语义。
- M3 租户协作需求落地：完整设计 tenant membership、授权、存储和审计，不能信任客户 tenantId。
- 20 条历史不足以支持明确的业务审计消费者：单独记录保留策略变更，不能在实现中偷偷取消现有限制。

## References

- [LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)
- [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [现有架构](../../WORKFLOW_ARCHITECTURE.md)
- [ADR 0001](0001-fourth-round-technology-stack.md) 与 [ADR 0002](0002-deferred-technology-options.md)：沿用职责分离和以实测触发基础设施扩展的原则。
