# StateGraph 执行契约与分阶段能力基线

> 当前能力与已知限制见 [交付摘要](../acceptance/DELIVERY_STATUS.md)。已完成阶段的计划、源码台账及候选复验均为可选历史材料；本文仍区分已实现语义与目标契约，不因旧计划归档就把目标视为已实现。


P6模型响应补充：官方SDK聚合响应必须明确成功终止（stop、tool_calls或兼容function_call）；length、缺终止原因、过滤等非成功终止明确失败，空正文且无合法工具调用也失败。合法空正文结构化工具调用保留。检查先于computed与结果提交，失败流保留部分输出并标interrupted。严格可选`modelParameters.thinking={type:enabled|disabled}`经官方SDK extra_body传递，默认保持提供方，现有高级节点参数可编辑。请求token cap与SDK实际usage分别记录，超时、取消或纯reasoning不视为零费用。

日期：2026-10-19更新。当前实施范围：P0/P1基础、P2恢复、P3控制流／子图／多等待及P4节点执行／依赖／策略。P4.0–P4.6已通过Local独立技术与无背景体验验收；具体支持及未测细分见[P4技术报告](../../artifacts/archive/document-history-20261020/files/docs/acceptance/p4-technical-independent.md)。P5.0–P5.7已实现并通过Local独立技术与无背景体验验收，P6现已另完成Vercel+Supabase Production规定范围实测，正式结论见P6独立矩阵与交付报告。

本文中“目标契约”是后续实现必须遵循的设计；只有“当前代码”列出的内容已生效。总体顺序和验收门槛见[实施计划](../../artifacts/archive/document-history-20261020/files/docs/architecture/WORKFLOW_STATEGRAPH_IMPLEMENTATION_PLAN.md)。

2026-10-19后续授权：[P5细案及实际交付](../../artifacts/archive/document-history-20261020/files/docs/architecture/WORKFLOW_STATEGRAPH_P5_PLAN.md)、[ADR 0005](decisions/0005-workflow-p5-stream-memory-history.md)已实现；独立综合验收已通过，见[技术报告](../../artifacts/archive/document-history-20261020/files/docs/acceptance/p5-technical-independent.md)和[首次体验](../../artifacts/archive/document-history-20261020/files/docs/acceptance/WORKFLOW_P5_USER_ACCEPTANCE.md)。原文档轮次仅为历史。

## 版本和适用范围

- StateGraph 兼容基线锁定 `langgraph==1.2.15`，Python 依赖继续由 uv.lock 锁定。
- 当前安装：langgraph-checkpoint 4.3.0、langgraph-prebuilt 1.1.0、langchain-core 1.6.10、langchain-deepseek 1.1.1、langgraph-checkpoint-postgres 3.2.0。它们的实际版本进入运行编译身份；官方 PostgreSQL checkpointer 已在 Local 配置。
- [SDK 实际签名快照](../../artifacts/archive/document-history-20261020/files/docs/acceptance/WORKFLOW_STATEGRAPH_SDK_BASELINE.json)覆盖节点、普通/条件边、入口、编译、调用/流、状态读取/更新、批量状态更新以及 Send/Command/RetryPolicy/CachePolicy。
- 1.2.15 节点签名包括 defer、input_schema、retry_policy、cache_policy、error_handler、destinations、timeout、trace_policy；compile 包括 checkpointer、cache、store、interrupt_before/after、transformers。后续每项必须有显式映射或清晰的不可配置说明，不能因未枚举而声称完整支持。
- 状态通道还需核对本版本 Overwrite、消息删除、私有/输入/输出通道及通道更新规则。Functional API、任意 Python 项目无损导入不在目标内；Graph API 内的遗漏保持未完成。
- 依赖签名基线不能替代行为验证。SDK 升级时更新快照、原生对照测试、支持矩阵和兼容说明。

## 当前代码

