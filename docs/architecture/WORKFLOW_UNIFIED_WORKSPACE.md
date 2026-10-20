# Unified Workflow Workspace

Current frontend target: `workflow-target-studio.html`, chat 01a149ca-1768-7993-8175-d67ccbdfaa5c. Frontend-first optimization and current acceptance evidence: [frontend target report](../../artifacts/archive/document-history-20261020/files/docs/acceptance/WORKFLOW_FRONTEND_TARGET_REPORT.md).

## Current frontend architecture (2026-10-18)

- One V2 library/editor remains the authority. Floating component tools sit at the top left and State/connection/execution/export tools at the top right. Overlay panels preserve canvas geometry and viewport; the old left rail is removed.
- Ordinary function/model/tool/subgraph nodes own processing and optional interaction contracts. Routing, fork/join and Send are control-flow views. There is no dedicated user-interaction node or mandatory launch-time input dialog. Advanced external invocation data belongs to graph settings.
- Each graph owns its State, reducers and interfaces. Nested graphs have independent saved layout and State; root document save/export includes them, and historical snapshots allow readonly nested navigation.
- Frontend authoring retains node retry/timeout/cache/error-handler/Command policies and graph budgets/wait/checkpoint policies. Unsupported execution is explicitly gated, with a separate labeled event preview for response, streaming, task/attempt identity and checkpoint branches. This preview creates no formal Runs, learning progress or evidence.
- Existing real model/tool/transform/router execution and isolated node tests continue through authenticated APIs and the Python LangGraph worker. Extending real execution to arbitrary functions, editable subgraphs, parallel/Send, interrupts/resume and additional policies remains backend work.

The sections below record the earlier 2026-10-17 unification and data cleanup. Their left-rail layout and deferred frontend-editing descriptions are historical; the current frontend is described above.

## Earlier unification delivery (2026-10-17)

- One V2 library and React Flow editor. Legacy UI, simulation, migration UI/API, domain/repository adapters and unused Demo fixtures/styles have been removed.
- Canvas-first workspace with left rail, optional component library, expandable right inspector and bottom history. Node configuration and actual execution use Read → Process → Write.
- Draggable/collapsible execution bubbles do not move nodes or the viewport. Execution details preserve step/invocation/attempt identity and actual State before/after.
- Historical definition/layout snapshots are read-only; returning to editing preserves the current draft. Editing keyboard shortcuts and execution actions are disabled in history.
- Owner-private ordinary workspace variables support defaults and environment overrides; the normal node selector reads their effective values. Saving variables updates node testing without reloading. Formal Runs freeze variable values/configuration revision.
- Single-node tests use the real compiler, adapters and reducers with isolated input/State, without creating formal history or learning evidence. Registered external tools require explicit test confirmation.
- Shared Course templates are honest V2 starting drafts, retaining stable Assignment references. Export produces the displayed definition/layout JSON, without managed credentials.

## Local cleanup

Applied forward migrations 20261017122810, 20261017123725 and 20261017124653. The four Legacy tables (workflow_runs, user_workflow_definitions, user_workflow_state, workflow_migration_reports) are absent. Shared templates have schemaVersion 2.0 and no old runOrder. Obsolete migration RPCs/guards are removed. The two retired browser workflow storage keys are deleted at app initialization and are never used as runtime authority.

Course, Knowledge and learner progress data were not reset. Existing unrelated working-tree changes were preserved. Hosted databases were not changed, and no deployment or Git push was performed.

## Two-role acceptance

The root agent implemented changes. A single independent agent began from the product URL and a test account, without reading code, prototype, background or an operation guide. It created/edited workflows, ran real model calls, compared historical runs and inspected configuration/execution/layout. Subsequent rounds received only repair/retest targets.

- Round 1 found blocked ordinary-variable selection/testing, a contradictory environment warning, clipped controls at 1024/768 widths, and hard-to-find task requirements.
- Round 2 confirmed node testing, environment warning, responsive layout and task-description repairs; it found the remaining variable catalog defect and a history-banner overlap.
- Round 3 confirmed normal variable selection, saved values taking effect without page reload, no formal history from node tests, history read-only controls/shortcuts, preserved drafts, and corrected banner placement.
- Download artifacts passed independent verification: both question-workflow exports match revision 5, four nodes, three transitions, environment binding and layout; the template export matches its revision 2 edit state. Browser download-event timeout was an automation observation, not a product failure. All specified third-round items passed.

Evidence: [first use](../../.acceptance/workflow-unified/first-use-round1.md), [round 2](../../.acceptance/workflow-unified/round2-report.md), [round 3](../../.acceptance/workflow-unified/round3-report.md), [desktop screenshot](../../.acceptance/workflow-unified/round3-final-desktop-canvas-bubbles-detail.jpg), [768px layout](../../.acceptance/workflow-unified/round2-04-width768-fixed.jpg).

## Verification

- TypeScript compilation and lint passed, including a final rerun after the acceptance fixes.
- Frontend/API/domain tests: 148 files, 1181 tests passed.
- Worker tests: 112 passed, 4 explicitly integration-gated skips.
- Production build passed; the existing large-chunk warning remains.
- Local authenticated API smoke passed: anonymous requests rejected with 401; effective ordinary variable appears in catalog; isolated real node test yields 7 from input 2 plus environment value 5 without a Run; formal execution yields 7 and emits actual State 0 → 7; registered read-only HTTP order tool returns the controlled A1001 fixture.
- git diff --check passed. No new top-level API Function entrypoint or package dependency was introduced for this delivery.

## Scope boundary

This completes the agreed unification/configuration/execution-visibility delivery with existing V2 executors, ordinary variables and real node tests. Human interruption, editable subgraphs, arbitrary code, general HTTP authoring, connection provisioning and standalone executable export remain subsequent execution-contract work. They are not exposed as fake working capabilities. Current connections list authorized managed providers/tools; JSON export is a configuration artifact, not an independent program.

Local browser acceptance is not Hosted acceptance; Hosted schema synchronization, generated Function-count evidence and deployment checks remain required before a future Hosted release.
