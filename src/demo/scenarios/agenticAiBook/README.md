# Agentic AI Golden Demo Scenario

这个目录只保存 **Golden Demo 的固定场景数据和教学内容**，不把原始 PDF 提交到仓库，也不改变 Core Domain。

## 目标

演示一条稳定的未来产品路径：

`上传教材 → AI 仿真建课 → 课程草稿 → 技能树 → 学习/课程设计模式 → AI 重构 Lesson → 知识点实训 → 前置成果继承 → 篇章 Workflow → AI 验收`

## 关键边界

- 课程、Knowledge、Assignment、Material、Workflow 等 Core 模型继续使用现有 Feature contracts。
- 这里的 `demoRenderer`、脚本化 AI 回复、生成时间线和固定验收结果属于 Demo Scenario 元数据，不应反向进入 Core。
- 31 个原子 KnowledgeNode 使用现有 Agentic AI stable IDs；不创建为了演示布局而存在的假节点。
- 知识点实训与篇章实训落地时仍使用 `CourseAssignment` / `AssignmentCoverage`；不新增平行 Practice domain。
- 原始 PDF 不入库；优先通过 SHA-256 识别 Golden Demo，文件名只做开发期回退。
- `learning-state.json` 是独立用户状态，禁止把完成度写回课程定义。

## 来源与再设计

教材来源：李博杰《深入理解 AI Agent：设计原理与工程实践》v1.4（2026-08-13）。

教材提供术语、技术内容与原始章节；六篇章递进结构、知识点实训、成果继承、互动 Lesson、Multi-Agent Research System 和最终综合项目是 EduFlow Golden Demo 的教学再设计，不应被描述成原书原有课程结构。

## 当前状态

`prepared-not-wired`：内容和 Scenario 数据已准备，尚未接入页面、权限、Scenario Resolver 和 UI 状态机。
