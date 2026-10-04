# Route / Action unification — work in progress

2026-10-04. This is an execution record, not a completion claim.

## Verified baseline

- Original chat checkout `/Users/fanyuhang/.codex/worktrees/0109/EduFlow` was detached at a0fc93e. Required branch was checked out cleanly at `/Users/fanyuhang/Documents/OpenUniflo/EduFlow`, 29 commits behind. Fetched origin and fast-forwarded that existing branch to `06fb55c44b76eafec8f21eeab84f71598dd12cf4`. All implementation continues there on `feature/project-capability-model`.
- Baseline READY Feature deployment from Vercel: https://edu-flow-jiippifnz-july-nanas-projects.vercel.app, same commit. No Production promotion.
- Hosted `uyljtdbvlivxniililay` inspected read-only: action templates/bindings lack explicit execution references; ActionRun has Micro path and legacy evidence source but no Assignment execution link.
- Active route snapshot prerequisite audit: 7 course/version groups, all reported zero edge identity/endpoint/relation mismatches. Course/version groups: agentic-ai-golden V1, ai-agents-in-depth V11/V15, cds525-deep-learning V1, enterprise-vietnam-supply-collaboration V1/V5/V7. This validates stored facts, not the old renderer's invented adjacency lines.
- Hosted has 3 Actions, 3 bindings, 4 runs. Two enterprise Practice Actions have no target AssignmentCoverage. They need explicit content configuration; guessing an Assignment is forbidden.
- Security Advisor baseline includes five service-only RLS/no-policy notices, can_read_course SECURITY DEFINER execute notices and disabled leaked-password protection. No policies were broadened and no unrelated security changes made.

## Frozen contracts

- `docs/architecture/CAPABILITY_ROUTE_ACTION_CONTRACT.md`
- `docs/design/FRONTEND_DESIGN_SYSTEM.md`
- Superseded old AGENTS Navigator learning-only requirement with the user's explicit Action recommendation contract. Existing Micro/Assignment evidence authority remains unchanged.

## Phase 1 acceptance

Requirements: only factual route relations; no adjacency inference; cross-chapter edges retained; hard/soft/enables distinguishable; presentation changes do not restart layout; actual Preview browser verification.

Implemented: shared `routeRelations` projection, formal RoutePlan input to Navigator, React Flow rendering using existing ELK engine/options, structural cache and accessible node/relation list. Ordered IDs affect layout only. Legacy sine-wave adjacency connectors removed. Current prerequisites remain distinct from support enables.

Reviewer 2 found and implementation corrected: pending/failed formal routes incorrectly showing an edgeless fallback; stale new bridge eligibility; enables cycle reversing the hard prerequisite backbone. Explicit loading/error handling, source-state hard-gate projection and ELK MODEL_ORDER cycle handling now cover those cases. MODEL_ORDER follows the existing topological route order and does not change factual edge direction; see https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-cycleBreaking-strategy.html.

Initial verification: 28 targeted tests passed; 107 full-suite files / 763 tests passed; typecheck, lint and build passed before the last two added regression cases. Build has pre-existing H5P `*width` CSS warning. Latest checks and deployed browser validation are pending.

Baseline screenshots (Playwright, logged-in ordinary acceptance account):
- `output/playwright/route-action-unification/before-course-route.png`
- `output/playwright/route-action-unification/before-bridge-switch.png`

## Independent review baseline

Four separate read-only reviewers completed product, graph/interaction, UI/UX, and regression/data/security reviews. Important confirmed findings:

- Product: fake route edges, source +30 cost instead of gate, implicit Micro lookup, parallel Practice upload lifecycle, silent active-run cancellation, no repetition, lost history, Bridge presentation jump, Micro-only recommendation.
- Graph: no current/preview overlay input to Scene; global facts leak into project detail; missing action-count hover. Existing Scene structural identity and force/camera separation can be reused.
- UI: Library mixes diagnosis and history; null run ID combines proposals; light text leaks onto white background; Evidence/Project Assistant reuse hidden selections; typography and reduced motion need improvement.
- Data: retain old RPC signatures for shared Production; new explicit-resource/confirmed-switch boundaries should be additive. Assignment accepted state must not be reset for repetition. New attempts need exact ActionRun attribution. Existing Micro path history cannot be reported as fresh repeated execution.

