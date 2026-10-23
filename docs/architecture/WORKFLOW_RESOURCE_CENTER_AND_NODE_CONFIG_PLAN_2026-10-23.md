# 工作流资源中心与节点配置改造方案（P0，2026-10-23）

状态：**方案已确认（决策见第 8 节）；尚未实施。** 交互设计已按设计稿定稿（见下方「设计稿」）。分阶段的执行步骤见 [实施计划](WORKFLOW_RESOURCE_CENTER_IMPLEMENTATION_PLAN_2026-10-23.md)。
依据：`feat/workflow` @ `ff3b9db` 的只读核查，以及 2026-10-23 的画布可用性审查（模型只能接 DeepSeek、提示词不能插变量、读写依赖 JSON Pointer、资源配置挤在 360px 侧栏等）。
前置决策沿用 [2026-10-22 开发计划](WORKFLOW_CANVAS_AND_REAL_SCENARIOS_PLAN_2026-10-22.md)：D1=A（共享 Runtime 环境 + 每用户连接），D2=A（连接版本不可变，节点显式升级到新版本）。

设计稿：Design 画布「EduFlow 工作流画布改造」（https://claude.ai/artifact/F6AEviLALhRyPYuncBbs6b，已设为知道链接即可查看）。共 10 张画板：

| 画板 | 对应章节 |
| --- | --- |
| 画布总览 · 浮动控件（含顶栏「变量」下拉） | 2.1、2.3、2.6 |
| 节点面板 · 模型（参数式提示词） | 2.4、3.3 |
| 节点面板 · 函数（同一骨架 + 变量选择器） | 2.4 |
| 节点面板 · 工具（表单式参数） | 2.4 ⑥、3.5 |
| 节点面板 · 运行数据 + 历史抽屉（含运行所用变量环境） | 2.4、2.5 |
| 悬窗 · 节点展开调试 | 2.4 |
| 侧面板 · 数据（State） | 2.3 |
| 悬窗 · 资源中心 · 模型供应商总览 | 2.2 |
| 悬窗 · 资源中心 · 添加模型 | 2.2 |
| 悬窗 · 资源中心 · 变量（变量环境标签页） | 2.2、2.6 |

## 0. 结论

P0 只解决"用户打开画布后不知道去哪配、配了不会用"，拆成四块：

| 编号 | 内容 | 主要落点 | 是否需要后端 |
| --- | --- | --- | --- |
| P0-A | **资源中心悬窗 + 画布浮层化**：模型、API、MCP、函数、变量移入画布上的全屏遮罩悬窗；流程层面板改为浮动侧面板；历史栏改为浮动抽屉 | 前端 | 少量 API（引用查询、测试回显） |
| P0-B | **OpenAI 兼容模型供应商**：一个供应商多个模型，自定义 baseUrl、Key，可拉取 `/models` 后勾选启用 | Worker + 前端 | 是 |
| P0-C | **统一节点面板**：所有节点共用「配置 ｜ 运行数据」骨架，输入/输出改为表格 + 变量选择器，运行数据来自历史选中的那次运行 | 前端 | 否 |
| P0-D | **模型节点参数式提示词**：先声明输入参数，System / User 提示词只引用参数名（`core.llm` 只保留新版 typeVersion 2） | 前端 + Worker | 是 |
| P0-E | **工具节点表单式参数**：按工具的参数 Schema 逐行填写，每个参数可绑定变量或直接填固定值（`core.tool` 只保留新版 typeVersion 2） | 前端 + Worker | 是 |
| P0-F | **用户自建变量环境**：像 Apifox 一样，用户可以创建「开发 / 测试 / 正式」等多套变量值并在顶栏切换，与平台运行环境解耦 | 前端 + API + Worker + 数据库 | 是（1 个前向迁移） |

约束：

- **不为新功能新增 Vercel Function**：全部复用 `api/workflows.ts → handleWorkflowV2` 已有的 `extensions` / `configuration` 资源分支。
- **工作流后端合并进 `edu-flow`**（R11）：Python Compiler 改为 `edu-flow` 中的 `api/workflow-compiler.py`，Worker/watchdog 改为 `edu-flow` 的 Daemon，`api/health.ts` 移出入口以保持 12 个 Function；验证后删除 Vercel 项目 `edu-flow-workflow`。不改产品功能，由实施计划 M14 执行。
- **只有一个数据库迁移**：P0-F 给 `workflow_workspace_configuration` 增加变量环境列，并清空旧的按运行环境覆盖的值。连接 `content` 和变量的其余新增字段都在 jsonb 内，只改校验。
- **不保留旧版本节点**（R3）：目前仍在开发阶段，`core.llm`、`core.tool` 只保留新版，旧版定义直接废弃，不做兼容运行和自动转换。
- **不新增路由**：资源中心只做编辑器内的悬窗（R2=B）。
- **不改变 LangGraph State 语义**：节点之间仍然只通过 State 传值。"节点输出""运行数据"都只是编辑器层面的投影。

## 1. 现状约束（代码级）

| # | 事实 | 证据 | 对方案的影响 |
| --- | --- | --- | --- |
| 1 | 用户自建资源存于 `workflow_private.p4_catalog`，主键 `(owner, environment_ref, kind, ref, version)`，版本不可变 | `supabase/migrations/20261018143554_workflow_p4_execution_policies.sql` | 资源中心以 `ref` 作为逻辑身份聚合多个版本。"编辑"等于发布 `ref@v+1` |
| 2 | 资源**按运行环境分区** | 同上，`p4_catalog_read(owner, environment)` | 每个部署只配置一个平台运行环境，界面不暴露它（R13，见 2.7）；资源中心自动使用这个环境，不提供选择 |
| 3 | 凭据写入 Vault，内容里只保留 `secretRef`；只有 Worker 能解密 | `20261018143955_workflow_p4_managed_secrets.sql` | 密钥只能存在连接里；变量表不承载密钥（P0 保持现状） |
| 4 | 变量是账号级的 jsonb 数组，`overrides` 按**平台运行环境** `environmentRef` 覆盖，带 revision 乐观锁 | `20261017123725_workflow_environment_variables.sql`、`api/_lib/workflowV2.ts:141-154` | P0-F 把覆盖的键改为用户自建变量环境的 id，需要一个前向迁移 |
| 5 | 连接类型白名单为 `http` / `deepseek` / `mcp-http`；DeepSeek 限定官方地址和两个模型 | `services/workflow/src/eduflow_workflow/extensions.py:71-74` | P0-B 需要放开为 `openai-compatible` |
| 6 | 模型适配器固定为 `ChatDeepSeek` | `runtime.py:135` | P0-B 在这里分流；`langchain-openai` 已是 `langchain-deepseek` 的依赖（`uv.lock:713-722`），不引入新依赖 |
| 7 | 连接测试只返回 `{ok:true}`，HTTP 响应体被丢弃 | `extensions.py:23-50` | 资源中心的测试需要返回脱敏后的预览和模型列表 |
| 8 | 绑定只支持 `input` / `state` / `environment` 加 JSON Pointer；模型节点只接受 `messages`；工具节点只有一个对象输入 `arguments` | `contracts.py:113`、`registry.py:31-32` | P0-D、P0-E 用 typeVersion 2 替换旧定义，旧版不再注册 |
| 9 | 平台环境自带 stdio MCP（如 Everything MCP），用户自建只允许 streamable-http | `examples/local-environments.json`、`extensions.py:96` | 资源中心要区分"平台提供"（只读）和"我的"（可编辑） |
| 10 | 运行 Step 带有 `input` / `output` | `domain/v2/types.ts`（`WorkflowStepV2`） | P0-C 的「运行数据」只需前端实现 |
| 11 | 画布已是 React Flow 铺满（`.wf-v2-canvas{position:absolute;inset:0}`），底部有运行历史栏，可 `controller.selectRun(record)` 切换查看 | `workflowV2.css`、`LiveWorkflowEditor.tsx`（`wf-history-dock`） | 浮层化是在现有结构上收敛，不重写画布；「运行数据」直接跟随历史栏的选中运行 |
| 12 | Worker 构建运行环境时按运行环境 ref 合并变量值，并把结果与 `configurationRevision` 冻结进 Run 的 `registry_snapshot`；恢复检查点时使用冻结值 | `registry.py:98-110`、`server.py:188-191`、`20261017124653_workflow_configuration_runtime_read.sql` | P0-F 只需把"按哪个键取覆盖值"改为所选变量环境 id，并把该 id 一起冻结；冻结机制本身不变 |
| 13 | 演示模板与本地种子中有使用旧版 `core.llm` / `core.tool` 的定义 | `src/demo/workflow/productWorkflowTemplates.ts`、`src/demo/workflow/scenarios/*.json`、`supabase/seed.sql` | R3 废弃旧版后需要同步改写这些模板和种子 |

