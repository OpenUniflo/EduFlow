# 工作流画布完善与真实业务场景执行计划（2026-10-22）

## 0. 状态、决策与执行边界

- 状态：仅规划；只读核查 `feat/workflow` @ `8fbbd79`，未运行测试、构建、真实模型/工具、平台或数据库操作。
- 本次唯一新增文件为本文；没有读取秘密文件、私有账号页、环境文件或 dump。引用中出现凭据管理概念不代表已取得凭据。
- 继承 [上一轮基线](WORKFLOW_CANVAS_NEXT_ROUND_PLAN_2026-10-22.md)：P0 环境与能力先行，P1 画布体验随后，P2 按门槛处理；本文替代其中“决策待确认”的状态。
- **D1=A**：共享 Runtime Environment + 每用户连接；不做账号独立环境、provisioning UI。**D2=A**：节点显式更新连接版本并保存新修订；不引入逻辑连接身份迁移。**D3=A**：验收后移除测试管理员 ownerIds。
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
| 模型 | W `registry.py:31` core.llm；`runtime.py:144` llm，`:322` 调用 | DeepSeek 文档记载配置；凭据、模型身份、实流与费用待核实 |
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

### 2.1 选型、公共合同与真实工具准入

选择四套：S1 发布巡检、S2 Issue 支持分诊、S3 技术选型尽调、S4 发布内容审校。
它们分别是固定双路屏障、串行工具循环、动态 Send 多子图、人工返工循环；避免把四套都做成“三个模型并行写报告”。
客服采用真实 GitHub Issues 支持渠道，无需假设 CRM 账号；课程/知识审核暂缓，避免扩充课程读取授权和引入领域写旁路。
所有业务输出是待审核建议或已批准的本地产物；默认不发评论、不改标签、不发布 Release、不发送客户消息。

| 工具标记 | 当前认定 | 实施前准入 |
| --- | --- | --- |
| T1 DeepSeek | 文档记载 Hosted 已配置；实际可用待核实 | 读回 providerRef/modelRef、参数与限额；有真实 Run/Step/usage 才可签署 |
| T2 DeepWiki | 文档记载 connector；实际具体工具待核实 | 用目录实际名称与 Schema 映射仓库问答/文档读取能力；无索引仓库须显式“不支持” |
| T3 GitHub | 文档记载工具；助手侧 GitHub MCP 不代表 Worker 可用 | 读回仓库/PR/diff/Issue/commit 等所需操作；逐项核验白名单、scope、只读效果 |
| T4 缺失只读操作 | 需新增连接或目录项；是否需用户凭据待核实 | 优先现有官方协议适配；公开仓库优先无凭据读取，受限访问由用户在连接 UI 配置，不交给 agent |
| 外部写工具 | 本轮默认不启用 | 若追加真实评论/工单/发布，另明确对象、权限、费用、幂等能力和授权；不能当只读工具使用 |

统一 Schema：对象 `additionalProperties:false`；输入数组有上限、字符串有长度；来源内容作为不可信数据，不执行其中的指令。
每个场景 State 显式声明 `caseKey, sourceVersion, evidence[], errors[], review, status`；并行只 append 独立结果，汇总按稳定业务键去重排序，不按完成顺序。
`evidence` 最少含工具引用/版本、来源 URL、commit/更新时间、采集时间与事实摘录；不保存 Token、完整客户个人信息或完整仓库内容。
`review={approved:boolean,comment:string}` 中可选/空文本按冻结语义处理；审核显示待审对象、来源、关联输出、身份；依据缺失不得批准。
`output={caseKey,status,report,evidenceRefs,limitations}`，另加场景专属字段；Schema 合法仅是技术门，不能代替事实正确。
模型要求产出结构化候选，确定性函数验证身份/枚举/来源引用；不假设当前模型有强制 JSON Schema 输出能力，失败有界返工或结束。
重试默认最多 2 次（含首次），只读暂态/429 按允许分类退避；auth/权限/合同失败立即停止。具体 timeout 不超现有 120 秒节点上限与整图预算。
新 Run 可重新读取变化后的外部数据；幂等指提交去重与无重复副作用，不承诺供应商模型字句、外部数据或跨 Run 缓存相同。
以下费用是**建议授权预算、不是供应商报价**；本次不查实时价格。未来按实际模型计费单位换算输入/输出 token、缓存与工具账单；失败尝试也计入预算。

