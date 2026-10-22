# 工作流产品模板验收计划（2026-10-22）

状态：**未执行**。本文是后续验收任务书，所有用例结果、部署身份、证据与签字均待实施后填写；不代表测试通过。
对应[开发计划](../architecture/WORKFLOW_CANVAS_AND_REAL_SCENARIOS_PLAN_2026-10-22.md)，基线 `feat/workflow` @ `67c1a2c`。实现文件、场景合同与 R1–R4 路线以开发计划为准，验收矩阵集中在本文。

## 0. 本地技术探针（2026-10-22，不计入正式验收）

本节只记录实现期间的**技术可行性探针**，不是 §3 的 S1 正式验收，不替代 UI、拒绝/失败/幂等、清理或签字。

| 探针 | 结果 | 证据与边界 |
| --- | --- | --- |
| Local 真实模型调用 | 成功 | 经普通认证 API 创建并运行 `workspace-question` 变体；run `7bbd21ba-87a5-4e19-b10a-61e51f0b0127`，status `success`；provider `deepseek` / `deepseek-flash`，未记录密钥 |
| S1 公开检索 + 函数 + 模型 | 成功 | 普通认证 API 创建自定义探针 `608b80bb-8455-4778-8909-4a58e8b29710`；run `92f68fae-246a-45af-aeb6-edf933c8347a`，status `success`，输出 1 条中文简报；Hacker News Algolia 只读连接返回 5 条 story，经隔离函数整理后由真实模型生成 |
| 真实超时发现 | 已修正 | 首次 30s 节点超时导致模型节点失败；将探针节点超时提高到 120s 后成功。四套产品模板草案同步改为 `nodeTimeoutMs:120000` / `timeoutMs:180000` |
| S1 模板对齐 | 草案完成 | 产品模板改为读取 HTTP 适配器的 `result` 包装：HN `result.hits`、Wikipedia `result.extract`、npm `result` 对象，再由隔离函数整理后交给模型；compiler 结构校验 4/4 通过。arXiv XML 不是 JSON，暂由 npm 公开元数据替代第三个来源，arXiv 适配仍是缺口 |
| 环境问题 | 已绕过 | 本机 `NO_PROXY` 含 `[::1]` 会触发 httpx2 解析异常；启动 Local 服务时归一为 `localhost,127.0.0.1` 后模型可用。该问题不是代码失败，但需在验收环境说明 |

探针使用普通认证 API 与 Local Worker，未走浏览器、未使用产品模板创建对话框、未执行正式 UI 视觉；未验证拒绝、受控失败、重复提交、清理或跨账号隔离。`hn_ai_agents` 连接为当前 Local 测试账号私有、只读、固定查询；没有写入共享 Runtime，也没有提交任何密钥。

## 1. 范围、冻结决策与阶段门

| 项目 | 已确认边界 |
| --- | --- |
| 产品范围 | S1 技术动态简报、S2 开源依赖健康检查、S3 社区问题分诊、S4 内容事实审校是产品模板（B），不是仅供验收的夹具 |
| 画布范围 A | P0 环境闭环 + S1–S4 + P1：运行 tab 去重、窄屏插槽、键盘、归属、历史分支 |
| 共享 Runtime | 镜像、网络、资源/超时、基础 capabilities；`access:"authenticated"`；所有登录用户可用，无 ownerIds、provider/connector/tool/secret |
| 用户 Capability | DeepSeek/HTTP/MCP 连接、函数、变量，按 owner 隔离（`p4:`）；有效配置=Runtime+当前用户 Capability，Run 冻结二者修订 |
| 模板绑定 | 仅声明模型类型、工具类型/用途等能力需求；创建时选择/新建本人连接，不含写死的 `p4:`；缺项显示“需配置执行能力”，不允许假运行 |
| 测试模型 | 测试管理员私有 DeepSeek 连接；可临时用现有平台 Key 创建，仅本轮使用，不共享给他人，Key 不进入共享 Runtime |
| 投放与保留 | 四场景 Hosted 技术验收通过后，一条仅 INSERT `workflow_templates` 的内容迁移投放；不提前暴露半成品；验收后模板保留 |
| 数据与效果 | 公开检索/API 为主；GitHub 仅 S2 可选；业务输出只读、外部写关闭。S4 内部已审记忆 CAS 不等于外部发布 |
| 运行纪律 | 不做费用核算、不设 ¥5 或 10 次 Run 上限、不维护价格表/金额账本；保留运行清单，同一失败连续两次先停查 |
| Hosted | 直接部署 `edu-flow-workflow` 与 Preview，不设维护窗口；主站 production 前端不自动提升；不 reset 共享库、不删他人数据 |
| 决策状态 | D1/D2/D3=A，required/optional=A；无剩余产品决策，仅工程核实项 |

