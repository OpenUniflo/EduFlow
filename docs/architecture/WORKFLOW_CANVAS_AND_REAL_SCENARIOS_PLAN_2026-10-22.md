# 工作流画布完善与真实业务场景执行计划（2026-10-22）

## 0. 状态、决策与执行边界

- 状态：仅规划；只读核查 `feat/workflow` @ `8fbbd79`，未运行测试、构建、真实模型/工具、平台或数据库操作。
- 本次唯一新增文件为本文；没有读取秘密文件、私有账号页、环境文件或 dump。引用中出现凭据管理概念不代表已取得凭据。
- 继承 [上一轮基线](WORKFLOW_CANVAS_NEXT_ROUND_PLAN_2026-10-22.md)：P0 环境与能力先行，P1 画布体验随后，P2 按门槛处理；本文替代其中“决策待确认”的状态。
- **D1=A**：共享 Runtime Environment + 每用户连接；不做账号独立环境、provisioning UI。**D2=A**：节点显式更新连接版本并保存新修订；不引入逻辑连接身份迁移。**D3=A**：验收后移除测试管理员 ownerIds。
- **Hosted 已确认（2026-10-22）**：测试阶段直接部署 `edu-flow-workflow` 与 Preview，不设维护窗口；不做费用核算，也不设 ¥5 上限。
- required/optional 已按 [输入优化计划 §8](WORKFLOW_INPUT_OBJECT_OPTIMIZATION_PLAN.md#8-已冻结决策2026-10-21) 的 A 冻结并实现，不再提请决定；缺失与空文本、false、0 的区别继续保留。
- 后续实施：单写作者串行，热点文件不并行；无新增 Vercel Function、无数据库迁移。若 D2 改 C，停止本计划并另行评审，不把迁移夹入执行。
- 只用一个 V2 Definition、API Repository、LangGraph Worker、React Flow editor；不引入 Legacy，不把 Live 失败降级成预览成功。
- `AGENTS.md:559–571,587`、`README.md:18,124–132`：历史只读，展示不重排画布；课程身份留在应用/API 边界，成功 Run 不自动完成 Assignment、不授予 mastery；不替代 Global Assistant。
- 本文的函数名若标“拟新增”，是实施设计而非现有能力；未来命令、门禁和预期结果均不是本次执行记录。

## 1. 能力与现状核查

### 1.1 证据读法与 Hosted 边界

路径均相对仓库根，行号固定于本次 HEAD。表中 W=`services/workflow/src/eduflow_workflow/`，F=`src/features/workflow/`。
“代码支持”只证明实现入口存在；“Hosted 配置”必须由未来普通认证目录读回并实际 Run 证明，不能拿开发助手的 MCP 权限冒充 Worker 的工具权限。
[最终验收包 §3](../acceptance/WORKFLOW_FINAL_ACCEPTANCE_PACKET_2026-10-22.md#3-残余风险--未覆盖) 只证明此前 Hosted 入口→结束；未证明真实模型/工具。
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
| T1 | DeepSeek | 文档记载 Hosted 已配置；实际 provider/model/usage 待读回 | 总结、分类、审校 |
| T2 | Hacker News Algolia | 公开搜索 API，无密钥；需验证路径模板与速率 | S1/S3 检索 |
| T3 | Wikipedia REST | 公开 API，无密钥 | 背景/事实 |
| T4 | arXiv API | 公开 API，无密钥 | 论文检索 |
| T5 | npm registry / PyPI JSON | 官方公开 API，无密钥 | S2 元数据 |
| T6 | Stack Exchange API | 公开 API，无密钥但配额有限 | S3 备选 |
| T7 | DeepWiki | Hosted 已记录 connector；索引范围待核实 | S1/S3 可选 |
| T8 | GitHub 只读 | 文档记载工具；仅 S2 可选 | 仓库元数据 |
| T9 | 文件产物 | 函数节点生成 Markdown/JSON/CSV | 交付物 |
| T10 | 外部写 | **本轮默认关闭**；仅在你指定一次性测试仓库后授权 | 不做 |
| T11 | 通用网页搜索 | Tavily/Brave/Serper 等需 Key；可选后续 | 不做 |

> 当前 HTTP 连接 UI 只生成空对象 Schema；路径模板可写 `?query={query}`。R1 先用 T2 最小请求验证“连接→节点可见→真实调用”；若模型工具参数表达不了，补 Schema 字段或改用路径式 API。不能假装能跑。

统一合同：对象 `additionalProperties:false`；输入有界；来源内容是不可信数据；State 至少 `caseKey,sourceVersion,evidence[],errors[],review,status`；并行只 append 独立结果，汇总按稳定业务键去重排序；`review={approved:boolean,comment:string}` 按冻结语义；`output={caseKey,status,report,evidenceRefs,limitations}`。模型只产出候选，确定性函数校验来源/枚举；不假设模型有强制 JSON Schema 输出。

公开检索的验收快照：每次运行记录**查询词 + 时间 + 前 N 条结果（标题/URL/短摘录）**；断言“引用存在且来自本次检索”，不要求两次结果逐字相同。结果变化、限流、来源不可达必须显式写入 `limitations`，不能补造。

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

- 成功断言：三路各一份结果；每条结论能对上本次检索的 URL/时间；时间窗正确；join 前不显示完整简报；批准后内容与所审版本一致。
- 失败断言：429/超时最多两次并显式降级；任何一路未完成不显示“完整成功”；无结果写“未检索到”，不能补造；来源内容里的指令不执行。
- 审核断言：拒绝保留草稿；刷新后仍能定位；缺 citation 禁批准；重复 resume 返回原回执。
- 幂等/重跑：同 caseKey 只一个 Run；新 Run 重新检索并记录新快照；原历史只读。
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

- 成功断言：每包恰一份结果；包名/版本/日期与 API 一致；矩阵覆盖全部约束；不存在遗漏包的完整报告。
- 失败断言：404/429 明确 unknown 或跳过；不伪造星数/下载量；一个包失败不静默变成 zero；无完整矩阵不宣称完成。
- 审核断言：回应一项刷新，其他仍 waiting；全部审核才可完成；拒绝备注保留；不同包不串审。
- 幂等/重跑：同包同版本去重；重复响应不产生重复行；新 Run 重新取数并记录快照。
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

- 成功断言：分类/优先级是建议；引用真实问题/文档；toolCalls 均消费且消息匹配；未知版本列入待补资料。
- 失败断言：无搜索结果不是“无此问题”；auth/404 不重试；超过回合显式终止；不出现无界模型循环。
- 审核断言：审批前可见原问题与草稿；拒绝不产生客户消息；多次工具调用按调用序号对应参数/结果。
- 幂等/重跑：重试恢复不重复消费同一响应；新 Run 若问题更新时间变化需重新审核，不沿用旧批准。
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

- 成功断言：每个保留声明有对应公开来源；批准内容等于人工所审文本；新 Thread 读回版本匹配。
- 失败断言：无来源声明被标记；不静默批准；CAS 冲突不覆盖；第二轮仍有问题只能拒绝/结束；记忆节点不配置 retry/handler 绕过事务保护。
- 审核断言：退回后旧批准不复用；拒绝不写 Store；缺来源禁批准；最多两轮。
- 幂等/重跑：重复 resume 不增加保存次数；新 Thread 读已确认版本；历史分支不回滚 Store，新写仍做当下 CAS。
- UI 演示：填公开/脱敏文案→看声明与来源→退回修改→第二轮→批准保存→新 Thread 读回→拒绝一轮确认版本未变。
- 耗时/调用规模：5–12 分钟；模型 2–4 次、工具 2–5 次；输入 8k–25k、输出 2k–7k token；按实际 Run 记录，不单独核算费用。

### 2.6 运行记录与停止条件（不做费用核算）

**不设 ¥5 上限、不做价格表/费用换算。** 正常几轮的花费相对验收价值可以忽略；单次 Run 已由 `maxOutputTokens`、`maxToolCalls`、`maxNodeExecutions`、`timeoutMs` 等策略上限约束，不需要再叠一层金额预算。

- **运行清单**：每次 Run 记录 `{runId, scenario, env, revision, status, startedAt, finishedAt}`，作为验收证据和复现索引；不计算金额，不维护 token 价格表。
- **token usage**：Step 里仍有 `usage`，只作为“模型实际调用过、规模正常”的观测；需要时在证据里写 token 数，不折算费用。
- **停止条件**：同一失败连续出现 2 次，先停下定位，不静默重跑；单次 Run 若卡住/循环，按现有取消与超时机制终止；不把“多跑几次碰成功”当验收。
- **费用可见性**：如果账户 owner 想看花费，以供应商控制台账单为准；本项目不做计费系统，也不把估算写成已结算。
- **成功定义**：Run 完成、无报错只是必要条件；通过标准是 §4.2 的场景断言（真实来源、引用、审核门禁、失败路径、无外部写），不是“跑绿了”。

## 3. 文件级实施清单（后续获准才执行）

下表路径 F/W 同 §1；各项均有独立提交/候选冻结点。测试留在现有 Feature/worker 测试目录，不放 `api/` 顶层。
所有新状态保持 loading/error/empty 独立，HTTP/MCP 发现也不能被环境列表成功掩盖；结果落地前核对仍是同一个 owner/env/请求代次。

| 项目/顺序 | 文件、函数与状态改动 | 测试与场景门 | 回滚 |
| --- | --- | --- | --- |
| P0-1，0.5–1日 | F `application/v2/useWorkflowV2Controller.ts` 独立 environment load/error 状态；拟增 `environmentAvailability.ts` 分类纯函数；`LiveWorkflowEditor.tsx` 展示本人 UUID、复制、重载；CSS 共享顶部插槽 | 分类/失败重载/无环境仍可编辑保存；390/768/1024 几何、键盘复制；S1 启动前覆盖 | 回退 UI 提交但保留准确错误，不扩大 owner 权限 |
| P0-2a，0.5–1日 | controller 拟增 `refreshTools(envRef)` 与统一 `refreshEnvironmentResources`；取消过期响应；Live onSaved、EnvironmentPanel onDiscover 串行发现后刷新 | controller 测试保存 HTTP 即出现、MCP discovery 后出现、切环境竞态与失败重试；S1/S2 无页面刷新 | 回退接线，用显式刷新资源按钮暂替；不得假称工具已更新 |
| P0-2b，0.5–1日 | W `registry.py` public_environment/public_tools、`extensions.py` 补结构化 origin/connectionRef/version/availability；F `domain/v2/types.ts`、`repository/v2/WorkflowApiV2.ts` 接收；EnvironmentPanel/ProcessingFields/WorkflowConnections 展示“我的连接·vN”与内置来源 | 投影仅暴露安全字段；同名不同连接可区分、同连接最新可用优先，旧已选版本仍显示；S1/S2 | 可选元数据兼容旧前端；无元数据明确来源待确认，不误标执行端 |
| P0-2c，1–1.5日 | F 拟增 domain `connectionReferences.ts`：递归扫描子图 providerRef/toolRef/allowedToolRefs；生成旧→新提案；重取工具 contractDigest；ProcessingFields/Live 做预览、确认、保存新修订；W compiler 现有工具诊断只有 nodeId、无 pointer，需补 pointer/graphPath 或由前端按 nodeId 定位；`api/_lib/workflowV2.ts` 仅透传，不新增 Function | 旧版仍可用也提示可更新，停用旧版阻断；映射歧义/Schema 改变不自动绑定；子图/dispatch/白名单覆盖；S1–S4 各取一节点，S3 子图必测 | 未确认零修改；已保存通过新修订恢复原引用；旧连接仍须有效，禁改历史 Run/冻结 Thread |
| P0-3，0.5–1日+等待 | 后续新增明确开关的场景验证脚本置 `scripts/workflow/checks/`，复用 `verify-agent-scenarios.mjs` 计数/运行清单思路；不默认调用；文档记录真实环境与 Run | Local S1 先成功，再四场景，最后 Hosted 模型+公开检索/DeepWiki 真实调用与一条失败证据 | 关停自建 Thread、停用临时连接；保留失败证据，不重放未知外部效果 |
| P0-4，0.5日 | 后续更新 Hosted runbook：共享环境授权责任人、脱敏结构快照、CI 发布、D3 清理；不恢复归档裸部署脚本 | 部署前后自检、兼容候选、owner 移除前后读回；授权撤销不能继续原 Thread；保留账号不受影响 | 仅授权后恢复原 owner 清单；不恢复秘密到文档、不回滚共享数据库 |
| P1 输入，0.5日 | `LiveWorkflowEditor.tsx:509` 移除可编辑入口；RunInputSnapshot/RunPreparationDialog 保留只读摘要及顶部运行唯一入口 | 调用方输入仍只读；required/optional 与历史重跑不回归；S1/S4 | 回退局部展示提交，不能改变冻结输入语义 |
| P1 布局，1–2日 | `WorkflowGraph.tsx`/Live/CSS 统一顶部、palette、inspector、底部工具插槽；互斥与滚动；禁止由面板开关触发布局/fit | S3 多等待+历史条+子图；S4 长审核；视口矩阵中按钮可点击、节点坐标/视口稳定 | 回退布局提交；阻塞窄屏功能保持明确限制，不签通过 |
| P1 键盘，1–2日 | WorkflowGraph、ExecutionBubbles、SubgraphInvocationHistory、WorkflowDialog 的选择/移动/Tab/焦点返回；运行状态 aria-live | S2 调用选择、S3 部分回应全键盘可用；历史只读时禁移动；焦点不被轮询夺走 | 分批回退快捷键；保留已验证可访问名称与焦点环 |
| P1 归属/历史，0.5–1日 | `executionPresentation.ts` 共用 invocation/attempt/输入摘要；ExecutionDetails/RunOutput/SessionHistoryWorkspace 展示当前分支与其他分支只读范围 | S2 多工具回合、S3 同名并发、S4 返工；查看历史不替换草稿、不改坐标 | 回退展示层；不得移除身份字段或把 attempt 当独立任务 |
| P2 条件纳入，0.5–1日 | WorkflowConnections、connectionDraft、EnvironmentPanel：统一测试失败类别/发现过期/凭据状态；仅复用服务器可知状态，不暴露秘密；缺诊断先报差距 | MCP 合同失效、缺凭据、轮换后准备失效；S1/S3；真实生产模型等待和完整矩阵纳入最终门 | 诊断不全显示待核实；不伪造“已配/测试通过” |
| P2 保留不做 | provisioning、required/optional B、账号密码轮换、课程任务关联、独立可复用子图资产、全量 V2 改名 | 不影响本轮四场景；若成为必需依赖，停该范围并重新评审 | 无实现即无回滚；禁止偷偷扩范围 |

D2 特别门：新增版本不改旧定义；显式确认前展示所有受影响节点/子图路径、字段与合同差异；确认仅改当前编辑草稿，再走验证→保存新修订。
新旧工具不是同一合同或工具名映射不唯一时要求人工重选；MCP 工具通过结构化 connector 身份与发现合同关联，不能只按 ref 字符串替换。
正在执行、等待 Thread、历史修订保留原 pin；权限/环境变更仍按既有兼容检查拒绝或明确恢复，不能把“更新节点”伪装成热修复旧 Run。
后端若无法安全提供元数据，先形成差距，不从显示文案推断 owner/version，也不借机加数据库迁移。

## 4. 分层验收与证据规则

### 4.1 Local → Hosted，四段验收

1. 实施者冻结候选：记录 commit、锁文件、变更清单；只在后续授权执行中跑相关单测/worker 用例，收尾按基线跑 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:workflow:worker`。
2. 技术/自动视觉自验：Local 真实 Worker + 普通认证 API + 普通 UI；先 S1 真工具成功，再 S2–S4；可控故障证明边界，必须标 controlled，不能代替真实远端成功证据。
3. fresh agent 模拟无背景预验收：只给业务目标、入口、非秘密测试输入和通过标准，不给开发排障步骤/实现解释；普通 UI 操作。允许后续专门启动只读验收 agent，单写作者继续独占代码。
4. 产品负责人最终验收：看完整证据索引并亲自走关键路径，签通过/有条件通过/不通过；fresh agent 不冒充无背景人类，记录真实人类缺席风险。

Hosted 进入前：先只读核对目标前后端 deployment、Supabase 项目/迁移历史、执行器 digest、环境/工具目录修订、/ready、Worker/watchdog/Sandbox、实际生成 Function 数每部署≤12。
本轮预期无迁移：若 Hosted 已缺仓库既有迁移或与候选不兼容，标阻塞并另列维护项，不能擅自补库或重置。READY 前端不能代替后端就绪。
后台 Daemons 的 Production 平台约束与产品 production 提升分开说明；若新 Worker 必须更新后台 Production，按已确认的直接部署执行，但仍在部署前后核对后台 Production 状态，不能称“只是 Preview”规避风险。
Hosted 先普通认证 API 冒烟再 UI，复跑四套真实场景；保留模型最小成功、只读工具最小成功、一条可读失败记录，不用入口→结束或旧证据充数。
Hosted 按 2026-10-22 用户确认：测试阶段**直接部署** `edu-flow-workflow` 与 Preview 前端，不设正式维护窗口；仍执行部署前后 `/ready`、Function 数、环境修订、Worker 状态检查，不 reset 共享库、不删除其他用户/示例数据；若发现其他用户活跃运行，暂停并报告。主站 production 前端不自动提升；后台 Production 更新按用户授权执行。

### 4.2 通过与失败阈值

| 场景/横切项 | 必须通过 | 任一即失败 |
| --- | --- | --- |
| S1 | 真公开检索+实模；三路全到；每条结论有本次检索来源；批准/拒绝各覆盖；无外部写 | 编造来源、缺支路报告成功、审后版本漂移 |
| S2 | 2–4 个包各一份结果；版本/日期/维护状态与 registry API 一致；矩阵覆盖约束 | 伪造下载量/星数、遗漏包却报告完整、跨包串审 |
| S3 | 真实公开问题；至少一个真实工具回合；白名单与回合上限生效；回复有引用 | 未调用却声称查询、工具消息错配、无界循环、社区被写入 |
| S4 | 一次退回→再审→批准；新 Thread 读回；拒绝不增版本；CAS 冲突可读 | 未审稿持久为已批准、绕过冲突、分支回滚 Store |
| 连接/权限 | 新工具无需刷新、轮换提案可定位/确认、新修订可审计、撤权生效 | 跨 owner 可见、秘密泄露、自动改冻结历史/Thread |
| UI/技术 | 类型/构建及相关测试门全过；无新增 console error；关键控件可见可点 | 关键审核/运行控件遮挡、无法恢复、保存丢失、未知提交被重发 |

语义断言基于真实来源与状态，不按模型句子逐字比较；证据不足不得产品签通过。各场景成功/失败/拒绝/重复提交各至少一个明确记录。
视口：1280×800、1440×900、1920×1080 按原冻结基线阻塞；本轮触碰的 1024×768、768×1024、390×844 插槽/审核功能也升级为阻塞，超出变更面记风险。
Chrome 全路径，Safari/Firefox 冒烟；截图+DOM 几何+elementFromPoint 命中+Tab/Escape 焦点；侧栏/历史/等待打开关闭前后节点坐标与视口不变。
每个视口检查无环境三态、连接列表、运行输入、长审核、S3 多任务、子图与历史条共存；截图工具超时重采，不能仅靠文本宣称视觉通过。

### 4.3 证据、失败循环与清理

- 后续证据根：`artifacts/workflow/acceptance/evidence/canvas-real-20261022/<round>/<local|hosted>/<S1..S4>/<caseId>/`；索引在 `docs/acceptance/`，本次不创建这些目录或文件。
- 命名：`manifest.json`、`assertions.json`、`calls.redacted.json`、`review-<n>.json`、`ui-<viewport>-<step>.png`、`cleanup.json`；失败保留 `failure-<code>-<attempt>.json`，复验证据另建 caseId。
- manifest：commit/部署/执行器/环境修订/工具合同、workflow/revision/run/thread/step/task/namespace/checkpoint、开始结束时间、客户端、caseKey 与运行身份；未知项明确 null+原因。
- 真工具证据：实际工具名/ref/版本、目标公开 URL/查询词/时间/SHA（如有）、外部状态码、耗时/attempt、结果短摘要/散列与 Step 关联；模型 provider/model、流片段时序、usage。token usage 只作观测，不折算费用或写成已结算。
- 禁止证据包含 Authorization/Cookie、真实凭据、完整 State/客户正文、私有仓库源码或网络原始 HAR；公开索引使用脱敏身份，完整 UUID 如运维必要只在授权受限证据中留存。截图先检查账号/连接字段。
- 受控 429/timeout/断流用于分类与重试边界，另标 controlled；不篡改真实凭据制造故障，不用本地 echo 替代真工具成功。真远端失败有则如实记录，无则不虚构。
- 失败循环：原失败→定位原因→单写作者修复→相关门复验→新 fresh 会话重走失败路径及邻接路径→产品再审；不覆盖旧失败证据。恢复未知提交先查原幂等回执，禁止重发。
- 同一阻塞两轮无进展即给产品负责人差距/选项/成本；涉及秘密泄露、跨 owner、unknown 外部效果立即停受影响路径并升级；同一失败连续两次或出现异常循环立即停止排查。不得降门槛换通过。
- 清理清单只列自建对象精确 ID、owner、用途、保留期和清理回执；先终结 waiting/active，再用支持的认证接口清理自建 workflow/thread/记忆/连接。无删除接口则标待人工运维，不直接广删 SQL。
- D3 在产品验收与证据收齐后实施：管理员授权维护、保存受控 owner 清单、移除测试管理员、按 runbook 发布读回；验证该账号环境不可用、保留 owner 正常。UUID 清单不放公开文档。
- 保留正常用户与既有四个 Hosted 示例；不按名字模糊删除。未知外部写先核对目标回执/计数，取消不代表撤销，清理也不自动撤销业务操作。

### 4.4 必须显式授权的动作

| 动作 | 授权应包含 | 未授权默认 |
| --- | --- | --- |
| 真实外部写 | 目标仓库/对象、操作/内容、账号、幂等/回执、回撤方式 | 只产草稿；人工审核按钮不替代用户给工程执行者的授权 |
| 真实调用 | 使用已授权的模型与公开工具；按实际 Run 记录 | 不发起未授权付费工具；同一失败两次先排查 |
| 真实凭据 | 用户在受控连接界面/服务端秘密管理中配置及许可范围 | 不请求粘贴到聊天，不读私有文件，不扩大 token scope |
| ownerIds | 执行账号、目标环境、增删集合、回退责任人 | D3 决策已定；具体变更执行须有目标与运维授权，不能扩大授权 |
| production 提升/后台更新 | 项目、候选、兼容回退与操作员 | 测试阶段可直接部署 workflow 服务 + Preview（2026-10-22 已确认）；主站 production 不自动提升；后台 Production 更新按授权执行 |

## 5. 下一轮路线与可停点

| Round / 估时 | 目标与交付物 | 门禁/依赖 | 风险、可停止条件 |
| --- | --- | --- | --- |
| R1，3–5日 | P0-1、P0-2；连接诊断/刷新/轮换；**Local S1 首个真实公开检索（HN/arXiv/Wikipedia）+DeepSeek**，版本提案与最小成功/失败证据 | 模型/公开工具凭据；按实际 Run 记录；目录映射落实；相关测试与局部视觉，S1 成功/拒绝/失败/幂等通过 | 目录缺操作/凭据未就绪停在候选；不扩四场景；可交付连接闭环后等待真实验收 |
| R2，3–5日 | Local S2–S4，显式 demo seed/普通 API 创建；P1 画布与必要 P2；技术/视觉与 fresh 预验收 | R1 真工具通过；四套合同、运行清单、清理清单；类型/全量基线与构建按 §4 执行 | Send 屏障、循环/消息、CAS 为风险；缺业务工具先停该场景，不改成 echo；可停在 Local 完整套件 |
| R3，1–3日 | Hosted 对账与直接部署；P0-3/4，四场景真实调用、失败与跨视口证据 | R2 通过；真实环境、schema、digest、Function 产物≤12；部署前后自检通过 | 平台限流/不兼容/部署异常即停；不重置共享库；可停在已验证 Preview，不提升主生产 |
| R4，1–2日+返工 | fresh Hosted 预验收→产品负责人最终验收；D3 移除授权、精确清理、签署残余风险 | 四套所有必过项、0 阻塞视觉、运行清单/清理清单齐；产品签署与运维授权 | 失败按 §4 循环；移除 owner 后再读回；可接受“Local 通过/Hosted 阻塞”明确结论，不假签完成 |

总粗估 8–15 人日，另计外部授权与失败返工；不承诺供应商延迟。每轮独立冻结候选与可回滚提交，单作者串行修改 Live/controller/registry/API 等热点。
回退保留历史、Run、检查点；应用回退不等于数据库回退；后端改动可能改变 executorDigest，升级前先验证旧 waiting 恢复资格，无兼容候选就明确拒绝继续并保留旧身份。

## 6. 待用户决策 / 工程待核实（不重开 D1–D3）

| # | 类型 | 事项与建议默认值 |
| --- | --- | --- |
| 1 | 必须你决定 | 真实数据目标：公开检索主题、包名或待审文案；建议公开数据，避免私有内容；S1 先选你熟悉的主题。 |
| 2 | 必须你决定 | 外部写范围：建议本轮全部只读，交付草稿；评论/Release/CMS/工单写留下一轮逐项授权。 |
| 3 | 已确认 | 不做费用核算，不设 ¥5 上限；按实际 Run 记录，单次 Run 受现有策略上限约束（§2.6）。 |
| 4 | 已确认 | Hosted：测试阶段直接部署 workflow 服务 + Preview，不设维护窗口；主站 production 不自动提升。 |
| 5 | 工程待核实 | 当前 Hosted 项目/部署、schema/digest/实际 Function 数与 ready：默认未核实不进 Hosted。 |
| 6 | 工程待核实 | 公开检索 API/DeepWiki/GitHub 的实际目录、Schema、限流、副作用与凭据可用：逐项读回，缺项出差距单并决定是否新增连接。 |
| 7 | 工程待核实 | 连接元数据、MCP 发现版本映射、前后端兼容及旧 Thread 行为：默认只扩现有投影，不迁移；歧义要求人工重选。 |
| 8 | 工程待核实 | 公开 API 限流、运行上限及清理 API：默认并发≤2、重试≤2、四场景有界；未知限流/清理权限阻塞对应动作。 |

## 7. 本次规划核查记录

只执行本地只读文件/代码检索、分支与 HEAD 查询，并新建本文；未运行任何测试/build/场景脚本，未联网、未访问秘密、未创建验收数据、未部署。
旧文档里的测试数量、部署 READY、实模记录均是历史材料，不是本次验证结论。后续执行者必须逐条形成自己的证据和签署。

## 8. 复核与变更记录

- 2026-10-22：Codex 只读子智能体起草；Lead 复核后补充场景覆盖矩阵与场景落地方式，更正连接轮换表述（旧版本在停用/移除前仍可用），并把工具诊断 pointer 缺口改为“复用 nodeId 或补 pointer”。未实施、未提交、未部署。
- 2026-10-22：按用户反馈改为公开检索为主（HN/arXiv/Wikipedia/npm/PyPI/StackExchange，GitHub 仅 S2 可选）；Hosted 改为测试阶段直接部署、不设维护窗口。
- 2026-10-22：按用户反馈取消费用核算与 ¥5 上限；不维护价格表/金额账本，只保留运行清单与“同一失败两次先停查”的规则。