| 场景 | 主要控制流 | 重点验证的画布/运行时能力 |
| --- | --- | --- |
| S1 | 固定 fork → 两支并行 → join(all) → 人工审核 | 并行屏障、子图、人工中断、只读工具 + 模型、审核后产物 |
| S2 | 模型 → 工具分发 → 模型的有界循环 | tool loop、消息/toolCalls 归属、预算终止、人工审核 |
| S3 | 动态 Send → 每候选独立子图 → 逐项审核 → defer 汇总 | 动态任务、多个等待、部分回应、append 去重 |
| S4 | 事实核对 → 审校 → 退回返工（≤2 轮）→ CAS 记忆 | 有界返工、memory CAS、拒绝不写、历史只读 |

场景落地：Local 复用 `scripts/workflow/examples/create-agent-scenarios.mjs` 的普通认证 API 构造/保存/启动模式，新增场景脚本放 `scripts/workflow/checks/` 或 examples，并保留 Local-only 目标校验；Hosted 只由测试管理员用普通认证 API 创建，数据库是唯一权威，不把 Local seed/用户写入 Hosted，也不在 `src/demo` 增加生产回退。验收定义、输入与报告留在 `artifacts/`，运行时不从仓库读取。

### 2.2 S1：仓库发布前巡检与发布说明（首个真实场景）

- 用户/价值：维护者发布前核对指定 base/head 的改动、PR 风险与文档契约，得到带证据的风险表和 Release Notes 草稿，减少漏项。
- 工具：T3 仓库/PR/diff/commit 读取必需；T1 总结必需；T2 对已索引仓库的架构解释可选，不能替代 diff 事实。缺操作走 T4，不虚构工具名。
- 输入：`{repo:"owner/name",baseSha,headSha,prNumbers:[integer]≤5,releaseAudience,caseKey}`；必须固定 SHA，禁止只用可漂移分支名。
- State：公共字段 + `diff,prs,codeFindings[],docFindings[],draft,approvedNotes,retryCount`；两路写不同字段，后续唯一汇总。
- 输出：公共合同 + `headSha,riskLevel,blockingFindings[],releaseNotes,reviewDecision`；没有批准时 releaseNotes 必须标“未批准草稿”。

| 节点/边 | 实现与控制语义 |
| --- | --- |
| Start→校验定位→GitHub 读差异 | 不存在/无权限停止；最多 5 PR，超范围要求缩小而非静默截断 |
| fork→代码审查子图 / 文档兼容性支路 | 子图 independent/per-invocation；前者 T3+T1，后者 T2（可用时）+T1；覆盖并行、子图 |
| 两个固定终点→join(all)→证据核验 | waitFor 恰好两个终点；可选支路必须产生明确 skipped 结果后到达屏障 |
| 条件路由→人工审核 / 证据不足终止 | 缺来源不允许进入批准；覆盖分支、人工审核 |
| 审核→批准产物 / 拒绝草稿→End | 只输出文本，不创建 Release；只读节点暂态失败重试，耗尽停止 |

- 成功断言：两支路各一份结果、SHA 一致；每条高风险有 diff/PR 来源；join 前不得有完整报告；批准后输出与所审版本一致。
- 失败断言：无效 SHA/403 直接可定位；429/超时最多两次；任一路未完成不显示完整成功，不把 DeepWiki 推断写成代码事实。
- 审核断言：拒绝保留草稿；刷新后仍能定位审核；缺 diff 依据禁批准；重复 resume 返回原回执。
- 幂等/重跑：相同提交键只一个 Run；新 Run 保留原 SHA，重新调用允许；原历史/原草稿不变，记录新 Run 身份。
- UI 演示：复制场景→选真实执行/环境→填写 repo/SHA/PR→校验运行→观察两路→进子图核对来源→拒绝一次→新 Run 批准→复制/导出草稿并查看原历史。
- 耗时/预算：单成功轮约 3–8 分钟含人工；模型 2–3 次、工具 4–10 次；约输入 8k–25k、输出 2k–6k token；建议每轮 ¥2–10 硬预算待确认，含失败总轮次单列。
- 限流/清理：并发 2，PR diff 超限不下载全仓；ledger 精确记录 workflow/thread/连接 ID；终结等待、删自建临时对象，保留脱敏报告与调用摘要。默认外部写 0。