## 2. 信息架构

### 2.1 画布为底，浮层分四级

| 层级 | 内容 | 形态 |
| --- | --- | --- |
| **L0 画布** | React Flow 全屏铺满 | 永远在最底层；任何面板开关都不触发重新布局或视口变化 |
| **L1 悬浮控件** | 左上「添加组件」「主流程 ⚙」「流程说明」；右上胶囊「数据 ｜ 资源 ｜ 运行 ｜ 导出」；左下缩放与视图工具（适应画布 / 可读视图 / 缩放比例 / 小地图 / 执行气泡）；左下角运行历史状态行；右下 EduFlow 助手入口 | 圆角、轻阴影，不贴边 |
| **L2 浮动侧面板** | 节点配置、数据（State）、本流程资源、运行详情 | 浮动卡片，离画布边缘 12px，从右上胶囊下方开始；同一时刻右侧只开一个；默认宽 460，可拖拽 360–720（State 面板默认 640），宽度只存 localStorage 作展示偏好 |
| **L3 遮罩悬窗** | 资源中心、节点展开调试、版本历史、运行准备 | 四周留约 40px，背景压暗；关闭后回到画布，草稿不丢 |

GlobalNav 和现有工作流顶栏（返回、名称、版本状态、执行方式、撤销/重做、版本与恢复、保存、校验、运行）保留；**去掉「运行环境」下拉**（R13，见 2.7），在原位置放「变量环境」下拉（见 2.6）。原则：**资源只在资源中心创建和编辑，画布只负责选择和引用**。画布内的"新建连接"入口都改为"在资源中心新建"：打开资源中心悬窗，创建完成后自动回填到当前节点。

### 2.2 资源中心（L3 悬窗）

**入口**（R2=B，只做悬窗，不新增路由）

- 右上胶囊「资源」侧面板底部的「打开资源中心」。
- 节点里所有资源选择器的「在资源中心新建」，完成后回填。
- 资源有新版本时，画布上的提示「N 个资源有新版本」。

**布局**：悬窗头部为标题、说明、关闭（不显示运行环境，R13）；主体左侧是分类导航（模型供应商 / API / MCP 服务 / 函数 / 变量，带数量），右侧是该分类的内容。

**模型供应商总览**（参考 WorkBuddy 等桌面 AI 应用的模型设置，但支持一个供应商多个模型）

- 顶部：说明文字、搜索框、主按钮「+ 添加模型」。
- 每个供应商一张卡片：
  - 卡片头：首字母图标、名称、类型（DeepSeek / OpenAI 兼容）、版本、地址、凭据状态、被几个工作流使用、最近一次连接测试的状态；操作为「测试连接」「编辑」「⋯」（停用、版本历史、引用）。
  - 卡片体是模型表：模型名 · 来源（从 `/models` 拉取 / 手动添加）· 被引用的节点数 · 启用开关。
  - 最近一次测试中发现、但不在 `modelRefs` 里的模型标为「新发现」，默认不启用。该列表只来自测试响应，不持久化，也不是权威数据。
  - 开关改动先暂存，卡片底部提示「启用或停用模型会发布 v4，正在使用 v3 的节点不受影响」，确认后发布一个新版本。
  - 卡片底部有「+ 在此供应商下添加模型」。
- 本地供应商（地址为 `http://localhost`，只有本地开发部署允许）标注「仅本地开发可用」。
- 平台提供的供应商单独一张只读卡片，标注"由平台管理凭据"，修正当前把所有模型都标成"执行端管理"的问题。这张卡片只在平台运行环境带有平台模型时出现：本地开发部署有平台 DeepSeek；Hosted 的公共环境不带平台模型（R12），因此不显示。

**添加模型对话框**（叠在资源中心之上的小对话框）

1. 切换「新供应商 / 添加到已有供应商」。后者只需选供应商，再勾选模型，保存即发布该供应商的新版本。
2. 供应商用卡片网格选择预设：DeepSeek / OpenAI / 通义千问 / Kimi / 本地 Ollama / 自定义 OpenAI 兼容。预设只负责预填名称和 Base URL。
3. API Key（只写不读）+「测试连接」：成功后显示耗时，并从 `{baseUrl}/models` 拉取模型列表。
4. 「启用的模型」：拉取到的模型以勾选列表展示，支持搜索；列表里没有的可以手动输入模型名。节点里只能选到已启用的模型。
5. 底部汇总「将创建供应商「通义千问」v1，启用 2 个模型」，然后取消 / 保存。

**其他分区**

| 分区 | 列表项 | 详情 | 说明 |
| --- | --- | --- | --- |
| API | 名称 · 方法 · 地址 · 读/写 | 配置 / 测试 / 引用 / 版本 | P0 沿用现有能力（GET/POST + path）；完整请求编辑器属于 P1 |
| MCP 服务 | 名称 · 传输方式 · 已启用工具数 | 配置 / 工具 / 引用 / 版本 | "先连接、再发现、再勾选"属于 P1；P0 把现有表单搬进来，并展示已发现的工具 |
| 函数 | 名称 · 语言 · 用途 | 代码（只读预览）/ 引用 / 版本 | 函数仍在节点里编写和发布；资源中心负责浏览和停用 |
| 变量 | 表格：名称 · 类型 · 默认值 · 当前变量环境的值 · 说明 · 引用；表格上方是变量环境标签页 | — | 详见 2.6。已覆盖的值高亮，未覆盖的以灰色占位显示默认值；整表一次保存（revision 乐观锁） |

**通用交互**

