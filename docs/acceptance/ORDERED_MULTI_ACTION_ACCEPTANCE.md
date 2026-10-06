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