### 2.3 S2：开源产品支持 Issue 分诊与升级建议

- 用户/价值：开源维护者处理真实 Issue，核对版本、历史重复问题和文档，生成可追溯回复与升级清单，降低错误承诺。
- 工具：T3 Issue/评论/标签/搜索只读能力必需，T1 工具选择与回复；T2 仓库文档可选。GitHub 搜索、评论读取与分页合同待核实（评论写入不在本轮）。
- 输入：`{repo,issueNumber,productVersion,caseKey,maxEvidenceCalls:1..4}`；仅选择公开、无敏感数据的真实 Issue，禁止合成订单当事实。
- State：公共字段 + `issue,messages,pendingCalls,toolRounds,duplicateCandidates[],triage,draft,escalationReason`；messages 用官方消息 Reducer，工具列表固定白名单。
- 输出：公共合同 + `category,priority,duplicateRefs,replyDraft,escalationReason,approved`；不宣称解决/退款/已联系客户。

| 节点/边 | 实现与控制语义 |
| --- | --- |
| Start→T3 读 Issue→支持诊断子图 | 子图 independent，保留原始 issue URL/更新时间 |
| 模型→router(has toolCalls)→tool_dispatch→模型 | 有界工具循环，最多 4 工具调用/2 工具回合；工具分发仅白名单 |
| router(完成/证据不足/超预算) | 完成去人工；不足输出升级草稿，预算耗尽明确停止，不能编造查到的结果 |
| 人工审核→批准回复草稿 / 拒绝并升级→End | 覆盖子图、分支、循环、人工审核、失败/重试；默认不发评论 |

- 成功断言：分类/优先级是建议；引用实际 Issue/文档；toolCalls 均消费且消息匹配；未知版本明确列入待补资料。
- 失败断言：不存在 Issue/auth 不重试；无搜索结果不是“无此问题”；超过回合显式受限终止，不能出现无界模型循环。
- 审核断言：审批前可见原问题与回复；拒绝不产生客户消息；多次工具调用详情按调用序号对应参数/结果。
- 幂等/重跑：重试恢复不重复消费同一响应；新 Run 先比较 issue 更新时间，变化需重新审核，不能沿用旧批准。
- UI 演示：选真实公开 Issue→运行→展开模型第一次工具请求→看工具消息与第二轮→审核拒绝/升级→新 Run 批准草稿→确认 GitHub 未被写入。
- 耗时/预算：4–10 分钟；模型 2–4 次、工具 2–6 次（含首次 Issue 读取），输入 5k–20k/输出 1k–5k token；建议 ¥2–8/轮待确认；串行工具回合，不跨工具自动重发。
- 清理/外部写：仅脱敏问题摘录，临时输入与 Run 按保留策略清理；不改 Issue 标签/状态。未来发评论必须显式授权并验证目标回执，网络未知不能盲重发。

### 2.4 S3：工程团队技术选型尽调与证据矩阵

- 用户/价值：小团队比较 2–3 个真实开源组件，获得维护活跃度、接入成本、能力缺口和证据矩阵，用于采购/架构决策；不冒充法律许可意见。
- 工具：T3 仓库元数据/发布/README 只读，T2 已索引仓库问答，T1 每候选分析及最终汇总；不假设有通用 Web 搜索。
- 输入：`{question,candidates:[{repo,pinnedRef}]2..3,constraints:{runtime,budget,requiredFeatures:[]},caseKey}`；结构化约束不拼进一段权威 prose。
- State：公共字段 + `items,item,assessments[],decisions[],matrix,report`；append 后按 repo/ref 去重；每个 Send 子图写一个独立结果。
- 输出：公共合同 + `matrix,recommendation,unknowns,perCandidateDecisions`；无证据的指标为 unknown，不填伪精确评分。

| 节点/边 | 实现与控制语义 |
| --- | --- |
| Start→校验去重→Send(items,target=候选子图) | concurrency=2，per-invocation independent；next 不连提前汇总 |
| 子图：T3 取事实→T2 读文档→T1 分析→条件核验 | 文档未索引明确返回缺口；必要证据缺失禁批准；只读暂态有界重试 |
| 子图内逐项人工审核→输出一个 assessment | 可部分回应；拒绝是完整决定，不是运行失败；不同候选不能串审核 |
| 子图后继→defer 汇总→完整性核验→T1 比较→End | 按动态任务全量完成语义汇总；不把动态实例数量伪装成 join.waitFor 静态前驱 |