进入 Local：候选代码与锁文件身份冻结；测试账号 A/B 隔离；公开输入、能力需求及受控故障方案可复现；共享 Runtime 与本人连接完成预检。
进入 Hosted：Local 技术/视觉与 fresh 预验收完成；明确 Supabase 项目、迁移历史、实际部署/执行器 digest、环境修订和 Function 产物计数≤12。
既有迁移缺口先增量对账，核实 hosted-safe 必需数据；Preview 构建不得自动迁共享库。内容迁移在四场景技术门后单独执行，不混入 schema 变更。
退出：下列所有阻塞项有证据、fresh 预验收及产品签字完成、模板发布后复验通过、清理与 D3 回执齐全。Run 完成/无报错只是必要条件。
无法完成则写“Local 通过/Hosted 阻塞”等真实分层结论；缺证据、越权、秘密泄漏、引用造假与外部写不得有条件放行。

## 2. 分层验收矩阵

| 层级 / 阶段 | 执行与入口 | 必须交付 / 退出门 |
| --- | --- | --- |
| Local 技术自验（R1→R2） | 真实 Worker、普通认证 API、普通 UI；先 S1，再 S2–S4；受控故障另标 controlled | §3 每场景成功、拒绝/失败、重复提交；P0-5/6 隔离/冻结；相关单测及完整门禁 |
| Local 自动视觉（R1→R2） | Chrome 全路径；Safari/Firefox 冒烟；§5 六视口 | 截图、DOM 几何、命中与键盘证据；0 新增 console error，不触发 fit/重排 |
| Local fresh agent 预验收（R2） | 新会话模拟无背景；仅业务目标、入口、非秘密输入、通过标准 | 普通 UI 完成复制→绑定→运行→审核→历史；记录困惑与阻塞，不靠实施者口头补救 |
| Hosted 技术/视觉（R3） | 直接部署后 ready/Worker/watchdog/Sandbox 检查；先认证 API 冒烟再浏览器 | S1–S4 真模型/真公开工具与失败边界；模型/工具最小成功；相同阻塞视觉门 |
| Hosted 模板投放复验（R3） | 技术门通过后内容迁移；普通账号重新读目录并创建 | 四模板可见、可复制、本人绑定后可运行；A/B 隔离；迁移只插入预定四 ID |
| Hosted fresh agent 预验收（R4） | fresh 会话从已发布模板开始，不给排障路径或源码说明 | 重走关键业务路径，定位报告与来源、审核、重复提交、历史；问题复验闭环 |
| 产品负责人最终验收（R4） | 看证据索引，亲走关键路径，签通过/有条件通过/不通过 | 阻塞项清零；残余风险与责任人明确；签字后精确清理和 D3，再补回执 |

fresh agent 是模拟无背景预验收，不能冒充真实人类或替产品负责人签字；人类实际参与范围在签字表记录。
候选改变后复验受影响项及邻接路径；不覆盖原失败。若其他用户活跃 Thread 存在兼容风险，停止受影响发布步骤并报告，不能重置其运行。

## 3. 四场景用例与共同断言

每条用例分别记录 Local/Hosted 结果，初始均为“待执行”。输入遵循开发计划 §2.2–2.5，不为测试硬编码生产场景分支。
T1–T6 是用户连接；T7 DeepWiki、T8 GitHub 是测试环境可选工具，不得成为产品模板必需项；T10 外部写关闭。
运行前由产品负责人确认本轮输入：S1 主题与时间窗、S2 包与生态、S3 公开问题、S4 公开/脱敏文案；Lead 不擅自替换为私有数据。