1. **编辑即发新版本（D2=A）**：保存时提示"将发布 v4；以下 3 个工作流的 5 个节点仍引用 v3"。旧版本不自动替换；节点「处理」段顶部显示「已有 v4，本节点使用 v3 · 升级」，点击后写入草稿并进入撤销栈。
2. **凭据**：只写不读，重新输入即轮换（发布新版本）。HTTP 和 MCP 以请求头传入（`Authorization` / `X-API-Key`，沿用 Worker 现有白名单），模型填写 API Key。
3. **测试**：结果区显示状态、耗时；HTTP 显示**脱敏截断后的响应预览**（最多 4KB），模型显示拉取到的模型列表，MCP 显示工具列表。写入型 API 测试仍需显式勾选"允许修改外部数据"。
4. **引用**：列出引用该资源（模型细到 `modelRef`、变量细到 key）的工作流和节点，点击后关闭悬窗并在画布定位节点。

### 2.3 画布 · 流程层（L2 侧面板）

右上胶囊从 `State | 连接 | 执行 | 导出` 改为 **`数据 | 资源 | 运行 | 导出`**。

- **数据（原 State）**
  - 表格：字段 · 类型 · 初始值 · 更新方式 · 写入节点 · 读取节点。后两列由 3.4 的纯函数派生，点击节点名在画布定位。
  - 展开某一行可编辑类型、初始值、更新方式、说明；自定义 Reducer 收在行内「高级」。
  - 没有任何节点读写的字段给出"可以删除"提示。
  - 工作流说明、运行限制、"发现 MCP 工具"按钮移出，放进「主流程 ⚙」图设置。
- **资源（原 连接）**：只展示本流程引用的资源（由定义派生）和未绑定的能力（复用 `CapabilityBindingPanel`），每项标注可用 / 有新版本 / 已停用；变量只读展示本流程用到的 key 和当前值；底部「打开资源中心」。
- **运行（原 执行）**：显示历史抽屉中选中那次运行的详情（State 变化、错误、检查点恢复）。历史抽屉只负责列表和切换，两者不重复。

### 2.4 画布 · 节点层（统一节点面板）

LangGraph 节点的语义都是"从 State 读 → 执行 → 写回一部分 State"，所以所有节点共用一个面板骨架，只有「处理」段随类型变化：

```
┌ 头部：类型图标 · 节点名 · 类型徽标 · [展开调试] [⋯] [✕]
├ Tab：配置 ｜ 运行数据
│ 配置（四段，顺序固定，可折叠，段标题带计数）
│  1 输入   表格：参数名 ｜ 取值（变量选择器）       ← 所有节点同一组件
│  2 处理   模型：供应商 / 模型 / 提示词 / 参数；工具：资源 / 参数；
│           函数：代码；路由：条件；人工审核：表单
│  3 输出   表格：输出项 ｜ 写入 State 字段 ｜ 更新方式；下方注明下游读取者
│  4 高级   重试、超时、错误处理、可用工具、原始 JSON Pointer（默认折叠）
└ 底部：单步测试 · 运行到此节点 · 配置完整度
```

**① 输入表 + 变量选择器**（替代"数据来源 + 读取范围 + JSON Pointer"）

- 一行一个参数：「参数名」是节点内部名字（提示词、代码里引用它）；「取值」用变量选择器选，或直接填固定值。
- 参数从哪里来分两种：
  - **由 Schema 决定**（工具、已注册函数）：每个 Schema 属性一行，参数名只读，显示标题、说明、类型和"必填"标记，不能增删。
  - **由用户声明**（模型、代码函数）：可增删、可改名；参数名默认取所选字段的名字（选 `summary.topics` 即为 `topics`）。
- **固定值像表单一样填写**：按参数类型在行内显示对应控件——文本框、数字框、开关、下拉（enum）；对象和列表参数展开为子表单（复用 `SchemaForm`），不要求用户手写 JSON。每行右侧可以在「固定值 / 变量」之间切换。变量绑定以参数为单位：对象参数要么整体绑定一个变量，要么整体用子表单填固定值，子表单内的单个字段不能单独绑定变量。
- 变量选择器是分组树，各组用不同颜色的 chip 区分来源：
  ```
  启动输入            question  文本
  <节点名> 的输出      hnHits ▸ hits ▸ hits[].title …   （按写入节点分组）
  共享 State          messages  列表                    （无写入节点）
  环境变量            COURSE_NAME  文本
  固定值…
  ```
- 字段可展开到嵌套属性，结果写回同一个 `Binding.pointer`。可展开的属性来自声明的 Schema（State Schema、工具 outputSchema），以及历史选中运行的样例值；只来自样例的标注"样例推断，未声明类型"。
- 类型不兼容的选项置灰并写明原因（复用 `BindingFields` 现有的 `compatible`）。
- 原始 JSON Pointer 与 JSON 绑定编辑放进「高级」。

**② 输出表**

- 一行一个输出项：输出项 ｜ 写入 State 字段（同一个选择器，从 State 字段中选或"新建字段"）｜ 更新方式（覆盖 / 追加，来自字段 Reducer）。不写入的输出项显示为虚线的「不写入 · 选择字段」。
- 新建工具、函数、模型节点时，提示"把结果保存为 State 字段"，字段名默认取节点标签的 slug。只是编辑器便利，生成的仍是普通 State 字段 + `writes`。
- 段底注明"下游读取 X：<节点>"。

**③ 运行数据 Tab**（替代原方案中各段内联的"上次运行样例卡片"）

- 数据来源是历史抽屉中**当前选中的那次运行**（默认最近一次），取该节点的 Step：输入、输出、写入 State 的值、耗时。（设计稿中的"之前 → 之后"对比需要读取 checkpoint，列入 P1。）在历史中切换运行后，所有节点面板一起切换。
- 顶部标出来源（"来自运行 10/23 15:58:48 · 第 2 步 · 40ms"）并链接「在历史中查看」；节点未参与那次运行时显示"本次运行未经过此节点"；没有运行记录时不显示该 Tab。
- 只读；底部提供「用这组输入单步测试」「复制 JSON」。

**④ 展开调试悬窗（L3）**

- 头部「展开」进入，三栏：左栏「可用数据」（启动输入、上游节点输出、环境变量的实际值）｜中栏同一套配置 ｜ 右栏「输出」与 State 变化。顶部可切换数据来源的运行，「收回侧面板」回到 L2。
- 左栏字段可拖到中栏输入表：拖到已有参数上即重新绑定，拖到空行即新增参数。
- 「固定这组输入」（类似 n8n 的 pin data）**不在 P0**，见第 9 节。

**⑤ 模型节点（见 3.3）**

- 输入表声明参数，例如 `question ← 启动输入 · question`、`topics ← 整理社区问题 · summary.topics`、`course ← 环境变量 · COURSE_NAME`；可选「对话历史」选择一个 messages 类型的变量。
- 处理段：供应商（显示版本与升级提示）→ 模型（只列已启用的）→ 提示词 → 参数摘要（温度 / top_p / 思考开关，与 Worker 白名单对齐，点「参数」展开编辑）。
- 提示词：System 一栏，User / Assistant 消息可增删。输入 `{{` 或点「引用参数」只弹出本节点**已声明的参数**，插入后显示为不可拆分的参数 chip。引用未声明参数时可一键"添加为参数"。
- 输出表：`text → State · answer`（覆盖），`messages`、`toolCalls` 默认不写入。

**⑥ 工具节点（见 3.5）**

- 处理段只选工具（API / MCP 工具，带版本与升级提示）。
- 选定工具后，输入表按工具的 `inputSchema` 逐行生成参数行（Schema 决定，参数名只读），每行可绑定变量或按类型填固定值；必填参数未填时在段标题和行内标红。
- 输出表：`result → State 字段`。

**⑦ 旧版节点**

