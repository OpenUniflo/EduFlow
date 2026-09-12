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

Hosted reset, counts/checksums, clean-account browser acceptance and exact READY Preview are pending execution after the code verification gate. No claim of Hosted completion is made yet.

## Known content boundary

CTX02 and other real missing Micro assets remain unavailable at the frontier. No personalized generator, fake creation CTA, duration or state, practice scheduler, Material fallback, Workflow rewrite, course redesign or bundle work was added. Build's existing large-chunk advisory remains non-blocking.