- 成功断言：每候选恰一份结果且来源/ref 正确；最终表覆盖全部 requiredFeatures，证据不足写 unknown；不存在遗漏候选的完整报告。
- 失败断言：一个候选 403/未索引不伪造信息；可用已声明缺口的终止结果汇总，否则整个任务失败；共享数组无覆盖丢项。
- 审核断言：回应一项刷新，其他仍 waiting；全部审核才可完成；错误批量响应不得消费任一项，保留拒绝备注。
- 幂等/重跑：同一 interrupt 重复响应无重复行；同一 repo/ref 输入去重；新 Run 用新报告 ID，历史 matrix 只读。
- UI 演示：输入三仓库→运行→进入各子图看来源→批准一项→刷新→拒绝一项→批量完成剩余项→看矩阵与执行次数→查看原分支。
- 耗时/预算：6–15 分钟；模型 3–4 次、工具 6–12 次；输入 12k–40k/输出 3k–8k token；建议 ¥4–15/轮待确认；并发 2，遇 429 停止扩容。
- 清理/外部写：保存公共来源短摘录，报告导出前去账号标识；等待任务全终结，自建 Thread/namespace 精确清理。默认外部写 0，不创建采购单。

### 2.5 S4：产品更新内容的事实审校与人工返工

- 用户/价值：产品运营把待发布文案与真实版本事实比对，发现夸大承诺/未发布功能；产出已审核内容包和可追溯修改记录。
- 工具：T3 指定 Release/PR/commit 只读事实 + T1 审校；T2 技术文档可选；不依赖不存在的 CMS、邮件或社交账号。
- 输入：`{repo,releaseRef,draftText≤12000,channel,caseKey,maxReviewRounds:1..2}`；draftText 是候选文本，不能作为事实源。
- State：公共字段 + `releaseFacts,claims[],violations[],revisionDraft,round,approvedContent,previousVersion,savedVersion`。
- 输出：公共合同 + `approvedContent,claimEvidence[],decision,storedVersion`；拒绝则 approvedContent 为空，未审稿不得进入已确认记忆。

| 节点/边 | 实现与控制语义 |
| --- | --- |
| Start→T3 锁版本事实→读 workflow 私有记忆 | memory.get，集合 acceptance_content，按 caseKey；TTL 1440 分钟 |
| 审校子图→T1 拆声明/核验→确定性来源检查 | independent/per-invocation；只输出可定位声明/证据；无来源不批准 |
| 人工审核→router(批准/退回/拒绝) | 退回附人工意见→T1 修订→同一审校子图，最多 2 轮；超过则结束草稿 |
| 批准→memory.put(expectedVersion)→End | CAS 保存已审内容；冲突明确失败，不覆盖别人的新版本；不调用 CMS |

- 成功断言：每个保留的功能声明有对应版本来源；批准内容等于人工所审文本；Store 新 Thread 读回与版本匹配。
- 失败断言：错误 releaseRef 停止；CAS 冲突不覆盖；模型流中断不提交草稿；记忆节点不配置 retry/handler 绕过事务保护。
- 审核断言：退回后旧批准不复用；拒绝不写 Store；缺来源禁批准；第二轮仍有问题只能拒绝/结束，不能无限返工。
- 幂等/重跑：重复 resume 不增加保存次数；新 Thread 读已确认版本；历史分支不回滚 Store，新写仍做当下 CAS。
- UI 演示：填真实版本与含一条未支持声明的草稿→查看事实→退回修改→检查第二轮→批准保存→新 Thread 读回→拒绝一轮确认版本未变。
- 耗时/预算：5–12 分钟；模型 2–4 次、工具 2–5 次；输入 8k–25k/输出 2k–7k token；建议 ¥3–10/轮待确认；串行、最多两轮。
- 清理/外部写：内部 Store 是持久写，需纳入验收对象 ledger；只删本 caseKey/版本对象，不删他人记录。默认外部写 0，真正发布另行明确授权。

## 3. 文件级实施清单（后续获准才执行）

