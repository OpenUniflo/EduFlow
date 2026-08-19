# EduFlow Agentic AI Golden Demo — 实施规格

## 1. 演示目标

用一本真实 Agent 教材作为输入，演示 EduFlow 如何把静态教材重构成：

1. 有知识依赖的课程技能树；
2. 每个知识节点都有实训的实践树；
3. 前置实训成果持续复用的工程学习路径；
4. 具备互动表达和 AI 辅助修改能力的 Lesson；
5. 能汇合往期成果的复杂 Workflow；
6. 可通过固定 AI 验收回写能力反馈的闭环。

原始教材负责提供事实、术语和技术主题；Golden Demo 的 6 篇章、实训和综合项目属于 EduFlow 教学设计。

## 2. 固定课程

**Agentic AI 工程实践：从单 Agent 到多智能体研究系统**

| 篇章 | 阶段成果 |
|---|---|
| 1 Agent 基础与任务建模 | 最小任务 Agent |
| 2 Context 与结构化交互 | 上下文增强 Agent |
| 3 Tools、RAG 与 Memory | 知识工具 Agent |
| 4 Runtime 与可靠性 | 可恢复 Agent |
| 5 Evaluation、Guardrail 与可信执行 | 可信 Agent |
| 6 Multi-Agent Workflow | Multi-Agent Research System |
| Final | AI 科研调研与立项助手 |

固定统计：**6 CurriculumChapters / 6 CurriculumLessons / 31 Knowledge / 31 知识点实训 / 6 篇章实训 / 37 Assignments total / 6 ChapterOutcomes / 1 FinalProject**。

## 3. Demo Golden Path

`学生/教师/管理员 → 上传指定 PDF → 仿真建课 → 固定课程草稿 → 技能树 → 第 6 篇章 → AI Native Lesson → 知识点实训 → 前置成果加载 → 篇章 Workflow → AI 验收 → 能力反馈`

教师和管理员还可在同一技能树、同一 selected anchor 与 viewport 上进入课程设计模式，用 AI 修改 Lesson；Student 只有已发布课程的学习能力，没有课程管理或课程设计权限。

课程 publication lifecycle 是浏览器 presentation state，不写入 Core Course：`draft` 只出现在 Course Management，`published` 才进入 Course Center，`archived` 保留在 Course Management 并从 Course Center 隐藏。AI 建课完成时初始为 `draft`。

课程设计和 Lesson 设计继续保留各自的底层 Provider、Proposal、Preview、Validation、Apply 与 Undo 能力，但用户可见入口统一为右下角 **EduFlow Assistant**。Assistant shell 根据 Course / Chapter / Knowledge / Material / Segment / Assignment 上下文和 Learn / Design mode 改变能力；设计 mutation 只在 Teacher/Admin 具备 capability 的 Design Mode 开放。

## 4. 角色与导航

- 学生：学习 / 探索 / 课程 / 画布
- 教师：学习 / 探索 / 课程 / 画布 / 教学管理
- 管理员：学习 / 探索 / 课程 / 画布 / 教学管理 / 系统管理

顶部悬浮 Tab 是全局导航主体。`/` 是 Learning Space（今天 / 我的知识 / 记录），`/explore` 的主体是 Global Knowledge Atlas，`/courses` 是 learner-facing Course Center，`/workflows` 保留为“画布”的 canonical URL，`/teaching` 收纳建课和 Design Mode，`/system` 当前只收纳真实的知识领域治理。`/profile`、`/course-management`、`/admin/domains` 保留兼容跳转。

教师/管理员进入同一个课程技能树时显示 `学习模式 ↔ 课程设计模式`；学生不显示切换按钮。不要再做独立“学生视角预览”。

## 5. 建课仿真

指定 PDF 命中 Golden Scenario 后，不走现场不可控的全量生成；播放固定但真实的 UI state machine：

`解析教材 → 提取知识 → 分析依赖 → 重构教学路径 → 设计实训 → 生成互动课件`

随后加载固定课程 Scenario。

**假的是 AI 智能过程，真的必须是产品交互：** 文件上传、页面跳转、权限、模式切换、Drawer、Lesson、Workflow、提交和 UI 状态变化都应是真实产品能力。

## 6. 实训规则