- 真实 capabilities 新增 `stategraph`：schemaVersion、SDK 目标/安装版本、implemented 和 pending。
- 此字段描述执行器构建能力；不包含用户数据或凭据，不接受环境配置把 pending 能力宣称为已实现。既有环境授权继续由服务端决定。
- 现有注册节点、串行、条件与循环保持真实执行。普通节点可配置 `config.authoring.interrupt={title,schema,resumeWrites}`；`resumeWrites` 为回应字段到业务 State 字段的映射。没有新增用户交互节点。
- `policy.authoring` 支持 `checkpoint:'superstep'`、`recursionLimit`（1–10000）和 `waitTimeoutMs`（1000–604800000，默认 24 小时）。P3 另支持 interruptBefore／interruptAfter 和 entryRouter。P4处理节点的重试／缓存／超时／处理器及隔离代码现已接入，支持限制见下节；P5新增受控Store、next、history／派生state／bulk及fork，边界见P5节。
- 业务 State 每字段映射独立 SDK 通道，append/messages 交原生 Reducer 合并。节点结果先写私有 task receipt 与 prepared Step，只有 SDK 超步检查点和产品 State/版本/Step 完成/事件在同一数据库事务提交后才标为完成。
- 官方 `AsyncPostgresSaver` 独占检查点序列化和存储协议，薄适配器负责租约隔离与提交协调；运行 Worker 不执行 SDK setup/DDL。每次操作独立连接，持久化图使用 `durability='sync'`；stateless 子图不设 saver，显式 async 避开锁定 SDK 的无 saver＋sync 缺陷，持久边界在父任务。
- 提交摘要覆盖父身份、完整 SDK checkpoint、metadata、new_versions；集合顺序归一，非 JSON 类型由官方 serializer 编码。相同 ID 相同语义幂等，不同语义回滚整个事务，包含 SDK upsert。不能仅比较业务 State。
- SDK Runtime.execution_info 提供 taskId/namespace/checkpointId/attempt；ContextVar 在回调退出恢复。已完成的同任务结果可从官方 pending writes 或私有 receipt 重用，不因恢复重做成功节点。
- Thread 持久化冻结定义/编译/环境身份、当前检查点及累计节点/工具/计算预算。等待不计计算时间、不占 Worker 槽；恢复不能重置额度。工具额度与任务分配由数据库原子预留。
- 节点先 interrupt，再读取输入/创建 Step/执行处理。回应校验 JSON Schema、必填可见文本、State 写入及大小/凭据约束，保留 0、false 和空列表。SDK 返回 interrupt 时确认 pending write 已落盘后公开 waiting；不会误记 success。
- 同 Thread 恢复新建 Run；原 waiting Run 进入 continued 并指向新 Run。故障有检查点可尝试恢复；取消、等待过期和成功执行不可恢复。外部 write 已开始但无持久化 receipt 时返回 EXTERNAL_EFFECT_UNCERTAIN，禁止盲目重做，不承诺外部 exactly-once。
- 模型续传使用官方 message_to_dict/messages_from_dict，将 provider 内部信息写入仅服务器可读的独立 SDK 通道及 receipt；有凭据与大小检查，不进入业务 State 或 API 投影。
- `/threads` 通过认证 API 列出/读取等待与可恢复故障、提交回应或结束执行；原生检查点与冻结 registry 不对浏览器开放。主应用执行面板显示节点 Schema 表单，刷新及原 Run 清理后仍可找到等待 Thread。

## P3 已实施的控制流与恢复契约

实现及验收入口：[P3 细案](../../artifacts/archive/document-history-20261020/files/docs/architecture/WORKFLOW_STATEGRAPH_P3_PLAN.md)、[独立技术验收](../../artifacts/archive/document-history-20261020/files/docs/acceptance/p3-technical-independent.md)、[首次体验与复验](../../artifacts/archive/document-history-20261020/files/docs/acceptance/WORKFLOW_P3_USER_ACCEPTANCE.md)。以下是当前产品语义，不能从 UI 的连线外观推断其他调度保证。