- 改造前的工作流数据会被直接清理（R10，见第 6 节），不提供重建或转换界面。唯一保留的是校验防线：如果通过导入 JSON 等方式带入旧版 `core.llm` / `core.tool`，问题列表报 `NODE_VERSION_RETIRED`，节点面板提示"此节点是旧版本，请删除后重新添加"。

### 2.5 运行历史抽屉

- 收起时是画布左下角的一行状态：「运行历史 · N 次 · 预览 M · 就绪」。
- 展开时是浮在画布上的圆角面板（不挤压画布，最高约占 40%，右侧给 L2 面板和助手入口让位），列表沿用现有内容（状态、修订、时间、会话、检查点）。
- 选中一次运行后，画布进入"查看历史运行"状态：顶部提示条带「回到编辑」，节点显示状态与耗时，所有节点面板的「运行数据」切到这次运行。这是现有 `selectRun` / `viewingRun` 的收敛，不新增运行语义。
- 每条运行记录显示它使用的变量环境名称（来自 Run 冻结时记录的变量环境，见 3.2）。

### 2.6 变量环境（R1，参考 Apifox）

用户界面中只有一种"环境"，就是变量环境。平台运行环境是底层基础设施，用户看不到（见 2.7）。

| | 平台运行环境（底层，不对用户显示） | 变量环境（用户可见） |
| --- | --- | --- |
| 谁提供 | 平台，每个部署一个 | 用户自己创建 |
| 决定什么 | 执行后端、能力清单、限额 | 变量取哪一套值 |
| 例子 | —（用户不需要知道） | 开发 / 测试 / 正式 |

- **顶栏切换**：工作流顶栏放「变量环境」下拉（占原「运行环境」下拉的位置），列出用户的所有变量环境和「仅默认值」。选择按工作流记在 localStorage（展示偏好）；首次打开时用用户标记的「默认变量环境」。运行时把所选变量环境 id 交给服务端，服务端校验后冻结进 Run。
- **资源中心 · 变量**：
  - 表格上方是变量环境标签页：`默认值 ｜ 开发 ｜ 测试 ｜ 正式 ｜ + 新建环境`。「默认值」标签下编辑每个变量的默认值；其他标签下编辑该环境的覆盖值，未覆盖的显示灰色的默认值占位。
  - 每个环境的 ⋯ 菜单：重命名、复制为新环境、设为默认、删除（删除时同时删除它的所有覆盖值，需确认）。
  - 变量的名称、类型、说明对所有环境共享；只有值按环境区分。
- **课程实训发起的运行**（带 `launchContext`）不显示选择器，使用用户的默认变量环境；没有默认环境时只用默认值。
- 变量环境不影响连接和凭据。密钥类变量仍不在 P0 范围。

### 2.7 平台运行环境：对所有用户开放，对用户不可见（R12、R13）

- **是什么**：运行工作流所需的公共执行依赖——执行后端（Worker、watchdog、任务队列、代码沙箱）、能力清单、单次运行限额。它是公共基础设施，**所有登录用户都可以使用**（Hosted 使用 `access: "authenticated"`）。
- **不包含什么**：公共环境不携带任何平台的模型、连接器、工具、变量、函数或密钥（现有安全规则）。
- **用户私有**：模型/API/MCP 连接与凭据、函数、变量与变量环境、工作流定义与运行记录，只有本人能访问（数据库行级安全）。
- **对用户不可见**：界面上不出现"运行环境"这个概念，不提供选择，也不显示它的名称或标识。每个部署只配置一个平台运行环境，前端自动使用它：
  - 去掉工作流顶栏的「运行环境」下拉、资源面板的「当前环境」下拉、新建工作流对话框与运行准备中的环境选择。
  - 资源中心、能力绑定、连接版本、问题诊断等文案不提运行环境；环境不可用时只用用户能理解的话提示（例如"工作流服务暂时不可用"）。
- **实现约束（只对开发者）**：用户的连接和函数在数据库中按"用户 + 运行环境标识"存放。平台调整运行环境时只改内容（能力、限额、执行镜像），不改标识；如果必须换标识，要同时迁移所有用户的连接、函数和凭据引用。这条约束写在运维手册里，不出现在界面上。

## 3. 数据模型变更

### 3.1 连接：新增 `openai-compatible` 类型

```ts
// p4_catalog.content（kind = "connection"）
{ type: "openai-compatible";
  name: string;                 // 1–120
  baseUrl: string;              // https；本地环境（localFixtures）允许 http://localhost
  modelRefs: string[];          // 已启用的模型，1–50，每项 1–200，/^[\w.:\/-]+$/
  credentialHeader?: "Authorization"; // 固定为 Bearer；本地无凭据时可省略 secretRef
  description?: string }        // ≤500
```

- 一个连接 = 一个供应商，`modelRefs` 是该供应商下**已启用**的模型列表；启用 / 停用 / 添加模型都是发布 `ref@v+1`。「新发现」的模型只存在于测试响应，不写入连接。
- 现有的 `deepseek` 类型继续可读、可用。资源中心的 DeepSeek 预设**仍然创建 `deepseek` 类型**，以保留 `thinking` 等专有参数，同时把模型名从固定两项放宽为"拉取结果 + 手动输入"。
- 新增 `description?` 字段，对所有连接类型可选（只做展示）。
- 不需要迁移：`p4_secret` 只依赖 `content->>'secretRef'`，与类型无关。

### 3.2 变量与变量环境

```ts
type VariableEnvironment = { id: string; name: string };   // id: /^[a-z0-9][a-z0-9_-]{0,39}$/；name 1–40，用户内唯一；最多 20 个
type WorkflowVariable = { key: string; value: string|number|boolean;    // value 即「默认值」
  overrides: Record<VariableEnvironment["id"], string|number|boolean>;  // 键从运行环境 ref 改为变量环境 id
  description?: string };                                               // 新增，≤300
type WorkflowConfiguration = { revision: number; variables: WorkflowVariable[];
  environments: VariableEnvironment[];                                  // 新增
  defaultEnvironmentId: string | null };                                // 新增
```

**数据库**（一个前向迁移，例如 `supabase/migrations/<时间戳>_workflow_variable_environments.sql`）：

- `workflow_workspace_configuration` 增加 `environments jsonb not null default '[]'`（检查为数组）和 `default_environment_id text null`。
- 数据处理：旧的按运行环境覆盖的值不保留（R10），迁移把每个变量的 `overrides` 置为 `{}`，保留变量名、类型、默认值和说明；不做"运行环境 → 变量环境"的转换。
- `create or replace` 函数 `workflow_private.environment_variables(p_owner)`，返回值增加 `environments` 与 `default_environment_id`。
- 已执行过的迁移不改动；按 AGENTS 的 Hosted 纪律在目标环境逐个应用。

**API**：`configuration` 的 GET/PUT 带上 `environments` 和 `defaultEnvironmentId`；校验 `overrides` 的键必须是已存在的变量环境 id、默认环境必须存在；去掉原先"覆盖键必须是可用运行环境"的检查。`createRun` 请求体新增可选 `variableEnvironmentId`：不传时用默认变量环境；传了但不存在则返回 400。

**Worker**：`registry.environment(ref, owner, variable_environment_id)` 按 `overrides[variable_environment_id]`（缺省回落到默认值）计算 `env["variables"]`，并把 `variableEnvironmentId` 与名称连同 `configurationRevision` 一起冻结进 `registry_snapshot`。恢复检查点时沿用冻结值（现有逻辑不变）。Run 记录对外返回 `variableEnvironment: {id, name} | null`，供历史列表显示。

