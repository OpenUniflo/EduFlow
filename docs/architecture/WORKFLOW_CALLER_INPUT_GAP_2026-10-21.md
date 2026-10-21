# 工作流调用方输入只读 · 现状与差距

- 日期：2026-10-21
- 范围：P1a “Assignment/API 调用方输入只读”
- 结论：当前没有调用方输入数据源，不能只靠前端禁用控件伪装实现；本项保持未完成，等待产品/API 明确来源。

## 代码事实

1. `CourseAssignment` 没有工作流启动输入字段：`src/features/course/types.ts:121` 仅包含 `workflowTemplateId`、`experience` 等元数据。
2. Assignment 启动上下文只解析课程、实训和模板身份：`src/app/integrations/workflowAssignmentIntegration.ts:9` 返回 `courseId / assignmentId / workflowTemplateId`。
3. 前端 `WorkflowLaunchContext` 也只有这三个字段：`src/features/workflow/domain/v2/types.ts:41`。
4. 创建 Run 的 `input` 始终来自浏览器当前输入；`WorkflowApiV2.createRun` 没有“调用方输入快照”或授权签名参数。
5. 因而运行准备对话框只能让用户现场编辑，无法展示“调用方已提供、画布只读”的权威输入。

## 可行方案

### 方案 A：Assignment 持久化启动输入

- 在 `CourseAssignment` 增加显式 `workflowInput`（或等价的结构化字段），并在课程创作、持久化、API 投影中贯通。
- Assignment 启动时把该值作为调用方输入传入 `WorkflowLaunchContext`；画布展示只读快照，不再允许改写。
- 服务端仍需按 `(courseId, assignmentId, workflowTemplateId)` 重新校验归属、输入 schema 和权限；不能信任浏览器。
- 优点：与现有 Assignment 路由一致；缺点：涉及课程 schema、迁移、创作 UI 和 Hosted 数据。

### 方案 B：独立调用方启动 API

- 由调用方通过受控 API 提交输入并取得一次性启动凭据；画布只展示凭据对应的只读快照。
- 优点：不把业务输入塞进 CourseAssignment；缺点：需要新的启动/授权契约、签名与防重放，范围更大。

## 当前决定

- 不实现“界面看起来很只读、实际仍可改写”的假象。
- 不把现有空输入当成调用方输入。
- 待产品确认方案 A 或 B 后，再进入实现与验收；在此之前 P1a 保持未完成。

## 2026-10-22 方案 A 首切片

产品已选择方案 A。当前已实现：

- `CourseAssignment.workflowInput` 与 `CourseJsonValue` 类型；Assignment 创建编辑器增加“Workflow 启动输入 JSON”字段。
- 迁移 `20261022000000_course_assignment_workflow_input.sql`：新增 `course_assignments.workflow_input`，并让 `publish_course_authoring_draft_base` 在发布时写入该字段。
- `/api/courses` 投影 `workflowInput`；`WorkflowLaunchContext` / Assignment resolver 携带该值。
- 运行范围：存在调用方输入时直接开始运行，不打开可编辑的运行准备；图设置的输入按钮显示“调用方输入只读”，运行 tab 显示只读快照。
- 服务端 `validateLaunch` 从 `course_assignments.workflow_input` 读取权威值，并与提交 `input` 做摘要比较；不一致返回 409 `INVALID_LAUNCH_CONTEXT`，不创建 Run。
- 本地实测：1024×768 运行 tab 显示只读输入；用不匹配输入调用 API 返回 409；测试后已恢复本地 Assignment 并删除临时 template。

仍待完成：

- Hosted Supabase 尚未应用该迁移；Hosted 验收前按迁移纪律增量应用。
- 现有 Assignment 的“编辑”弹窗仍只改标题/说明/输出，尚未编辑已保存的 `workflowInput`；新建时已可录入。
- 发布函数与作者草稿的完整端到端验收（创建→保存草稿→发布→重新加载→启动）尚未执行。