下表路径 F/W 同 §1；各项均有独立提交/候选冻结点。测试留在现有 Feature/worker 测试目录，不放 `api/` 顶层。
所有新状态保持 loading/error/empty 独立，HTTP/MCP 发现也不能被环境列表成功掩盖；结果落地前核对仍是同一个 owner/env/请求代次。

| 项目/顺序 | 文件、函数与状态改动 | 测试与场景门 | 回滚 |
| --- | --- | --- | --- |
| P0-1，0.5–1日 | F `application/v2/useWorkflowV2Controller.ts` 独立 environment load/error 状态；拟增 `environmentAvailability.ts` 分类纯函数；`LiveWorkflowEditor.tsx` 展示本人 UUID、复制、重载；CSS 共享顶部插槽 | 分类/失败重载/无环境仍可编辑保存；390/768/1024 几何、键盘复制；S1 启动前覆盖 | 回退 UI 提交但保留准确错误，不扩大 owner 权限 |
| P0-2a，0.5–1日 | controller 拟增 `refreshTools(envRef)` 与统一 `refreshEnvironmentResources`；取消过期响应；Live onSaved、EnvironmentPanel onDiscover 串行发现后刷新 | controller 测试保存 HTTP 即出现、MCP discovery 后出现、切环境竞态与失败重试；S1/S2 无页面刷新 | 回退接线，用显式刷新资源按钮暂替；不得假称工具已更新 |
| P0-2b，0.5–1日 | W `registry.py` public_environment/public_tools、`extensions.py` 补结构化 origin/connectionRef/version/availability；F `domain/v2/types.ts`、`repository/v2/WorkflowApiV2.ts` 接收；EnvironmentPanel/ProcessingFields/WorkflowConnections 展示“我的连接·vN”与内置来源 | 投影仅暴露安全字段；同名不同连接可区分、同连接最新可用优先，旧已选版本仍显示；S1/S2 | 可选元数据兼容旧前端；无元数据明确来源待确认，不误标执行端 |
| P0-2c，1–1.5日 | F 拟增 domain `connectionReferences.ts`：递归扫描子图 providerRef/toolRef/allowedToolRefs；生成旧→新提案；重取工具 contractDigest；ProcessingFields/Live 做预览、确认、保存新修订；W compiler 现有工具诊断只有 nodeId、无 pointer，需补 pointer/graphPath 或由前端按 nodeId 定位；`api/_lib/workflowV2.ts` 仅透传，不新增 Function | 旧版仍可用也提示可更新，停用旧版阻断；映射歧义/Schema 改变不自动绑定；子图/dispatch/白名单覆盖；S1–S4 各取一节点，S3 子图必测 | 未确认零修改；已保存通过新修订恢复原引用；旧连接仍须有效，禁改历史 Run/冻结 Thread |
| P0-3，0.5–1日+等待 | 后续新增明确开关的场景验证脚本置 `scripts/workflow/checks/`，复用 `verify-agent-scenarios.mjs` 计数/ledger 思路；不默认调用；文档记录真实环境与 Run | Local S1 先成功，再四场景，最后 Hosted 模型+DeepWiki/GitHub 真实调用与一条失败证据 | 关停自建 Thread、停用临时连接；保留失败证据，不重放未知外部效果 |
| P0-4，0.5日 | 后续更新 Hosted runbook：共享环境授权责任人、脱敏结构快照、CI 发布、D3 清理；不恢复归档裸部署脚本 | 维护排空、兼容候选、owner 移除前后读回；授权撤销不能继续原 Thread；保留账号不受影响 | 仅授权后恢复原 owner 清单；不恢复秘密到文档、不回滚共享数据库 |
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

Hosted 进入前：获准只读核对目标前后端 deployment、Supabase 项目/迁移历史、执行器 digest、环境/工具目录修订、/ready、Worker/watchdog/Sandbox、实际生成 Function 数每部署≤12。
本轮预期无迁移：若 Hosted 已缺仓库既有迁移或与候选不兼容，标阻塞并另列维护项，不能擅自补库或重置。READY 前端不能代替后端就绪。
后台 Daemons 的 Production 平台约束与产品 production 提升分开说明；若新 Worker 必须更新后台 Production，应单独申请维护窗口/发布授权，不能称“只是 Preview”规避授权。
Hosted 先普通认证 API 冒烟再 UI，复跑四套真实场景；保留模型最小成功、只读工具最小成功、一条可读失败记录，不用入口→结束或旧证据充数。
依 [Hosted runbook](WORKFLOW_HOSTED_RUNBOOK.md) 暂停 start/next/resume/branch、排空 queued/running、保留 waiting、成对兼容回退；当前无原子维护闸，不承诺开放流量无损更新。