| 配置 | 实际映射／限制 |
| --- | --- |
| 同一普通出口的多个后继、control.fork.branches | 原生多边并行；各任务独立身份，整超步统一提交 |
| core.router mode:first／all | 首个匹配／全部匹配；无匹配走 defaultOutlet |
| policy.authoring.entryRouter | 引用已有 router，直接映射 START 条件分发；开始只能连此 router，开始与 router 标记不额外执行 |
| control.join strategy:all | waitFor 必须等于已连接前驱，映射原生 add_edge([...],join)；条件互斥前驱应采用 any，不能假定未激活前驱会自动满足屏障 |
| control.join strategy:any | 分别连接前驱，按就绪超步触发，较晚批次可再次触发；不是取消其余分支或全局只执行一次 |
| control.send | items 为 State 列表路径，itemKey 为已声明 State 字段；各 Send 接收独立条目。next 与任务同时调度，不是聚合屏障；汇总连到目标后继，必要时配置 defer |
| Send concurrency | 本次运行采用整图各 Send 上限中的最小值与20的较小值作为 SDK max_concurrency；是保守的整图限制，不宣称各 Send 分别调度 |
| config.authoring.command | enabled／destinations／可选 update 字段绑定、graph:current／parent；update 与节点 writes 合并。goto 与静态边叠加；父图目标须真实存在，根图 parent 预检拒绝。parent 的 writes／update 字段须由父子 State 共同声明，子图专有字段预检拒绝 |
| config.authoring.defer | 原生延迟节点，不能用普通汇合代替 |
| core.subgraph | graph 为完整 V2 定义；inputs 传图输入，writes 映射图输出；最多8层嵌套 |
| 子图 stateMode:independent | 子图 Schema、初值和 Reducer 独立，按图接口显式映射，不复制父图权威状态 |
| 子图 stateMode:shared | 父子 Schema 和 Reducer 必须一致；父状态作为调用输入，回传本次调用原始 patch，避免完整列表再次 append。per-thread 子图内跨次通道值仍遵循 SDK Reducer 输入语义，图输出映射与 raw patch 回传保持区别 |
| 子图 persistence | per-invocation 默认：调用隔离且可恢复；per-thread：同一子图在 Thread 内延续，不允许 Send 并发调用；stateless：不保留子图检查点，递归中断／断点预检拒绝 |
| stateless 外部写入 | 父任务按子图授权工具的写能力登记效果；父结果未确认时禁止盲目重入，不承诺子图独立恢复 |
| 调试断点 | 从真实 snapshot.next 获取位置，包含子图路径。它是整图继续操作：存在断点时须批量提交当前全部等待项，部分请求在创建 Run 前返回 STATIC_BREAKPOINT_BATCH_REQUIRED；不是逐个业务中断 |

业务中断可单项或批量回应。响应仍由 interrupt ID 映射；批量先全部校验，非法批次不消费、不创建 Run。数字0、false、空列表保留。新增可选 currentRunId，由主应用始终提交；SQL锁内核验当前 Run，防止部分恢复后 checkpoint ID 不变时旧窗口误操作。相同恢复请求先返回原幂等回执。

等待期限采用 Thread 首次等待的截止上界，后续部分回应／新等待不隐式延期；等待不计计算预算，恢复不重置节点／工具额度。恢复前服务端以官方 Saver 核查根检查点及公开子图等待所引用检查点，缺失返回 CHECKPOINT_MISSING，不从空初值重跑。

SDK task namespace 包含节点／调用后缀，不能与图 checkpoint namespace 混用。P3 独立维护 graphNamespace、graphPath、parentTaskId；子图 checkpoint 与其 Step 完成／事件在同一事务提交到私有 scope 提交索引，绝不改写根 Thread 的 checkpoint／State。任务结果已保存、超步已提交、整图完成分别展示。父图通过原始输出映射提交根状态。

运行中 Worker 失联由 watchdog 封为 WORKER_LOST，用户从可发现失败记录显式尝试检查点继续；本阶段没有新增自动接管。实际停止进程、租约收尾、人工恢复以及已有子图回应结果跨重启均有独立证据。cancel、过期或成功不能被新回应复活。

前端沿用原画布设计：任务选择与批量提交在现有节点气泡；父图子图气泡提供内部等待提示／定位；执行与历史按 graphPath、task 和调用序号区分，面板与状态更新不重排节点。孤立节点测试不执行控制流／子图，提示运行完整流程。配置导出仍不是独立运行程序。

