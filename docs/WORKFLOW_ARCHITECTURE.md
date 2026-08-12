# Workflow Architecture

## 1. Responsibility map

Workflow is split by current responsibility rather than by future runtime plans:

- `src/features/workflow/domain`: Workflow definition types, node/edge types, factories, geometry, and pure graph operations.
- `src/features/workflow/editor`: editor-only types, pure CRUD operations, Canvas, Topbar, Inspector, Config Popover, code presentation, and node UI.
- `src/features/workflow/application`: the React controller that coordinates definitions, editor persistence, runtime progress, Environment selection, State, and Run History.
- `src/features/workflow/runtime`: runtime and run-record contracts plus Run Panel presentation.
- `src/features/workflow/repository`: persistence contract and the LocalStorage adapter.
- `src/features/workflow/pages`: Library and Editor page composition with page-local presentation state.
- `src/demo/workflows`: concrete templates, description selection, Environment defaults, code-export fixture, and the timed Demo runtime.
- `src/app/integrations`: validated Workflow Run to Learning Progress integration.

`src/app/App.tsx` composes these dependencies and owns routes, authentication wiring, and cross-Feature integration. It does not implement Workflow CRUD, runtime timing, persistence, or editor state.

## 2. Definition and run identity

`WorkflowDefinition` (with the compatibility type name `Template`) describes nodes, edges, run order, result presentation, and code presentation. `WorkflowRunRecord` describes one completed execution. A Run records its own `workflowTemplateId` and may additionally record explicit `courseId` and `assignmentId`.

The Runtime contract receives only Workflow definition and runtime state. It does not import or resolve Course Assignments.

## 3. Persistence compatibility

The LocalStorage adapter preserves the existing contracts:

- `knowledge-atlas.workflow-state.v2`: workflows, active template, description, Schema saved state, node positions, state values, and Run History.
- `knowledge-atlas.workflow-settings.v2`: existing mock settings plus Environments and active Environment.
- `knowledge-atlas.mock-session.v2`: Mock Auth session, owned by `src/features/auth/session.ts`.

Stored custom workflows remain authoritative. Missing built-in Demo templates are merged in, and the existing showcase display-name migration is retained. Invalid JSON falls back to built-in definitions or default settings without changing the key or schema.

## 4. Demo runtime behavior

`DemoWorkflowRuntime` preserves the prototype behavior: it advances through `runOrder` every 760 ms, computes deterministic state snapshots, supports one-step advancement through the controller, and creates a success Run History record when a full Run finishes. Run History remains capped at 20 records per Workflow by the application controller.

This boundary is intentionally limited to current behavior. It does not model streaming, checkpoints, retry policy, tools, memory, tracing, or a backend runtime.

## 5. Assignment integration

Course and Material actions build the existing URL with `courseId`, `assignmentId`, and the Workflow template path. Before a Run can carry Assignment context, `src/app/integrations/workflowAssignmentIntegration.ts` verifies that:

1. the Course exists;
2. the Assignment exists in that Course;
3. its mode is `workflow`;
4. its `workflowTemplateId` equals the opened Workflow.

Only a completed Run with that validated context updates the explicit Assignment. An independent Run updates no Assignment. Two Assignments that share one template remain distinct because completion never performs reverse lookup by template. Knowledge mastery is not changed by this integration.
