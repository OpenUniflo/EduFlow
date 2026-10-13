# Ordered multi-action implementation acceptance

## Phase 0 baseline · 2026-10-06

The requested branch is checked out at `/Users/fanyuhang/Documents/OpenUniflo/EduFlow`; the chat's managed worktree was detached on main. Work continues on `feature/project-capability-model`, baseline `e38a24c9579106ff3b61e386532451862a8fcb0e`. Two pre-existing untracked Playwright output directories are preserved.

Hosted project `uyljtdbvlivxniililay` is ACTIVE_HEALTHY. Latest applied migration is `20261005154706_retire_trace_practice_and_enforce_artifact_bindings`. Enterprise catalog has 23 bound factual Edges, 24 available Micro bindings, 2 available Practice bindings. A/B active versions are `7444b6b0-cde9-4ec5-8086-82ce1d8f3949` and `f6d17576-2f3e-4117-809c-fcc72aad5fa1`. Baseline deployment `dpl_3P4jSd5bKPNfJiFCMLgi8hBPUjJw` is READY at baseline SHA.

Updated the formal contract to 0..N candidates, 1..N distinct ordered selections, consecutive same-Edge executionSteps, independent Edge membership and derived execution reachability. Retain historical same-owner/course/Edge/Action completed-Run compatibility; no per-Version completion entity or UKS write is introduced. Necessary selected incoming Edge groups all complete before target reachability. Repeat does not block progression.

Reset guards passed static review and automatic tests. Using the existing artifact A/B baseline, two Hosted reset runs returned the identical protected outside hash `0136e8579f2d2ae9b95e0809db36cb87`, with zero storage removals. Local `.env.local` points to local Supabase and the saved Vercel env file contains redacted placeholders; both rejected reset before writes. The successful run used the exact Hosted URL and existing linked CLI credentials. No secret is persisted here. A new multi-action baseline must later be established through Preview/Adopt and checked twice again.

Reviewer 1 identified Phase 1 gaps in current-Step enforcement, underlying UKS-only execution conditions and active-Run adoption conflicts. Reviewer 2 identified single-selection, History/Step keys, hard-scope, hidden overview, catalog and detail identity gaps. These are pending implementation, not acceptance passes.

## Phase 1 · core ordered execution

Reviewer 1 second review PASS after fixing v1 completion compatibility, the learning handler's second assignment-coverage readiness check, and retained future Run start/submission bypasses. Independent review ran 72 tests; implementation verification ran 98 relevant tests and TypeScript successfully.

`verify-ordered-route-local.sql`, executed together with the forward migration inside one local rollback transaction, passed actual RPC behavior: non-current Action rejected; old future in-progress Run cannot start or submit; committed pending/failed Result completes its Run; partial Edge group cannot reach its target; complete group reaches its target without UKS; the next factual Edge starts; active adjustment conflicts are rejected; UKS remains byte-equivalent. No Hosted catalog or migration mutation has yet occurred.

## Phase 2 · product controls

Reviewer 2 second static/local review PASS after correcting explicitly cleared selections (no implicit recommendation), desktop editing overview overlap, and omitted structural conflict counts/details. Full browser/viewport verification remains pending the new Preview. Checkbox groups, local up/down order, independent add/remove/reorder diffs, distinct Step keys, exact Action details and all selected branches are covered by automated checks.

## Phase 3 · enterprise resources

Reviewer 1 PASS after individually reviewing all 23 transfers and 24 business tasks; independent 69 tests passed. New catalog preserves existing Micro methods, archived Trace and immutable history, and adds 23 Edge-specific Micro Paths and 24 unique business Assignments (47 new Actions). The full matrix is in `ENTERPRISE_ORDERED_ACTION_AUDIT.md`. Explicit Assignment order 100–123 is disjoint from Hosted existing 0–21. Generic artifact submission supports text/private files/mix with manual pending; no Practice ontology or Action type was added. Old catalog generation no longer injects hardcoded user states.

Local actual SQL publication twice inside a rollback transaction passed, with zero inserts on the second run. Full test: 128 files / 967 tests PASS. TypeScript, lint, production build, factual relation audit and client secret audit PASS. Existing H5P CSS and bundle-size build warnings remain out of scope. Pre-deployment A/B and protected outside-state capture saved privately before Hosted mutations.

## Phase 4 · Hosted acceptance and final regression

Implementation commits on `feature/project-capability-model`, after baseline `e38a24c`:

