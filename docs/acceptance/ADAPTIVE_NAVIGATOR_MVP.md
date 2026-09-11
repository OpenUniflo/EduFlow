# Adaptive Learning Navigator MVP — acceptance

Baseline: `origin/prototype` at `9fa8c0007a5ad3e2ab37263503c70319fade4419`. Initial working tree clean. Branch: `feat/adaptive-learning-navigator-mvp`. No dependency, schema, Function or Course content changes.

## Stages and success criteria

1. Confirm existing boundaries: CourseGraphPage / CoursePathView; API Navigation Engine; progress repository; published Micro repository; Assignment lifecycle. Reuse confirmed, no second engine.
2. Projection: one server-selected action, persistent derived backlog, separate nextPractice, explicit dependencies, submitted/accepted handling, navigation sequence and state mapping. Fourteen Vitest cases pass.
3. Interaction: 1440px desktop / 390px mobile snake path, clear chapter transitions, one primary CTA, read-only task detail, keyboard focus, reduced motion and visible request errors. Local browser A–G pass using real catalog plus in-memory learner fixtures; no fixture state is persisted.
4. Regression and delivery: full commands pass; real Hosted Preview verification after push is recorded below. Never deploy to production or merge prototype.

## Architecture evidence

- Course page: `src/features/course/pages/CourseGraphPage.tsx`, default path presentation. Graph/editor preserved.
- Navigation: `ApiLearnerStateService.getNavigation` → `/api/navigation` → `api/_handlers/navigation.ts` → `api/_lib/navigationEngine.ts` (`course-rule-v2`). Current policy yields Micro, Material, or course/no-action explanations; supported Practice rendering is fixture-tested, not claimed as a current server recommendation.
- Learner state: `/api/progress` hydrates UserKnowledgeRepository and ApiLearningProgressRepository. `useOptionalUserCourseState` observes refreshed snapshots.
- Assignment state: `UserCourseState.assignmentStates`, backed by `user_assignment_states`; accepted/completed is terminal for backlog, submitted awaits review. No debt timestamp exists in the current read model.
- Micro: existing published MicroLearningRepository and `createMicroLearningNavigation`, unchanged completion and evidence flows.
- Golden local Course `ai-agents-in-depth`: first chapter Agent 架构与运行基础 has 10 Knowledge, 10 published available Micro, 10 Assignments. The existing local learner has 12 pending practices and a Material Next Action. No Course content was edited.

## Verification

- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS.
- `pnpm test`: PASS — 84 files / 534 tests, including 14 new projection cases.
- `pnpm build`: PASS. Existing large-chunk advisory remains; no new dependency or splitting overhaul.
- `pnpm verify:learning-loop:local`: PASS — real local attempted/accepted state machine and versioned NavigationDecision checks.
- `scripts/acceptance/course-navigator.browser.mjs`: PASS, authenticated Local Supabase catalog with memory-only fixture states. A/B Micro current and completion progression; C/D four retained practices independent of Micro; submitted visible without recommendation; E supported Practice single CTA; F/G chapters, 1440/390, reduced motion; API failure/retry; native dialog Escape and restored focus.
- Screenshot artifacts are under `output/playwright/` (local review artifacts, not source fixtures).
- Hosted migration history: linked project `uyljtdbvlivxniililay`; 47/47 repository migrations match. No migration or fixture synchronization required by this UI-only change.
- Hosted Preview and existing Micro browser regression: pending final delivery verification.

## Acceptance matrix

| AC | Status | Evidence |
| --- | --- | --- |
| 01 | PASS (local) | A single named action and start control in the queue |
| 02 | PASS | Browser asserts one primary; backlog has none |
| 03 | PASS | Four-debt and begun-debt regression; real 12-item backlog |
| 04 | PASS | Exactly one ready nextPractice; route/dependency tests |
| 05 | PASS | Distinct Micro action and Practice recommendation in A/C/D |
| 06 | PASS | Compact circular nodes, no Knowledge card list |
| 07 | PASS | Deterministic snake SVG, linear sequence, chapter separators |
| 08 | PASS | Completed/current/available/locked mapping and appearance |
| 09 | PASS | Server node identity gives the sole current marker; locate action |
| 10 | PASS (local) | Golden first chapter 10 Knowledge / 10 Micro / 10 Assignments |
| 11 | PENDING | Existing Micro browser regression |
| 12 | PASS (fixture/local API) | Refresh snapshot advances node and Next Action; learning-loop verifier |
| 13 | PASS (local) | 1440px / 390px, no horizontal overflow, focus and reduced motion |
| 14 | PASS | No dependency or lockfile changes |
| 15 | PASS | No Workflow runtime, ML, evaluation or tracking expansion |
| 16 | PASS | Full typecheck/lint/tests/build and local learning-loop verifier |
| 17 | PENDING | Push and Preview completion |

## Deliberate limits

No historical practice-debt time is invented. Sorting uses actual route and Assignment ordering. No new spaced-review/Quiz capability is implied. Current Navigation can stop on a material-only Knowledge without a completion mechanism that advances it to learned; changing that server policy is outside this presentation round. Full Workflow execution, richer Assignment environments, and ML ranking remain out of scope. Learning home is unchanged.
