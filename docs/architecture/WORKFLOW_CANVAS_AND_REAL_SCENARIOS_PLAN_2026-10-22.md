# 工作流画布完善与真实业务场景执行计划（2026-10-22）

## 0. 状态、决策与执行边界

- 状态：仅规划；只读核查 `feat/workflow` @ `67c1a2c`，未运行测试、构建、真实模型/工具、平台或数据库操作。
- 本轮更新本文、新建独立验收计划，并仅在上一轮计划文首加替代指针；没有读取秘密文件、私有账号页、环境文件或 dump。引用中出现凭据管理概念不代表已取得凭据。
- 继承 [上一轮基线](WORKFLOW_CANVAS_NEXT_ROUND_PLAN_2026-10-22.md)：P0 环境与能力先行，P1 画布体验随后，P2 按门槛处理；本文替代其中“决策待确认”的状态。
- **D1=A**：共享 Runtime Environment + 每用户连接；不做账号独立环境、provisioning UI。**D2=A**：节点显式更新连接版本并保存新修订；不引入逻辑连接身份迁移。**D3=A**：验收后从旧受限环境 ownerIds 移除测试管理员；不删除账号，不撤销所有登录用户对共享 Runtime 的访问。
- **Hosted 已确认（2026-10-22）**：测试阶段直接部署 `edu-flow-workflow` 与 Preview，不设维护窗口；不做费用核算，也不设 ¥5 上限。
- **四套场景=产品模板（B，2026-10-22）**：共享 Runtime Environment（`access:"authenticated"`，无 Key）+ 用户自建执行能力；模板创建时绑定当前用户连接；Hosted 技术验收后用一条内容迁移投放，模板保留。
- required/optional 已按 [输入优化计划 §8](WORKFLOW_INPUT_OBJECT_OPTIMIZATION_PLAN.md#8-已冻结决策2026-10-21) 的 A 冻结并实现，不再提请决定；缺失与空文本、false、0 的区别继续保留。
- 后续实施：单写作者串行，热点文件不并行；无新增 Vercel Function、无 schema 迁移；仅在四场景 Hosted 技术验收通过后执行一条只插入 `workflow_templates` 的内容迁移。D2=A，不引入逻辑连接身份迁移。
- **画布范围 A**：P0 环境闭环 + S1–S4 + P1（运行 tab 去重、窄屏插槽、键盘、归属、历史分支）；R1/R2/R3/R4 分别 4–6/4–6/1–3/1–2 日，总 10–17 人日。
- 只用一个 V2 Definition、API Repository、LangGraph Worker、React Flow editor；不引入 Legacy，不把 Live 失败降级成预览成功。
- `AGENTS.md:559–571,587`、`README.md:18,124–132`：历史只读，展示不重排画布；课程身份留在应用/API 边界，成功 Run 不自动完成 Assignment、不授予 mastery；不替代 Global Assistant。
- 本文的函数名若标“拟新增”，是实施设计而非现有能力；未来命令、门禁和预期结果均不是本次执行记录。

## 1. 能力与现状核查

### 1.1 证据读法与 Hosted 边界

路径均相对仓库根。原能力表代码证据保留；未逐行重核的历史定位标为待核实，不代表本轮验证通过。本轮直接复核了环境装配/快照、Hosted 校验、连接注入与模板创建边界（下表及 P0-5/6）；其余能力行号/行为待实施时核实。表中 W=`services/workflow/src/eduflow_workflow/`，F=`src/features/workflow/`。
“代码支持”只证明实现入口存在；“Hosted 配置”必须由未来普通认证目录读回并实际 Run 证明，不能拿开发助手的 MCP 权限冒充 Worker 的工具权限。
[最终验收包 §3](../../artifacts/archive/acceptance-process-20261023/WORKFLOW_FINAL_ACCEPTANCE_PACKET_2026-10-22.md#3-残余风险--未覆盖) 只证明此前 Hosted 入口→结束；未证明真实模型/工具。
上一轮计划 §1/§2 记载 DeepSeek、DeepWiki、GitHub；**当前实际部署、具体 toolRef/合同、约 24 capabilities 数量均待核实**，本次未联网读回。
[场景手册](../acceptance/WORKFLOW_AGENT_SCENARIOS_GUIDE.md) 的本地 A/B/C 曾有实模记录，但 A 的订单是受控 HTTP、MCP 是 echo；不能据此签署真实业务工具或 Hosted 可用。

| 能力 | 代码支持与证据（文件:行，函数/符号） | Hosted / 缺口 |
| --- | --- | --- |
| 入口/结束 | W `registry.py:28` NODE_DESCRIPTORS；`runtime.py:309–311` _process_node | 既有文档记载 2 节点成功；当前部署需再核对 |
| 模型 | W `registry.py:31` core.llm；`runtime.py:144` llm，`:322` 调用 | DeepSeek 文档记载配置；凭据、模型身份、实流待核实 |
| 工具 | W `registry.py:32` core.tool；`runtime.py:324` _process_node；`server.py:94` discovery | DeepWiki/GitHub 文档记载；具体操作、可见性和限额待核实 |
| 模型工具分发 | W `registry.py:33` core.tool_dispatch；`runtime.py:92` tools，`:323` 分发 | 白名单调用；业务场景需实测工具消息回合，不要求模型一定选工具 |
| 路由/条件 | W `graph_control.py:67,119–121` build_control_graph；`runtime.py:312` router | first/all/default；Hosted 能力目录与实跑待核实 |
| 并行/Send | W `graph_control.py:122–129` Send；`runtime.py:419` 并发限制 | Send next 不是屏障；使用每次调用独立子图，Hosted 实跑待核实 |
| join | W `graph_control.py:132–135` all 屏障；`validate_control:43` | all 必须真实固定前驱；any 可重复触发，不提供全局一次性语义 |
| 子图 | W `runtime.py:344` subgraph；`graph_control.py:49,52` validate_control | independent/shared、per-invocation 等已有；Send 禁 per-thread；Hosted 检查点待核实 |
| 人工中断/恢复 | W `runtime.py:183` interrupt；`interrupts.py:27,41` response_patch_for/validate_resume；`api/_lib/workflowV2.ts:81` resumeThread | 单项/批量有现成边界；刷新、重复提交、过期必须实测 |
| 循环/预算 | W `compiler.py:105` _validate_definition；`runtime.py:401` run_graph；`server.py:82` bounded-loop | 沿条件边构造有界循环；不是独立 loop 节点，额度不得因 resume 重置 |
| 重试/超时 | W `execution_policies.py:62,70,118` retry_allowed/compute/RetryPolicy | 仅允许分类，次数含首次；Hosted 429/timeout 实测待核实 |
| 错误处理 | W `execution_policies.py:55,112,120` purpose handler；`:62` 安全限制 | 不吞 auth/policy/validation/infrastructure/effect unknown；需新业务 handler 版本时先确认目录 |
| State/Reducer | W `compiler.py:270,276,281,293` state_channels/encode_state/encode_patch/_channel_reducer | 显式 Schema/绑定/Reducer；并发列表不得 last-write 丢数据 |
| 长期记忆 | W `session_memory_history.py:37,50,57,69,89` namespace/memory_get/memory_write/memory_node/commit_intents | CAS/TTL/命名空间；与 Thread State 不同；Hosted 实写读回待核实 |
| 模型流式 | W `session_memory_history.py:103` stream_model；`runtime.py:433` astream | 增量不等于成功提交；断流/取消与 usage 待核实 |
| 历史/分支 | W `session_memory_history.py:173,235` clone_scopes/operation；F `editor/v2/SessionHistoryWorkspace.tsx` | 原历史只读、确认才执行副本；Store 不随分支回滚，Hosted 待核实 |
| 前端预览 | F `application/v2/frontendPreview.ts:44,49` createFrontendPreview/advancePreview | 浏览器演示，不调用真实工具，不计入真实验收 |
| 导出 | F `editor/v2/LiveWorkflowEditor.tsx:292` exportDocument，`:504` 导出面板 | 定义与布局 JSON，不含部署能力；脱敏检查后交付，非独立运行程序 |

### 1.2 环境闭环事实复核

| 事实 | 本次证据 | 工程结论 |
| --- | --- | --- |
| owner 过滤 | W `server.py:85–90` catalog；`registry.py:91` 环境匹配 | 空目录无法证明“未授权”；只能提示未授权/未配置的可能原因 |
| Hosted 约束 | W `operations.py:85,102–103` assert_hosted_configuration | 显式 UUID、无 localFixtures/通配，不能复制 Local 环境配置 |
| 自建连接注入 | W `extensions.py:88–95` hydrate_connections | DeepSeek→providers、HTTP→tools、MCP→connectors；键 `p4:owner:ref:version` |
| 版本与轮换 | 同上；`catalog_operation:24` 版本键；上一轮计划 §1.7 记载不可变版本 | 旧版本不必立即失效；停用或目录不再提供时不可用。新版本出现也须明确提示可升级，不能宣称所有轮换必然失联 |
| 工具刷新断点 | F `application/v2/useWorkflowV2Controller.ts:129–134` useEffect 仅依赖 environmentRef；`editor/v2/LiveWorkflowEditor.tsx:503` onSaved | 保存只拉环境，须补工具刷新、取消旧响应和发现后的同步 |
| 凭据来源标识错误 | F `editor/v2/EnvironmentPanel.tsx:7` 所有 provider 固定同一文案；W `registry.py:130` public_environment | 公共投影尚无结构化来源/版本，不能仅靠名字判断“我的连接” |
| 环境/能力耦合 | W `registry.py:72–79,90–133`；`operations.py:102–103` | 当前 environment 同时含 provider/tool/ownerIds；目标拆为共享 Runtime（无 Key）+ 用户 Capability（§2.7） |
| 模板创建缺口 | `api/_lib/workflowV2.ts:116–118,158–171`；F `pages/WorkflowCreateDialog.tsx`、`domain/v2/types.ts:25` | 目录仅返回名称/描述，创建直接复制定义；尚无能力需求投影、绑定或服务端连接归属校验，P0-6 补齐 |
| 修订冻结缺口 | W `registry.py:83–89,125–131`；`api/_lib/workflowV2.ts:318` | 当前 environmentRevision/configurationRevision 与 registrySnapshot 需明确承载 Runtime/Capability 两者修订，不能只加 access 字段 |
| 移动端重叠 | F `editor/v2/workflowV2.css:74–75` notice/palette/banner/overview top:112px | 需要共享插槽，不是再加一个局部 top 偏移 |
| 账号与输入入口 | F `editor/v2/LiveWorkflowEditor.tsx:140` ownerId；`:509` 运行 tab 可编辑按钮 | 可展示本人 UUID；移除重复编辑入口、保留只读摘要 |
| API 可复用 | `api/_lib/workflowV2.ts:127–154,256–275` extensions/catalog/preflight | 扩展现有 handler 与投影，不新增 Function；权限继续由服务器 owner 决定 |

## 2. 真实业务工作流套件

### 2.1 选型、公共合同与工具准入

选择四套**公开数据**场景（主题可按你指定替换，骨架不变）：

| 场景 | 业务闭环 | 主要控制流 | 重点验证 |
| --- | --- | --- | --- |
| S1 技术动态简报 | 按主题汇总 HN/arXiv/Wikipedia，产出带引用的周报 | 固定 fork → 三路并行 → join(all) → 人工审核 | 并行屏障、子图、HTTP 工具、引用 |
| S2 开源依赖健康检查 | 2–4 个真实包的维护状态与风险矩阵 | 动态 Send → 每包独立子图 → 逐项审核 → defer 汇总 | 动态任务、多等待、append 去重 |
| S3 社区问题分诊 | 真实公开问题 → 分类/优先级/带引用回复草稿 | 工具循环（≤4 调用/2 回合）→ 人工审核 | tool loop、调用归属、预算终止 |
| S4 内容事实审校 | 待发布文案逐条核对公开来源，退回返工 | 事实核对 → 审核 → 返工 ≤2 轮 → CAS 记忆 | 有界返工、memory CAS、拒绝不写 |

数据源以公开检索/公开 API 为主；GitHub 只在 S2 作为**可选**来源，不再作为骨架。所有业务输出是草稿或已批准的本地产物；默认不发评论、不改标签、不创建 Release、不发消息。

**工具准入**（R1 先用最小请求读回真实目录/Schema；未通过不进场景）：

| 标记 | 工具 | 认定与准入 | 用途 |
| --- | --- | --- | --- |
| T1 | DeepSeek | **用户自建连接**（测试管理员私有；共享运行环境不含 Key） | 总结、分类、审校 |
| T2 | Hacker News Algolia | **用户自建 HTTP 连接**；公开搜索 API，无密钥；需验证路径模板与速率 | S1/S3 检索 |
| T3 | Wikipedia REST | **用户自建 HTTP 连接**；公开 API，无密钥 | 背景/事实 |
| T4 | arXiv API | **用户自建 HTTP 连接**；公开 API，无密钥 | 论文检索 |
| T5 | npm registry / PyPI JSON | **用户自建 HTTP 连接**；官方公开 API，无密钥 | S2 元数据 |
| T6 | Stack Exchange API | **用户自建 HTTP 连接**；公开 API，无密钥但配额有限 | S3 备选 |
| T7 | DeepWiki | 测试环境 connector；产品模板不依赖 | S1/S3 可选 |
| T8 | GitHub 只读 | 测试环境工具；产品模板不依赖 | 仅 S2 可选仓库元数据 |
| T9 | 文件产物 | 函数节点生成 Markdown/JSON/CSV | 交付物 |
| T10 | 外部写 | **本轮关闭**；外部写不在本轮范围 | 不做 |
| T11 | 通用网页搜索 | Tavily/Brave/Serper 等需 Key；可选后续 | 不做 |

产品模板只声明**能力需求**（模型类型、工具类型），不写死 `p4:` 引用；创建时绑定当前用户自己的连接，见 §2.7。

> 当前 HTTP 连接 UI 只生成空对象 Schema；路径模板可写 `?query={query}`。R1 先用 T2 最小请求验证“连接→节点可见→真实调用”；若模型工具参数表达不了，补 Schema 字段或改用路径式 API。不能假装能跑。

统一合同：对象 `additionalProperties:false`；输入有界；来源内容是不可信数据；State 至少 `caseKey,sourceVersion,evidence[],errors[],review,status`；并行只 append 独立结果，汇总按稳定业务键去重排序；`review={approved:boolean,comment:string}` 按冻结语义；`output={caseKey,status,report,evidenceRefs,limitations}`。模型只产出候选，确定性函数校验来源/枚举；不假设模型有强制 JSON Schema 输出。

公开检索的验收快照：每次运行记录**查询词 + 时间 + 前 N 条结果（标题/URL/短摘录）**；断言“引用存在且来自本次检索”，不要求两次结果逐字相同。结果变化、限流、来源不可达必须显式写入 `limitations`，不能补造。

详细成功/拒绝/失败/重复提交用例统一见[验收计划](../../artifacts/archive/acceptance-process-20261023/WORKFLOW_PRODUCT_TEMPLATE_ACCEPTANCE_PLAN_2026-10-22.md)。

重试默认最多 2 次（含首次），只读暂态/429 按允许分类退避；auth/权限/合同失败立即停止。新 Run 可读取变化后的外部数据；幂等指提交去重与无重复副作用，不承诺模型字句或外部数据相同。运行记录见 §2.6。

### 2.2 S1 技术动态简报（首个公开检索场景）

- 用户/价值：团队按主题获得一份带来源的周报，减少人工翻 HN/论文的时间；产出是草稿，人工审核后采用。
- 工具：T2 HN 搜索、T4 arXiv、T3 Wikipedia 背景；T1 汇总；T7 可选。缺哪个源就显式写 `limitations`，不虚构。
- 输入：`{topics:[1..3], sinceDays:1..14, audience, caseKey}`；主题是结构化枚举/短文本，不拼成权威 prose。
- State：公共字段 + `queries,hnItems[],papers[],background[],normalized[],brief,limitations`；三路写不同字段，join 后归一。
- 输出：公共合同 + `brief,sections[],citations[],limitations`；未批准时 `brief` 必须标“未批准草稿”。

| 节点/边 | 实现与控制语义 |
| --- | --- |
| Start→校验主题→fork | 主题为空/超范围停止；三个固定分支 |
| HN 支路（T2） | 按主题+时间窗检索，保留 URL/时间/短摘录 |
| arXiv 支路（T4） | 按主题检索最近论文，保留 abs/URL/日期 |
| Wikipedia 支路（T3） | 取背景摘要，标注“背景，不作为最新事实” |
| 三终点→join(all)→归一 | waitFor 恰好三个终点；缺失源产生 skipped 结果后到达屏障 |
| 归一→T1 汇总→人工审核 | 每条结论必须带 citation；无来源不得进入批准 |
| 审核→批准简报 / 拒绝草稿→End | 只输出文本，不发布 |

- UI 演示：复制场景→选环境→填主题→运行→看三路→进子图核对来源→拒绝一次→新 Run 批准→导出。
- 耗时/调用规模：3–8 分钟；模型 2–3 次、工具 6–12 次；输入 10k–30k、输出 2k–6k token；按实际 Run 记录，不单独核算费用。

### 2.3 S2 开源依赖健康检查

- 用户/价值：小团队比较 2–4 个真实开源包，得到维护活跃度、最近发布、已知风险与证据矩阵；不冒充法律许可意见。
- 工具：T5 npm/PyPI 官方元数据必需；T8 GitHub 仓库元数据可选；T1 评估/汇总；不依赖付费数据源。
- 输入：`{packages:[{name,ecosystem:"npm"|"pypi",pinnedVersion?}] 2..4, constraints:{runtime,budget,requiredFeatures:[]}, caseKey}`；包名去重，版本可选。
- State：公共字段 + `items,item,assessments[],matrix,recommendation,unknowns`；append 后按 `(ecosystem,name,version)` 去重。
- 输出：公共合同 + `matrix,recommendation,unknowns`；无证据的指标写 `unknown`，不填伪精确评分。

| 节点/边 | 实现与控制语义 |
| --- | --- |
| Start→校验去重→Send(target=包子图) | concurrency=2；per-invocation independent；next 不连提前汇总 |
| 子图：T5 取元数据→T8 可选取仓库→T1 评估→逐项审核 | 版本/日期/维护状态必须来自 API；缺 GitHub 不影响主线 |
| 子图输出一个 assessment→父图 defer 汇总 | 按动态任务全量完成语义汇总，不伪装成静态 join 前驱 |
| 汇总→完整性核验→T1 比较→End | 覆盖全部 requiredFeatures；不足写 unknown |

- UI 演示：填 2–3 个包→运行→进各子图看 API 来源→批准一项→刷新→拒绝一项→看矩阵→重跑核对。
- 耗时/调用规模：6–15 分钟；模型 3–4 次、工具 6–12 次；输入 12k–40k、输出 3k–8k token；按实际 Run 记录，不单独核算费用。

### 2.4 S3 社区问题分诊

- 用户/价值：从真实公开社区问题出发，核对版本/文档/相似问题，生成带来源的回复草稿与升级建议；不冒充已解决。
- 工具：T2 HN 搜索或 T6 Stack Exchange 必需；T3 Wikipedia 背景可选；T1 分类与回复；T7 可选。默认不发帖。
- 输入：`{source:"hn"|"stackexchange", questionQueryOrId, productVersion?, caseKey}`；只选公开、无敏感数据的问题。
- State：公共字段 + `question,messages,pendingCalls,toolRounds,duplicateCandidates[],triage,draft,citations,escalationReason`；消息用官方 Reducer，工具白名单固定。
- 输出：公共合同 + `category,priority,duplicateRefs,replyDraft,citations,escalationReason,approved`；不宣称解决/退款/已联系客户。

| 节点/边 | 实现与控制语义 |
| --- | --- |
| Start→T2/T6 读问题→支持诊断子图 | 保留原始 URL/更新时间；404 不重试 |
| 模型→router(has toolCalls)→tool_dispatch→模型 | 有界循环，最多 4 调用/2 回合；只调白名单 |
| router(完成/证据不足/超预算) | 完成去人工；不足输出升级草稿；预算耗尽明确停止 |
| 人工审核→批准回复草稿 / 拒绝升级→End | 覆盖子图、循环、分支、人工审核；默认不发评论 |

- UI 演示：选真实公开问题→运行→展开第一次工具请求→看工具消息与第二轮→拒绝/升级→新 Run 批准草稿→确认社区未被写入。
- 耗时/调用规模：4–10 分钟；模型 2–4 次、工具 2–6 次；输入 5k–20k、输出 1k–5k token；按实际 Run 记录，不单独核算费用。

### 2.5 S4 内容事实审校

- 用户/价值：产品运营把待发布文案与公开事实比对，发现夸大承诺/未证实说法，产出已审核内容包与修改记录；不接 CMS、不发社交平台。
- 工具：T2/T3/T4 公开检索事实；T1 审校/修订；不依赖不存在的邮件或 CMS。
- 输入：`{draftText≤12000, topic, channel, caseKey, maxReviewRounds:1..2}`；草稿必须是公开或脱敏文本，不能把私有客户内容当事实源。
- State：公共字段 + `claims[],evidence[],violations[],revisionDraft,round,approvedContent,previousVersion,savedVersion`。
- 输出：公共合同 + `approvedContent,claimEvidence[],decision,storedVersion`；拒绝则 `approvedContent` 为空，未审稿不得进入已确认记忆。

| 节点/边 | 实现与控制语义 |
| --- | --- |
| Start→T1 拆声明→逐条公开检索 | 每条声明必须有可定位文本；检索记录 query/time/URL |
| 确定性 citation 检查→T1 审校→人工审核 | 无来源的声明不得批准；模型不得补造来源 |
| 审核→router(批准/退回/拒绝) | 退回附意见→修订→复核，最多 2 轮；超过结束草稿 |
| 批准→memory.put(expectedVersion)→End | CAS 保存已审内容；冲突明确失败；不调用 CMS |

- UI 演示：填公开/脱敏文案→看声明与来源→退回修改→第二轮→批准保存→新 Thread 读回→拒绝一轮确认版本未变。
- 耗时/调用规模：5–12 分钟；模型 2–4 次、工具 2–5 次；输入 8k–25k、输出 2k–7k token；按实际 Run 记录，不单独核算费用。

### 2.6 运行记录与停止条件（不做费用核算）

**不做费用核算、不设 ¥5 上限、不设 10 次 Run 上限、不维护价格表/金额账本。** 单次 Run 已由 `maxOutputTokens`、`maxToolCalls`、`maxNodeExecutions`、`timeoutMs` 等策略上限约束，不需要再叠一层金额预算。

- **运行清单**：每次 Run 记录 `{runId, scenario, env, revision, status, startedAt, finishedAt}`，作为验收证据和复现索引；不计算金额，不维护 token 价格表。
- **token usage**：Step 里仍有 `usage`，只作为“模型实际调用过、规模正常”的观测；需要时在证据里写 token 数，不折算费用。
- **停止条件**：同一失败连续出现 2 次，先停下定位，不静默重跑；单次 Run 若卡住/循环，按现有取消与超时机制终止；不把“多跑几次碰成功”当验收。
- **费用可见性**：如果账户 owner 想看花费，以供应商控制台账单为准；本项目不做计费系统，也不把估算写成已结算。
- **成功定义**：Run 完成、无报错只是必要条件；通过标准是[验收计划](../../artifacts/archive/acceptance-process-20261023/WORKFLOW_PRODUCT_TEMPLATE_ACCEPTANCE_PLAN_2026-10-22.md)的场景断言（真实来源、引用、审核门禁、失败路径、无外部写），不是“跑绿了”。

### 2.7 产品模板化：共享运行环境 + 用户执行能力

四个场景按用户确认作为产品模板（B），架构拆分为：

| 层 | 内容 | 访问 |
| --- | --- | --- |
| Runtime Environment（共享） | 镜像、网络、资源/超时、基础 capabilities | `access:"authenticated"`；所有登录用户，不使用 ownerIds |
| Capability（用户） | DeepSeek/HTTP/MCP 连接、函数、变量 | 按 owner 隔离（`p4:`），用户自建 |
| 有效配置 | Runtime + 当前用户 Capability，Run 冻结二者修订 | — |

- 共享运行环境**不含** provider/connector/tool/secret；平台 Key 不进入共享层。测试管理员的 DeepSeek 连接是私有能力，可临时用现有平台 Key 创建，仅用于本轮验收。
- 模板及嵌套子图不写死 `p4:` 引用，只声明能力需求（模型类型、工具类型/用途）；创建时检测需求，让用户选择或新建自己的连接，再写入副本。缺连接时显示“需配置执行能力”，不允许假运行。
- 对无密钥公开 API，绑定向导可提供“创建推荐连接”一键创建（用户确认），仍属于用户能力，不进入共享环境。
- 模板 Local 先验证；Hosted 在四场景技术验收通过后，用一条**只插入 `workflow_templates` 的数据迁移**投放，不提前暴露半成品。
- 模板验收后保留；只清理测试 Run/Thread/临时连接。现有 `hosted`（带平台 Key）保持 owner 限制，仅作测试与既有 owner 使用。

## 3. 文件级实施清单（后续实施，本轮只改文档）

下表路径 F/W 同 §1；各项均有独立提交/候选冻结点。测试留在现有 Feature/worker 测试目录，不放 `api/` 顶层。
所有新状态保持 loading/error/empty 独立，HTTP/MCP 发现也不能被环境列表成功掩盖；结果落地前核对仍是同一个 owner/env/请求代次。

| 项目/顺序 | 文件、函数与状态改动 | 测试与场景门 | 回滚 |
| --- | --- | --- | --- |
| P0-1，0.5–1日 | F `application/v2/useWorkflowV2Controller.ts` 独立 environment load/error 状态；拟增 `environmentAvailability.ts` 分类纯函数；`LiveWorkflowEditor.tsx` 展示本人 UUID、复制、重载；CSS 共享顶部插槽 | 分类/失败重载/无环境仍可编辑保存；390/768/1024 几何、键盘复制；S1 启动前覆盖 | 回退 UI 提交但保留准确错误，不扩大 owner 权限 |
| P0-2a，0.5–1日 | controller 拟增 `refreshTools(envRef)` 与统一 `refreshEnvironmentResources`；取消过期响应；Live onSaved、EnvironmentPanel onDiscover 串行发现后刷新 | controller 测试保存 HTTP 即出现、MCP discovery 后出现、切环境竞态与失败重试；S1/S2 无页面刷新 | 回退接线，用显式刷新资源按钮暂替；不得假称工具已更新 |
| P0-2b，0.5–1日 | W `registry.py` public_environment/public_tools、`extensions.py` 补结构化 origin/connectionRef/version/availability；F `domain/v2/types.ts`、`repository/v2/WorkflowApiV2.ts` 接收；EnvironmentPanel/ProcessingFields/WorkflowConnections 展示“我的连接·vN”与内置来源 | 投影仅暴露安全字段；同名不同连接可区分、同连接最新可用优先，旧已选版本仍显示；S1/S2 | 可选元数据兼容旧前端；无元数据明确来源待确认，不误标执行端 |
| P0-2c，1–1.5日 | F 拟增 domain `connectionReferences.ts`：递归扫描子图 providerRef/toolRef/allowedToolRefs；生成旧→新提案；重取工具 contractDigest；ProcessingFields/Live 做预览、确认、保存新修订；W compiler 现有工具诊断只有 nodeId、无 pointer，需补 pointer/graphPath 或由前端按 nodeId 定位；`api/_lib/workflowV2.ts` 仅透传，不新增 Function | 旧版仍可用也提示可更新，停用旧版阻断；映射歧义/Schema 改变不自动绑定；子图/dispatch/白名单覆盖；S1–S4 各取一节点，S3 子图必测 | 未确认零修改；已保存通过新修订恢复原引用；旧连接仍须有效，禁改历史 Run/冻结 Thread |
| P0-3，0.5–1日+等待 | 后续新增明确开关的场景验证脚本置 `scripts/workflow/checks/`，复用 `verify-agent-scenarios.mjs` 计数/运行清单思路；不默认调用；文档记录真实环境与 Run | Local S1 先成功，再四场景，最后 Hosted 模型+公开检索/DeepWiki 真实调用与一条失败证据 | 关停自建 Thread、停用临时连接；保留失败证据，不重放未知外部效果 |
| P0-4，0.5日 | 后续更新 Hosted runbook：共享 Runtime 配置责任人、旧环境 ownerIds 脱敏结构快照、CI 发布、D3 清理；不恢复归档裸部署脚本 | 部署前后自检、兼容候选、owner 移除前后读回；旧受限环境撤权不能继续原 Thread；保留账号及共享 Runtime 不受影响 | 仅授权后恢复原 owner 清单；不恢复秘密到文档、不回滚共享数据库 |
| P0-5，1–2日 | W `server.py:catalog`、`registry.py:environment/update/snapshot/public_environment`、`operations.py:assert_hosted_configuration`：校验共享 Runtime 的 `access:"authenticated"`，不使用 ownerIds，拒绝 provider/connector/tool/secret；`extensions.py:hydrate_connections` 只装配当前 owner 能力。沿 `compiler.py:compile_definition` → `api/_lib/workflowV2.ts` enqueue 的现有 registrySnapshot 冻结 Runtime/Capability 修订；F `domain/v2/types.ts`、`repository/v2/WorkflowApiV2.ts`、`editor/v2/EnvironmentPanel.tsx` 区分共享配置与本人有效能力。双修订字段承载及旧 Thread 兼容待核实，复用现有 JSON，不改 schema | `services/workflow/tests/` 下 `test_hosted_operations.py`、`test_preflight.py`、`test_runtime.py` 补匿名拒绝、登录可见、非法共享配置拒绝、跨 owner 隔离、轮换不改旧快照、旧 ownerIds 恢复限制；F `repository/v2/WorkflowApiV2.test.ts` 覆盖投影；双修订可读回才进 S1 | 回退前后端兼容候选及共享配置；保留用户连接和冻结快照。旧候选不能识别新 Thread 时停止恢复、保留记录，不降为通配 owner 或偷偷换 pin；不往共享层放 Key |
| P0-6，1–3日 | F `pages/WorkflowCreateDialog.tsx`、`domain/v2/types.ts`、`repository/v2/WorkflowApiV2.ts`：需求→选择/新建→绑定→创建，缺项显示“需配置执行能力”；拟新增 `domain/v2/templateCapabilities.ts` 管理结构化需求/节点路径映射。`api/_lib/workflowV2.ts` templates 与 template POST 投影需求、重新校验当前 owner 的连接版本/合同、递归绑定后 document 校验再 saveCreation；复用 W catalog/preflight，必要校验扩现有边界。拟新增 `src/demo/workflow/productWorkflowTemplates.ts` 作为 seed 输入（生产不 import），及 `supabase/migrations/<生成时间戳>_workflow_product_templates.sql`（拟新增，仅 INSERT workflow_templates）；需求载体与文档校验兼容待核实，不新建表 | 拟增同目录 `templateCapabilities.test.ts`、`pages/WorkflowCreateDialog.test.tsx`、`tests/api/workflow-template-binding.test.ts`；扩 `repository/v2/WorkflowApiV2.test.ts`：缺能力、取消/确认推荐连接、A/B 隔离、伪造绑定、嵌套引用、重复 creationId；比对 seed/迁移摘要，仅插入四个新 ID，冲突停查。Local→Hosted 四场景技术门→迁移→发布后复制运行 | 投放前失败不执行迁移；应用回退不撤销已插入行。发布后先停放量/回退兼容候选，保留模板、用户副本及历史；若必须下架或修订已投放内容，记录工程阻塞并另案处理，禁广删、禁以回退提交冒充数据库回退 |
| P1 输入，0.5日 | `LiveWorkflowEditor.tsx:509` 移除可编辑入口；RunInputSnapshot/RunPreparationDialog 保留只读摘要及顶部运行唯一入口 | 调用方输入仍只读；required/optional 与历史重跑不回归；S1/S4 | 回退局部展示提交，不能改变冻结输入语义 |
| P1 布局，1–2日 | `WorkflowGraph.tsx`/Live/CSS 统一顶部、palette、inspector、底部工具插槽；互斥与滚动；禁止由面板开关触发布局/fit | S3 多等待+历史条+子图；S4 长审核；视口矩阵中按钮可点击、节点坐标/视口稳定 | 回退布局提交；阻塞窄屏功能保持明确限制，不签通过 |
| P1 键盘，1–2日 | WorkflowGraph、ExecutionBubbles、SubgraphInvocationHistory、WorkflowDialog 的选择/移动/Tab/焦点返回；运行状态 aria-live | S2 调用选择、S3 部分回应全键盘可用；历史只读时禁移动；焦点不被轮询夺走 | 分批回退快捷键；保留已验证可访问名称与焦点环 |
| P1 归属/历史，0.5–1日 | `executionPresentation.ts` 共用 invocation/attempt/输入摘要；ExecutionDetails/RunOutput/SessionHistoryWorkspace 展示当前分支与其他分支只读范围 | S2 多工具回合、S3 同名并发、S4 返工；查看历史不替换草稿、不改坐标 | 回退展示层；不得移除身份字段或把 attempt 当独立任务 |
| P2 条件纳入，0.5–1日 | WorkflowConnections、connectionDraft、EnvironmentPanel：统一测试失败类别/发现过期/凭据状态；仅复用服务器可知状态，不暴露秘密；缺诊断先报差距 | MCP 合同失效、缺凭据、轮换后准备失效；S1/S3；真实生产模型等待和完整矩阵纳入最终门 | 诊断不全显示待核实；不伪造“已配/测试通过” |
| P2 保留不做 | provisioning、required/optional B、账号密码轮换、课程任务关联、独立可复用子图资产、全量 V2 改名 | 不影响本轮四场景；若成为必需依赖，停该范围并重新评审 | 无实现即无回滚；禁止偷偷扩范围 |

D2 特别门：新增版本不改旧定义；显式确认前展示所有受影响节点/子图路径、字段与合同差异；确认仅改当前编辑草稿，再走验证→保存新修订。
新旧工具不是同一合同或工具名映射不唯一时要求人工重选；MCP 工具通过结构化 connector 身份与发现合同关联，不能只按 ref 字符串替换。
正在执行、等待 Thread、历史修订保留原 pin；权限/环境变更仍按既有兼容检查拒绝或明确恢复，不能把“更新节点”伪装成热修复旧 Run。
后端若无法安全提供元数据，先形成差距，不从显示文案推断 owner/version，也不借机加 schema 迁移。P0-5/6 的实现细节待核实不重开产品决策；若现有 JSON/校验边界无法兼容，停在该门，不擅自扩大范围。

## 4. 分层验收与证据规则

详细用例、模板/画布矩阵、命令、证据、失败循环、D3 与签字统一维护在[产品模板验收计划](../../artifacts/archive/acceptance-process-20261023/WORKFLOW_PRODUCT_TEMPLATE_ACCEPTANCE_PLAN_2026-10-22.md)，本文只保留阶段门。该计划所有结果均未执行、待填。

| 阶段 | 进入与退出门 | 可停点 |
| --- | --- | --- |
| Local 技术/自动视觉 | 冻结候选；P0-1/2/5 → S1 → S2–S4/P0-6/P1；类型、测试、构建及阻塞视口通过 | 缺连接、合同或归属证据就停该场景，禁止以 preview/echo 代替真实成功 |
| Local fresh 预验收 | 仅提供业务目标、入口、非秘密输入与标准；普通 UI 完成关键路径 | 修复后重新预验收，不用开发解释代替可用性 |
| Hosted 技术与投放 | 核对目标项目、迁移历史、digest、目录、ready、Worker、实际 Function≤12；直接部署服务与 Preview，先认证 API 后 UI；四场景技术通过后才执行一条模板内容迁移并读回复验 | 不设维护窗口，不 reset 共享库；已有迁移缺口按仓库 Hosted 纪律增量对账处理，不由 Preview 自动迁库；schema/兼容性不明就停 |
| Hosted fresh → 产品最终验收 | 发布后可见/复制/绑定/真实运行与跨 owner 验证；产品负责人签字；收齐证据后 D3 与精确清理 | 主站 production 前端不自动提升；残余阻塞只能记未通过，不假签 |

本次仅编写计划；后续部署 `edu-flow-workflow` 可能影响后台 Production，必须记录实际目标及前后自检，不能用 Preview 名称掩盖后台影响。回滚保护旧 waiting/active Thread、用户副本及历史。

## 5. 下一轮路线与可停点

| Round / 估时 | 目标与交付物 | 门禁/依赖 | 风险、可停止条件 |
| --- | --- | --- | --- |
| R1，4–6日 | P0-1、P0-2、P0-5；连接诊断/刷新/轮换、共享环境 access 拆分；**Local S1 首个真实公开检索（HN/arXiv/Wikipedia）+测试管理员私有 DeepSeek 连接**，版本提案与最小成功/失败证据 | 模型/公开工具凭据；按实际 Run 记录；目录映射落实；相关测试与局部视觉，S1 成功/拒绝/失败/幂等通过 | 目录缺操作/凭据未就绪停在候选；不扩四场景；可交付连接闭环后等待真实验收 |
| R2，4–6日 | Local S2–S4、P0-6 模板绑定与模板内容；P1 画布与必要 P2；技术/视觉与 fresh 预验收 | R1 真工具通过；四套合同、运行清单、清理清单；模板跨 owner 不泄漏；类型/全量基线与构建按 §4 执行 | Send 屏障、循环/消息、CAS、绑定为风险；缺业务工具先停该场景，不改成 echo；可停在 Local 完整套件 |
| R3，1–3日 | Hosted 对账与直接部署；P0-3/4；四场景真实调用；技术验收通过后投放四套模板（一条数据迁移） | R2 通过；真实环境、schema、digest、Function 产物≤12；部署前后自检通过；模板投放前技术门通过 | 平台限流/不兼容/部署异常即停；不重置共享库；可停在已验证 Preview，不提升主生产 |
| R4，1–2日 | fresh Hosted 预验收→产品负责人最终验收；D3 移除旧环境测试管理员授权、精确清理、签署残余风险 | 四套所有必过项、0 阻塞视觉、运行清单/清理清单齐；产品签署与运维记录 | 失败按验收计划 §6 循环；移除旧环境 owner 后验证旧环境拒绝、共享 Runtime 仍可见；可接受“Local 通过/Hosted 阻塞”明确结论，不假签完成 |

总粗估 10–17 人日，另计外部授权与失败返工；不承诺供应商延迟。每轮独立冻结候选与可回滚提交，单作者串行修改 Live/controller/registry/API 等热点。
回退保留历史、Run、检查点；应用回退不等于数据库回退；后端改动可能改变 executorDigest，升级前先验证旧 waiting 恢复资格，无兼容候选就明确拒绝继续并保留旧身份。

### 5.1 本轮实施进展（2026-10-22）

| 项 | 状态 | 证据 |
| --- | --- | --- |
| P0-1 环境三态、布局横幅、账号 UUID 复制、重试、移动端不再绝对定位重叠 | 代码完成；单测通过；浏览器视觉待验收 | `src/features/workflow/application/v2/environmentAvailability.ts` 与其测试；`LiveWorkflowEditor` 的 `wf-v2-env-notice` 布局条；`useWorkflowV2Controller` 的 `environmentError` |
| P0-2a 保存连接后刷新环境与工具 | 代码完成；单测通过；跨 owner/真实连接待验收 | `loadTools` 请求代次、`refreshEnvironmentResources`、`EnvironmentPanel onSaved`；controller 测试覆盖工具刷新与刷新失败 |
| P0-5 共享 Runtime access 拆分 | 后端代码完成；owner/shared 兼容测试通过；双修订字段与旧 Thread 兼容待核实 | `registry.environment_allowed`、`public_environment.access`、`operations.assert_hosted_configuration`；owner 环境不新增 `access` 字段以保持 revision；shared env 拒绝 ownerIds/能力/secret；新增 backend tests |
| P0-2b 连接来源/版本投影与标识 | 代码完成；单测通过；同连接版本选择/升级提示已接 P0-2c | `capabilityOrigins` 仅用于投影、不进入 revision；provider/connector/tool 返回 origin/connectionRef/version；面板显示“我的连接 · vN”或“执行端管理凭据” |
| P0-2c 连接版本扫描与安全更新 | 代码完成；浏览器/真实连接待验收 | `connectionReferences.ts` 递归扫描子图/providerRef/toolRef/allowedToolRefs；最新启用版本提案、合同变化/模型不匹配转人工；`ConnectionVersionPanel` 写入草稿；`connectionKey` 投影；节点内提示原连接不可用/新版本；compiler 工具诊断补 `pointer`；5 项单测 + contract pointer 断言 |
| P0-6 模板能力前置 | 四套模板草案（含真实 HTTP result 包装对齐）+ Local seed + 创建时直连绑定完成；内容迁移、真实连接验收待做 | `templateCapabilities.ts` 四套需求；`WorkflowCreateDialog` 读取模板定义、展示未绑定项、创建前选择环境/模型/工具并随 `useTemplate` 发送 bindings；`workflowTemplateBinding.ts` 服务端递归绑定/owner 目录校验/合同变化拒绝；`template POST` 接受 `environmentRef+bindings`；`productWorkflowTemplates.ts` 四套草案读取 `result.hits`/`result.extract`/`result`；compiler `validate_structure` 4/4 通过；seed 已重生成 |
| S1 本地技术探针 | 成功；API + 浏览器 UI 技术证据，非正式验收 | API：run `92f68fae…`、两来源产品模板 run `6035ca25…`、三来源 HN/StackExchange/npm run `27e5285f…` 成功；UI 三来源 workflow `ccdd6f3a…`、run `b3e7923a…` 成功；四视口/125% 等效视口、控制台 0 error、跨账号 404、清理与拒绝/失败/幂等均已有证据 |
| S2 依赖健康检查 | 成功；API + 浏览器 UI 技术证据，非正式验收 | PyPI 完整 JSON 触发 `EVENT_TOO_LARGE`，改用 pypistats 下载统计；API workflow `ffaf3615…`、run `f080c8ee…` 成功；UI workflow `36153215…`、run `0c69c9b0…` 成功，输出 3 条使用/版本/升级风险；截图已入库 |
| S3 社区问题分流 | 成功；API + 浏览器 UI 技术证据，非正式验收 | 固定社区问题 HN 连接 + DeepSeek；API workflow `15bac484…`、run `8675b3e7…` 成功；UI workflow `dfdf322c…`、run `8036cb00…` 成功，输出归纳/分流/回应；首次输出截断后收紧 200 字 |
| S4 内容事实核对 | 成功；API + 浏览器 UI 技术证据，非正式验收 | 仅 DeepSeek；API workflow `2bc165d7…`、run `ad8804a6…` 成功；UI workflow `598b087e…`、run `261ef403…` 成功；三条主张均标为缺少依据，给出保守发布版与补证模板 |
| Hosted 环境审计 | 通过（只读）；部署已开始、迁移未执行 | Supabase `uyljtdbvlivxniililay`：迁移 117 条与本地 digest `4abc4c45…` 一致、无 Local 用户、16 个历史模板但四产品模板缺失；Worker Production `dpl_Dy382…`、前端 Preview `dpl_9Sr9…` 均 READY；最近 Run 成功，Sandbox 固定镜像 `eduflow-isolated@sha256:fb27a073…`；前端 12/12 API 入口；env/log 读取被团队 scope 403，未读秘密 |
| Hosted 部署/冒烟 | **按用户决定暂缓 Hosted 门** | 前端 Preview `dpl_8ZDWpav…` READY；Worker 重部署 `dpl_CrYMiVk…` 后 Sandbox smoke run `cd2fc9e2…` 成功；S4 模型仍 `NODE_EXECUTION_FAILED`；临时 workflow/连接已清理；模板内容迁移未执行；用户 2026-10-23 决定先以 Local 验收为准 |
| 本地执行能力自配置 | **成功** | 测试账号通过 UI/API 创建加密 DeepSeek 连接 `my_deepseek_round22`，连接测试成功，环境 provider `origin=user`；真实运行 workflow `ddada551…`、run `e44be04a…` 成功；截图 [round22-selfservice-deepseek.png](../../artifacts/archive/acceptance-process-20261023/evidence/workflow-s1-round13/round22-selfservice-deepseek.png) |
| S1–S4、Hosted 正式验收 | **Local 通过；Hosted 暂缓** | Local S1–S4 API+UI 与自建模型能力均通过并完成精确清理；Hosted 未签，内容迁移未执行；见 [Local 最终验收](../../artifacts/archive/acceptance-process-20261023/WORKFLOW_LOCAL_FINAL_SIGNOFF_2026-10-23.md) |

验证：新增 2 项产品模板草案测试；四套 Definition 经 compiler `validate_structure` 全部通过；6 项 connection + 1 项 template capability + 3 项服务端模板绑定单测通过；worker 220 passed / 12 skipped（本机 `NO_PROXY` 含 `[::1]` 会触发 httpx2 解析异常，归一为 `localhost,127.0.0.1` 后通过）；`pnpm test` 171 文件 / 1280 项通过；`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过。S1 已取得 API 三来源、UI 四视口/125% 等效视口、控制台 0 error、跨账号 404 与清理证据；S2、S3、S4 已取得 API + UI 成功；Local 五项 run（含自建 DeepSeek）均 success；Hosted Sandbox 在 Worker 重部署后 smoke 成功，但模型节点仍失败，按用户决定暂缓 Hosted 门、内容迁移未执行；真实浏览器 zoom 与 Wikipedia/arXiv 适配仍缺。

## 6. 确认状态 / 工程待核实（不重开 D1–D3）

**无剩余产品决策**：D1/D2/D3=A、required/optional=A、产品模板=B、画布范围=A 均已冻结。这里只列工程核实项，不要求重新选方案。

| 工程核实项 | 落点 / 未满足时的处理 |
| --- | --- |
| Hosted 项目、部署、迁移历史、digest、Function 数与 ready | R3 进入门；对不上先停，不凭前端 READY 签后端可用 |
| 公开 API 实际合同、查询参数、限流与只读性质；T7/T8 测试能力 | R1 工具准入；缺项出差距单，不把可选工具变成模板依赖 |
| access 校验、Runtime/Capability 修订与旧 Thread 兼容 | P0-5；复用已有快照 JSON，无法兼容停该门、不加 schema |
| 模板需求 JSON 载体、绑定校验、推荐连接与内容迁移一致性 | P0-6；不硬编码 owner 引用，不绕开 document/preflight |
| 场景输入与证据、精确清理接口、旧环境 D3 回执 | 按验收计划准备公开/脱敏数据；无安全删除接口标待运维，保留对象不广删 |

## 7. 本次规划核查记录

只执行本地只读文件/代码检索、分支与 HEAD 查询，并更新两份计划、新建独立验收计划；未运行任何测试/build/场景脚本，未联网、未访问秘密、未创建验收数据、未部署。
旧文档里的测试数量、部署 READY、实模记录均是历史材料，不是本次验证结论。后续执行者必须逐条形成自己的证据和签署。

## 8. 复核与变更记录

- 2026-10-22：Codex 只读子智能体起草；Lead 复核后补充场景覆盖矩阵与场景落地方式，更正连接轮换表述（旧版本在停用/移除前仍可用），并把工具诊断 pointer 缺口改为“复用 nodeId 或补 pointer”。未实施、未提交、未部署。
- 2026-10-22：按用户反馈改为公开检索为主（HN/arXiv/Wikipedia/npm/PyPI/StackExchange，GitHub 仅 S2 可选）；Hosted 改为测试阶段直接部署、不设维护窗口。
- 2026-10-22：按用户反馈取消费用核算与 ¥5 上限；不维护价格表/金额账本，只保留运行清单与“同一失败两次先停查”的规则。
- 2026-10-22：按用户确认把四套场景升级为产品模板（B）：共享 Runtime Environment（`access:"authenticated"`，无 Key）+ 用户自建执行能力；模板创建时绑定用户连接；Hosted 技术验收后用一条内容迁移投放并保留模板。
- 2026-10-22：基于 `67c1a2c` 完整任务书复核：统一 Runtime/Capability 与双修订冻结，补模板 API 绑定、内容迁移与保留式回滚；抽出独立验收计划；澄清 D3 仅撤旧环境授权；范围 A、R1–R4 共 10–17 人日及无剩余产品决策。仅文档更新，未实施、未提交、未部署、未运行测试。
- 2026-10-22：实施 P0-1（环境三态布局横幅、UUID 复制、重试）与 P0-2a（保存连接后刷新环境+工具、请求代次防旧响应）；新增 availability/controller 测试。定向 37 项、全量 167 文件/1268 项、typecheck/lint/build 通过；浏览器视觉、P0-2b/c、P0-5/6、真实场景与 Hosted 仍未执行。
- 2026-10-22：实施 P0-5 共享 Runtime access 拆分：`access:"authenticated"` 目录放行、shared env 禁止 ownerIds/provider/tool/secret、owner 环境不新增 `access` 字段以保持 revision；新增 6 项 backend tests。Worker 218 passed/12 skipped，前端 167/1268，typecheck/lint/build 通过；双修订/旧 Thread、视觉、真实场景未做。
- 2026-10-22：实施 P0-2b 连接来源/版本投影：`capabilityOrigins` 仅用于公共投影、不进入 environment revision；provider/connector/tool 返回 origin/connectionRef/version；面板区分“我的连接 · vN”与执行端凭据。Worker 220 passed/12 skipped，前端 167/1268，typecheck/lint/build 通过；P0-2c 版本选择/升级尚未做。
- 2026-10-22：实施 P0-2c 核心：`connectionReferences` 递归扫描子图/白名单/providerRef/toolRef，生成最新启用版本提案；合同变化、模型不匹配、工具合同未读取转人工；`ConnectionVersionPanel` 应用到当前草稿；extensions 增加 connectionKey。新增 5 项单测；前端 168/1273、worker 220 passed/12 skipped、typecheck/lint/build 通过；节点内提示与 preflight 定位未做。
- 2026-10-22：完成 P0-2c 收尾：`ProcessingFields` 对 `p4:` provider/tool 显示“原连接不可用/有新版本”并指向“环境 → 连接版本”；compiler 的 `TOOL_UNAVAILABLE`/`TOOL_CONTRACT_CHANGED` 补 `pointer`，widget 定位可落到节点配置；contract 测试断言 pointer。前端 168/1273、worker 220/12、typecheck/lint/build 通过；浏览器/真实连接验收未做。
- 2026-10-22：实施 P0-6 前置：四套产品模板的需求元数据、创建对话框需求提示、未绑定能力扫描与绑定面板；模板定义、服务端需求投影、创建时服务端绑定及内容迁移仍未做。前端 169/1275、worker 220/12、typecheck/lint/build 通过。
- 2026-10-22：补 P0-6 服务端绑定：`workflowTemplateBinding.ts` 递归应用绑定、拒绝错误节点类型/重复目标，按当前 owner 的 catalog 校验连接与模型、工具合同变化；`definitions?op=template` 接受 `environmentRef+bindings` 并先绑定再 `/v1/document` 校验。新增 3 项单测；前端 170/1278、worker 220/12、typecheck/lint/build 通过；模板定义/内容迁移/创建对话框直连仍未做。
- 2026-10-22：补 P0-6 模板草案与 Local seed：`productWorkflowTemplates.ts` 四套（简报、依赖、社区、核对）保留模型/工具空引用供绑定；compiler `validate_structure` 4/4 通过；seed 生成器与 `supabase/seed.sql` 加入四套模板。新增 2 项草案单测；前端 171/1280、worker 220/12、typecheck/lint/build 通过；创建对话框直连、内容迁移、真实连接验收未做。
- 2026-10-22：补 P0-6 创建时直连绑定：模板 GET 支持单条定义，创建对话框读取定义、扫描未绑定项、选择环境/模型/工具后随 `useTemplate` 发送 `environmentRef+bindings`；未全部绑定或读取失败时禁止创建。content migration 仍待技术门；前端 171/1280、worker 220/12、typecheck/lint/build 通过。
- 2026-10-22：S1 本地技术探针成功（非正式验收）：run `92f68fae-246a-45af-aeb6-edf933c8347a`，HN Algolia 只读公开检索 + 隔离函数 + 真实 `deepseek-flash` 生成中文简报；发现 30s 节点超时不足，120s 后成功；四套产品模板草案同步调整节点/总超时。未走浏览器、未验证拒绝/失败/幂等/清理，不能据此签 S1 验收。
- 2026-10-22：按真实探针回灌产品模板：HTTP 工具输出为 `{"result": <json>}`，S1/S2/S3 改为写入 `result.hits`/`result.extract`/`result` 并由隔离函数整理；S1 第三来源暂用 npm（arXiv XML 适配待补）；四套模板复查 `validate_structure` 4/4，seed 重新生成；未做模板端到端真实运行。
- 2026-10-22：产品模板端到端 API 验收：`product-tech-brief` 用 HN/npm/DeepSeek 绑定创建（workflow `67a50f22…`）并运行成功（run `6035ca25…`）；伪造绑定 409；同幂等键同 run；公开 404 受控失败为 `HTTP_TOOL_FAILED`。S1 收窄为 HN+npm 两来源，Wikipedia Worker 超时/arXiv XML 适配仍缺；模型输出上限与提示长度调整后稳定在 120s 内。未走浏览器 UI、跨账号、清理或 Hosted。
- 2026-10-22：S1 浏览器 UI 路径成功（390×844）：在新建对话框选择 `product-tech-brief`，绑定 Local acceptance + HN/npm/DeepSeek，创建 workflow `f65535a3…`；run `fa281044…` 成功，HN/npm 工具均成功，最终输出带来源。几何测量顶栏/历史不与画布重叠；截图未落盘，768/1024/1440、控制台错误、跨账号与清理仍未覆盖。
- 2026-10-22：S1 视觉与隔离收尾：四视口 390/768/1024/1440 截图与几何通过，当前路径控制台 0 error；管理员读取/Run 学生 workflow 均 404、管理员库搜索 0 条；清理 12 个 `S1 …` 探针副本并禁用 wiki/失败测试连接。125% zoom、S1 第三来源与 Hosted 仍未覆盖。
- 2026-10-22：S1 三来源落地：Wikipedia mobile 在 Worker 超时、PyPI 完整 JSON 触发 `EVENT_TOO_LARGE`、arXiv 为 XML，改用 StackExchange `result.items` 作为第三来源；三来源产品模板 workflow `f526d1dc…`、run `27e5285f…` 成功。125% 以 1152×720 等效视口截图通过；三来源 UI 复跑与 Hosted 仍未做。
- 2026-10-22：S1 三来源浏览器 UI 复跑成功：新建对话框绑定 HN/StackExchange/npm/DeepSeek，workflow `ccdd6f3a…`、run `b3e7923a…` 成功，最终输出同时引用三来源；1440 截图存入验收证据。真实浏览器 zoom、Wikipedia/arXiv 适配、Hosted 仍未做。
- 2026-10-22：S2 依赖健康检查技术验收：PyPI 完整 JSON 触发事件过大，改用 pypistats 最近下载；API workflow `ffaf3615…`、run `f080c8ee…` 与 UI workflow `36153215…`、run `0c69c9b0…` 均成功，输出 3 条风险要点。S3–S4、Hosted、真实 zoom 仍未做。
- 2026-10-22：S3 社区问题分流技术验收：新增固定问题 HN 连接；API workflow `15bac484…`、run `8675b3e7…` 与 UI workflow `dfdf322c…`、run `8036cb00…` 均成功，输出归纳/分流/回应；首次输出截断后约束 200 字。S4、Hosted、真实 zoom 仍未做。
- 2026-10-22：S4 内容事实核对技术验收：API workflow `2bc165d7…`、run `ad8804a6…` 与 UI workflow `598b087e…`、run `261ef403…` 均成功；三条主张均标为缺少依据，输出保守发布版与补证模板。S1–S4 本地技术路径全部完成；Hosted、内容迁移与真实 zoom 仍未做。
- 2026-10-22：Hosted 只读审计完成（未部署/未迁移）：Supabase 迁移 117 条与本地 digest 完全一致、无 Local 用户、16 个历史模板但四产品模板缺失；Worker Production `dpl_Dy382…`、前端 Preview `dpl_9Sr9…` READY；最近 Run 成功，Sandbox 固定镜像 digest 已读回；前端 12/12 API 入口，Function 预算已满；项目 env/logs 因团队 scope 403 未读。下一步：部署新 Preview/Worker 后先认证 API 读回环境与四场景，再执行模板 INSERT 迁移。

- 2026-10-23：Hosted 首次部署与冒烟：推送 `5ecf96a` 后前端 Preview `dpl_8ZDWpav…` READY；Hosted 认证与环境目录可用，但 S1（3 工具 + 函数 + 模型）run `ccc24dd1…` 因 `SANDBOX_UNAVAILABLE` 失败，S4（仅模型）run `85c8e7a4…` 因 `NODE_EXECUTION_FAILED` 失败；已删除临时 Workflow/禁用临时连接，未执行模板内容迁移。Hosted 技术门仍阻塞。
- 2026-10-23：读取 Hosted daemon 日志确认 Sandbox `create` 阶段 `SandboxApiError`、watchdog `SANDBOX_REAP_FAILED`；重部署 Worker `dpl_CrYMiVk…`（commit `6a94040`）后最小 Sandbox smoke run `cd2fc9e2…` 成功，但 S4 模型仍 `NODE_EXECUTION_FAILED`。
- 2026-10-23：用户决定先以 Local 验收为准，不把 Hosted 门作为当前阻塞；Local 自建 DeepSeek 连接（加密凭据、连接测试、`origin=user`）与真实模型 run `e44be04a…` 成功，S1–S4 五项 Local run 均为 success；Hosted 临时数据已清理，模板内容迁移保持暂停。
- 2026-10-23：Local 最终验收签字：S1–S4 与自建 DeepSeek 五项 run 均 success；精确删除 10 个验收 Workflow、禁用 12 个测试连接，清理后 active connections=0、templates=24；Hosted 按用户决定暂缓、模板内容迁移未执行。见 [Local 最终验收](../../artifacts/archive/acceptance-process-20261023/WORKFLOW_LOCAL_FINAL_SIGNOFF_2026-10-23.md)。
- 2026-10-23：定位本地 S3 失败与连接 UX：用户看到的 `S3 community triage real run` 是旧验收副本 `ad7ffe1d…`，其 prompt 早于 200 字收敛，run `715d6072…` 因 `MODEL_OUTPUT_TRUNCATED` 失败；随后精确清理停用了它引用的 `hn_community_question` v1，故又显示工具不可用。MCP Everything 在受限环境中因 PATH/cache 缺失启动失败，discovery 500 是未捕获异常。已修复 stdio MCP 环境传递、结构化 `CONNECTOR_UNAVAILABLE`、Local cache 目录；删除 4 个旧失败副本，恢复 active 连接并新建 S3 修复副本 workflow `5577a678…`，run `5673df3b…` success。UI 移除连接版本面板/旧版本提示/函数版本管理，仅展示最新连接。更大的“URL + API Key 统一凭据、请求与函数写在节点”重构仍待做。