## Remaining work (not PASS)

Finish Phase 1 latest Preview visual/runtime validation. Then implement Action resource binding, Assignment reuse and repetition with atomic lineage, confirmed switching, history, source gate and recommendation; unified KnowledgeNodeDetail including Bridge; Navigator Action integration; project overlays/diff/branch/relationship scope; presentation-aware Assistant; Evidence Library and staged run-scoped diagnosis with summary/detail APIs; unified tokens/reduced motion. Run each phase's review/fix loop. Complete final full tests/audits, migration consistency/advisors, latest READY Preview 5xx/fresh acceptance, all 17 requested screenshots and all 33 success criteria. No final completion or final commit claimed yet.

## Verified updates, 2026-10-04

Phase 1 Preview `78364753d6ac6ff3cdfdf55c09b1d99eda929b20` is READY at https://edu-flow-qkch8tfd7-july-nanas-projects.vercel.app. Ordinary-user browser console had zero errors. Independent UI review passed the final desktop title wrapping, narrow controls and actual Fit result screenshots:
- `output/playwright/route-action-unification/phase1-desktop-final.png`
- `output/playwright/route-action-unification/phase1-narrow-controls-fixed.png`
- `output/playwright/route-action-unification/phase1-narrow-fit.png`

Phase 2 implementation is local and uncommitted. The additive migration `20261004095510_action_execution_resources_v2.sql` introduces explicit nullable Micro/Assignment executor references and links existing attempts to ActionRun. It preserves old RPC signatures and v1 records; no new Practice lifecycle or client write policy was introduced. No Phase 2 migration has been applied to Hosted.

Practice reuses Assignment evaluation, results, review and evidence. Starting an Action does not write practicing state. Repetition preserves accepted Assignment aggregate status, owns a fresh attempt lineage, and exact-attempt review remains possible. Micro repetition evaluates through the existing Micro pipeline, observes only this run's accepted steps and does not replay historical completion evidence. Action resource availability, source gates, cost ranking and explicit switching confirmation are implemented.

Deliberate current boundary: workflow-mode Assignments are unavailable as Action executors until their existing WorkflowRun completion can carry ActionRun identity. Ordinary course workflow execution remains available. Unconfigured legacy bindings are honestly unavailable in the new UI; the two existing enterprise Practice bindings cannot be guessed because their target Knowledge lacks AssignmentCoverage.

Independent data review found and fixes cover: concurrent attempt ownership theft, advisory-lock inversion, replay moving the current attempt pointer backwards, pending manual review bypass, changed Micro snapshot/path, and historical Practice repeating through explicit route exclusion. Saved Assignment retries now recover the exact persisted result despite subsequent Action archival, while rejecting changed response/execution identity.

Verification before these last two regression additions: 108 test files / 778 tests passed; typecheck, lint, production build passed (existing bundle-size/H5P warnings). Latest local transactional suite passed 32 checks, including archived Action replay; legacy Action regression passed 25 assertions. Full migration transaction replay passed before the latest replay fix. Final Phase 2 full checks, migration consistency, Hosted application and fresh Preview acceptance remain pending.

The remaining phases and the 33 final criteria are still incomplete. This record is not a completion claim.

Phase 2 final local checkpoint: 108 files / 780 tests PASS; typecheck, lint, build, relation audit and client-secret audit PASS. Full current migration replay in a rolled-back transaction PASS; local Security Advisor at warning level reports no issues. Reviewer rechecked the last two fixes and found no blocker. Hosted still has the original 59 migrations immediately before deployment.
