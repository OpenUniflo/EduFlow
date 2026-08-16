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

课程设计模式还提供独立于 Drawer 的页面级 AI 课程助手：右下角悬浮入口支持 hover 预览和 click 固定对话，上下文随当前 Course / Chapter / Knowledge / Assignment 自动更新。Lesson 设计页的 AI 课件助手使用相同的悬浮交互语言，但继续保留独立 Provider。两者都仅在 Teacher/Admin 的课程设计模式显示。

## 4. 角色与导航

- 学生：学习
- 教师：学习 + 教学管理
- 管理员：学习 + 教学管理 + 系统管理

菜单分组：
- 学习：知识星图首页 / 课程中心 / 工作流画布 / 个人知识
- 教学管理：课程管理
- 系统管理：知识领域管理

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

## 8. 固定 AI 脚本

Lesson 设计模式至少支持：

- 解释得简单一点；
- 增加案例；
- 增加 Worker 超时案例；
- 检查课件与实训是否一致。

输入框开放，但命中关键词后映射预设 mutation；未命中走固定 fallback。修改经过 Preview → Apply，并支持撤销最近一次修改。切换 learn/design 保留 session draft，刷新后恢复 seed。

Course Design 的 Material authoring 使用浏览器 `localStorage` overlay：在 Repository Material/Coverage 之上记录关联、取消关联和生成的 Article draft。生成采用固定 700ms 仿真并自动关联当前 Knowledge；生成 Material 可由正常 Lesson route 打开。该状态不修改 Repository seed、不写 Supabase，发布课程也不会把 authoring overlay 持久化到后端。

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

## 13. NEXT: Course Structure Authoring Prototype

下一轮再处理 Chapter/Knowledge 的新建、删除、重命名、Chapter 归属拖动、Knowledge dependency 编辑、AI 拆分/合并/依赖建议与自定义 Graph layout；本轮 Material authoring overlay 不承担课程结构编辑职责。