| 场景 | 非秘密输入与模板能力需求 | 快照要求 |
| --- | --- | --- |
| S1 | `topics[1..3],sinceDays:1..14,audience,caseKey`；T1 模型、T2 HN、T3 Wikipedia、T4 arXiv | 每主题/来源 query+UTC time+top N；保留日期、URL、短摘录；Wikipedia 标背景 |
| S2 | 2–4 个 npm/PyPI 包（可带 pinnedVersion）与 runtime/budget/requiredFeatures 约束；T1、按 ecosystem 需要的 T5；T8 仅可选 | 查询键为 ecosystem/name/version；记录 time、N（单对象为 1）、来源 URL、版本/日期字段；未知指标不填零 |
| S3 | `source:hn或stackexchange,questionQueryOrId,productVersion?,caseKey`；T1、按 source 选择 T2 或 T6；T3 可选 | 原问题 URL/更新时间、检索 query+time+top N；每个 toolCall 可关联本次证据 |
| S4 | 公开/脱敏 `draftText≤12000,topic,channel,caseKey,maxReviewRounds:1..2`；T1、T2/T3/T4 公开事实检索及本人审校函数/记忆能力 | 声明文本位置→query+time+top N→来源；记录审阅文本散列与 CAS 前后版本 |

N 在用例准备时显式记录；结果不足 N 保留真实条数，不补造。快照包含返回顺序、标题/URL/短摘录；不要求跨 Run 外部数据或模型措辞相同。
函数/变量也属于当前用户 Capability；模板使用到的校验/归一/产物函数必须纳入需求检查，不能借测试管理员函数绕过绑定。

| 用例 ID | 操作 | 必过断言 / 失败条件 |
| --- | --- | --- |
| S1-OK | 三源检索→join→实模简报→审核批准 | 三固定支路均到达；时间窗正确；每结论引用本次来源；join 前无完整简报；批准文本与所审一致 |
| S1-REJECT | 缺 citation 尝试批准；另对有效草稿拒绝并刷新 | 无 citation 禁批准；拒绝仍标未批准草稿且可定位；不发布、不执行来源中的指令 |
| S1-FAIL | 一源受控 429/timeout 或空结果 | 暂态最多两次含首次；缺源显式 limitations/skipped；未检索到不等于事实不存在，不宣称完整成功 |
| S1-IDEM | 重复同一启动提交、重复 resume；再显式新 Run | 原幂等键只一份 Run/回执；新 Run 新快照、原历史只读；caseKey 不替代请求幂等身份 |
| S2-OK | Send concurrency=2→每包独立子图→逐项批准→汇总 | 每包一行；包名/版本/日期匹配 registry；全部动态任务结束才汇总；覆盖约束、未知项明示 |
| S2-REJECT | 批准一项后刷新、拒绝另一项 | 其他项仍 waiting；不串包审核，拒绝备注保留；未全审核不得完成 |
| S2-FAIL | 一个包 404/429 或不可读 | unknown/跳过明示；无伪造下载量、星数、维护状态；缺包不得宣称完整矩阵 |
| S2-IDEM | 重复包项、重复同项响应 | 按 ecosystem/name/version 去重；矩阵无重复行、其他审核不被消费；新 Run 重新取数 |
| S3-OK | 真实公开问题→至少一轮真实模型工具分发→审核草稿 | toolCall ID、调用序号、参数/结果一一对应；引用真实问题；分类优先级是建议，未知版本需补资料 |
| S3-REJECT | 查看问题/草稿→拒绝或升级 | 不生成已发送状态，不向社区写入；保留升级原因与证据；不声称已解决 |
| S3-FAIL | 无结果/受控 auth、404；受控触发预算边界 | auth/404 不重试；只调白名单，≤4 调用/2 回合；超限停止、resume 不重置；无结果不冒称无问题 |
| S3-IDEM | 重复响应/恢复；新 Run 问题版本改变 | 工具响应不重复消费；新来源版本必须重新审核，不沿用旧批准 |
| S4-OK | 拆声明→核对→退回→修订再审→批准→新 Thread 读回 | 保留声明都有来源；最多两轮；保存内容等于所审版本；新 Thread 读回 CAS 版本一致 |
| S4-REJECT | 无来源声明尝试批准；拒绝有效稿 | 无来源禁批准；拒绝 approvedContent 为空且 Store 版本不增；退回后旧批准失效 |
| S4-FAIL | 受控 CAS 冲突、第二轮仍有问题 | 冲突不覆盖；不通过 retry/handler 绕事务保护；第二轮失败只能拒绝/结束草稿 |
| S4-IDEM | 重复批准 resume；查看/分支旧历史 | 不重复保存；历史不回滚 Store；新写使用当下 CAS，不沿用旧版本授权 |

