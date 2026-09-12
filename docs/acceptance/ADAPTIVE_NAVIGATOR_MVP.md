# Adaptive Learning Navigator — frontier, Assignment and clean-start acceptance

## Baseline and gates

Branch `feat/adaptive-learning-navigator-mvp`, starting HEAD `a6022544d559f3f1db939cb1ae5baf1e2f8f1f49`, clean tree with no unrelated changes. Prototype `9fa8c0007a5ad3e2ab37263503c70319fade4419`; feature ahead 4 / behind 0. Baseline v3: 84 test files / 542 tests PASS.

Before any Hosted deletion, two new frontier regressions FAILED against v3: a later underway node displaced an earlier eligible node, and also displaced a blocked frontier. The one-line selection correction passed those tests. No historical state was removed to hide the bug.

## Implementation and policy

- `course-rule-v4` scans the existing deterministic curriculum path and skips only learned/skipped nodes. The earliest unfinished node remains frontier whether eligible, underway, blocked or missing Micro. Later underway history is neither rewritten nor prioritized. No Material/Assignment fallback and no scan-ahead for assets. Cold start is the same rule with empty state, not personalized recommendation. Micro completion remains learned, not mastery.
- Shared `assignmentEligibility` consumes published Course, valid nonempty coverage, instructional Knowledge statuses, hard dependency statuses and actual Assignment status. Feature and server adapters supply their own facts; the API revalidates ownership and published lifecycle first. No new API entrypoint, dependency or schema.
- Start accepts not_started/started/needs_revision plus existing legacy aliases. Submit requires started/revision. Submitted/accepted/completed cannot restart or submit a new attempt. Existing scoped idempotency keys retain the RPC's same-response replay and conflict handling without a new attempt.
- All checks precede course membership, practicing, state, attempt or result writes. The direct URL shows a blocked explanation without starting or rendering the editor. Task dialogs and Course drawer use the same eligibility semantics and link into the existing Assignment page with state-aware labels. Answer/trace/code submission runtime remains there.
- Practice stays separate from top learning Next Action. Only hard dependencies block execution; soft dependencies remain guidance. Existing deterministic coverage/order ranking and retained submitted debts remain.
- Fixed a browser-observed result-refresh race: pending results briefly exposed retry while the hydrated status still said started. Retry now also requires an actual failed result.

## Local verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`: PASS: 86 files / 574 tests.
- `pnpm verify:learning-loop:local`: PASS, including illegal start/submit before readiness, dependency rejection, illegal unstarted/accepted submit, exact database snapshot equality on rejections, normal failed/retry/passed attempts and accepted-result idempotency replay.
- Navigator browser fixtures: PASS: retained debt/order, submitted, complete vs missing states, locked details, Material access, API retry, reduced motion, 1440/390 and keyboard/modal focus.
- Real local cold start: A02 learning -> learned -> AGC01 next frontier under v4.
- Real local Assignment: A02 task -> start -> return/continue -> answer submission -> view submission. AGC01 direct URL blocked; progress identical before/after; 1440/390 and no page errors.
- Existing Micro browser regression: PASS for RT01, CDS525-K012, CDS525-K021 through actual challenge completion and review, zero review writes.
- An old source-string membership test expected an inline upsert. Updated it to the existing `activateCourse` helper call; real integration snapshots verify the same membership behavior and reject-before-write contract.

## Hosted reset scope and safeguards

Preflight inspects actual columns, all public foreign keys and triggers. There are no noninternal public triggers. A saved 52-table snapshot covers 51 public tables plus Auth users. Twelve history tables are explicitly allowlisted in `scripts/dev/reset-learner-history.sql`; deletion is child-first, without CASCADE, inside one transaction. All tables are locked briefly and all 40 protected tables must retain both row count and full-row checksum. Unexpected constraints or differences abort the entire transaction. No migration or automatic reset was added.

Cleared: learning_events, knowledge_evidence, performance_results, learning_attempts, navigation_decisions, user_micro_unit_progress, user_micro_path_progress, user_assignment_states, user_material_states, user_course_states, user_knowledge_states, workflow_runs.