| Commit | Change |
| --- | --- |
| `6e2bf361c00006ba8bcf0a1c9ca3bb827aed5702` | Frozen ordered Action contract |
| `198ce33ca3323bbafc49b33c7c0e42f9659007bf` | Ordered execution, transactional authority, Planner/Course/History controls, enterprise resources |
| `944edaaa67e284b8edb7eb246a7b8ad39bcba550` | Explicit removal of unavailable historical choices; Planner recommendation shares authoritative candidate sorting |
| `e93c52fa3d55630223ba03ec3ac629f544bb7ee3` | Action Micro startup uses its owned Run instead of also issuing a UKS-gated ordinary Micro start |

The acceptance-record commit follows these implementation commits. Its final SHA and matching READY deployment are recorded in the delivery response after Git assigns the SHA; this document cannot contain its own future commit hash.

Changes are limited to ordered route pure functions/projections, their API/RPC execution gates, Action/Planner/History/Course/Micro presentation, enterprise acceptance catalog scripts/fixtures, tests and documentation. No dependency changes, competing lockfiles, new Action type, Action Graph or persistent execution-reachability entity were introduced. Course facts, UKS authority, Evidence → Diagnosis → explicit Confirm and existing submission executors remain separate.

### Hosted catalog, migration and protected data

Applied the forward-only migration `20261006082021_ordered_multi_action_route_execution.sql` to `uyljtdbvlivxniililay`; all previously applied migrations remain unchanged. Remote dry-run reports up-to-date, zero migrations/seeds/roles. Reviewer 1 compared all ten changed Hosted function bodies to the migration verbatim, with service-role-only execution permissions.

The existing 23 factual enterprise Edges now have **73 active available bindings: 47 Micro and 26 Practice**. New resources are 23 independent Edge-specific Micro Paths plus 24 independent business Assignments/Actions; existing 24 Micro and 2 Practice remain. No active Trace/Quiz Practice was restored. The 23-Edge content matrix passed individual review in `ENTERPRISE_ORDERED_ACTION_AUDIT.md`; the criteria → qualification Edge has two distinct business tasks, rather than two artificial checks of one artifact.

Protected original knowledge facts, original Actions, histories and all unrelated users (including admin/QQ) retain their pre-publication hash `0136e8579f2d2ae9b95e0809db36cb87`, when excluding only the explicitly added v4 catalog Actions. A/B's 14 course UKS records remain byte-equivalent after identity sorting. The hosted factual topology audit checks 17 published Courses / 11 existing active routes / 28 valid scenarios with zero conflicts or fabricated-edge mismatches; data and method are saved in `ORDERED_ROUTE_HOSTED_FACTS.json`.

### Fresh browser chains

| Scenario | Result |
| --- | --- |
| A: one Micro on one Edge | Planner → Preview → Adopt V10 → Course → Execute → three accepted informational steps → Run `51eb4c64-25b9-4119-8be8-9c359e0c7fe4` completed → next Step; PASS |
| B: one Practice on one Edge | Background/instructions → actual authored text artifact → explicit formal submission → pending PerformanceResult → Run `c0899d4f-e356-49c4-9827-957d71aa5e68` completed → next Step; PASS |
| B: Evidence | Explicit “检查能力变化” saves source `a8d5f24e-45c1-4eea-9dcd-c0228b9994e8`; provenance connects original user response, course, Assignment, Run, Attempt, Result and pending outcome. No diagnosis confirmation or UKS mutation; PASS |
| C: Micro → Practice 1 → Practice 2 on one Edge | Checkbox multi-selection and local reorder → Preview → Adopt A V11 → History → consecutive Steps 3–5 / relation actions 1–3. Micro and both pending committed submissions complete all three Runs; PASS |
| C: prevent skip | Direct later Action selection returns `409 route_step_not_current`; no Run manufactured; PASS |
| C: next Edge without confirming UKS | Completed group makes qualification transiently execution-reachable; next admission Action available. On fixed Preview, Run `f62f47fa-e047-4a55-a1b3-6538d615f5bb` saves its original `admission-explain` Micro Step with matching Run/user/course/path and no ordinary-start 403; PASS |
| Running Route adjustment | Valid Preview replacing the current in-progress Action cannot Adopt: `409 route_active_run_conflict`; active V11 retained; PASS |
| Repeat | Explicit “再次实践” creates independent Run `4da286db-2b40-40ea-a6d8-f7a5ce860230`, a new pending submission and original user-text Evidence source. It does not reopen formal progression; subsequent scoped reset removes this temporary record/source; PASS |
| History | V10 single-action compatibility; V8 unavailable Action prevents exact restore. Replan retains historical choice visibly, explicit removal/reselection produces valid Preview. Immutable history and completed/pending records survive normal Adopt; PASS |