密钥类变量仍不在 P0 范围（见第 9 节）。

### 3.3 模型节点 `core.llm`（只保留 typeVersion 2，参数式提示词）

决策 R5=A：**先声明输入参数，提示词只引用参数名**，与所有节点「输入表 → 处理」的结构一致。

```ts
type PromptSegment =
  | { type: "text"; text: string }
  | { type: "param"; name: string; format?: "text" | "json" };   // name 必须是本节点 inputs 的 key

type LlmConfigV2 = {
  providerRef: string; modelRef: string;          // modelRef 必须在该连接版本的 modelRefs 中
  modelParameters: Record<string, JsonValue>;
  allowedToolRefs: string[];
  prompt: {
    system: PromptSegment[];                                    // 可为空
    messages: { role: "user" | "assistant"; content: PromptSegment[] }[]; // 至少 1 条
  };
};
// inputs: Record<paramName, Binding>   —— 用户声明的参数，来源只能是 input/state/environment
//         保留键 history?: Binding（messages 类型，拼接在 system 之后、prompt.messages 之前）
// outputs: { messages, toolCalls, text }  —— 新增 text：最终 assistant 的纯文本
```

设计要点：

- **提示词以结构化分段持久化，不使用 `{{...}}` 字符串**。`{{` 只是编辑器的输入手势。
- **绑定只出现在 `inputs`**，提示词只持有参数名。因此：
  - 编译期校验分两层：`inputs` 的每个绑定走现有 `binding_check`；每个 `param` 分段的 `name` 必须存在于 `inputs`（不能引用 `history`）。
  - 改动取值来源不需要改提示词；重命名参数时，编辑器同步改写引用它的分段（进入撤销栈）。
  - 声明了但未被引用的参数给出警告，不阻止运行。
- 参数名规则：`/^[A-Za-z_][A-Za-z0-9_]{0,63}$/`，节点内唯一，`history` 为保留名。
- 渲染规则：`format:"text"` 时字符串原样输出、数字和布尔值转为字符串、对象和列表回退为 JSON；`format:"json"` 一律 `JSON.stringify`。缺失值遵循对应绑定自身的 `onMissing` 设置。
- 新增输出 `text`，用户就能直接把回答写进一个文本类型的 State 字段，不必再理解 messages 结构。
- **旧版废弃（R3）**：Worker 不再注册 `core.llm` typeVersion 1；编译遇到旧版返回 `NODE_VERSION_RETIRED`（带 nodeId），不提供兼容运行、自动转换或重建界面（旧数据按 R10 清理）。typeVersion 从 1 升到 2 只是为了让残留或导入的旧定义能被明确识别并报错，界面上不出现"v1 / v2"的概念。
- 起步模板（`LiveWorkflowEditor` 里的 loop 模板、`authoringExamples`）和演示夹具（`src/demo/workflow/`）一并改写为新版；本地种子 `supabase/seed.sql` 由 `pnpm db:seed:generate` 重新生成，不手改。

### 3.4 编辑器层派生数据（不持久化）

| 纯函数 | 输入 | 输出 | 用途 |
| --- | --- | --- | --- |
| `stateFieldProducers(def)` | definition | `Map<field, nodeId[]>` | 变量选择器分组；数据表"写入节点"列 |
| `stateFieldConsumers(def)` | definition | `Map<field, nodeId[]>` | 数据表"读取节点"列；输出段"下游读取" |
| `connectionReferences(def)`（已有，扩展） | definition | 现有返回值 + `modelRef?` | 流程层资源面板；升级提示 |
| `variableReferences(def)` | definition | `{key, nodeId, graphPath}[]` | 变量引用；流程层资源面板 |
| `defaultParamName(binding)` | Binding | string | 输入表参数名默认值（取末段字段名并去重） |
| `nodeRunData(def, steps, nodeId)` | 定义 + 选中运行的 Steps | `{input, output, writes, elapsedMs, runId} \| null`（`writes` 为写入 State 的字段与值） | 「运行数据」Tab；变量选择器的样例推断；调试悬窗 |
| `toolParamRows(tool, inputs)` | 工具 `inputSchema` + 节点 inputs | `{name, title, description, schema, required, binding?}[]` | 工具节点表单式输入表 |

以上函数放在 `src/features/workflow/domain/v2/`，保持纯净（不依赖 React 或 app 单例），符合 AGENTS 的 Workflow 模块边界要求。

### 3.5 工具节点 `core.tool`（只保留 typeVersion 2，表单式参数）

```ts
type ToolConfigV2 = { toolRef: string; contractDigest: string };
// inputs: Record<argumentName, Binding>  —— 键必须是工具 inputSchema.properties 的键；
//         固定值用 { source: "literal", value }，变量用 input/state/environment 绑定
// outputs: { result }
```

- **运行时**：按 `inputs` 解析出每个参数的值，组装成 `arguments` 对象（未绑定的可选参数不出现），再走现有的 `validate_value(tool.inputSchema, arguments)` 和 `invoke_tool`。
- **编译期**：`inputs` 的键必须属于工具 Schema；必填参数必须有绑定（`TOOL_ARGUMENT_REQUIRED`，带 nodeId 与参数名）；字面量值按该参数子 Schema 校验；变量绑定走 `binding_schema_check`，目标类型取参数子 Schema。
- **工具升级**：工具新版本的 Schema 变化时，升级提示列出新增必填参数和被删除的参数；被删除参数的绑定在升级时移除（进入撤销栈）。
- **旧版废弃**：同 3.3，旧版 `core.tool`（单个 `arguments` 输入）编译返回 `NODE_VERSION_RETIRED`。

## 4. 前端改动范围

