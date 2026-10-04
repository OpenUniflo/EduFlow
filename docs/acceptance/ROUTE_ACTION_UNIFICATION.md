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

Deployment checkpoint: commit `9a1f1904d317eed5088945cf2ffd65fb214a04e0` pushed on the required branch. Exact migration applied to Hosted with Supabase CLI after dry-run showed only that file; all 60 local/Hosted history versions match. Post-migration Hosted Security Advisor matches the recorded baseline (five service-only RLS notices, can_read_course execute notices, disabled leaked-password protection), with no new finding. New Feature Preview `dpl_C88HKbNM8E2XpnoV5UrrztA7ukdJ` is building; fresh Phase 2 UX acceptance remains pending.

Phase 2 Preview is READY at https://edu-flow-2of9zqnsp-july-nanas-projects.vercel.app. Private labelled course `acceptance-route-action-v2` was created for the authorized normal acceptance account with `scripts/acceptance/route-action-v2-fixture.sql`. It references existing A02 / CTX01 and factual soft prerequisite `book-gold-v1-prerequisite-a02-ctx01`. No Knowledge facts or learner state were seeded. It copies CTX01 teaching content into an explicitly bound private Micro resource and defines one repeatable trace Assignment. These records remain acceptance evidence.

Browser adopted explicit inclusion of A02 through Preview → Adopt. Existing soft prerequisite did not silently force source into the route. Browser then selected Practice, launched the existing Assignment page with ActionRun `1c8d45f0-9c2d-4c86-bcb8-2fe1e9c6dc9f`, submitted a wrong trace answer, retried and passed. Hosted verified failed attempt `419f96e8-a162-4c2a-9d1f-3929587eaad8`, passed attempt `6bb3376c-1cc1-4785-a7bf-40c7e86596e3`, exact run ownership, completed run, one Assignment KnowledgeEvidence, and no CTX01 UserKnowledgeState.

Fresh UX found an availability cache defect after adopting a route: manual refresh was required. Fixed by reloading Action data on formal route/knowledge revision and aligning Micro source+target route visibility with Practice; pending new Preview confirmation. After fix: 780 tests, typecheck, lint and build PASS. Micro full browser execution, repetition/switching fresh checks, Node Detail entry and final UI polish remain pending.

Explicit Micro fresh browser execution completed all seven teaching steps (including playback, role classification and keyboard reorder) for ActionRun `3ae93c7e-d06d-4562-a6b0-01f3de637262`. Hosted confirmed `completed`, bound path `acceptance-route-action-v2-ctx01`, seven attempts and seven distinct accepted steps. Assignment-result console had zero errors; completing Micro then produced HTTP 422 from `/api/navigation` and a next-step retry warning. This completion-page defect remains under investigation. Screenshots `phase2-assignment-result.png` and `phase2-micro-result.png` were visually inspected; result-page next-step copy still reflects the old Navigator and is included in the upcoming unification scope.

Latest READY Feature Preview for availability refresh commit `10f8fbd11ef86b5931e2b85137e08a674defbec1`: https://edu-flow-hcwb7q67s-july-nanas-projects.vercel.app (`dpl_3nEELqjehLAX8BHtca2EsoPsspsF`). The above full execution was performed on preceding READY `9a1f190`; latest-refresh-specific browser check remains pending.

## Phase 3/4 acceptance contract

One course-scoped Route controller and Action controller feed Path, Node Detail and Project. KnowledgeNodeDetail requires visible Knowledge plus explicit user state; course projection is optional. Bridge selection stays in Path, never fabricates curriculum or inherits all course materials. Skill Tree retains complete course relations/assets independent of personal exclusions; Path emphasizes outgoing current factual relations. Shared Action controls own selection, confirmation, start/repeat and snapshot history. Navigator prioritizes owned active execution, then available current-edge Actions by shared rank, and has an honest no-action state without automatic Micro fallback. Old navigation may supply learning progress only. Tests cover scope, source-oriented actions, Bridge absence of curriculum and active history after route changes; fresh desktop/narrow validation remains required.