A V11 `f0fdb38f-5bb7-47ee-9280-1c370bd07d3b` has 25 Steps, including qualification Micro `d924ff77-3b7c-5425-aa26-9147dec1b289` → request `9f9819bd-0305-5c53-a52a-2129c5cbeb44` → review `23cfb391-f828-5b2b-a541-78b205a40d0f`. Their completed Runs are `7f2202bb-1819-4e01-80b4-325c16b46a6e`, `7cfbcc67-1164-4147-a56c-54c19963a205`, `1773b09d-36de-4e8f-83e7-6b9a7f8d4d78`. Both business Results remain pending while execution progresses.

B V11 `e1ef2b1b-80ae-438c-8095-8b0bdabb1493` has 18 Steps; the incoming-quality group is Micro `c4e22c29-07e0-5eda-ab96-123fd0fee408` → Practice `17a2fa62-31f2-55cc-a63f-21975e4f6760`. It was created through ordinary UI Preview/Adopt, retaining the completed Practice-only history.

### Reset and visual verification

Captured a fresh legitimate multi-action A/B baseline through normal product behavior at `.acceptance/ordered-route-v4/multi-action-baseline-v1.json` (private, not committed). No executionSteps SQL patch was used. Tested Repeat after capture, then scoped restoration and storage cleanup. A transient ECONNRESET interrupted storage HTTP cleanup after database restoration; the existing persisted cleanup manifest allowed retry to finish and remove exactly one unreferenced authorized storage object.

Two subsequent complete reset runs returned identical protected hash `6c5e89ac4a62327741daed35cd324cfa`, zero additional storage removals, and snapshots exactly equal to every captured A/B table after sorting. Both restored-table SHA-256 values are `ee20f1be04e5cd9810039e1206996c9cbb11e7fca4d6117e06fc50a6852342e7`. The changed outside hash includes the intentional new catalog. New temporary next-Edge smoke records are restored to this same baseline after verification.

Desktop 1366×768 and 1440×900 plus mobile 390×844 / reduced motion PASS. Expanded bottom details preserve bottom-bar bounds and page scroll; History and selected-action removal remain reachable without horizontal overflow. Reduced-motion view has no infinite animations. Sparse map layout remains structurally stable. Screenshots are in `output/playwright/ordered-route-v4/` and `output/playwright/ordered-actions/reviewer2/`; no credentials are captured.

### Tests, deployments and review

Final implementation regression: **129 files / 971 tests PASS**. TypeScript, lint, production build, `audit:knowledge`, `audit:client-secrets`, diff checks and Hosted migration consistency PASS. Local actual SQL RPC rollback verification covers out-of-order start/submit, retained future Run, pending/failed committed execution, multi-action Edge group completion, adjustment conflict and unchanged UKS; converging incoming-Edge completion is additionally covered by pure tests; repeated catalog publication inserts zero rows on its second execution. One earlier cold dynamic-import UI test timeout passed on rerun; final full suite passes.

| Tested deployment | Commit | State |
| --- | --- | --- |
| `dpl_64PvfduJqYsP2ifmhvkpXdbk8jUT` / `https://edu-flow-livs27360-july-nanas-projects.vercel.app` | `198ce33` | READY; A single Micro / B Practice and Evidence |
| `dpl_EYpr98mtcBM4rMsRMcTjVhHhRC6R` / `https://edu-flow-8mig5ym5b-july-nanas-projects.vercel.app` | `944edaa` | READY; multi-action execution, History recovery, mobile |
| `dpl_31i2ye99665iWy7zUCJtsZe4jhh8` / `https://edu-flow-heybbuhd1-july-nanas-projects.vercel.app` | `e93c52f` | READY; next-Edge Micro startup/accepted Step fix |

Each tested deployment's Git SHA matched the branch HEAD at testing; all are feature Previews, without production promotion, force-push or merge. Runtime queries find no new systemic 5xx. Deliberate negative tests produce expected 409s. The identified 403 Micro startup issue was fixed and retested; opening a post-reset obsolete Run URL returned the expected 404, then the fresh normal Course launch saved successfully.

Reviewer 1 independently validated execution gates, immutable migration/functions/ACLs, catalog, original-data protection and UKS, with 79 core/API/fixture/UI tests plus 16 Micro-related tests. Reviewer 2 validated browser submission/Evidence/History, unavailable-choice recovery, recommendation sorting and responsive/reduced-motion presentation. All reported REAL DEFECTs were corrected and reviewed. Final delivery requires both final PASS confirmations and READY at the final acceptance-record SHA.

Existing H5P `*width` CSS and large-chunk build warnings, previously observed `url.parse()` DEP0169 and historical unrelated diagnosis issues remain out of scope. No new Evidence authority, external messaging, production promotion or unrelated-user writes were introduced.