## P4 当前节点执行与策略

[P4细案](../../artifacts/archive/document-history-20261020/files/docs/architecture/WORKFLOW_STATEGRAPH_P4_PLAN.md)、[Local执行ADR](decisions/0004-workflow-p4-local-execution.md)与[独立技术记录](../../artifacts/archive/document-history-20261020/files/docs/acceptance/p4-technical-independent.md)分别记录范围、实现选择和实际证据。P3任务／父子namespace／提交协议保持，新增能力不是第二套调度器。

| 配置／能力 | 实际行为及限制 |
| --- | --- |
| core.function registered | functionRef＋functionVersion固定引用；内置edu.scale@1/@2及owner/env私有函数版本。发布新版本不改旧版；停用在恢复／执行guard检查 |
| core.function code | Python／JavaScript固定镜像、仅标准库；process(input, context)返回对象，输入／输出Schema在命中时也检查；无宿主执行fallback |
| 发布用途 | purpose node／handler隔离，函数版本不可改写；可信predicate为edu.positive／edu.truthy@1，可信Reducer为edu.sum／edu.max／edu.unique@1，由代码发布扩展 |
| Runtime Context | 服务端ownerId／workflowId／nodeId／graphPath及累计attempt；不注入完整环境、产品实体或凭据 |
| retry | 最大1–10次包含首次，间隔／倍率／上限／分类显式配置；SQL按thread/task跨Run累计。额外尝试及handler扣节点预算，模型SDK／HTTP transport不叠加重试 |
| timeoutMs | 处理节点1–120000ms，受整图剩余预算限制；SDK协作超时＋容器硬期限＋独立watchdog回收。人工等待不算失败或计算时间 |
| cache ttlMs | 仅纯函数／确定性转换；1–3600整秒；官方Worker进程内缓存最多512条，重启失效。含interrupt／Command／handler及模型／工具／控制流／子图整体明确拒绝 |
| 缓存命中 | 键含owner、环境／版本、安全Context和输入；仍执行外层权限、当前task审计、具体输出Schema和原始patch提交，不复用旧身份。缓存损坏／不可用失败，不伪造成功 |
| errorHandler | functionRef＋functionVersion引用purpose handler；重试耗尽后最多一次，输入为error.code及原解析input。原失败保留；处理器失败有界结束 |
| 不可重试／吞掉的错误 | auth／policy／validation／infrastructure及effect unknown；interrupt／取消控制信号不进入普通处理器；外部不确定写入仍阻止重做 |
| overwrite | 节点authoring.overwrite为已写字段列表，原生Overwrite。候选同等Schema校验，多覆盖冲突；shared子图内部覆盖预检拒绝 |
| 消息删除 | role remove、目标id及content空数组，映射官方RemoveMessage；不开放历史checkpoint修改 |
| 连接管理 | owner/env私有HTTP工具、DeepSeek、MCP-http创建／测试／停用；Vault加密秘密，仅worker解析；用户不能配置stdio宿主命令 |

P4内层SDK纯计算图设checkpointer=False及async durability，外层P3父任务为持久边界。失败attempt不写成功receipt；成功结果、超步提交、整图完成继续区分。缓存不是检查点，重试不等于Worker自动接管。

P6真实故障验收修复了SDK原生`NodeTimeoutError`的遗漏：journal与节点策略共享同一可信工具效果声明；可能写外部的工具节点遇到该deadline时effect为unknown，不进入retry，也不能由handler吞掉。纯计算/只读超时仍可在已声明预算中重试。取消、超时和未收到回应均不证明外部写未发生。首轮受控远端计数实际重复3次的失败记录保留，修复必须以同类真实远端用例复验。

隔离限额和固定镜像见ADR：256MiB、0.5CPU、32PID、16MiB tmpfs、64KiB每输出流、最长30秒、无网络／宿主mount／凭据。Local要求Docker Linux VM及独立watchdog；这些结果不声明Hosted或任意内核漏洞隔离。

