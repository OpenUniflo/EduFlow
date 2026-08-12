# Workflow Architecture

## 1. Responsibility map

Workflow is split by current responsibility rather than by future runtime plans:

- `src/features/workflow/domain`: Workflow definition types, node/edge types, factories, geometry, and pure graph operations.
- `src/features/workflow/editor`: editor-only types, pure CRUD operations, Canvas, Topbar, Inspector, Config Popover, code presentation, and node UI.
- `src/features/workflow/application`: the React controller that coordinates definitions, editor persistence, runtime progress, Environment selection, State, and Run History.
- `src/features/workflow/runtime`: runtime and run-record contracts plus Run Panel presentation.
- `src/features/workflow/repository`: persistence contract, API adapter, and LocalStorage compatibility adapter.
- `src/features/workflow/pages`: Library and Editor page composition with page-local presentation state.
- `src/demo/workflows`: concrete templates, description selection, Environment defaults, code-export fixture, and the timed Demo runtime.
- `src/app/integrations`: validated Workflow Run to Learning Progress integration.

`src/app/App.tsx` composes these dependencies and owns routes, authentication wiring, and cross-Feature integration. It does not implement Workflow CRUD, runtime timing, persistence, or editor state.

## 2. Definition and run identity

`WorkflowDefinition` (with the compatibility type name `Template`) describes nodes, edges, run order, result presentation, and code presentation. `WorkflowRunRecord` describes one completed execution. The Runtime creates a base record with its `workflowTemplateId`; the application integration may attach a validated explicit `courseId` and `assignmentId` before Run History persistence. Those optional fields are application/persistence metadata retained for v2 compatibility, not Runtime inputs.

The Runtime contract receives only Workflow definition and runtime state. It does not import, receive, or resolve Course Assignments.

## 3. Persistence

The application composition uses `ApiWorkflowPersistence`. Authenticated user Workflow definitions, editor state, settings, and Run History are persisted through `/api/workflows` into owner-scoped PostgreSQL rows. Built-in template definitions are shared seed data; custom definitions and Runs are user owned. Each assignment-launched Run persists its launch-time `courseId`, `assignmentId`, and `workflowTemplateId`. Independent Runs omit Course provenance.

The LocalStorage adapter remains for Demo/test compatibility and preserves the historical contracts:

- `knowledge-atlas.workflow-state.v2`: workflows, active template, description, Schema saved state, node positions, state values, and Run History.
- `knowledge-atlas.workflow-settings.v2`: existing mock settings plus Environments and active Environment.

Mock session persistence is no longer an application runtime contract; Supabase Auth owns the session.

Stored custom workflows remain authoritative. Missing built-in Demo templates are merged in, and the existing showcase display-name migration is retained. Invalid JSON falls back to built-in definitions or default settings without changing the key or schema.

The unreachable legacy Settings compatibility UI still has a small writer for the same settings key. It merges only `dailyReminder`, `compactMode`, and `emailDigest` into the existing JSON object, preserving Environment fields and other current payload fields instead of replacing the object.

## 4. Demo runtime behavior

`DemoWorkflowRuntime` preserves the prototype behavior: it advances through `runOrder` every 760 ms, computes deterministic state snapshots, supports one-step advancement through the controller, and creates a success Run History record when a full Run finishes. Run History remains capped at 20 records per Workflow by the application controller.

This boundary is intentionally limited to current behavior. It does not model streaming, checkpoints, retry policy, tools, memory, tracing, or a backend runtime.

## 5. Assignment integration

Course and Material actions build the existing URL with `courseId`, `assignmentId`, and the Workflow template path. Before a Run can carry Assignment context, `src/app/integrations/workflowAssignmentIntegration.ts` verifies that:

1. the Course exists;
2. the Assignment exists in that Course;
3. its mode is `workflow`;
4. its `workflowTemplateId` equals the opened Workflow.

The application integration attaches that validated identity to the Runtime's base record before Run History persistence. Only a completed Run with that metadata updates the explicit Assignment. An independent Run updates no Assignment. Two Assignments that share one template remain distinct because completion never performs reverse lookup by template. Knowledge mastery is not changed by this integration.

Assignment identity is frozen when a Run starts. Later URL query or React callback changes cannot replace that launch identity; stop, Workflow switch, creation, and description generation clear the old Run session. Generate from Description returns the selected Demo Template identity to the page, and the App routing layer synchronizes the URL while dropping any no-longer-valid Assignment query.

## 6. Open product decisions

The current v2 prototype keeps one `nodePositions` map and one `schemaSaved` flag, allows editing while the Demo Run is active, and keeps the App-level controller mounted when leaving the Editor. Whether these should become per-Workflow state, enforce edit locking, or stop/background a Run is not specified. This refactor does not change those semantics or introduce Workflow version snapshots.
