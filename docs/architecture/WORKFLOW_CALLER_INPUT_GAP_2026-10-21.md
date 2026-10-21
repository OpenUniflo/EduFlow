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