| 文件/目录 | 改动 |
| --- | --- |
| **新** `features/workflow/resources/` | `ResourceCenterDialog.tsx`（L3 悬窗外壳 + 分类导航）、`ProviderOverview.tsx`（供应商卡片 + 模型表 + 启用开关暂存）、`AddModelDialog.tsx`（预设网格、测试、模型勾选）、`ApiResource.tsx`、`McpResource.tsx`、`FunctionResource.tsx`、`VariableTable.tsx`（含变量环境标签页与环境管理）、`ResourceTestPanel.tsx`、`ResourceReferences.tsx`、`resourceModel.ts`（按 ref 聚合版本、合并测试发现的模型的纯函数） |
| **新** `editor/v2/VariableEnvironmentSelect.tsx` | 顶栏「变量环境」下拉；选择按工作流存 localStorage；运行时传 `variableEnvironmentId` |
| `editor/v2/LiveWorkflowEditor.tsx`、`EnvironmentPanel.tsx`、`CapabilityBindingPanel.tsx`、`ConnectionVersionPanel.tsx`、`diagnostics.ts`、`pages/WorkflowCreateDialog.tsx` | 去掉运行环境的选择与显示（R13）；`useWorkflowV2Controller` 已默认取环境列表的第一项，继续沿用；环境不可用的提示改为用户能理解的文案 |
| `editor/v2/MessageComposer.tsx` | 删除（旧版模型节点不再支持） |
| `editor/v2/WorkflowConnections.tsx`、`EnvironmentVariables.tsx` | 拆分迁入 `resources/`；原文件删除 |
| `editor/v2/EnvironmentPanel.tsx` | 改为"本流程资源"浮动面板（引用列表 + `CapabilityBindingPanel` + 打开资源中心） |
| `editor/v2/StateFields.tsx` | 改为表格视图；移出说明、限制和 MCP 发现按钮 |
| `editor/v2/LiveWorkflowEditor.tsx` | 胶囊 Tab 重命名；L2 面板改为浮动卡片并支持拖拽宽度；挂载资源中心悬窗；历史栏改为浮动抽屉（复用 `selectRun` / `viewingRun`）；"查看历史运行"提示条 |
| **新** `editor/v2/NodePanel.tsx` | 统一节点面板外壳：头部、「配置 ｜ 运行数据」Tab、四段折叠、底部操作；各节点只提供「处理」段 |
| **新** `editor/v2/NodeParamsTable.tsx`、`NodeOutputsTable.tsx` | 输入表（参数名 ｜ 取值，支持 Schema 决定与用户声明两种模式、行内按类型填写固定值）与输出表（输出项 ｜ 写入字段 ｜ 更新方式），所有节点共用 |
| **新** `editor/v2/VariablePicker.tsx` | 分组树、嵌套展开、类型置灰、样例推断标注；供输入表、输出表共用 |
| **新** `editor/v2/NodeRunDataTab.tsx` | 「运行数据」Tab，数据来自 `nodeRunData` |
| **新** `editor/v2/NodeDebugDialog.tsx` | L3 三栏调试悬窗；左栏拖放绑定 |
| `editor/v2/BindingFields.tsx` | 改由 `NodeParamsTable` + `VariablePicker` 使用；原始 Pointer 编辑移入"高级" |
| **新** `editor/v2/PromptEditor.tsx` | 分段编辑、参数 chip、参数重命名联动 |
| `editor/v2/ProcessingFields.tsx` | 只保留各类型的「处理」段；模型节点用新版配置，参数补齐 top_p 和思考开关；工具节点只选工具；旧版节点只显示诊断提示 |
| `domain/v2/types.ts`、`schema.ts`、`factory.ts`、`authoring.ts` | `PromptSegment`、`LlmConfigV2`、`ToolConfigV2`、`VariableEnvironment`、`WorkflowVariable.description`、`WorkflowConfiguration.environments/defaultEnvironmentId`；`createNodeV2("core.llm" / "core.tool")` 生成 typeVersion 2；第 3.4 节的纯函数 |
| `application/v2/frontendPreview.ts` | 前端预览识别新版模型与工具节点（渲染提示词、组装参数，沿用 `previewOutput`） |
| `application/v2/useWorkflowV2Controller.ts` | 发起运行时带上 `variableEnvironmentId` |
| `repository/v2/WorkflowApiV2.ts` | `extensionReferences()`、`variableReferences()`；`createRun` 增加 `variableEnvironmentId`；测试结果类型扩展为带 `preview` / `models` / `tools` |
| `src/demo/workflow/` | 模板与场景 JSON 改写为新版 `core.llm` / `core.tool` |
| `editor/v2/workflowV2.css` | 浮动面板、抽屉、悬窗、表格、拖拽手柄；保持 ≤900px 的既有覆盖规则（窄屏时 L2 面板全宽覆盖画布） |

不改 `src/app/App.tsx` 和 `WorkflowLibraryPage.tsx`（R2=B，无新路由）。

## 5. 后端改动范围

### 5.1 API（`api/_lib/workflowV2.ts`，不新增 Function）

| 变更 | 说明 |
| --- | --- |
| `GET extensions?view=references&ref=` | 扫描当前用户 `workflow_v2_definitions` 的当前定义（含子图），返回引用了 `p4:owner:ref:*` 的工作流、节点、版本以及 `modelRef`。只读，使用用户 client 并遵守 RLS |
| `GET configuration?view=references` | 同样的扫描，返回每个变量 key 被哪些工作流和节点引用，供变量表「引用」列使用 |
| `configuration` zod | 接受 `description?`、`environments`、`defaultEnvironmentId`；覆盖键改为校验变量环境 id（见 3.2） |
| `runs` 创建 | 请求体接受可选 `variableEnvironmentId`，校验后转交 Worker；Run 详情与列表返回 `variableEnvironment` |
| 透传 | `extensions` 的 `test` 响应原样透传 Worker 新增字段 |

### 5.2 Worker（`services/workflow`）

| 文件 | 变更 |
| --- | --- |
| `extensions.py` | ① 白名单加入 `openai-compatible`，复用 `safe_http_url` 做 SSRF 校验（仅 `localFixtures` 环境允许 http/localhost，且允许无凭据）；② DeepSeek 放宽模型名为模式校验；③ `test` 返回值：模型类 → `{ok, elapsedMs, models}`（GET `{baseUrl}/models`，带超时）；HTTP → `{ok, status, elapsedMs, preview}`（先 `assert_no_secrets`，再截断到 4KB）；MCP → `{ok, tools}`；④ 接受 `description` |
| `extensions.py · hydrate_connections` | `openai-compatible` 注入 `env.providers`，带 `adapter:"openai"`、`baseUrl` 和已启用的 `modelRefs` |
| `runtime.py · model_adapter` | 按 provider 的 `adapter` 分流：`ChatDeepSeek` 或 `ChatOpenAI(base_url, api_key, http_async_client=<PinnedTransport 客户端>)`，保证模型请求和工具请求遵循同一套出站限制 |
| `registry.py · NODE_DESCRIPTORS` | `core.llm`、`core.tool` 改为 typeVersion 2 的 descriptor，旧版不再注册：模型 config 含 `prompt`、inputs 为动态参数 + 可选 `history`、outputs 增加 `text`；工具 inputs 为工具参数 |
| `registry.py · environment()` | 增加 `variable_environment_id` 参数，按变量环境取覆盖值；冻结 `variableEnvironmentId` 与名称（见 3.2） |
| `compiler.py` | 旧版节点返回 `NODE_VERSION_RETIRED`；模型：`prompt.messages` 非空，参数名合法且唯一，每个参数绑定走 `binding_check`（来源限 input/state/environment，环境变量 key 必须存在），每个 `param` 分段引用的参数必须已声明，`modelRef` 必须在连接版本的 `modelRefs` 中，预估长度计入 `maxInputBytes`；工具：参数键属于工具 Schema，必填参数已绑定，字面量按子 Schema 校验 |
| `runtime.py · llm` | 先解析参数绑定，按渲染规则把分段渲染成字符串，组装为 `[system?] + history? + prompt.messages`，再调用模型；输出时补充 `text` |
| `runtime.py · _process_node`（`core.tool`） | 由各参数绑定组装 `arguments`，再走原有校验与调用 |
| `server.py` | 创建 Run 时接收 `variableEnvironmentId` 并传给 `registry.environment()` |
| `tests/` | openai-compatible 校验和 SSRF 拒绝；`/models` 拉取与超时；提示词渲染（缺失值、JSON 格式、环境变量、未声明参数）；工具参数组装与必填校验；旧版节点报 `NODE_VERSION_RETIRED`；变量环境取值与冻结；测试预览的脱敏 |

依赖：`langchain-openai` 已通过 `langchain-deepseek` 间接锁定在 `uv.lock`，建议在 `pyproject.toml` 显式声明（版本范围与锁定一致），不会改变实际安装的包集合。