- 每个 KnowledgeNode 至少一个 CourseAssignment。
- 每篇章一个篇章实训。
- 后续知识点实训通过显式 AssignmentDependency 继承前置成果。
- 篇章实训显式汇合本篇章及必要往期成果。
- FinalProject 汇合多个 ChapterOutcome。
- 不创建“组合实训”新 Domain。
- Workflow Canvas 只是 Assignment 执行载体之一。

通用 `AssignmentExperience` 是 CourseAssignment 的可选执行/展示元数据，不是第二套课程本体。当前实现展示：
- 开放回答；
- 代码/文件提交；
- Trace Debug；
- Workflow Canvas。

四种体验共用独立 Assignment 页面和任务 Shell；Shell 展示关联 Knowledge、前置实训、继承成果、要求、预期输出与验收标准。Code/File 的文件选择与提交状态仅保存在 Prototype session；Workflow 跳转保留显式 Course/Assignment launch context。

## 7. 第 6 篇章重点

前五篇章在 Demo user state 中已完成。第 6 篇章进入时明确显示已继承：

- Task Specification
- Context Pack
- Knowledge & Tool Agent
- Runtime + Retry + Checkpoint
- Evaluator + Guardrail + Approval

完整制作两节 AI Native Lesson：

- **并行执行与结果汇合**
- **故障、验证与终止**

第 6 篇章最终 Workflow 使用 Planner、三类 Research Worker、Evidence Merge、Verifier、Experiment Designer、Critic、Human Approval 和 Final Proposal。

## 8. 固定 AI 脚本与统一 Assistant

Lesson 设计模式至少支持：

- 解释得简单一点；
- 增加案例；
- 增加 Worker 超时案例；
- 检查课件与实训是否一致。

输入框开放，但命中关键词后映射预设 mutation；未命中走固定 fallback。修改经过 Preview → Apply，并支持撤销最近一次修改。切换 learn/design 保留 session draft，刷新后恢复 seed。

Explore 的 Learning Intent Resolver 和 Micro Learning 也使用 Feature contract + `src/demo` deterministic provider + App composition wiring。它们只引用现有稳定 Knowledge ID，不创建第二套 Knowledge/Course/Practice ontology。未知学习目标先明确提示覆盖不足，再把材料创建作为 fallback；任意材料的高质量建课仍不是通用能力。MicroLesson 完成记录为 Prototype 学习活动，不自动写 Knowledge mastery。

Course Design 使用 course-scoped、schema-versioned 的浏览器 `localStorage` Draft Overlay。在 Repository Runtime/Graph 之上记录 Chapter 增删改序、课程 Knowledge 覆盖与移动、课程局部 Draft Candidate、Knowledge dependency、手动坐标、Material 关联/取消关联和生成的 Article draft。生成采用固定 700ms 仿真并自动关联当前 Knowledge；生成 Material 可由正常 Lesson route 打开。该状态不修改 Repository seed、Global Knowledge 或 Supabase。

结构 AI 只返回通用 `CourseAuthoringProposal.operations`。UI 先展示 Preview，再把 Proposal 应用到临时 Overlay 并执行确定性引用、重复边和 DAG 校验；只有通过后才写入 Draft，且整次 Apply 可 Undo。Golden 的拆分、合并、依赖建议和篇章重构是 `src/demo` 中的 scripted Proposal，不是真实 LLM mutation。

## 9. 固定验收

篇章综合实训在运行完成后分阶段演示分析过程，再显示固定 **86/100，需要修改**。

核心缺陷：

`Candidate → 直接 Cancel` 是错误的。

正确链路：

`Candidate → Verifier → Verified Success → Atomic Settle → Cancel Remaining Workers`

反馈映射到 `WF03 / E13 / RT14`，但 Assignment completion 不得自动等同 Knowledge mastery。

## 10. 实现约束

- Golden Scenario 代码应位于 `src/demo`，Core Feature 不得 import Demo。
- Generic UI 不得判断具体 `agentic-ai-engineering-demo`、文件名或节点 ID。
- Scenario Resolver 负责触发与注入；页面只读取正常 contract。
- 原始 PDF 不提交仓库。
- 不把 Demo AI 脚本、固定分数、课程名写入通用组件。
- Core `AssignmentMode = instruction | workflow` 保持不变；`AssignmentExperience = answer | code | trace | workflow` 只描述执行/展示体验。
- Generic Lesson 仅消费 `LessonAssistantProvider`，Generic Workflow Editor 仅消费可选 `WorkflowAssessmentResult`；固定 Demo 内容由 `src/demo/scenarios/agenticAiBook` 提供并在 App 组合根注入。