Context与依赖访问边界在P4交付，跨Thread长期Store的完整持久化、命名空间、权限和保留已由P5实现。版本不兼容明确拒绝且保留历史，不自动迁移P3旧checkpoint。P5已实现受控历史修改／分支和模型真实文本增量。

## 目标身份契约（P2 起实施）

| 身份 | 规则 |
| --- | --- |
| Workflow / Revision | Workflow 用户所有；Revision 不可变，恢复或运行冻结定义、执行版本和编译指纹 |
| Thread | 服务端创建，绑定 owner、workflow、定义版本兼容线；不同用户和不同上下文严格隔离 |
| Run | 一次执行请求；同一 Thread 的续跑请求形成新 Run，resumeOfRunId 保留原记录，原等待 Run 进入 continued 终态并关联 continuationRunId，不伪装成功 |
| Task | 使用 SDK 任务身份、checkpoint namespace 和 graph path；动态 Send 的每个调用保持独立身份 |
| Step / Attempt | Step 对应节点调用；Attempt 对应重试，不能用新的 nodeId 表示重试；节点重入与 SDK 重放必须可区分 |
| Interrupt | 使用 SDK 稳定中断 ID，绑定 Thread/checkpoint/task；回应校验 Schema，并通过 CAS/幂等键只消费一次 |
| Checkpoint | SDK 原生 checkpoint ID、namespace 和父 checkpoint；EduFlow 只维护权限、谱系和必要展示索引 |
| 分支 | 从历史 checkpoint 创建新 Thread 并关联 parentThreadId/parentCheckpointId，原记录只读 |

新 Run 续跑使用 continued 表示原等待 Run 已移交，新 Run 以 resumeOfRunId 指向原 Run，原 Run 以 continuationRunId 指向新 Run。continued 是终态但不是业务成功。P2 实施时同步更新 API、数据库及所有前端消费者；未更新全部消费者前不得开放。Run 取消使用 cancelled；等待过期使用 failed + WAIT_EXPIRED，Thread 使用 expired。既有 Run receipt 的 expired/historyExpired 只表示调试历史已清理，避免混淆。

## 目标状态与请求协议

- queued → running → waiting 或 success/failed/cancelled；恢复是新请求，并为前等待 Run 建立 continued 移交终态。Run 状态与 Thread 当前可执行状态分开。
- 创建运行、回应、恢复和分支分别使用幂等键；同键同载荷返回原结果，同键不同载荷返回冲突。
- API 从认证会话解析 owner，查询 Thread/Run/checkpoint 后再次校验；浏览器不得提供权威 owner、角色、凭据或课程实体。
- 同一 Thread 同时最多一个活跃执行；同时提交不同回应通过数据库锁/CAS 排序，旧 checkpoint 回应明确冲突。
- 等待任务返回 interruptId、任务/节点/路径、表单 Schema、已脱敏提示和 expiresAt，不返回可覆盖服务端权限的上下文。
- 取消、过期和回应竞争必须得到唯一结果。等待不占 Worker 槽；waitTimeoutMs 与计算预算分开，恢复后沿用 Thread 已消耗的预算，不重置额度。
- 任何暂停必须先确认 checkpoint 已持久化，再公开 waiting；不能先显示等待再发现恢复数据不存在。
- 定义不兼容、执行器版本不兼容和 checkpoint 缺失分别返回可定位错误，不能偷偷用最新草稿恢复。

## 事件与运行上下文

- 事件保留 protocolVersion、eventId、Run 内 seq、runId、nodeId、stepId、attempt、stateVersion、payload，并扩展 threadId、taskId、graphPath、namespace 和必要 checkpoint 关联。
- Run 内 seq 为传输排序，不冒充并行任务的因果顺序；使用父任务和超步身份表达必要先后关系。
- SDK 流先经过服务端适配和脱敏，再进入事件库与前端。增量以稳定消息/块身份合并，最终值负责校准，重复游标读不重复拼接。
- 工具、模型调用继承任务局部上下文；外部调用额度采用原子预留。共享可变“当前节点”禁止作为归属依据。
- 用户身份、连接能力、Store 命名空间和运行配置由服务端 Runtime Context 提供；业务 State 不存权限或密钥。
- 等待、故障恢复、重放和重试可能导致节点重入。副作用采用明确的幂等身份、结果复用或效果不确定状态，不能承诺一般性的 exactly-once。