### 5.3 数据库

- 只有 P0-F 的一个前向迁移（见 3.2）；已执行过的迁移不改。
- `supabase/seed.sql` 由 `pnpm db:seed:generate` 从 `src/demo/workflow/` 夹具重新生成，不手改。
- 旧工作流数据清理（R10）是数据操作，不写成迁移：本地用带本地守卫、默认只读预检的脚本执行；Hosted 执行等价 SQL，执行前由用户确认。范围见第 6 节。

## 6. 兼容与迁移

- 目前仍在开发阶段，**改造前的工作流画布数据直接清理，不保留**（R10），本地和 Hosted 都一样：
  - **删除**：所有工作流定义、编辑器文档、修订、Run（含 steps/events/jobs 等）、会话与检查点、工作流作用域的记忆数据。
  - **保留**：用户建立的模型/API/MCP/函数连接与 Vault 凭据、变量默认值、课程与学习数据。（本地 DeepSeek 是环境配置里的平台模型，不在数据库中，不受清理影响。）
  - **重建**：`workflow_templates` 用新版模板覆盖写入，模板 id 不变，课程中引用的模板继续有效。
  - 删除前先列出各表行数，并检查学习侧证据是否引用将被删除的 Run；有引用时先报告用户，不擅自删除学习证据。
- **旧版 `core.llm` / `core.tool` 直接废弃**（R3）：清理后不应再有旧定义；如果通过导入带入，编译报 `NODE_VERSION_RETIRED`。
- 其他节点类型、State 结构、连接保持有效。
- 连接版本不可变规则不变；资源中心的"编辑"、启用/停用模型都只是"发布新版本"的另一种界面。
- 其他节点（函数、转换等）现有的 `inputs` 绑定在新输入表里直接显示为参数行（参数名即现有 inputs key），不需要数据转换。
- 变量：迁移保留变量默认值，清空旧的按运行环境覆盖的值（见 3.2）；用户需要的环境重新在资源中心创建。
- 删除 `WorkflowConnections.tsx` 和 `EnvironmentVariables.tsx` 前，确认它们的测试（`connectionDraft.test.ts` 等）迁到新组件，同时保留现有的纯函数 `connectionDraftIssue` 和 `connectionTestIssue`。
- 课程实训发起的 Run（`launchContext`）不改启动输入和 Course 绑定，只是变量取值改为使用用户的默认变量环境。

## 7. 分期、工期与验收

单写作者顺序执行，每期独立可合并。

| 期 | 内容 | 估 | 验收 |
| --- | --- | --- | --- |
| **P0-A1** | 画布浮层化：L2 浮动面板与拖拽宽度、胶囊 Tab 重命名、历史浮动抽屉；资源中心悬窗外壳，把现有 API、MCP、DeepSeek、函数、变量原样迁入；变量改表格 | 2.5 天 | 打开/关闭任何面板不触发画布重新布局或视口变化；从节点「在资源中心新建」DeepSeek 后自动回填，全程不刷新页面；390/768/1440 三档无横向滚动 |
| **P0-A2** | 模型供应商总览与添加模型对话框（先接 DeepSeek 类型）；测试回显、引用查询（含 modelRef 与变量）、编辑即发版与升级提示；数据（State）表格面板 | 2.5 天 | 勾选多个模型保存后节点模型下拉只出现已启用的；启用新模型后看到受影响节点，点「升级」写入草稿并可撤销；HTTP 测试显示脱敏预览；数据表"写入/读取节点"列与定义一致（单元测试） |
| **P0-B** | `openai-compatible`（Worker + 预设 + `/models` 拉取） | 1.5 天 | 本地由脚本用 `.env.local` 的 DeepSeek 配置建立「OpenAI 兼容」连接，拉到模型并跑通一次 Live Run；对话框界面流程用本地假端点验收；本地 `http://localhost` 只做单元测试（本地没有 Ollama）；拒绝私网（非 localFixtures）和凭据嵌入 URL；`deepseek` 类型连接与环境配置中的平台 DeepSeek 回归通过 |
| **P0-C** | 统一节点面板（`NodePanel`、输入/输出表、`VariablePicker`）、自动保存为 State 字段、「运行数据」Tab、展开调试悬窗与拖放绑定 | 3.5 天 | 用模板 `product-community-triage`（社区问题分流）新建的工作流，不打开任何"高级"区就能重新连好全部读写；所有节点类型的面板结构一致；历史中切换运行后各节点「运行数据」同步切换；类型不兼容选项置灰并给出原因 |
| **P0-D** | 新版 `core.llm`（Worker 编译与运行 + PromptEditor + 参数重命名联动 + 旧版废弃 + 模板/种子改写 + 本地旧数据清理） | 2.5 天 | System 和 User 中引用来自 State 与环境变量的参数跑通 Live Run；`text` 输出写入文本字段；引用未声明参数时编译期定位到节点和分段；导入旧版节点报 `NODE_VERSION_RETIRED`；本地旧数据已清理且平台 DeepSeek 仍可用 |
| **P0-E** | 新版 `core.tool`（Worker 参数组装与校验 + 表单式输入表 + 工具升级时的参数增删） | 1.5 天 | 本地选一个 HTTP 工具和一个 MCP 工具（本地平台自带的 Everything MCP），不写 JSON 只按表单填参数（混合固定值与变量）跑通；必填参数缺失时编译期定位到参数 |
| **P0-F** | 变量环境（迁移 + API + Worker 取值与冻结 + 顶栏选择 + 变量表环境标签页） | 2 天 | 新建「开发」「正式」两个环境并给同一变量设不同值，切换顶栏后各跑一次，两次 Run 冻结的值与环境名不同；历史列表显示环境名；删除环境会同时清除其覆盖值；课程实训 Run 使用默认环境 |

门禁：`pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build`；`pnpm test:workflow:worker`、`pnpm test:workflow`、`pnpm workflow:check-layout`；`edu-flow` 的 Function 数量不超过 12（Hobby 上限）。

验收环境：所有需要模型的验收都在**本地**自动完成，不需要用户填写——DeepSeek 配置来自 `.env.local` 的 `LLM_PROVIDER`、`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`：现有模型节点用本地平台 DeepSeek（`pnpm workflow:local` 把 `LLM_API_KEY` 注入 Worker）；需要用户连接的验收由本地专用脚本读取这些变量、通过本地 API 建立连接；「添加模型」对话框的界面流程用本地假 OpenAI 兼容端点和测试 Key 验收。智能体不在浏览器表单中输入真实 Key。**Hosted 的模型相关验收由用户人工完成并填写到实施计划的「人工验收」表，不作为门禁**；Hosted Sandbox 不可用，跳过函数节点的运行验收。

Hosted 部署：先按 R11 把工作流后端合并进 `edu-flow` 并删除 `edu-flow-workflow`（实施计划 M14）。之后 Hosted 只发布 `edu-flow`，且 Worker/watchdog 只在**生产部署**运行（2026-10-23 验证：预览部署不创建 Daemon）。顺序：清理旧工作流数据（用户确认后执行）→ 应用 P0-F 迁移 → 同步新版模板 → 发布 `edu-flow` 生产部署 → 冒烟（资源中心、变量环境保存与切换、模板列表、编译校验、用 `core.transform` 流程在两个变量环境下各跑一次）。

## 8. 决策记录