### 4.2 通过与失败阈值

| 场景/横切项 | 必须通过 | 任一即失败 |
| --- | --- | --- |
| S1 | 真 GitHub 差异+实模；固定 SHA；两路全到；批准/拒绝各覆盖；无 Release 写 | 编造来源、缺支路报告成功、审后版本漂移 |
| S2 | 至少一个真实工具回合；白名单和回合上限生效；分类/回复有依据 | 未调用却声称查询、工具消息错配、无界循环、客户消息被写 |
| S3 | 三候选完整；部分回应刷新后正确；按身份去重汇总 | 任务串审、丢候选、提前汇总、拒绝被当失败或批准 |
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
- manifest：commit/部署/执行器/环境修订/工具合同、workflow/revision/run/thread/step/task/namespace/checkpoint、开始结束时间、客户端、caseKey 与预算；未知项明确 null+原因。
- 真工具证据：实际工具名/ref/版本、目标公开 URL/SHA、外部状态码、耗时/attempt、结果短摘要/散列与 Step 关联；模型 provider/model、流片段时序、usage。无供应商账单只能写 token 估算费用，不写已结算费用。
- 禁止证据包含 Authorization/Cookie、真实凭据、完整 State/客户正文、私有仓库源码或网络原始 HAR；公开索引使用脱敏身份，完整 UUID 如运维必要只在授权受限证据中留存。截图先检查账号/连接字段。
- 受控 429/timeout/断流用于分类与重试边界，另标 controlled；不篡改真实凭据制造故障，不用本地 echo 替代真工具成功。真远端失败有则如实记录，无则不虚构。
- 失败循环：原失败→定位原因→单写作者修复→相关门复验→新 fresh 会话重走失败路径及邻接路径→产品再审；不覆盖旧失败证据。恢复未知提交先查原幂等回执，禁止重发。
- 同一阻塞两轮无进展即给产品负责人差距/选项/成本；涉及秘密泄露、跨 owner、unknown 外部效果立即停受影响路径并升级；超过授权费用立即停止新调用。不得降门槛换通过。
- ledger 只列自建对象精确 ID、owner、用途、保留期和清理回执；先终结 waiting/active，再用支持的认证接口清理自建 workflow/thread/记忆/连接。无删除接口则标待人工运维，不直接广删 SQL。
- D3 在产品验收与证据收齐后实施：管理员授权维护、保存受控 owner 清单、移除测试管理员、按 runbook 发布读回；验证该账号环境不可用、保留 owner 正常。UUID 清单不放公开文档。
- 保留正常用户与既有四个 Hosted 示例；不按名字模糊删除。未知外部写先核对目标回执/计数，取消不代表撤销，清理也不自动撤销业务操作。

### 4.4 必须显式授权的动作

| 动作 | 授权应包含 | 未授权默认 |
| --- | --- | --- |
| 真实外部写 | 目标仓库/对象、操作/内容、账号、幂等/回执、回撤方式 | 只产草稿；人工审核按钮不替代用户给工程执行者的授权 |
| 费用 | 总额/每轮上限、供应商、场景与失败重试额度 | 不发起付费实模；建议全轮总额 ¥100、单轮按 §2 上限，待确认 |
| 真实凭据 | 用户在受控连接界面/服务端秘密管理中配置及许可范围 | 不请求粘贴到聊天，不读私有文件，不扩大 token scope |
| ownerIds | 执行账号、目标环境、增删集合、窗口/回退责任人 | D3 决策已定；具体变更执行须有目标与运维授权，不能扩大授权 |
| production 提升/后台更新 | 项目、候选、排空窗口、兼容回退与操作员 | 停在 Local/已授权 Preview；不裸 promote，不本地推生产 |

## 5. 下一轮路线与可停点

