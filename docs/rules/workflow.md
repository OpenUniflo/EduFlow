# 工作流

> 由 AGENTS.md 拆出。修改本领域代码前必须阅读本文件；与 AGENTS.md 冲突时以 AGENTS.md 为准。

## Workflow Module Boundaries

- Workflow uses one V2 Definition, API repository, server-side LangGraph execution boundary and React Flow editor. Legacy editor/simulation/persistence/migration paths MUST NOT be reintroduced.
- Pure Workflow types, factories and graph operations live under `src/features/workflow/domain/v2` and MUST NOT depend on React, browser storage, Demo fixtures, `src/app` or application singletons.
- Workflow Editor and presentation state belong to the Workflow Feature. App owns assembly and navigation only.
- Production definitions and Runs use authenticated APIs. Removed Legacy browser storage keys MUST NOT become authority or compatibility fallback.
- Concrete Course starting templates live under `src/demo/workflow` and are database seed input. Production MUST NOT import them as a fallback.
- Ordinary environment variables, State and managed credentials remain distinct. Variable Bindings are structural; Runs freeze ordinary variable values/configuration revisions at launch while server authorization/revocation is revalidated.
- Node tests reuse the actual execution boundary with isolated test State and MUST NOT create formal Runs, progress, completion or mastery evidence. External writes require explicit test confirmation.
- Course integration belongs to the application/API boundary. Run metadata freezes validated `courseId`, `assignmentId` and `workflowTemplateId`. Runtime MUST NOT receive or infer Course/Assignment entities. Live success MUST NOT automatically complete an Assignment or grant mastery.
- History viewing is read-only and MUST NOT replace the editing draft. Execution details use Run/Step/invocation/attempt identity. Presentation changes MUST NOT re-fit or relayout the canvas.
- Exported configuration MUST NOT be presented as a standalone executable package unless that packaging capability actually exists.

## Workflow Run Invariants

- WorkflowTemplate is reusable. A Workflow run launched from a Course Assignment MUST preserve `courseId`, `assignmentId`, and `workflowTemplateId`.
- Two Assignments sharing one WorkflowTemplate MUST remain distinguishable in Run History and completion updates.
- Evaluation output is runtime/evidence data, not CourseAssignment or WorkflowTemplate definition data.