所有用例共同阻塞项：来源真实且来自本次检索；审核门禁绑定具体文本版本；工具归属可追溯到 owner/workflow/run/step/task/invocation/attempt；无外部写。
以调用目录的只读合同、调用记录与产物交叉验证无外部写，不能只看按钮名称或模型自述；T7/T8 若另测也必须通过相同只读门。
真实远端成功不能用 echo、前端 preview 或旧报告替代。真实失败如有则记录；可控故障显式标 controlled，不故意破坏真实凭据。

## 4. 产品模板与能力隔离验收

| ID | 步骤 | 阻塞断言 |
| --- | --- | --- |
| TP-01 需求检测 | 选择四个模板，逐项查看模型/工具用途与所需函数变量 | 模板及子图无 owner、Key 或固定 `p4:`；需求与 §3 输入选择一致，T7/T8 非必需 |
| TP-02 本人绑定 | A 选择已有连接或新建后返回绑定 | 版本与合同可定位；递归绑定子图/dispatch/白名单；服务端按认证 owner 重新校验，不能信任浏览器 owner |
| TP-03 缺连接 | 无模型或必需 HTTP 能力时尝试运行 | 显示“需配置执行能力”，可引导配置；不能假运行、偷用平台 Key、回落 preview 或给出成功 |
| TP-04 推荐公开连接 | 点击“创建推荐连接”，先取消，再确认 | 无确认不创建；确认仅创建当前用户无密钥公开连接；保存/发现后立即可绑定，失败可重试且不伪称成功 |
| TP-05 跨 owner | A/B 分别复制同模板；B 伪造 A 的连接引用 | B 的列表、副本、导出、运行均不含 A 能力；伪造绑定/直接运行被服务端拒绝；函数变量同样隔离 |
| TP-06 私有测试 Key | 用测试管理员私有 DeepSeek 实跑；其他账号检查可见投影 | 共享 Runtime、模板、导出、前端响应、证据无 Key/secret；其他账号不能看到或使用测试连接 |
| TP-07 双修订冻结 | 启动后轮换本人连接，再查看原 Run/等待 Thread | 原 Runtime/Capability 修订可读回且不变；新 Run 使用新确认修订；不自动改旧 Thread，兼容失败明确拒绝 |
| TP-08 发布 | 记录 Hosted 四场景技术门→内容迁移→读回 | 一条迁移仅插四个预定 workflow_templates ID；无 DDL/UPDATE/DELETE、无其他表写；ID 冲突停查；发布前不暴露半成品 |
| TP-09 发布后 | 普通登录用户检索、复制、绑定并运行四模板；匿名尝试受保护操作 | 按现有认证边界可见/复制/运行；匿名不能使用 authenticated Runtime；缺能力仍按 TP-03；不凭“目录存在”签运行通过 |
| TP-10 重复与保留 | 重复 creationId；清理后重新读模板与用户副本 | 重复提交不产生多份副本；模板保留，普通用户副本不受影响；测试连接停用后不冒称原副本仍可直接运行 |

