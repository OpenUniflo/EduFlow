# Reviewer 2 preparation · Practice / Planner / History

Prepared against the actual repository `/Users/fanyuhang/Documents/OpenUniflo/EduFlow`, branch `feature/project-capability-model`, HEAD `036b95caf4684dbc2a584e9ca46fb32d7e5964e2` on 2026-10-05 (Asia/Shanghai). This is a bounded review plan, not a completed Preview review or acceptance verdict.

Read the full supplied goal, `FRONTEND_DESIGN_SYSTEM.md`, existing Practice semantics / Conversation Workbench acceptance and prior layout review, the current `ProjectCapabilityView`, `RoutePlanningPanel`, `useRoutePlanning`, `projectCapability.css`, `AssignmentExperiencePage`, capability-route contract, package commands and browser acceptance conventions.

## Scope and rounds

- Phase 3: Node / Edge selection, Inspectors, independent Draft / Preview overlays, comprehensible summary, typed-issue repair and successful Adopt.
- Phase 4: immediate History selection/detail/diff, reachable footer, current-version protection and invalid-history replan.
- Phase 5: clean A/B fresh-browser Course Route → Practice and both Planner paths, History restore/replan, desktop/mobile/reduced-motion and actual recordings.
- Each phase has at most two rounds. Round 2 rechecks only Round 1 findings. New Round 2 BLOCKERs are limited to data corruption, security, an impossible core flow or broken authority.
- Classifications are only BLOCKER, REAL DEFECT, IMPROVEMENT and OUT OF SCOPE. No core edits, resets, additional agents, wholesale UI review or unrelated cleanup.

## Existing-source observations to verify after implementation

These describe the starting implementation, not defects charged against a future Preview. Node click still calls `mark` while editing and clears selection. Edge Inspector labels an active-snapshot Action as current while its radio selection follows the Draft. Preview summary currently counts execution Steps instead of separately communicating capabilities/relations. Issue navigation deduplicates Edge IDs and does not navigate Node-only issues. History appends the selected snapshot after the list; its restore button does not distinguish the active version in the UI. Practice contains Trace presentation. The existing design system explicitly permits Trace and tool-mode Node mutation, which the supplied new goal supersedes; the formal document must be updated along with the implementation.

## Real-browser checks

Use fresh, separately named browser sessions and normal UI login. Acceptance accounts are the only write targets. Coordinate the write window with the main agent; do not Reset. Start each assigned Preview from its actual active Version and record its number. Read-only API / DOM observations may substantiate state, but cannot substitute for actual clicks, submission, Preview, Adopt or restore.

1. **Action Adjustment:** enter Planner → click a factual Edge → inspect selection and separate formal/Draft Actions → replace Action → Preview → verify four-part summary → Adopt enabled → click Adopt → verify newly displayed Version and immutable prior version.
2. **Structure Adjustment:** enter Planner → click Node → verify draft unchanged → inspect role/state/formal/Draft/Preview and relations → explicit Include / Exclude / Undo → Preview → inspect a real unresolved issue → locate the correct Node/Edge Inspector → perform the offered repair → repeat until zero → Adopt enabled → successful new Version. No local-store mutation, injected route decisions or direct Adopt API.
3. **Protections/stability:** a Preview without Adopt leaves the formal Version unchanged; dirty dismissal protects the Draft; stale Preview rejects adoption and can be recalculated. Record graph screen geometry, selection and visible camera presentation across ordinary changes. Intentional locate/focus operations are distinct camera actions.
4. **History:** open list/detail; click a non-current Version without scrolling; selected row, viewing title and default diff update immediately. Inspect names rather than UUIDs, progressive details and footer. Current Version cannot restore. Legal history restores through UI into a new Version. Invalid Action history stays readable, offers replan and reaches Preview/Adopt through UI without modifying its snapshot.
5. **Practice:** launch both Gold outcomes from the formal Course Route; no Quiz/Trace/single/multiple choice task appears. Inspect scenario, actionable task, output and standards; submit personal text or a real private attachment; inspect formal Result; request actual AI Feedback; send follow-up conversation. Verify formal submission and Composer remain reachable and ordinary conversation does not silently submit.

## Visual matrix and evidence

Actual viewports: 1366×768 and 1440×900 at scale/zoom 1; 390×844; Reduced Motion. Check independent lightweight selection, preserved blue/green/gray capability meaning, Inspector readability/graph access, stable Bottom Bar, desktop master-detail and mobile list→detail→back, no unexplained camera/scroll/layout jumps, and no disappearing selection. Check keyboard focus, Escape and dirty modal safe action. Reduced Motion retains static direction/selection and all controls while suppressing ornamental loops/displacement.

Capture initial Planner, Node selection/Inspector/Include/Exclude, Edge selection/Inspector/Action change, Preview, typed issue, resolved issue, Adopt enabled/success; History list/detail/diff/current/replan; both Practice outputs and Feedback; mobile Planner/History/Practice; Reduced Motion. Record the structure→repair→Adopt flow, History select→restore/replan and Practice submit→Feedback. Artifact root: `output/playwright/practice-planner-history/`; redact credentials, tokens and signed private URLs from retained reports.

Browser tooling is Playwright CLI through the installed skill wrapper, run from a neutral tooling directory because this repository correctly rejects npm as its package manager. No dependency or lockfile changes. `npx` is present and the wrapper help is operational outside the repo. Use snapshots before element references; inspect actual screenshots as well as geometry. No test runner or UI mock is introduced.

Final Reviewer 2 verdicts: Practice UI, Node Selection, Edge Selection, Planner Information Hierarchy, Issue Resolution, Preview / Adopt, History, Responsive, Animation and Reduced Motion individually PASS / FAIL. Mark pending checks as unverified rather than inheriting prior acceptance PASS.

## Initial classifications

- BLOCKER: None assessed; no assigned implementation Preview has been reviewed.
- REAL DEFECT: None assessed; starting-source observations are reserved for the implementation delta.
- IMPROVEMENT: None requested.
- OUT OF SCOPE: Reviewer 1's database/migration/reset/invariant proof, existing external embedding reliability, old Advisor findings, unrelated pages, broad Micro Learning redesign and Production promotion. Shared authority evidence may be cited with its actual source.