| 编号 | 决策 | 结论 |
| --- | --- | --- |
| R1 | 用户心目中的"环境"（开发/测试/正式）怎么落地 | **已定 B**：用户自建多套变量环境（参考 Apifox），与平台运行环境解耦；顶栏切换，Run 冻结所选环境（2.6、3.2，P0-F） |
| R2 | 资源中心的形态 | **已定 B**：只做编辑器内 L3 悬窗，不新增路由 |
| R3 | 节点版本如何处理 | **已定**：不分新旧版本，`core.llm`、`core.tool` 只保留最新定义，旧版直接废弃（开发阶段，未正式上线） |
| R4 | 本地是否允许 `http://localhost` 的模型和 API | **已定 A**：仅 `localFixtures` 环境允许；Hosted 仍然禁止 |
| R5 | 提示词里的变量如何引用 | **已定 A**（Coze 式）：先在输入表声明参数，提示词只引用参数名，所有节点共用同一面板骨架 |
| R6 | 节点运行数据从哪里来 | **已定**：来自运行历史中选中的那次运行（默认最近一次），以「运行数据」Tab 展示，不在配置段内联样例卡片 |
| R7 | 画布整体形态 | **已定**：画布铺满，控件、侧面板、历史抽屉、悬窗都浮在画布上（2.1 的四级浮层） |
| R8 | 模型供应商的组织方式 | **已定**：一个供应商一份凭据，可启用多个模型；添加时可拉取 `/models` 勾选 |
| R9 | 工具节点参数如何填写 | **已定**：按工具参数 Schema 逐行、像表单一样填写，每个参数可绑定变量或按类型填固定值，不让用户写整个 JSON 对象（3.5，P0-E） |
| R10 | 改造前的工作流数据如何处理 | **已定**：本地与 Hosted 直接清理，不保留、不兼容；保留用户连接与凭据、变量默认值、课程与学习数据，模板用新版重写（第 6 节） |
| R11 | Hosted 工作流后端放在哪个 Vercel 项目 | **已定**：合并进 `edu-flow`（Python Compiler 为 Function、Worker/watchdog 为 Daemon），删除 `edu-flow-workflow`。依据 2026-10-23 合并可行性验证：根项目可同时构建前端、Python 入口与 Daemon，Function 恰为 12；Daemon 只在生产部署运行。取代 ADR 0006 中的两项目部署决定 |
| R12 | 平台运行环境谁能用 | **已定**：它是公共基础设施，对所有登录用户开放（Hosted 用 `access: "authenticated"`）。按现有安全规则，公共环境不携带平台的模型、连接器、工具、变量或函数，用户在资源中心建立自己的连接使用；Hosted 原有的平台 DeepSeek / DeepWiki 移除（2.7） |
| R13 | 用户是否需要知道平台运行环境 | **已定**：不需要。界面不出现运行环境的选择、名称或标识；每个部署只配置一个平台运行环境，前端自动使用；用户唯一可见的"环境"是变量环境（2.6、2.7） |

## 9. 本方案不做（转入 P1/P2）

- Apifox 式完整 HTTP 请求编辑器（方法、Params、Headers、Body、cURL/OpenAPI 导入）
- MCP 先发现再勾选的流程、SSE/stdio 用户自建
- 调试悬窗的「固定这组输入」（pin data）与基于固定输入的反复单步测试
- 密钥类变量、在 HTTP 请求头里引用变量
- Monaco 代码编辑器、函数单独试运行
- 新节点类型（迭代、变量赋值、模板、知识库、参数提取）
- 隐藏 LangGraph 术语（Reducer、Send）的整体文案工作

## 变更记录

- 2026-10-23：初稿。
- 2026-10-23：按设计稿同步。资源中心改为只做悬窗（R2=B）；画布改为四级浮层结构；节点面板统一为「配置 ｜ 运行数据」骨架，输入/输出改为表格；提示词改为参数式引用（R5=A，修订 3.3）；"上次运行样例"改为跟随历史选中运行的「运行数据」Tab；历史栏改为浮动抽屉；新增展开调试悬窗；模型供应商改为多模型总览 + 添加模型对话框；变量与模型增加引用查询；工期由 10.5 天调整为 12.5 天。
- 2026-10-23：拆出实施计划。核查代码后补充：引用查询扩展已有的 `connectionReferences` 而不新建；「运行数据」的 State 变化在 P0 只显示写入值（Step 不带 State 快照）；工具节点逐参数输入需要 `core.tool` v2，作为待确认决策 R9。含基线确认、领域层、API 与收尾后，总工期以实施计划为准（约 15.5 天）。
- 2026-10-23：确认全部待定决策。R1 改为 B，新增用户自建变量环境（2.6、3.2，P0-F，含一个前向迁移）；R3 改为只保留最新节点定义，旧版 `core.llm` / `core.tool` 直接废弃并提供「按新版重建」；R4 定为 A；R9 定为做，新增表单式工具参数（2.4 ⑥、3.5，P0-E）。
- 2026-10-23：设计稿补齐「节点面板 · 工具（表单式参数）」、顶栏「变量」下拉、变量表环境标签页与环境操作菜单、历史记录中的变量环境标识；明确对象参数的子字段只能填固定值。
- 2026-10-23：新增 R10（改造前工作流数据在本地与 Hosted 直接清理，保留连接/凭据/变量默认值/课程数据，模板重写），因此去掉「按新版重建」界面与变量覆盖值转换。验收环境调整：本地无 Ollama，OpenAI 兼容通道用 DeepSeek 验收；Hosted 无模型，跳过模型相关验收。补充：`seed.sql` 必须由 `pnpm db:seed:generate` 生成；门禁改用仓库已有的工作流脚本。
- 2026-10-23：更正上一条中"`edu-flow-workflow` 为误建"的说法：核查后确认它是 ADR 0006 有意创建、正在运行的工作流后端。经合并可行性验证，新增 R11：把后端合并进 `edu-flow` 并删除 `edu-flow-workflow`（实施计划 M14）；Hosted 冒烟改为在合并后的生产部署上执行，运行验收使用不依赖 Sandbox 的 `core.transform` 流程。
- 2026-10-23：改正本地 DeepSeek 的来源（环境配置中的平台模型，Key 为 `LLM_PROVIDER_KEY`，不是数据库里的用户连接）；新增 R12（Hosted 平台运行环境对所有登录用户开放，公共环境不携带平台模型与工具）；Hosted 模型相关验收改为用户人工完成并填表，不作为门禁。
- 2026-10-23：本地模型验收改为全自动：使用 `.env.local` 的 `LLM_*` 配置，由本地专用脚本建立用户连接，对话框界面流程用本地假 OpenAI 兼容端点验收；只有 Hosted 的模型验收需要用户手工填写。
- 2026-10-23：新增 R13（平台运行环境对用户不可见：去掉所有运行环境选择与显示，每个部署只配一个，前端自动使用）并新增 2.7 统一说明公共运行环境与用户私有资源的边界；R12 去掉"另建指定用户环境"的选项。通读修正：迁移描述改为"清空"旧覆盖值；`nodeRunData` 返回值与实施计划统一为 `writes`；P0-C 验收改用 `product-community-triage` 模板；P0-D 不再提"重建"；决策表按编号排序。
- 2026-10-24：设计稿去掉顶栏的「Local acceptance」运行环境下拉与资源中心头部的运行环境选择，「仅本地环境可用」改为「仅本地开发可用」，与 R13 一致。