## 11. 本地验收身份与数据

`pnpm auth:bootstrap-local` 可重复创建并验证：

- `local-student@eduflow.local` → student
- `local-teacher@eduflow.local` → teacher
- `local-admin@eduflow.local` → admin + global-domain-admin

Teacher 未单独配置密码时使用 local-only Admin acceptance password 作为明确 fallback。Golden `UserCourseState` 由 Demo fixture 注入/seed：篇章 1–5 的阶段 Assignment 已完成，篇章 6 进行中；Knowledge mastery 仍只读取独立 `UserKnowledgeState`。

## 12. 真实与仿真边界

真实：教材文件选择、SHA/文件名路由、角色权限、导航、Course/Skill Tree、learn/design 状态、Lesson mutation、Assignment UI、Workflow launch context、运行状态、提交与反馈交互。

仿真：PDF 的 AI 分析推理、课程生成推理、Lesson AI 文案生成、Workflow AI 验收推理和固定结果。

## 13. Course Structure Authoring Prototype

Teacher/Admin 的 Design Mode 在现有 React Flow + ELK 上提供：Chapter 新建、重命名、上移/下移与受控删除；已有 Global Knowledge 的课程覆盖、课程局部 Draft Candidate、从课程移除与跨 Chapter 鼠标拖放（Drawer 下拉仍为 fallback）；节点手动坐标、显式“自动整理”；Canvas dependency handles、依赖选择/删除以及 self/duplicate/cycle 防护；snapshot Undo/Redo 和键盘快捷键。

Design Mode 将 Knowledge 暂时投影为根节点，使 React Flow 能跨 Chapter 拖动；drop 时以节点中心命中目标 Chapter，并把位置转换回 Chapter-relative overlay 坐标。Chapter 归属与坐标作为同一个 Draft snapshot 提交，聚合后会形成 Chapter cycle 的移动会在提交前拒绝。普通 Drawer、selection 和 mode state 不触发手动位置重置；只有教师确认“自动整理”才清除手动坐标并重新使用 ELK。Drawer 关闭只释放布局宽度，不清除当前 selection，标题区始终从 Course Header 下方开始。

发布前运行 Publication Check：broken reference、重复/self edge 与 cycle 是 fatal，会阻止 Publish；课件/Assignment 覆盖、Draft Candidate、ChapterOutcome 和 FinalProject 缺口是 warning，允许教师确认后发布。publication lifecycle 与 authoring snapshot 都是当前浏览器 presentation state；发布只切换 `draft → published`，Course Center 和 Student 在同一浏览器中读取已 Apply 的 Editable View，不写后端。

## 14. Prototype 闭环与持久化边界

最终演示闭环为：`AI create → draft → teacher structure authoring → AI Proposal / Preview / Validate / Apply → material authoring → publish check → publish → student learn → Assignment → Workflow → AI Evaluation`。

结构 authoring、Material authoring、AI Proposal Apply 和 publication lifecycle 都仅保存在浏览器本地 overlay。它们不会创建 Global Knowledge、不会更改课程 seed、不会迁移 Supabase schema，也不代表正式版本历史或多人协作。Draft Candidate promote、正式审批、后端持久化、多人协作和真实 Course Authoring Agent 留待产品阶段。

管理员基础能力由 `role=admin` 直接授予；`global-domain-admin` 继续作为兼容旧账号的附加 capability。最终本地真实浏览器验收覆盖 Admin/Teacher/Student、Drawer、跨 Chapter 拖放、手工依赖、四类 AI Proposal、Material/Lesson、Publish→Student、Workflow 及 1366/1440/1512 桌面尺寸。已知非阻断项：本地 Supabase 在 logout 后首次切换账号时，Workflow hydrate 偶发一次 `/api/workflows` 500，立即重试成功；若部署环境不复现则不扩展 Auth/Workflow 范围。