Preserved: Auth accounts, Profiles including roles/capabilities, all course/Knowledge/Micro/Material/Assignment assets and ownership, all authoring data, Assistant sessions/messages, user workflow definitions and editor settings. Those authoring/settings records do not drive navigation, course progress or evidence. No separate public learning_sessions table exists; Auth and Assistant sessions are preserved.

Hosted reset completed after local gates and the first READY Preview. All 12 tables were zero inside the transaction and in an independent committed-state read; every protected table retained its count and checksum. Auth accounts 4 -> 4; Profiles 4 -> 4; role distribution remains 3 students / 1 admin. No credentials or learner rows are stored in this document. Cold-account Hosted acceptance passed on the corrected Preview below.

## Known content boundary

CTX02 and other real missing Micro assets remain unavailable at the frontier. No personalized generator, fake creation CTA, duration or state, practice scheduler, Material fallback, Workflow rewrite, course redesign or bundle work was added. Build's existing large-chunk advisory remains non-blocking.


## Reset evidence

| Table | Before | Immediately after reset |
|---|---:|---:|
| knowledge_evidence | 42 | 0 |
| learning_attempts | 2 | 0 |
| learning_events | 4 | 0 |
| navigation_decisions | 47 | 0 |
| performance_results | 2 | 0 |
| user_assignment_states | 9 | 0 |
| user_course_states | 23 | 0 |
| user_knowledge_states | 67 | 0 |
| user_material_states | 24 | 0 |
| user_micro_path_progress | 42 | 0 |
| user_micro_unit_progress | 45 | 0 |
| workflow_runs | 1 | 0 |

All other 40 tables, including full Auth/Profile rows and ALL teaching/authoring/chat records, had identical before/after checksums. The two target Course asset counts below were independently re-read after commit and matched exactly.

| Asset | Agent before/after | CDS525 before/after |
|---|---:|---:|
| assignmentCoverages | 117 / 117 | 90 / 90 |
| assignmentDependencies | 304 / 304 | 204 / 204 |
| assignments | 127 / 127 | 97 / 97 |
| chapters | 9 / 9 | 6 / 6 |
| curriculumCoverages | 117 / 117 | 90 / 90 |
| edges | 136 / 136 | 115 / 115 |
| knowledge | 117 / 117 | 90 / 90 |
| lessons | 9 / 9 | 26 / 26 |
| materialCoverages | 148 / 148 | 91 / 91 |
| materials | 2 / 2 | 12 / 12 |
| micro | 12 / 12 | 3 / 3 |

## Hosted deployment correction

The first code Preview was READY but `/api/learning` failed on Node ESM module resolution: the new shared module imported teachingPrerequisites without a `.js` extension. Real Vercel logs and independently emitted JavaScript reproduced ERR_MODULE_NOT_FOUND. The import now uses `.js`; the emitted module loads in Node, and full checks are rerun. This is why READY alone is not accepted as functional verification. No learner writes occurred during those failed requests. Corrected code Preview `https://edu-flow-8a24ke8s9-july-nanas-projects.vercel.app` at `8e2a9f2` is READY with 12 actual lambda outputs. Authenticated start/submit before readiness each return 403; all 51 public tables remain identical after those rejected requests. No runtime failure remains on the corrected deployment.


## Hosted browser and post-acceptance evidence

Ordinary learner only; no administrator action or teacher acceptance was needed. Empty-state cold start showed A02 in both queue and current route node, performed all six Micro steps through the normal UI/API, returned to Course and advanced exactly to AGC01 under v4. The resulting Knowledge was learned (not mastered). The same learner opened the A02 task from backlog, started, returned and continued, submitted a real answer, and viewed its pending submission. AGC01 Assignment direct URL displayed the blocked explanation and no editor; before/after progress was identical. No page errors, 1440/390 overflow or dialog clipping; modal focus and Escape/return focus passed.

