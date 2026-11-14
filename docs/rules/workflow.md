# 工作流

> 由 AGENTS.md 拆出。修改本领域代码前必须阅读本文件；与 AGENTS.md 冲突时以 AGENTS.md 为准。

## Workflow Module Boundaries

- Workflow uses one V2 Definition, API repository, server-side LangGraph execution boundary and React Flow editor. Legacy editor/simulation/persistence/migration paths MUST NOT be reintroduced.
- Pure Workflow types, factories and graph operations live under `src/features/workflow/domain/v2` and MUST NOT depend on React, browser storage, Demo fixtures, `src/app` or application singletons.
- Workflow Editor and presentation state belong to the Workflow Feature. App owns assembly and navigation only.
- Production definitions and Runs use authenticated APIs. Removed Legacy browser storage keys MUST NOT become authority or compatibility fallback.
- Course starting templates are database content attached to the Course; the repository holds none, and nothing falls back to bundled templates.
- Ordinary environment variables, State and managed credentials remain distinct. Variable Bindings are structural; Runs freeze ordinary variable values/configuration revisions at launch while server authorization/revocation is revalidated.
- Node tests reuse the actual execution boundary with isolated test State and MUST NOT create formal Runs, progress, completion or mastery evidence. External writes require explicit test confirmation.
- Course integration belongs to the application/API boundary. Run metadata freezes validated `courseId`, `assignmentId` and `workflowTemplateId`.
- A Workflow created from a practice is a normal work owned by the learner and linked to that practice (link stored at the application/API boundary, never inside the Workflow Definition). Practice submission references a frozen Workflow version; trial runs inside the editor do not need to be launched from the practice. Runtime MUST NOT receive or infer Course/Assignment entities. Live success MUST NOT automatically complete an Assignment or grant mastery.
- History viewing is read-only and MUST NOT replace the editing draft. Execution details use Run/Step/invocation/attempt identity. Presentation changes MUST NOT re-fit or relayout the canvas.
- Exported configuration MUST NOT be presented as a standalone executable package unless that packaging capability actually exists.
- Managed connections keep a stable reference while display-name and model edits publish immutable versions. Every definition save MUST, after acquiring the connection-lifecycle lock, resolve its recursive user `p4` provider/tool/allowed-tool references against the owner, selected environment and exact version; platform references and empty draft fields stay untouched. Deletion MUST recheck current references, nested subgraphs and unfinished/waiting Runs inside the database transaction that removes every version and managed credential; an API preflight alone is never authority. Historical revisions do not permanently block deletion, but restoring one MUST revalidate its connections. Restoring a disabled connection publishes a new active version and does not silently re-enable old pinned bindings; users reselect the new version.

## Workflow Run Invariants

- WorkflowTemplate is reusable. A Workflow run launched from a Course Assignment MUST preserve `courseId`, `assignmentId`, and `workflowTemplateId`.
- Two Assignments sharing one WorkflowTemplate MUST remain distinguishable in Run History and completion updates.
- Evaluation output is runtime/evidence data, not CourseAssignment or WorkflowTemplate definition data.