## Phase 5/6 acceptance contract

Force input is the active visible factual ancestor closure of Course targets, independent of acquired state, current route, draft and preview. Only prerequisite/enables facts participate; hidden structural context is neither selectable nor labelled and is excluded from explicit Fit. Current Route is visible on entry. Valid Preview shows kept/added/removed edges and node membership (including isolated nodes), preserving Current baseline. Every overlay edge must match a current factual edge ID, direction and relation. Preview is presentation-only; Adopt remains the existing version mutation. Search, relation details, downstream highlighting and Action branches use the displayed project scope. Hover, click and keyboard expose the same Action count/choices without changing engine graph identity or camera. Tests cover closure cycles, inactive and unrelated nodes, acquired pruning, stale snapshot edges, empty/singleton routes and diff identity. Browser screenshots and coordinate/camera assertions remain necessary before PASS.

Phase 2 follow-up commit `93667bc38142964a757157c692ee39c287c0c2bf` READY at https://edu-flow-bhyu4kufb-july-nanas-projects.vercel.app. Fresh normal-user Micro result reload asserted navigation HTTP 200 and console zero errors; inspected screenshot `phase2-micro-result-fixed.png` shows completion without retry warning. Explicit acquired factual ancestors now survive candidate pruning; unrelated/unacquired/removed identities and lost facts remain invalid. Contract and AGENTS were reconciled.

Phase 3/4 local checkpoint: KnowledgeNodeDetail with optional course fields and Bridge learning resource, shared Route/Action controllers, source-oriented relationships, common Action execution and independent ActionRunHistory. Navigator recommends server-confirmed continuable runs, then available Actions toward unacquired targets. Skill Tree summaries include full factual course relations without weakening execution gates. Product/data reviewers found scope leakage, blocked historical recommendations and missing Bridge learning entry; fixed with keyed course/user workspace, request unmount guards, server continuation checks and explicit existing Micro path. Full suite 110 files / 789 tests, typecheck/lint/build PASS; knowledge/client-secret audits PASS. A final small summary-availability scope alignment is being verified. Browser validation of this implementation remains pending; later phases and final criteria remain incomplete.

Final pre-Preview Phase3/4 checks remained 110 files / 789 tests PASS, typecheck/lint/build PASS; Assignment transactional suite 32 checks PASS. Graph review found no introduced force/ELK/camera blocker. UI code review required fresh screenshots and identified off-screen switch confirmation risk; confirmation now receives focus and cancellation restores the trigger. Fresh visual/interaction acceptance remains pending.

Phase3/4 fresh browser on READY `f85c3cf9599b856523727da12182e199b87ae157`, https://edu-flow-3riufe4ar-july-nanas-projects.vercel.app (`dpl_FZy3xfMWa9m4XEgGdqRUYYWwvjui`): Bridge A02 opens unified detail in Path and bounding-box assertion confirms no node movement. Outgoing factual relation shows both correctly ranked Actions. Repeat Practice created fresh `92388c60-ef81-4c35-b16d-6c7021e45981`, opened blank Assignment trace rather than the previous result, and became Navigator current execution. Switch confirmation received focus; request listener asserted no mutation before confirmation. Cancel retained that in-progress run. Explicit confirm cancelled only that run and selected repeat Micro `92dca8ed-017c-4591-bdc6-60448cfb24aa`; it launched the exact bound path at 0/7. Hosted read verified old two completed records, cancelled repeated Practice and in-progress repeated Micro with correct repeatedFromRunId. Formal route remains V2 with exactly two versions. Browser console zero errors.

Inspected desktop/narrow screenshots `phase3-route-default.png`, `phase3-bridge-detail.png`, `phase3-action-in-progress.png`, `phase3-switch-confirmation.png`, `phase3-narrow-detail.png`. UI review in progress. Found unstyled inline buttons/oversized inner heading; local fix applies shared button classes, confirmation spacing and scoped heading size. Micro repeat progress is now labelled as this execution rather than formal learning progress; Assignment return copy says Course. These presentation corrections await new Preview validation. Skill Tree comparison, Bridge with a published starting resource, history after route exclusion and later phases remain pending.

