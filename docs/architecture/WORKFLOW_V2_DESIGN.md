# Workflow Canvas V2 设计契约

> 本文保留已采纳的 V2 基础设计。下文 M1 验收、Hosted 未验收及后续阶段规划描述属于原轮次背景；现行执行范围以 [运行契约](WORKFLOW_STATEGRAPH_RUNTIME_CONTRACT.md)和[交付摘要](../acceptance/DELIVERY_STATUS.md)为准，不依赖归档报告才能理解或运行。


- 状态：M1 七类契约与体验整改已实现，32 项/288 条技术体验条件、五条代理新手旅程（含一次只读补证）及原 M1 回归完成，现移交人工走查。整体真人验收待完成，Hosted 未验收，M2/M3 为规划。当前证据和最终文件检查见[整改执行报告](../../artifacts/archive/document-history-20261020/files/docs/acceptance/WORKFLOW_V2_M1_UX_REPORT.md)；契约与[整改方案](../../artifacts/archive/document-history-20261020/files/docs/architecture/WORKFLOW_V2_M1_UX_REMEDIATION.md)保持兼容。
- 日期：2026-10-14
- 任务：[Issue 37](https://github.com/OpenUniflo/EduFlow/issues/37)
- 决策：[ADR 0003](decisions/0003-workflow-v2-runtime-and-contracts.md)
- 实施与验收：[M1 计划](../../artifacts/archive/document-history-20261020/files/docs/architecture/WORKFLOW_V2_M1_PLAN.md)

## M1 体验整改接口增补（2026-10-14 实施基线）

按[整改方案](../../artifacts/archive/document-history-20261020/files/docs/architecture/WORKFLOW_V2_M1_UX_REMEDIATION.md)开始实施，以下兼容扩展纳入七类契约；尚待统一体验与回归验收，不代表完整交付。

- `POST resource=validate` 保留 saved 请求；新增 `mode:"draft"`，传 `workflowId/baseRevision/draftDefinition/environmentRef/input?/clientRequestId?/draftGeneration?`。草稿身份须等于基线，owner 与当前修订重验；不保存、不入队、不调用模型或工具。返回 `checks:{structure:boolean,environment:boolean,input:boolean|"unchecked"}`，以及 `requestId/clientRequestId?/draftGeneration?`。无输入或无合法 Schema 可预检时 input 为 unchecked，不能声称输入已通过。创建 Run 仍只接受已保存的不可变修订并重新预检。
- Diagnostic 可增加 `scope:definition|input|environment|run`、关联请求、runId/stepId/invocation；定义内 pointer 保持原含义，输入诊断 pointer 指向 Input。required 缺字段精确指向该字段，不能解析自然语言猜路径。请求外层和诊断的 requestId 一致。
- `GET resource=revisions&workflowId&cursor?&limit?`，owner 隔离，按 revision 降序；cursor 为 exclusive revision。返回 `items:[{revision,name,createdAt,definitionHash,availability:"available"}],nextCursor:number|null`。指定旧定义读取与现有双 revision 保存事务组合实现恢复为新修订。
- Run 详情和 input artifact 可附 `inputReuse:{available,complete?,fields?:[{pointer,value}],removedFields?:[{pointer,reason}],reason?}`。只复用明确非敏感完整字段；敏感/脱敏值不返还执行，数组作为完整字段处理避免稀疏掩码。列表不展开输入。无权/过期仍 404/410。
- Editor schemaVersion=1 的 `edges[transitionId]` 新增可选 `routing:{version:1,mode:"auto"|"manual",source?:{side,offset},target?:{side,offset},points?:[{x,y}]}`。side 为 left/right/top/bottom；offset 为 0～1；points 为有限图坐标且≤32。视觉锚点不改变语义 outlet；路由不进入语义 hash/编译。显式 auto 恢复自动走线；当前同 ID 边有路由而旧客户端省略扩展时返回 409，未知扩展拒写，删除 Transition 可清理对应布局。旧修订恢复时须显式标 auto，不能通过遗漏擦除路由。
- 定义摘要可带真实 `updatedAt`；库分组 `group?:"test"|"general"` 只投影可信 head `provenance.libraryGroup` 的显式运维元数据。缺省或未知值保持未分类，不按名称、来源类型、模板身份推测分组。原 provenance 字段保留；create/save/copy 不接收客户端分组或 provenance 写入，此轮不新增用户分类编辑权限。分组不进入 Definition、Editor、State、任何 hash 或 Compiler。工具分组独立，只透传工具运维目录的 `group:test|general` 元数据。

纯布局保存不增加 Definition revision；名称/说明/label 变更仍增加定义修订和 definitionHash，semanticHash 保持不变。所有新增响应继续执行字段策略脱敏和权限检查。复用已有 API Function，无新增 SQL 或 M2 能力。

## 1 目标和里程碑

Workflow Canvas V2 支持搭建、配置、校验、真实执行、调试、保存复盘、发布和外部调用。EduFlow 拥有工作流定义、权限、产品上下文和证据契约，LangGraph 负责图执行。普通流程与 Agent 共用原语，ReAct 等架构通过模板组合。

实施以一个完整里程碑为单位，内部持续验证，不以原 Issue 的六个 PR 为强制暂停点。

| 里程碑 | 完整交付范围 | 不包含 |
| --- | --- | --- |
| M1 | Definition V2、迁移、真实 LangGraph、DeepSeek、HTTP/MCP 工具、状态、Trace、历史与画布闭环 | 任意用户代码、并行图、子图、Checkpoint 恢复、外部部署 API |
| M2 | 子图、Send、并行/Reducer、Interrupt、Checkpoint、Skills、Harness、Sandbox | 不默认包含多云部署 |
| M3 | 不可变发布、部署身份、外部 API、Webhook、约定范围内 SDK/可运行导出 | 不承诺模型输出逐字可复现 |

M1 支持由 Router/普通转移组成的有界串行循环，包括工具调用循环；无专门 Loop DSL。并行循环、动态分发与子图归 M2。前端状态只能展示已经实现的能力。

## 2 当前基线与权威边界

实施前的 App 装配 DemoWorkflowRuntime，Legacy WorkflowDefinition 包含 runOrder、固定结果与展示代码，旧 API 接受客户端历史。当前 V2 入口通过 authenticated API 创建持久 Run，由独立 Python LangGraph Worker 真实执行；Legacy Demo 保留显式兼容入口和非可信来源。实施与验收状态以 M1 计划和独立验收报告为准，Local 能力不代表 Hosted 已上线。

```text
Editor → Definition Revision → Validator/Compiler → LangGraph Worker
                                   ↑                       ↓
                             Node/Tool Registry      Run/Step/Event
                                                           ↓
                                                   API → Run Panel
```

- Workflow Domain 保持纯数据与纯校验；不依赖 React、Demo、Supabase 或 App singleton。
- Editor Document 是呈现数据。拖动、选择、缩放不改变执行语义。
- API 负责认证、授权、持久化和入队；Worker 负责执行。浏览器不直接调用 Worker。
- 课程关联由应用集成层验证；Runtime 不接受 Course/Assignment 对象。
- 学习者解释与聊天使用 Global Assistant。工作流内 LLM/Agent 是执行节点，不能成为第二个学习者聊天运行时。
- 以下类型是语言无关的协议说明，以 TypeScript 风格表达；不是本次新增的生产代码。

## 3 契约一 Definition V2

### 3.1 持久化结构

```ts
type WorkflowDefinitionV2 = {
  schemaVersion: "2.0";
  workflowId: string;
  revision: number;                  // 服务端分配，单调递增
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  state: {
    schema: JsonSchema;
    initial: Record<string, JsonValue>;
    inputBindings: Record<string, Binding>;
    reducers: Record<string, ReducerRef>;
  };
  entryNodeId: string;
  nodes: NodeDefinition[];
  transitions: Transition[];
  outputBindings: Record<string, Binding>;
  policy: ExecutionPolicy;
  requiredCapabilities: string[];
};

type NodeDefinition = {
  id: string;
  label: string;
  type: string;                     // 注册表身份，如 core.llm
  typeVersion: number;
  config: Record<string, JsonValue>;
  inputs: Record<string, Binding>;  // 对应注册表 inputSchema 字段
  writes: Record<string, string>;   // State 顶层字段 → 本节点输出 JSON Pointer
};

type Binding =
  | { source: "literal"; value: JsonValue }
  | { source: "input" | "state"; pointer: string;
      onMissing: { mode: "error" } | { mode: "default"; value: JsonValue } };

type ReducerRef = {
  name: "replace" | "append" | "messages";
  version: 1;
};

type ExecutionPolicy = {
  timeoutMs: number; nodeTimeoutMs: number;
  maxNodeExecutions: number; maxToolCalls: number;
  maxInputBytes: number; maxStateBytes: number; maxEventBytes: number;
  maxOutputTokens: number; maxAttempts: number;
  maxCost?: { amount: string; currency: string };
};

type Transition = {
  id: string;
  from: string;
  outlet: string;                   // next 或 Router 声明的出口
  to: string;
};

type EditorDocument = {
  schemaVersion: 1;
  workflowId: string;
  editorRevision: number;
  definitionRevision: number;
  nodes: Record<string, { x: number; y: number; width?: number;
                          height?: number; collapsed?: boolean }>;
  edges: Record<string, { sourceHandle?: string; targetHandle?: string;
    routing?: { version: 1; mode: "auto" | "manual";
      source?: { side: "left" | "right" | "top" | "bottom"; offset: number };
      target?: { side: "left" | "right" | "top" | "bottom"; offset: number };
      points?: { x: number; y: number }[] } }>;
  viewport?: { x: number; y: number; zoom: number };
};
```

JsonValue 只允许 JSON 可序列化值，拒绝 NaN、Infinity、循环引用。JsonSchema 采用 JSON Schema 2020-12 的受限子集：type、properties、required、additionalProperties、items、enum、const、数值/长度边界及本地 $defs/$ref。M1 不支持远程引用、任意正则、隐式类型转换；未知关键字不能被静默忽略。title/description/default/$schema 为允许的注解，default 不自动应用；type 可用基础类型或包含 null 的类型数组。顶层 Input/State/Output 都为 object，绑定表的键是其顶层字段名，不是路径。编译时检测递归引用并拒绝 M1 不支持的递归 Schema。TS 与 Python 使用成熟验证库并共享一致性样例。

M1 Binding 有意不支持跨节点历史输出路径。节点结果通过显式 writes 写入 State，再由下游读取，避免循环内“取哪一次输出”的歧义。单次输出保留在 Step 中供调试。writes 值为空 JSON Pointer 时表示完整节点输出。State 顶层写入替换/合并规则见第 5 节。

例如 LLM 节点 `writes: { pendingCalls: "/toolCalls", messages: "/messages" }`，LLM 适配器直接返回已满足注册表 Schema 的 messages 单元素数组，不由通用包装器偷偷增加字段。tool_dispatch 的 inputs.toolCalls 使用 `{ source: "state", pointer: "/pendingCalls", onMissing: { mode: "error" } }`；返回 toolMessages 数组后写入使用 messages Reducer 的 State.messages。此映射是显式配置，不由节点 label 推断。

草稿保存分两层：合法 envelope/版本、唯一 ID、有限大小、合法 JSON 与 owner 边界是阻断校验；缺模型配置、断开的图、未完成绑定属于可保存的语义诊断。任意损坏载荷或未知版本不可作为 V2 草稿写入。

节点和边 ID 在工作流内唯一且稳定；label 可改。Workflow ID 在用户拥有的命名空间内唯一，服务端查询必须同时约束 owner。同一原始模板被复制后生成新 Workflow ID，并保留 provenance 引用，不篡改模板。

### 3.2 控制流

- 入口节点为 core.start，出口为 core.end；至少一个可达出口。
- start/普通节点在 M1 只有一个 next 出口和一条转移；end 无出边。
- Router config 为 `{ cases: [{ id, priority, predicate }], defaultOutlet }`。priority 必须唯一，按升序取首个匹配，必须有 default；出口各有一条转移。
- Predicate 是结构化判别联合：`{ op: eq|ne|gt|gte|lt|lte, left: Binding, right: Binding }`、`{ op: exists|nonEmpty, source: input|state, pointer }`、`{ op: and|or, children: Predicate[] }` 或 `{ op: not, child: Predicate }`。and/or 的 children 非空；eq/ne 比较同类型 JSON 值，排序比较仅允许有限数值。exists 对缺失返回 false，对 null 返回 true；nonEmpty 仅用于数组/字符串，对缺失或 null 返回 false，其他类型报错。这样 Router 可直接判断 toolCalls 数组是否非空，不依赖自然语言或隐式 length 运算。
- Router 输入校验后确定出口。禁止同一节点同时用普通边与条件边重复调度。
- 删除节点时预览其边和绑定影响，并清除确定关联的连线；无法自动修复的绑定保留诊断。格式合法的不完整草稿可保存，但悬空引用阻止 Live。
- 有向环合法，但运行必须受 maxNodeExecutions、maxToolCalls 和截止时间限制。未声明出口、死路、不可达节点阻止 Live；编辑草稿可保存并显示诊断。
- M1 不允许多出口同时触发；多入边只能表示互斥路由的汇合，不表示并行 barrier。

### 3.3 修订与执行身份

保存传入 baseRevision，冲突返回 409，不后写覆盖。定义修订不可变；编辑布局使用独立 editorRevision，并记录其对应 definitionRevision。结构编辑通过一次事务保存定义和布局，校验两个 base revision；纯拖动仅更新布局。历史定义使用其保存时布局快照，不能混入当前编辑器已删除/新增节点的位置。缺少位置时采用确定性的展示默认值，不影响执行。EditorDocument 的 definitionRevision 必须等于本次编辑基线；过期位置更新返回 409，不把已删除节点重新写回布局。创建 Run 冻结定义修订，即使运行期间编辑或离开页面也不变。

semanticHash 使用 RFC 8785 规范 JSON 与 SHA-256；JSON 数值限跨语言可互操作范围，整数字面值超出 ±(2^53−1) 拒绝或由 Schema 显式定义为字符串，不做浮点隐式舍入；包括执行节点 ID/type/version/config/bindings/writes、转移、入口、Schema、State 初值、Reducer、输出映射、策略和 capability。排除 name、description、label、布局、revision、时间。无语义顺序的集合按稳定 ID 规范排序；数组字面值与显式 priority 的语义不得丢失。

definitionHash 覆盖完整定义文档；compileFingerprint 再包括 semanticHash、Compiler/Runtime/节点执行器版本、工具契约摘要。同一个修订可对应不同执行环境，但 Run 必须记录实际解析的环境修订和依赖清单。

## 4 契约二 节点执行

### 4.1 注册表和调用接口

```ts
type NodeDescriptor = {
  type: string; version: number;
  configSchema: JsonSchema;
  inputSchema: JsonSchema; outputSchema: JsonSchema;
  outlets: string[];                // Router 可从已校验 config 推导
  sideEffect: "none" | "read" | "write";
  requiredCapabilities: string[];
};

type NodeExecutionRequest = {
  runId: string; stepId: string; nodeId: string;
  invocation: number; attempt: number;
  definition: NodeDefinition;
  resolvedInput: Record<string, JsonValue>;
  deadlineAt: string;
};

type NodeExecutionResult = {
  output: JsonValue;
  outlet: string | null;           // 仅 core.end 为 null
  usage?: { inputTokens?: number; outputTokens?: number;
            cost?: { amount: string; currency: string; source: string } };
  artifactRefs?: string[];
};

type ExecutionError = {
  code: string;
  category: "validation" | "auth" | "rate_limit" | "timeout" |
            "provider" | "tool" | "policy" | "infrastructure";
  message: string; retryable: boolean;
  externalStatus?: number; effect?: "none" | "confirmed" | "unknown";
  nodeId?: string; invocation?: number;
  stage?: "input_resolution";
  pointer?: string;                // Definition 配置位置，不是输入值
};
```

执行器通过非序列化的 ExecutionContext 获得取消信号、受控工具客户端、Secret resolver、产物写入与事件回调；不能将上下文放入 State。节点只返回 output/outlet，统一包装器负责按 writes 产生 State patch、验证、应用和记录。节点不得绕过包装器直接修改共享 State 或 Run 终态。

节点输入读取、Secret 检查或输入校验可能在 Step 建立前失败。此时 Run.error 可携带真实的 `nodeId`、本次 `invocation`、`stage="input_resolution"` 与安全 Definition `pointer`；不得伪造 Step、step.failed、State 更新或已解析输入。位置只标识配置，不携带失败业务值或密钥。前端定位到该 Run 的不可变执行快照并说明该节点尚未执行；原错误缺少上下文时保持未知，不从当前图猜测或回填历史。

stepId 标识一次逻辑节点执行，循环创建新 stepId；同一次执行重试使用相同 stepId 和递增 attempt。M1 固定 maxAttempts=1，不开放重试配置；保留 attempt 字段用于未来扩展。工具调用另有 callId，关联消息中的 toolCallId。最终结果与消息必须能够对应到具体调用。

### 4.2 M1 节点目录

| 节点 | 核心配置 | 输入与输出 |
| --- | --- | --- |
| core.start | 空 | 空输入，空输出，next |
| core.end | 空 | 空输出，无出口；Runtime 生成 Run Output |
| core.transform | operationRef、operationVersion | 注册的纯函数输入/输出；不接受任意源代码 |
| core.router | cases、defaultOutlet | 结构化条件；输出所选出口 |
| core.llm | providerRef、modelRef、modelParameters、allowedToolRefs | messages → messages（一个 assistant 消息）、toolCalls；usage 置于执行结果信封 |
| core.tool | toolRef、contractDigest | arguments → result；artifactRefs 置于执行结果信封 |
| core.tool_dispatch | allowedToolRefs | toolCalls → toolMessages；按数组顺序执行 |

工具注册表支持受信任 Function、HTTP 与 MCP 适配器。模型产生的 tool name 只映射到 allowedToolRefs，不允许自选 URL、命令或 Secret。Tool descriptor 包含 input/output Schema、版本/摘要、副作用类别、凭证引用和授权范围。MCP tools/list 的元数据需经过服务端注册与权限过滤；原始工具 Schema 与经适配的执行 Schema 均保留摘要。遇到 M1 不支持的 Schema 标为不可用，不能删掉关键字以伪造兼容。没有 outputSchema 的工具使用协议内容信封 Schema 校验，不宣称已验证业务结果。名称相同不能自动替换旧契约。运行前发现摘要变化返回 TOOL_CONTRACT_CHANGED，不静默采用。

LLM 消息通过官方/成熟 SDK 转换为版本化 MessageV1：id、role、content blocks、toolCalls；tool result 包含 toolCallId。toolCalls 包含 id、name 和 JSON arguments。保留文本和结构化工具调用，不自行实现模型流协议。M1 不向前端或普通 Trace 暴露隐藏推理，只保留可展示输出和调用事件。提供方若要求在工具循环中回传 reasoning/opaque continuation，官方适配器必须在当前 Run 的受保护内存中保持并原样回传；不放入用户可编辑 MessageV1/State，M1 进程丢失即失败。M2 再设计该上下文的受保护恢复存储。实际模型必须完成多轮工具链验收，不能一律删除协议必需字段；不要求 token 级流式 UI。

模型 → Router(has tool calls) → tool_dispatch → 模型构成有界串行循环；无调用时 Router → end。所有控制流仍由图决定，不给 ReAct 编写另一个执行引擎。

### 4.3 执行约束

包装器依次执行授权/绑定校验、输入校验、执行、输出校验、State 更新校验及持久化。无输出校验通过记录不能宣称节点成功。

ExecutionPolicy 包含 timeoutMs、nodeTimeoutMs、maxNodeExecutions、maxToolCalls、maxInputBytes、maxStateBytes、maxEventBytes、maxOutputTokens、maxAttempts，以及可选 maxCost。M1 默认 120000/30000 ms、50 次节点、10 次工具、64 KiB 输入、1 MiB State、64 KiB 单事件、2048 输出 token、1 次尝试，冻结为 policyVersion=m1.1。服务端硬上限为 600000/120000 ms、200 次节点、50 次工具、8192 输出 token；其他上限与默认值相同。用户可降低预算，不能提高部署硬上限；M1 不接受 maxCost。

不认识成本时 cost 为缺失，不能写 0；无可靠计价的提供方不能声明执行了货币硬预算。以调用、token、时间硬限额兜底。节点超时受 Run 截止时间进一步约束。

M1 所有工具均不自动重试，包括 tool_dispatch 整批。未来启用写入型工具重试时，必须由注册表声明幂等支持并使用稳定 idempotencyKey。超时后无法确定是否发生副作用，记录 effect=unknown，不自动重新执行。取消不能撤回已发生的外部副作用。

### 4.4 工具批次和输出约束

core.tool_dispatch 在执行前验证整批 toolCallId 唯一、工具授权和参数 Schema，然后按序调用；每次调用前再次检查取消/预算/撤销状态。第一项运行时失败后停止，不调用余下项；已成功项的工具记录与副作用保留，未开始项标 skipped。M1 整个 Step 失败且不提交该批次的 State patch，不自动回到模型重试。toolCallId 与 callId 对应关系持久化，不能重试整个批次重复已成功副作用。

每次 core.llm 都输出完整的本轮 toolCalls（无调用时为 []），以 replace 清除上轮 pendingCalls；messages 是当前轮增量，不是完整历史。tool_dispatch 输出 toolMessages 数组，以 messages Reducer 追加。到达 end 时必须无悬空 tool call，outputBindings 全部解析且通过 outputSchema 后才允许 Run success；否则 failed/INVALID_RUN_OUTPUT。每个 Run Output 的字段必须明确绑定或在 Schema 中可选，不把最后一个节点的输出自动当作最终结果。

## 5 契约三 State

Run Input 不可变，经 inputSchema 校验后，通过 state.inputBindings 初始化内部状态。State.initial 先应用，再应用输入绑定，最后检查 State Schema。JSON Schema default 仅为元数据，不隐式补值。显式 null 与字段缺失不同。

- inputBindings 仅允许 input/literal；节点 inputs 允许 input/state/literal；outputBindings 在 end 使用同样的来源集。
- writes 只能指向已声明的 State 顶层字段，嵌套对象作为字段整体更新，禁止未声明写入。
- 初始化提交 stateVersion=0；仅非空 State patch 成功提交后递增 stateVersion，无写入节点前后版本相同。相同 Step 完成提交重发不重复应用 patch。
- M1 reducers：replace@1、append@1、messages@1。append 接受数组；messages 使用成熟消息合并适配器，按稳定消息 ID 去重，保留调用关联。自定义 Reducer 源码不进入 IR。
- State reducer 由 Runtime 的 LangGraph 适配层执行；先计算并校验候选 State，再提交 Step/State/事件，提交确认后才调度下一节点。纯 Reducer 可能用于校验而重复计算，但效果只提交一次；事件投影不再应用 Reducer。持久化失败使 Run 停止，不继续采用未提交状态执行。
- M1 串行更新。M2 并行新增前必须明确每个字段合并法则；无 Reducer 的并发冲突拒绝执行，不能按完成顺序取最后值。
- 单次 Step 存输入输出引用及状态前后版本；调试快照不作为恢复授权。
- 输入/输出/State 均可能包含个人数据，按字段策略脱敏。Secret resolver、凭证及 HTTP Authorization 头始终排除。SDK 私有 State 字段不能被假定为自动隐藏。
- 超出大小限制失败或按已声明的产物协议写入对象存储并保存引用，不静默截断执行状态。展示可以截断，但保留标记和授权产物引用。

## 6 契约四 Graph Compiler

```ts
type CompileRequest = {
  definition: WorkflowDefinitionV2;
  registrySnapshot: { id: string; digest: string;
    nodes: NodeDescriptor[]; tools: JsonValue[]; capabilities: string[] };
  targetRuntime: { name: "langgraph-python"; protocolVersion: "1" };
};
type Diagnostic = {
  code: string; severity: "error" | "warning";
  message: string; nodeId?: string; transitionId?: string;
  scope?: "definition" | "input" | "environment" | "run";
  requestId?: string; clientRequestId?: string; draftGeneration?: number;
  pointer?: string;                 // 定义内 JSON Pointer
};
type CompileResult = {
  valid: boolean; diagnostics: Diagnostic[];
  semanticHash?: string; compileFingerprint?: string;
  requiredCapabilities: string[];
};
```

Compiler 是服务端纯转换边界，注册表快照作为输入；工具发现和权限解析在调用前完成，编译本身不调用模型、工具或数据库。编译出的 LangGraph 对象仅存 Worker 内存，不传给浏览器、不跨语言序列化。

校验顺序：格式/版本 → ID 与引用 → 节点配置/Schema/绑定 → 入口和可达出口 → 路由完整性 → 写入与 Reducer → 循环和预算 → capability。无法静态证明的输入类型保留 Runtime 校验；不能声称已完成全路径类型证明。

M1 将 core.start/end 保留为可观察包装节点，分别连接 LangGraph 的 START/END；end 先做输出校验和成功封口再结束。将普通节点映射为受控节点包装器，将 Router 出口映射为条件转移。LangGraph 负责图调度，EduFlow 不复制其调度器。无效定义返回诊断，不返回可执行编译对象。

Definition 节点 ID 属于 EduFlow 身份空间，不能因 SDK 的保留名称或字符限制改变身份。适配层以确定性内部名称连接 LangGraph 节点和转移；节点执行、诊断、Step 与事件始终引用原始 ID，迁移也保留原身份。

标准错误码包括 UNSUPPORTED_SCHEMA_VERSION、DANGLING_NODE、MISSING_OUTLET、UNREACHABLE_NODE、INVALID_BINDING、UNKNOWN_STATE_FIELD、UNSUPPORTED_CAPABILITY、UNBOUNDED_POLICY、TOOL_CONTRACT_CHANGED。前端以 pointer/身份定位；不通过错误文本匹配控制行为。

缓存使用 compileFingerprint，不包含布局。缓存只能含纯编译结构，不能捕获 Secret、owner、活动客户端或可变 Run State；每个 Run 单独绑定经过授权的 ExecutionContext。所有授权与数据查询另带 owner 范围，不能因哈希相同而共享用户数据。同 semanticHash 在注册表、Compiler 或执行器升级后不能错误复用旧缓存。完整运行导出归 M3，M1 保留旧 Demo 代码展示并标明非 Live 导出。

## 7 契约五 Runtime API 与数据

### 7.1 公共接口

物理边界复用 `/api/workflows`；使用 resource/op 查询参数，禁止为每个动作新增顶层 Function。以下为 V2 公共契约；旧 GET/PUT 保留受限 Legacy 兼容路径，当前实现说明见 WORKFLOW_ARCHITECTURE.md。

| 方法与参数 | 请求 | 返回 |
| --- | --- | --- |
| GET resource=capabilities | 无 | protocolVersion、节点类型、启用特性、限制 |
| GET resource=definitions | cursor、limit | 当前用户定义与可读模板列表 |
| POST resource=definitions | definition（服务端分配 workflowId/revision）、editor | 201，workflowId/revision/editorRevision |
| PUT resource=definitions&id=… | baseRevision、baseEditorRevision、definition、editor | 200，新 revision/editorRevision；冲突 409 |
| GET resource=definitions&id=…&revision=… | revision 可省略取当前 | definition、对应 editor、structuralValidity、diagnostics |
| PUT resource=editor&id=… | baseEditorRevision、editor | editorRevision |
| POST resource=validate | saved：workflowId、revision、environmentRef、input?；draft 见本文整改增补 | CompileResult、checks、关联请求与诊断；无输入明确 unchecked |
| GET resource=revisions | workflowId、cursor?、limit? | owner 修订摘要分页；不由 Run 历史反推 |
| GET resource=environments | 无 | 已授权环境引用、修订及脱敏能力，不返回凭证 |
| GET resource=tools&environmentRef=… | cursor、limit | 已授权工具及 Schema/摘要/可用性 |
| POST resource=tools&op=discover | environmentRef、已登记 connectorRef | 实际发现且经过授权过滤的目录；不接受任意命令/URL |
| POST resource=migrations&op=preview | workflowId、sourceDigest | migrationId、candidate、差异、诊断 |
| GET resource=migrations&workflowId=…&op=legacy | 无 | owner 隔离且脱敏的 source/report/sourceKind/sourceDigest；详情 legacyAvailable 指示入口 |
| POST resource=migrations&op=apply | migrationId、sourceDigest、baseRevision（首次 null）、candidate、editor | 首个 V2 修订；重发返回同一结果 |
| POST resource=definitions&op=copy | sourceWorkflowId、sourceRevision | 新 Workflow ID、provenance，201 |
| DELETE resource=definitions&id=… | baseRevision | 逻辑归档，保留被引用修订与历史 |
| GET resource=artifacts&id=… | 无 | 授权、脱敏后的内容或短期访问地址 |
| POST resource=runs | CreateRunRequest；Idempotency-Key 头 | 202，runId/status/revision/eventsCursor |
| GET resource=runs&id=… | 无 | RunRecord |
| GET resource=runs&workflowId=… | cursor、limit | owner 范围内的历史列表 |
| GET resource=steps&runId=… | cursor、limit | StepRecord 分页 |
| GET resource=events&runId=… | afterSeq、limit | events、nextSeq、hasMore、status |
| POST resource=runs&id=…&op=cancel | 空对象 | 202 取消请求，终态重复请求返回 200 |
| POST resource=runs&id=…&op=resume | checkpointId、resumeInput、幂等键 | M2；M1 返回 409 UNSUPPORTED_CAPABILITY |

CreateRunRequest 为 `{ workflowId, revision, input, environmentRef, launchContext? }`。独立 validate 仅供诊断，不签发长期执行授权。创建 Run 必须重新读取指定修订、验证输入和所有产品关联、解析授权环境与注册表、编译并检查额度，再冻结快照并入队；不能相信客户端 valid/hash。Worker 领取后核对协议/编译指纹及当前授权撤销状态，不匹配时失败，不能换新版本继续。工具调用前仍检查即时授权。launchContext 仅包含 courseId/assignmentId/workflowTemplateId 候选身份，服务端重新授权并与真实产品数据匹配后冻结在应用元数据中；Worker 看不到它。请求不接受 ownerUserId、角色、客户端 Run 状态或任意定义替换。

认证失败 401；无权对象查询统一 404；已知有权限对象上的动作权限不足 403；格式 400；语义校验 422；修订/幂等冲突 409；配额 429。错误体 `{ error: { code, message, diagnostics?, requestId } }`。外部工具的 401 是 Step 错误 externalStatus，不等同于调用用户的 API 会话失效。

认证通过后先查幂等记录，再决定是否重新做创建预检；已存在 Run 的重发不重新编译或改用新的环境修订。首次请求的幂等预留、额度占用、Run 和队列写入为一个事务；编译在事务前对不可变修订完成，事务内复核对象归档/权限/环境修订与撤销 epoch，已改变时重做预检或返回冲突。相同 owner、同幂等键与相同规范请求返回同 runId；同键不同输入返回 409。幂等记录独立于历史清理保留至少 24 小时；过期后重发可能新建 Run，客户端必须知晓。Run 与待执行工作项事务性写入，不能先返回成功再依赖一次不可恢复的网络通知。

### 7.2 状态与事件

```ts
type RunRecord = {
  runId: string; workflowId: string; revision: number;
  mode: "live";                    // 此结构只描述 Live Run
  verification: "unverified" | "passed" | "failed";
  status: "queued" | "running" | "waiting" | "success" | "failed" | "cancelled";
  definitionHash: string; semanticHash: string; compileFingerprint: string;
  environmentRef: string; environmentRevision: string; policyVersion: string;
  inputRef: string; outputRef?: string; error?: ExecutionError;
  createdAt: string; startedAt?: string; finishedAt?: string;
  cancelRequestedAt?: string; lastSeq: number;
};
type RunEvent = {
  protocolVersion: "1"; eventId: string; runId: string;
  seq: number; type: string; occurredAt: string;
  stepId?: string; nodeId?: string; attempt?: number;
  stateVersion?: number;
  payload: JsonValue;               // 各 type 使用封闭 Schema
};
```

归档仅阻止新建 Run 和继续编辑，保留已接受 Run 的冻结执行与历史查询；如需停止已接受 Run，用户另行取消。列表默认隐藏归档定义并可显式查看。

StepRecord 至少包含 stepId/runId/nodeId/invocation/attempt、status、inputRef/outputRef、stateVersionBefore/After、startedAt/finishedAt、toolCallIds、usage/error。历史兼容记录通过独立 Legacy DTO 读取，不能为旧 Run 伪造上述哈希和环境身份。

M1 事件类型为 run.queued/started/completed/failed/cancelled、step.started/completed/failed、tool.started/completed/failed/skipped、state.updated、run.cancel_requested。M2 增加 waiting/resumed 与子图路径。终态事件与 Run 终态在一个事务中落库。

seq 在 Run 内服务端单调分配，eventId 唯一；API 使用 seq 增量分页。浏览器重复接收按 eventId/seq 去重。M1 用有界轮询实现可靠观察（活跃页建议 1 秒，后台退避至 5 秒），流式传输可后续增加且复用相同事件协议。断网不停止 Run，刷新可补取。

节点完成提交包含 Step 输出、经过校验的 State 快照/patch、stateVersion 和对应事件，必须原子写入；引用对象先写入授权存储并确认存在，事务提交后可见，失败产生的孤立对象由 GC 清理；以 `(runId, stepId, attempt)` 去重，并校验预期前一 stateVersion。数据库提交失败不得展示节点成功。外部副作用与数据库不能组成事务：副作用已发生但提交失败时记录/诊断不确定性，M1 不自动重放。内部审计可引用无敏感值的外部 requestId 供人工核查。

queued 可进入 running、failed（预检失败/排队超时）或 cancelled；running 可进入 success/failed/cancelled；waiting/resume 仅 M2。取消请求与成功竞争使用数据库条件更新，先提交的合法终态生效，不覆盖已经完成的 Run。达到取消状态前不得声称副作用已停止。

Worker 通过服务端受控任务存储适配器领取租约并 heartbeat。租约含 fencing token；事件写入必须验证当前 token，旧 Worker 不能提交新结果。M1 租约过期将已启动运行标记 failed/WORKER_LOST，不自动重放执行；返回状态查询保留已产生证据。M2 再通过 Checkpoint 实现可恢复重调度。

M1 服务端必须有独立于浏览器的 watchdog/reconciler，处理无 Worker、队列滞留、租约过期、取消和总超时。Local 适配使用租约 30 秒、heartbeat 5 秒、独立 watchdog 每 5 秒扫描（契约要求不超过 10 秒）；排队最长 60 秒，到期 QUEUE_TIMEOUT。Run timeoutMs 从 running 开始计算，queued 另受排队上限约束。maxOutputTokens 是每次模型请求上限，maxToolCalls/maxNodeExecutions 按 Run 累积且在调用前检查。maxCost 在 M1 不开放（提供值返回 UNSUPPORTED_CAPABILITY）；真实费用可得时展示，不能以估算声称硬预算。每用户默认最多 2 个运行中、5 个排队，资源策略可调低；原子入队校验防止并发绕过。

停止/取消提交需要同时封禁新的 Step 和工具调用。Worker 在每个外部调用前检查租约/取消，丢失存储连接即停止调度；不能保证撤回已发出的网络请求。所有 Worker 消失时 watchdog 仍负责收敛终态，不能依赖死进程把自己标失败。

### 7.3 存储与安全

建议持久化实体：workflow_revisions、workflow_editor_documents、workflow_run_jobs、workflow_live_runs、workflow_run_steps、workflow_run_events、workflow_idempotency、workflow_migration_reports。名称为设计名，实施 migration 可复用现有表，但必须满足隔离和不可变性。

定义、Schema、配置和事件 payload 可用 JSONB；owner、workflow/revision、run/step/event 身份、状态、序号、时间和外键使用关系字段。事件唯一约束 `(run_id, seq)` 和 eventId；Step 唯一身份包含 Run；父子关系不可跨 owner。前端无 Live Run 写权限。服务端授权与 Supabase RLS 同时保留。

旧客户端 PUT 中的 Run History 只能走 Legacy/Demo 兼容路径，永远不能写 Live 表、验证结果或正式评价。旧 PUT 不允许删除/覆盖已迁移 V2 定义；冲突返回 409 CLIENT_UPGRADE_REQUIRED。内置模板身份由服务端确定，不能信任客户端 builtinWorkflowIds。

正式历史列表延续每用户每工作流最近 20 条终态记录的约束；Legacy 与 Live 合并计数，物理清理不跨 owner/workflow。活跃 Run 是独立作业，不参与终态历史额度。清理时级联 Trace/产物，但不能删除其他领域引用的证据；需要保留的最小证明先进入独立证据存储。V2 修订在 Run/发布/证据引用存续期间禁止删除。保留最小 owner 作用域 tombstone 时 GET 返回 410；其他主体或已清除 tombstone 返回 404，不能泄露历史存在性。幂等键在有效窗口内命中已淘汰 Run 时返回原 runId 与 historyExpired=true，不重新执行。

Demo/Live 是执行来源，Verified 是独立验证记录的结果，不能合成一个“成功”标识。M1 新 Live 默认 unverified；验收包可证明能力，但不自动写学员评价。新的 Live Run 不走旧 Demo 成功即完成作业路径；可记录真实尝试/产物，正式作业完成仍需独立评价授权。保留教学 Demo 的展示，禁止用其输出认定真实完成。

审计与恢复资料不全量暴露：Worker 执行使用受保护的原始 Input/State；浏览器 API 只提供字段策略脱敏的投影，不能把脱敏值反馈进执行。M1 不新增正式 Evidence/评价写入消费者，避免将新证据流水线偷偷纳入本里程碑；已有消费者的历史引用必须先审计。存在真实引用时，先复用既有 Evidence 存储保存最小证明或完成数据迁移，再按 20 条规则清理，不能先删再补。Legacy 迁移本身不淘汰仍在现有保留范围内的历史。

## 8 契约六 部署与发布

### 8.1 M1 运行服务

优先 Python LangGraph Worker，API/前端保留 TypeScript。Worker 以固定版本镜像/锁文件运行，不与 PDF parser 混用执行进程。依赖 Python 服务沿用仓库 uv 管理方式，JS 依赖使用 pnpm。

内部接口为 `GET /health`、`GET /capabilities`、`POST /v1/validate`。validate 请求携带协议版本、定义及经过解析的注册表快照，返回 CompileResult；健康接口不返回环境变量。执行通过事务性任务队列领取，不使用浏览器直接 POST Worker 执行。API 到 Worker 采用服务间身份认证，Worker 到数据库使用仅限运行域的权限；生产身份载体在部署环境确定，不能把静态公钥/URL 当作鉴权。

M1 复用现有 Supabase/Postgres，以成熟持久任务队列组件或受控数据库任务适配器实现领取、租约、幂等；不在应用层重写通用分布式队列。实施时先验证现有数据库是否可用受维护的队列组件，再锁定依赖和权限；此部署适配不得改变公共 Runtime API。

environmentRef 指向服务端拥有并版本化的环境配置：provider/model 引用、tool registry、Secret 引用、网络策略与资源限制。创建 Run 时解析并冻结非敏感环境修订；Secret 在调用时按授权解析并记录版本身份，不记录值。Secret 撤销优先于历史快照，不能因冻结修订继续使用已撤销凭证。

M1 环境与 Secret 由受信任运维配置注入；提供环境/工具目录选择，不新增学员 Secret 写入 UI。重新绑定指运维将 Secret 引用映射到当前服务端 Secret 后端并授予 owner 权限，用户只能选择已授权引用；不得在普通配置表单粘贴 API Key。该流程和验收 setup 必须可重复执行。工具目录的读/发现接口在第 7 节，connector 本身只由受信任配置登记。

HTTP 采用注册目的地、方法和路径范围；拒绝未授权重定向、私网/metadata 地址及 DNS 重绑定。LOCAL 测试环境可显式放行 fixture 地址，不能带入 Hosted。MCP stdio 只运行管理员登记、固定版本命令，用户不可提交任意 shell 命令。M1 无任意用户代码，因此不以通用生产 Sandbox 为前提。

Hosted 前识别 Supabase 项目、检查迁移历史、增量迁移、同步安全 fixtures，先 API smoke 再浏览器；不在 Preview build 自动迁移共享库。新增/调整 API 后提供真实 Vercel 生成 Function 数量，限制为 12；rewrite 不算数量证据。Worker 部署与 frontend READY 独立验收。

### 8.2 M3 发布结构和外部 API

```ts
type PublishedWorkflowVersion = {
  publishedVersionId: string; workflowId: string; revision: number;
  definitionHash: string; compileFingerprint: string;
  inputSchema: JsonSchema; outputSchema: JsonSchema;
  dependencyManifestRef: string;
  verificationReportRef: string; createdAt: string;
};
type Deployment = {
  deploymentId: string; publishedVersionId: string;
  environmentRef: string; environmentRevision: string;
  status: "active" | "disabled";
  limits: JsonValue; authPolicyRef: string;
};
```

外部逻辑接口：POST `/v1/deployments/{id}/runs`，GET `/v1/runs/{id}` 与 `/events`，POST `/v1/runs/{id}/cancel`。实际托管路由在 M3 确定，不意味着增加多个 Vercel Function。创建时返回 runId、publishedVersionId、状态与授权查询位置；冻结版本，不跟随编辑草稿。

部署 Key 只保存安全哈希，签发时展示一次；包含 keyId、owner/tenant 边界、deployment scopes、有效期和撤销状态。服务端从凭证解析主体；调用方 tenantId 不作为权威。M1 使用 owner 隔离；M3 若引入共享 tenant，必须实现完整成员与授权模型，不能只添加字段。

Webhook 包含 eventId/runId/publishedVersionId，使用时间戳与 HMAC 签名，接收方按 eventId 去重并限制重放窗口。发送为至少一次交付，有界重试并记录失败。回滚显式改变 Deployment 指向，仅影响新 Run。撤销凭证阻止后续请求，不隐式取消已接受 Run；需要停止时使用显式取消/停用操作。

项目导出携带同一修订与依赖锁、运行入口、Schema 和配置模板，排除 Secret/用户 Trace。M3 验收以受控确定性工具的结果和图路径一致为准，不要求不同时间模型输出相同。

## 9 契约七 旧版本迁移

### 9.1 版本识别

LocalStorage 的 `knowledge-atlas.workflow-state.v2` 是历史存储 envelope 版本，不是 Definition V2。读取先检查明确 schemaVersion；无版本但具有旧 nodes/edges/runOrder 的载荷进入 Legacy parser；未知新版本返回只读诊断，不能当作空工作流或恢复 Demo 默认。

迁移输入为 Legacy 原始定义、来源/owner、旧编辑状态、模板版本信息；输出为 `{ migrationVersion, sourceDigest, candidate?, editor?, diagnostics, readiness: 'ready'|'needs_configuration'|'unsupported', legacyRef }`。同 owner/workflow/sourceDigest/migrationVersion 幂等。

### 9.2 字段规则

| 旧字段 | 迁移规则 |
| --- | --- |
| id/name/description | 保留身份与文案；冲突报告，不合并不同 owner |
| node.id/label | 保留；重复 ID 阻止转换 |
| node.x/y 与 nodePositions | 按工作流拆分；仅确认属于当前工作流的覆盖位置优先，其余用节点原始坐标 |
| edges.from/to/handles | 保留引用和展示端口；语义只采用能够明确映射的出口 |
| kind | 使用版本化映射表；llm/tool 等缺少真实配置时为 needs_configuration |
| logic/subtitle/reads/writes | prose 保留说明；reads/writes 只作迁移提示，缺 Schema/结构化映射不得猜测 |
| control.branches | 仅可确定解析的结构化目标迁移；名称/自然语言条件不推断 |
| code/codeReview/codeSnapshots | 作为 Legacy 教学资产保留，不自动执行 |
| runOrder/result/template.code | 保留 Legacy 内容；不进入 Live 语义 |
| schemaSaved | 不作为 V2 校验通过依据；重新校验 Schema 与配置 |
| stateValues | 保留旧演示输入/状态；不冒充新 Run State 或恢复点 |
| environment 明文凭证 | 从普通设置响应屏蔽；转为待重新绑定引用，不复制到新定义 |
| Run History | 保留原始 ID/时间/输出和已存关联；来源不明确标 legacy_unknown，不伪造哈希或验证记录 |

映射表修订 `mappingRevision=2` 按拓扑识别边界：无入边且有出边的 system 可映射 start；无出边的 output、或有入边且无出边的 system 可映射 end。带出边的中间 output、其他 system 保留为 unsupported，不根据名称猜测角色；所有节点、边和源资料均保留。

无歧义的 start/end/普通边可自动转换；只有结构完整且执行配置全部通过校验的候选可 ready。旧 llm/agent 的显示名称不足以决定模型、工具或控制流。unsupported 节点允许在兼容视图展示，Live 编译失败并定位。

### 9.3 执行流程与回退

持久权威来源为当前 owner 的服务端记录。LocalStorage 仅提供显式导入：必须登录、预览、确认后创建用户副本；不自动与服务器合并、不导入凭证或把本地历史提升为可信证据。源摘要按脱敏后的结构化来源计算，原始敏感字段不进入候选。

迁移首次保存的 baseRevision=null，要求不存在 V2 修订；否则返回现有迁移结果或 409，不覆盖已编辑 V2。候选经编辑也只能改变允许字段，apply 重新校验 sourceDigest 和 candidate，迁移报告/源快照/定义/布局事务性提交。复制模板时生成独立 ID，provenance 保存 sourceTemplateId/sourceRevision；这是来源，不是课程授权。旧课程入口保持原模板身份；从模板复制的用户工作流若不等于 Assignment 当前授权模板，不携带正式 launchContext，UI 明确作为独立实验运行。未来允许派生模板提交需另有产品规则。

1. 读取原始数据库记录并计算摘要，创建 owner 隔离的迁移报告。记录中的敏感设置不进入普通导出或日志。
2. 纯转换生成候选与诊断。提供节点/配置/连线差异预览，不静默覆盖已有修改。
   同一未应用报告再次显式预览时，以其原 `workflow_id`、owner/sourceDigest/source guard 生成当前映射的候选、布局和诊断，响应包含 `mappingRevision` 与 `previewAudit.originalMigrationId/storedMappingRevision/candidateRecomputedFromSource`。原报告候选和源快照继续作为原始预览审计保留，不把响应重算说成持久报告升级；已有 source guard 元数据校验规则保持。`migrationVersion=1` 与迁移身份不变。本地导入重用原私有目标 ID；apply 以实际提交候选及其 hash 保存首修订。报告已经应用（含 preview RPC 期间的并发应用）时返回原报告，重复 apply 返回原回执；映射修复不会后台改写已有 V2 修订。
3. 用户显式保存迁移候选，服务端以源摘要及 baseRevision 做并发检查，事务性创建首个 V2 修订、布局和 Legacy 引用。
4. 所有配置通过校验并重新绑定凭证后才允许 Live。用户可以继续查看 Legacy/Demo，而不是被迫运行不可用候选。
5. 升级客户端的定义写入只写 V2；迁移前的 Legacy 编辑仍可通过限定兼容路径保存，Legacy/Demo 历史仍可写非可信存储。旧客户端整体 PUT 如果包含任一受保护 V2 身份，整个请求先校验后以 409 拒绝，不允许部分更新设置、定义、历史或删除记录。未知旧扩展字段保存在受控 Legacy 附件中，不塞进执行 config。
6. 回退切换编辑器到兼容只读/原 Demo 视图，不回滚数据库 migration，不删除新修订与历史。源摘要变化重新预览，不能复用过期迁移结果。

原始工作流定义保留其非敏感内容；若旧定义 config/code 或原始设置包含 Secret，则例外：只保留脱敏原始内容和凭证处理审计，不为“备份”复制明文。重新绑定后对旧存储做授权清除；已暴露 Key 需要轮换。

内置模板来自服务器模板目录。用户自定义同名模板不被合并覆盖；复制生成新 Workflow ID。已保存的模板修改作为用户派生定义保留。历史数据若从未保存用户修改，不能凭空恢复，需显示该限制。

## 10 本轮设计审查结论

2026-10-14 文档审查修正了结束节点输出、LLM 消息映射、Router 判定、纯 Compiler 输入、草稿保存/布局修订、即时授权、Worker 故障收敛、批次工具副作用、历史淘汰幂等和迁移来源等契约缺口。对应验收新增 M1-25 至 M1-34。M1 规则已接受为实施基线；部署适配的包版本、Secret 后端、队列组件需在工作包 A 用实际环境确定，但不得改变本文协议或降低安全/真实执行验收。

## 11 资料与设计依据

- [当前工作流架构](../WORKFLOW_ARCHITECTURE.md)描述现有实现；本设计不替换其事实记录。
- [现有 fixture 验收矩阵](../../tests/workflow-integration/docs/ACCEPTANCE.md)是测试输入；独立脚本成功不能替代平台验收。
- [LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)：StateGraph、节点、边、Reducer 和条件流用于执行适配；本文件的版本化 IR/API/权限是 EduFlow 设计。
- [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)：Checkpoint 能力归 M2，Run Trace 不替代 Checkpoint。

实施时锁定 SDK/Runtime 的具体版本并运行协议一致性测试；本文不假定可用的最新包版本或模型名称。