## 持久化与保留规则

- 官方数据库 checkpointer 使用非暴露 schema；SDK 迁移由受控增量迁移完成，运行时 Worker 不获得任意 DDL 权限。
- API 是权限边界。checkpoint/Store/Thread 均有 owner 和命名空间约束；浏览器不能直接查询 SDK 原始表。
- Run 历史仍按每 owner/workflow 最新 20 条物理清理；活跃 waiting Thread 所需检查点归 Thread 生命周期，不能仅级联旧 Run 而丢失。
- Thread 对 SDK checkpoint 的依赖独立于旧 Run 行；可保留继续执行所需最小定义、环境快照和当前 checkpoint，不能无界复制已清理的 Run/事件。
- 当前策略：每 owner/workflow 最多 20 个 active/waiting 或有检查点可恢复的失败 Thread；waiting 默认 24 小时、最长 7 天；closed/expired Thread/checkpoint 7 天后清理。每 owner 同时最多 5 个 queued、2 个 running。Run 最新 20 条包含 waiting/continued；若新 Run 会挤掉 queued/running 则拒绝创建，等待 Thread 独立于已清理 Run。管理员可配置保留策略仍属后续能力。
- 删除工作流时检查活跃执行/等待并清理其专属 Thread/checkpoint；不得清理共享模板、课程事实或独立学习证据。
- 当前 checkpoint 与产品事件同事务提交；提交标识/摘要负责恢复对账和幂等。写入失败不得显示虚假成功。

## P5 当前流式、持续会话、记忆及历史操作

- 四类操作分别定义：回应interrupt、原轮故障恢复、成功后同Thread下一轮、历史checkpoint创建新Thread分支。各有幂等、head CAS及权限检查；新轮不清零累计预算，恢复不获得新额度。
- 暂态token／进度与已提交State分开；事件按task／attempt／消息块／子图归属。断线补读、背压、保留缺口和最终校准有明确协议；失败重试的半段输出不拼入成功答案，缓存不伪造生成。
- 长期Store通过受控能力和服务端命名空间授权接入；有条件写、TTL／配额、删除和提交故障恢复，不作为课程／学习领域旁路。隔离代码不因此获得宿主、数据库或网络权限。
- 原历史只读；状态修改／批量更新先预览并产生派生状态，显式分支执行才调度。分支不复制原成功receipt／已消费interrupt／权限，不隐含回滚Store或外部工具。
- 保留最新20条Run不变；可继续Thread、检查点、流与Store各自有界。传输为400ms前台／5秒后台有游标轮询；同库Store／checkpoint事务；轮数20、Thread7天、Store1000项／owner环境、每项16KiB／1–10080分钟、流2048事件／1MiB、模型64KiB、单scope批次20项。详细数值、TTL立即不可见、Run清理后的最小成功资格及旧版本拒绝见ADR 0005。

- 根快照的持久化interrupt集合是等待权威；并行后发values未携带interrupt不能把真实等待丢弃。分支输入取历史检查点私有通道，不取Thread最新轮输入。
- 历史主子图安全投影／相邻差异可读；原历史只读，派生副本整事务创建，每一中间State均校验，显式确认才执行；首次发布等待的child截面冻结，之后回应不污染旧历史，所需child检查点缺失明确拒绝。单批限同scope；仅待执行child可改；shared内部Overwrite仍拒绝。
- 记忆管理和节点共用官方Store；运行put/delete先暂存意图，随P3超步提交整事务写入。可变读不可套计算缓存，沙箱无新增DB或网络权限。

## 能力映射和后续门槛