| Round / 估时 | 目标与交付物 | 门禁/依赖 | 风险、可停止条件 |
| --- | --- | --- | --- |
| R1，3–5日 | P0-1、P0-2；连接诊断/刷新/轮换；**Local S1 首个真实 GitHub+DeepSeek**，版本提案与最小成功/失败证据 | 已授权模型预算/凭据；目录映射落实；相关测试与局部视觉，S1 成功/拒绝/失败/幂等通过 | 目录缺操作/付费未授权停在候选；不扩四场景；可交付连接闭环后等待真实验收 |
| R2，3–5日 | Local S2–S4，显式 demo seed/普通 API 创建；P1 画布与必要 P2；技术/视觉与 fresh 预验收 | R1 真工具通过；四套合同、预算、清理 ledger；类型/全量基线与构建按 §4 执行 | Send 屏障、循环/消息、CAS 为风险；缺业务工具先停该场景，不改成 echo；可停在 Local 完整套件 |
| R3，1–3日+窗口 | Hosted 对账与授权发布；P0-3/4，四场景真实调用、失败与跨视口证据 | R2 通过；真实环境、schema、digest、Function 产物≤12；后台更新单独授权 | 平台限流/不兼容/维护窗口不足即停；不重置共享库；可停在已验证 Preview，不提升主生产 |
| R4，1–2日+返工 | fresh Hosted 预验收→产品负责人最终验收；D3 移除授权、精确清理、签署残余风险 | 四套所有必过项、0 阻塞视觉、费用/调用账齐；产品签署与运维授权 | 失败按 §4 循环；移除 owner 后再读回；可接受“Local 通过/Hosted 阻塞”明确结论，不假签完成 |

总粗估 8–15 人日，另计外部授权/部署窗口与失败返工；不承诺供应商延迟。每轮独立冻结候选与可回滚提交，单作者串行修改 Live/controller/registry/API 等热点。
回退保留历史、Run、检查点；应用回退不等于数据库回退；后端改动可能改变 executorDigest，升级前先验证旧 waiting 恢复资格，无兼容候选就明确拒绝继续并保留旧身份。

## 6. 待用户决策 / 工程待核实（不重开 D1–D3）

| # | 类型 | 事项与建议默认值 |
| --- | --- | --- |
| 1 | 必须你决定 | 真实调用费用与轮次：建议全轮 ¥100，单轮 §2 上限；失败/取消也计费，达到任一上限停；未确认不调用 |
| 2 | 必须你决定 | 真实目标与数据许可：建议公开仓库、公开 Issue、固定 SHA，避免私有数据；S1 先选维护者熟悉仓库 |
| 3 | 必须你决定 | 外部写范围：建议本轮全部只读，交付草稿；评论/Release/CMS/工单写留下一轮逐项授权 |
| 4 | 必须你决定 | Hosted 维护责任人与窗口：建议指定一名操作员，Preview 验收与 production 提升分开；D3 按已定 A 收尾，执行目标/窗口具体授权 |
| 5 | 工程待核实 | 当前 Hosted 项目/部署、schema/digest/实际 Function 数与 ready：默认未核实不进 Hosted，不引用历史部署为当前事实 |
| 6 | 工程待核实 | DeepSeek/DeepWiki/GitHub 实际目录、约 24 capabilities、工具白名单/Schema/副作用/索引范围/凭据可用：逐项读回，缺项用 T4 差距单 |
| 7 | 工程待核实 | 连接元数据、MCP 发现版本映射、前后端兼容及旧 Thread 行为：默认只扩现有投影，不迁移；歧义要求人工重选 |
| 8 | 工程待核实 | 实际 token 单价/工具收费/限流、运行上限及清理 API：默认并发≤2、重试≤2、四场景有界；未知收费/清理权限阻塞对应动作 |

## 7. 本次规划核查记录

只执行本地只读文件/代码检索、分支与 HEAD 查询，并新建本文；未运行任何测试/build/场景脚本，未联网、未访问秘密、未创建验收数据、未部署。
旧文档里的测试数量、部署 READY、实模记录均是历史材料，不是本次验证结论。后续执行者必须逐条形成自己的证据和签署。

## 8. 复核与变更记录

- 2026-10-22：Codex 只读子智能体起草；Lead 复核后补充场景覆盖矩阵与场景落地方式，更正连接轮换表述（旧版本在停用/移除前仍可用），并把工具诊断 pointer 缺口改为“复用 nodeId 或补 pointer”。未实施、未提交、未部署。