测试前核实需求 JSON 载体、document/preflight 校验与现有 template POST 的兼容，见开发计划 P0-6；不能以新增 schema 或放松校验绕过工程阻塞。
TP-08 发布前，把四个模板的名称、说明、所需能力与示例输入交产品负责人确认；确认后才执行内容迁移。
Hosted 若只有测试管理员一个可用账号，跨 owner 隔离在 Local A/B 覆盖；Hosted 仅验共享 Runtime 可见性、模板目录/复制/绑定与管理员本人运行，并在签字表记录未覆盖的跨账号范围。
应用回退不能撤销已插入模板；投放前失败不迁移，投放后保留模板/副本并停止受影响发布步骤。下架或修订已发布内容若必需，记录待处理项，不自行广删。

## 5. 画布与权限矩阵

| 范围 | 操作与阻塞断言 |
| --- | --- |
| P0-1 三态 | loading/unavailable/error 区分；空目录不武断声称未授权；共享 Runtime 指引不要求管理员加 ownerIds；错误可重载，本人 UUID 可复制且可访问；无环境仍可编辑保存 |
| P0-1 移动插槽 | 顶部状态条与 palette、历史条、图说明、执行气泡不重叠；不能只改局部 top 偏移 |
| P0-2 刷新 | HTTP 保存、MCP discovery 后无需刷新页面即可选；切 owner/env 的旧请求不覆盖新目录；失败有独立状态与重试 |
| P0-2 轮换/标识 | 我的连接·vN；新版提示、旧版未停用仍可选；提案列受影响节点/子图及合同差异，确认后保存新修订；停用旧版 preflight 可定位；不改历史 pin |
| P0-5 access | 所有登录用户可用共享 Runtime，匿名拒绝；共享层无 provider/connector/tool/secret/ownerIds；旧受限环境仍过滤；当前用户能力不能混入共享配置 |
| P1 运行 tab | 只读启动摘要，编辑统一顶部运行对话框；调用方输入只读；required/optional、空文本/false/0 不回归 |
| P1 窄屏 | 顶部/左 palette/右 inspector/底部工具/历史插槽互斥与滚动可用；运行/审核控件可点 |
| P1 键盘 | 节点/连线选择移动、palette→canvas→inspector Tab；气泡/历史展开、Escape/焦点返回、aria-live；轮询不夺焦点，历史禁移动 |
| P1 归属 | S2 多子图、S3 多工具回合按调用序号+输入摘要+attempt 区分，不串结果/审核 |
| P1 历史分支 | 当前分支与其他分支状态清楚；原历史只读，确认才执行副本；查看不替换草稿、不回滚 Store |
| 稳定性 | 面板、历史、等待、选择切换不触发 fit/重排；对照节点坐标与视口；0 新增 console error |

| 视口 | 门禁 | 必验组合 |
| --- | --- | --- |
| 1280×800 / 1440×900 / 1920×1080 | 原冻结基线阻塞 | 环境三态、连接、运行输入、长审核、子图与历史共存 |
| 1024×768 / 768×1024 / 390×844 | 本轮触碰面阻塞，其他面记风险 | 插槽、窄屏审核、工具/调用归属、历史条与键盘焦点 |

1440×900 另测 125% 浏览器缩放（阻塞）；缩放不得造成裁切、横向滚动或控件不可点。
每视口保存截图+DOM 几何+elementFromPoint 命中+Tab/Escape 结果；截图失败须重采，不能文本代签视觉。Chrome 全路径，Safari/Firefox 冒烟。

## 6. 命令、证据、失败循环与清理