Latest `83571180755853850945ae972b6d63288dfced90` READY Preview https://edu-flow-kkhyilpvx-july-nanas-projects.vercel.app was freshly checked at 390×844. Switch confirmation is styled, visible and cancel retains the current Micro. `phase3-narrow-confirmation-styled.png` passed independent visual review. Bridge detail resolves its explicitly published private path `acceptance-route-action-v2-a02`; opening it renders the correct six-step content, recorded in `phase3-bridge-explicit-resource.png` and independently reviewed. The companion acceptance fixture adds only labelled teaching resources to the private test course, not Knowledge facts, curriculum coverage or user state.

Phase5/6 implementation checkpoint: structural ancestor closure is separate from candidate/current/preview visibility. Current and Preview node/edge overlays preserve factual relation styles; hidden context is removed from labels, interaction, branches, downstream emphasis and explicit Fit. Relation list provides a keyboard/touch alternative to hover. Project details use visible project facts. Action summaries include retained formal-route facts without widening execution authority. Review found and fixes address missed retained-edge summaries, removed-edge style ambiguity and overlapping narrow panels. An unacquired prerequisite context can remain visible but cannot be independently Included when the planner disallows it; acquired factual ancestors remain legal. Reduced motion freezes the project shader and removes camera animation. Hosted read-only closure measurement found at most 198 nodes / 260 edges among current course data (acceptance course 7 / 6); no artificial depth truncation was introduced.

Phase5 local verification: full suite 112 files / 794 tests PASS; typecheck, lint and production build PASS, followed by 14 focused tests after final edits. Existing chunk-size/H5P warnings remain. This graph implementation is not yet a visual PASS: fresh latest READY Preview Current/Diff/hover/branch/coordinate/camera checks and screenshots remain required. Assistant, Evidence, final design-system consolidation and all final acceptance criteria remain unfinished.

Phase5 fresh browser checkpoint on READY `b6dd2085e466baac0561f282b76d8ddb108fb0e8`, https://edu-flow-5sp8muwcz-july-nanas-projects.vercel.app (`dpl_2mQW2zA3YxaXy1ssqSLzBfLpFyJb`): Current V2 displays on entry. Clearing the explicit Bridge Include and requesting Preview shows the removed factual soft edge and removed A02 while keeping CTX01. DOM screen-coordinate comparison stayed within 1px. Hosted counted exactly two versions before and after Preview; clicking Adopt created V3, with retained target position unchanged. Route Navigator and four run-history records remain visible outside the new route. Restoring V2 constraints explicitly created V4. Hover over the real edge reports two Actions; real edge click opens exactly two branches, with screen coordinates still unchanged. Console has zero errors.

Screenshots: `phase5-current-route.png`, `phase5-preview-diff.png`, `phase5-edge-hover.png`, `phase5-multi-action.png`, `phase5-history-outside-route.png`. Independent UI review found one visual blocker: branch titles overlap on the short edge. Follow-up replaces them with numbered badges matched to full titles in the Action panel, and suppresses competing endpoint labels while branches are open. The relation-list entry now reserves space for Assistant; displayed capability counts include visible route context. These corrections await a new Preview check. Small remaining polish: Navigator history can display a Bridge ID when the new route snapshot has dropped its title.

The reduced-motion hook required an explicit mock in the existing recording-engine test harness; added a regression covering overlay, visibility and reduced-motion changes without reheat, camera reset or frozen-position mutation. Final follow-up suite: 112 files / 795 tests PASS, production build and lint PASS. Knowledge and client-secret audits PASS. Phase5 added-edge and narrow/reduced-motion fresh browser checks, Skill Tree comparison, later phases and final acceptance remain outstanding.