The newly completed A02 path was then reviewed through all six steps and returned to Course with zero progress writes. Final rendered queue remains AGC01 (real five-minute path), with the A02 submitted task retained separately. After real acceptance, all 39 protected public tables still match their post-reset checksums. New real records: one learner Knowledge, one Course membership, one Assignment state, one attempt/result, one Micro path/unit progress, one evidence, two learning events, four navigation decisions. Material progress and workflow runs remain zero. These are new acceptance actions, not restored historical fixtures. All four accounts remain, with three student Profiles and one admin Profile. CTX02 still has zero published Micro.

## AC01–AC46

| AC | Status | Evidence |
|---|---|---|
| 01 | PASS | v4 earliest unfinished curriculum node |
| 02 | PASS | Old v3 regression failed; v4 selects B over later Z underway |
| 03 | PASS | Frontier underway unit regression resumes B |
| 04 | PASS | Blocked frontier regression never selects later candidate |
| 05 | PASS | Missing frontier remains unavailable, no Material |
| 06 | PASS | Missing frontier wins over later underway with Micro |
| 07 | PASS | Hosted empty-state A02 first recommendation |
| 08 | PASS | Browser asserts queue and current node title identity |
| 09 | PASS | Actual six-step completion advances exactly to AGC01 |
| 10 | PASS | Server and projection reject Assignment as top action |
| 11 | PASS | Existing debt order and submitted tests; soft guidance non-blocking |
| 12 | PASS | Task dialog navigates to existing AssignmentExperiencePage |
| 13 | PASS | Local and Hosted A02 start succeeds |
| 14 | PASS | Browser returns and uses Continue on durable started state |
| 15 | PASS | Shared CTA and server tests; local failed->revision->passed submission |
| 16 | PASS | Hosted submitted task is viewed; no retry CTA; API restart rejection |
| 17 | PASS | Accepted/completed unit/API rejection; real accepted idempotency regression |
| 18 | PASS | Task/dialog and Course drawer use shared readiness; blocked URL has no editor |
| 19 | PASS | Hosted cold start API 403 and blocked URL no progress change |
| 20 | PASS | Hard-dependency API test and real local database rejection |
| 21 | PASS | Unstarted/accepted new submit returns 409 |
| 22 | PASS | Local exact learner snapshots; Hosted all-public-table checksum equality |
| 23 | PASS | Real Hosted answer submission/result view; local trace failed/retry/pass |
| 24 | PASS | Twelve historical tables zero, atomic and independent post-commit proof |
| 25 | PASS | Auth users 4->4, complete reset-time row checksum unchanged |
| 26 | PASS | Profiles 4->4 and complete checksum unchanged |
| 27 | PASS | Profile role/capability checksums, 3 student/1 admin distribution unchanged |
| 28 | PASS | All asset table row checksums plus target Course counts identical |
| 29 | PASS | All asset table row checksums plus target Course counts identical |
| 30 | PASS | All 39 protected public tables unchanged; all Courses included |
| 31 | PASS | Actual CTX02 zero published paths; missing-frontier tests |
| 32 | PASS | No generator or synthetic creation CTA |
| 33 | PASS | Engine has no Material fallback |
| 34 | PASS | package.json and lockfile untouched |
| 35 | PASS | No migration/schema/API entrypoint added |
| 36 | PASS | pnpm typecheck PASS |
| 37 | PASS | pnpm lint PASS |
| 38 | PASS | 86 files / 574 tests PASS |
| 39 | PASS | pnpm build PASS |
| 40 | PASS | Existing Navigator fixtures + Hosted cold advancement PASS |
| 41 | PASS | Existing three-path regression and Hosted six-step review PASS |
| 42 | PASS | Hosted task/start/continue/submit/view/blocked loop PASS |
| 43 | PASS | 1440 render/overflow/dialog/focus PASS |
| 44 | PASS | 390 render/overflow/dialog/focus PASS |
| 45 | PASS | Corrected READY Preview; no page runtime errors; final doc commit rechecked in report |
| 46 | PASS | Same feature branch; prototype unchanged; no merge |