以下命令仅供后续实施者执行，**本次未执行**；现有入口核对自 `package.json`。不运行未知部署命令，不把示例路径当现有脚本。

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:workflow:worker
pnpm workflow:check-layout
```

相关用例先跑变更面，候选收尾跑完整门禁。布局脚本覆盖范围先核实，不能替代上列六视口与真实浏览器路径。
真实场景脚本拟置 `scripts/workflow/checks/`，复用 `verify-agent-scenarios.mjs` 思路；具体参数/输出合同待实施时核实，不自动联网调用。
Hosted 部署/迁移命令待目标项目与现有 runbook 核实后写入执行记录；不得照搬 Local refresh/reset、不得每次 Preview 自动迁库。

| 证据 | 内容与规则 |
| --- | --- |
| 根目录 | `artifacts/workflow/acceptance/evidence/canvas-real-20261022/<round>/<local或hosted>/<S1至S4或横切项>/<caseId>/`；本次不创建证据 |
| manifest.json | commit、锁文件摘要、前后端部署、项目脱敏标识、executorDigest、Runtime/Capability 修订、工具合同；workflow/revision/run/thread/step/task/invocation/namespace/checkpoint；开始结束时间、caseKey、客户端；未知 null+原因 |
| assertions.json | 用例 ID、Local/Hosted、预期/实际、通过/失败/阻塞、证据相对路径；受控故障标 controlled |
| calls.redacted.json / sources.json | 工具 ref/版本、目标公开 URL、query/time/top N、外部状态码、耗时/attempt、摘要/散列与 Step；模型身份/流片段时序，usage 仅观测不换算费用 |
| review-N.json | 审阅版本散列、批准/退回/拒绝、幂等回执、CAS 前后版本；不放完整私有正文 |
| ui-viewport-step.png | 视口截图、几何/命中/焦点附件、console 与节点/视口稳定性对照 |
| 运行清单 | runId、scenario、env、Runtime/Capability 修订、status、startedAt、finishedAt、证据路径；不设次数上限、不记金额 |
| cleanup.json | 仅本轮测试 Run/Thread/临时连接的精确 ID、owner、用途、保留期与回执；D3 前后旧环境/共享环境读取结果 |

脱敏：禁止 Authorization/Cookie、真实凭据、完整 State、客户正文、私有源码或原始 HAR；公开索引身份脱敏，必要完整 UUID 仅留受限运维证据；截图先检查账号/连接字段。
失败循环：保留原失败→定位→单写作者修复→相关门→fresh 会话重走失败及邻接路径→产品再审；复验另建 caseId，不覆盖失败证据。
同一失败连续两次立即停查；未知提交先查原回执，禁止盲重发；卡住按取消/超时终止。同一阻塞两轮无进展列差距与工程选项，不降门槛。
秘密泄漏、跨 owner 或未知外部效果立即停受影响路径并报告；取消不代表撤销效果，不能签“已回滚”。
清理先终结本轮 active/waiting，再通过支持的认证/受控运维接口精确处理测试 Run/Thread/临时连接；无安全接口写待运维，保留对象不广删。
模板、用户副本、正常用户数据及既有 Hosted 示例保留；不按名称模糊删除，不增加 workflow/记忆批量清理范围。
D3=A：产品验收与证据收齐后，从旧受限 hosted 的 ownerIds 移除测试管理员并发布读回；旧环境不可用、旧 Thread 不可继续，保留 owner 正常。
D3 不删除测试账号，不撤销共享 Runtime 的 authenticated 访问；共享 Runtime 对该登录账号仍可见。测试管理员私有临时连接清理后不可再被使用。

## 7. 非目标、残余风险与签字

不做 provisioning UI、required/optional B、外部写、主站 production 自动提升、独立子图资产、全量 V2 改名、费用核算；不新增 P0-7。
工程待核实：双修订快照兼容、模板需求载体与绑定校验、公开 API 合同/限流、Hosted 项目/迁移/digest、清理接口。核实失败记阻塞，不新增产品决策。
若本轮没有真实无背景人类参与者，签字表须记录该残余风险；fresh agent 只能作预验收，不能替代产品负责人签字。

| 签字项 | 结果（全部待填） | 责任/证据 |
| --- | --- | --- |
| Local 技术/视觉 | 未执行 | 实施者、候选身份、manifest 索引 |
| Local fresh 预验收 | 未执行 | fresh 会话、业务路径与问题清单 |
| Hosted 技术及模板投放复验 | 未执行 | 部署/迁移回执、四场景、A/B 隔离及视觉证据 |
| Hosted fresh 预验收 | 未执行 | fresh 会话、缺陷复验、未覆盖项 |
| 产品负责人最终验收 | 未执行 | 姓名/时间、亲走路径、通过/有条件通过/不通过及理由 |
| 残余风险与清理/D3 | 未执行 | 风险、影响、责任人、处理期限；清理/撤权回执，保留对象清单 |

未实施、未提交、未部署、未运行测试。本文无测试通过或部署成功结论。