| SDK 能力组 | 画布/后台目标 | 阶段 |
| --- | --- | --- |
| State、schema、Reducer、消息更新 | 字段/接口、注册 Reducer、并发冲突与覆盖语义 | P1基础、P3/P4已实施范围见上文 |
| Nodes、Context、函数和依赖 | 读取/处理/写入、隔离代码、上下文依赖及授权 | P4已接入，见独立验收范围 |
| 普通/条件边、入口、循环 | 固定连接、条件表达式或函数、循环预算 | 已有基础，P3 完整 |
| 多后继、屏障、defer | 并行、全部等待、分别触发和延迟节点明确区分 | P3 已实施 |
| Send、Command | 独立任务输入、动态跳转和父图跳转 | P3 已实施 |
| Subgraphs | 独立/共享 State、持久化模式、父子命名空间 | P3 已实施 |
| interrupt、断点、resume | 节点内请求、调试断点、按中断身份恢复 | P2/P3 已实施 |
| Checkpointer、durability | Thread、超步快照、故障恢复与协调 | P2/P3 已实施 |
| Retry、Cache、Timeout、error_handler | 官方策略映射、尝试、取消和副作用边界 | P4已接入，见独立验收范围 |
| Store | 跨 Thread 长期记忆、权限和保留 | P5 |
| stream/astream、trace_policy | 模型/状态/自定义/子图流、脱敏及调试信息范围 | P1 事件基础，P5 完整 |
| get/update/bulk_update_state、history | 检查点检查、修改、重放、分支和批量状态操作 | P5 |
| transformers、图迁移 | 版本适用的高级接口映射、运行版本兼容 | P0 核对、P5/P6 验收 |

官方 API 中用于可视化的 destinations/metadata 不直接增加路由语义；图的高级扩展钩子不允许浏览器上传任意服务器可执行对象。必须通过版本化受控注册引用及权限校验。

## Hosted 执行边界（P6）

按用户授权仅使用Vercel与Supabase：主应用认证API→内部FastAPI Compiler→Supabase PGMQ→独立Daemon Worker→官方Saver/Store；另一个Daemon watchdog处理失联、保留和隔离VM回收。Daemon公共Beta只在Production运行，不能由Preview前端READY推断后台可用。实际环境、版本与最终签署见[P6计划](../../artifacts/archive/document-history-20261020/files/docs/architecture/WORKFLOW_STATEGRAPH_P6_PLAN.md)、[ADR0006](decisions/0006-workflow-p6-hosted.md)和[运维手册](WORKFLOW_HOSTED_RUNBOOK.md)。

Local Docker与Hosted Vercel Sandbox是同一Code节点契约的适配器，不是不同学习/工作流领域。Hosted固定镜像、无网络、无秘密，每调用新VM，内部非root且限制资源，失败不降级到宿主执行。许可模型/HTTP/MCP在服务端可信目录执行，不把网络权限交给隔离代码。

身份与运行状态以数据库为准；共享SQL健康信号和发现目录不能由浏览器或临时文件替代。`/health`只是存活，内部认证`/ready`要求当前执行器的DB/Worker/watchdog/隔离服务全部就绪。仅显式授权owner可用环境；验收账号与示例不扩大为所有用户权限。

所有Runtime和官方Saver/Store连接显式设置连接超时5秒（ready3秒）、TCP未确认数据20秒、statement15秒、锁等待3秒，保留SDK search_path；不能只依赖连接池未实际采用的角色默认值。watchdog只处理有待处置的Thread，每批最多128；过期集合各清理128、skip locked，失败下次重试。Sandbox回收与DB巡检分为独立异步任务；每轮处理20对象/尝试删除5个、4秒超时，失败不续健康信号，也不阻断Run失联封闭。7天保留边界与15分钟稳定性观察不是多日连续运行证明。

Worker进程重启不自动接管失联Run。显式恢复保留累积预算与已提交State/Store；执行器或目录不兼容时保留旧历史并拒绝继续，不重写指纹。备份恢复必须匹配旧应用与schema，秘密单独重新配置；应用回退不是共享数据库回退。

## 验收与证据

每阶段由实现者冻结候选，独立验收者先操作再读取实现解释。报告逐项列出真实运行、可控测试、前端演示及未验证项。P0/P1 不得以高级配置已可保存作为 P2–P6 通过证据。
