# Adaptive Learning Navigator — learning-only correction

## Baseline and stage gates

Continue `feat/adaptive-learning-navigator-mvp` at `970efcdc044c4cea7fbd7b15dbefb371bd3159f2`; initial tree clean and HEAD identical to origin branch. Local and remote prototype remain `9fa8c0007a5ad3e2ab37263503c70319fade4419`. No branch creation, merge, dependency or schema change.

1. Diagnose the actual API, persisted learner state, resource availability and generation capabilities before edits. Confirmed below.
2. Change the existing policy and projection only: learning-only action, no resource labels, truthful completion/unavailability, independent backlog, inspectable locks. Unit checks PASS.
3. Validate real local flows and in-memory edge cases, without Hosted progress changes. Navigator fixtures, supporting Material access, and real A02 completion/return PASS; all ten first-chapter paths reviewed through their actual UI.
4. Run full commands, push the same branch, wait for the exact Preview and verify Hosted data/UI before final acceptance.

## Root cause and capability audit

`CourseGraphPage` passes `ApiLearnerStateService.getNavigation` to CourseNavigator. `/api/navigation` reads course/global published learning paths and all MaterialKnowledgeCoverage mappings. The old adapter ignores Material coverage roles when constructing Navigation assets; it has no required-learning-vs-reference discriminator. `course-rule-v2` first picks an underway or eligible Knowledge by existing curriculum/prerequisite policy, then falls back to its Material whenever no unfinished Micro exists. Projection turns that into 学习材料 / 阅读材料. Practice was not selected by this server policy, but the old projection still accepted an Assignment decision.

On this round's live ordinary learner read, the current node is **Chat Template (CTX02)**, not Sparse Retrieval. Both CTX02 and **Sparse Retrieval (RAG02)** have no published Micro and one Material mapping, and both are eligible. Prior nodes through Agent Loop have learned state. A later Failure Recovery node has an available Micro, but this does not authorize skipping the current curriculum frontier. No visible RAG02 decision was found in this learner's history, so the precise earlier learner state cannot be reconstructed. The code/data fallback mechanism is proven; a historical jump is not claimed as independently observed. Underway Knowledge is prioritized by the existing engine, which can also explain a later-node resume when such state exists.

There is **no actual learner-personalized learning creation runtime**. `scripts/dev/generate-agent-lesson1-migration.ts` is offline content tooling, not a learner API. Course Creator's `desiredAssets` proposal explicitly plans assets without creating them (`api/_lib/courseCreatorProposal.ts`). `api/_handlers/course-authoring.ts` requires teacher/admin and draft/publish confirmation. Reusing those as an immediate learner generator would require new ownership, execution and publication semantics; no fake creation CTA or state is added.

## Current contract

- Existing Engine becomes `course-rule-v3`, separating persisted decisions from v2. It selects an available current learning path or a truthful no-action reason. Material and Assignment inputs remain compatible; neither becomes the selected learning resource.
- Material-only current nodes produce `learning_content_unavailable`; the engine does not scan ahead, change prerequisites, mark learned/mastered, or imply route completion. Empty routes are also not complete.
- Course Navigator exposes theme, learner-language reason, real matched-path duration, 开始学习, and launch identity. No resourceKind/reasonCode/label leaks into presentation. Legacy Material and Assignment decisions are rejected by projection.
- Learning complete with outstanding Assignments: 当前学习内容已完成 plus the real outstanding count; no CTA. All learning and all Assignments accepted/completed: 课程已完成 and 实训全部完成 ✓. Missing/blocked assets: 当前没有可继续的学习内容, without a false completion claim.
- Backlog semantics, deterministic ordering, submitted waiting status, accepted/completed exclusion and the separate nextPractice remain. No scheduler or practice promotion is added.
- Locked path nodes are labelled 尚未解锁，可查看详情 without aria-disabled. Micro starts are disabled and guarded in the handler; Assignment starts from the locked detail are disabled. Material is still inspectable, with no start-material mutation from the locked detail. The path detail drawer sits above the Course view switch so its close button remains usable.
- Course layout/Motion, Learning home, Micro interaction runtime and Course content are unchanged.

## Validation evidence

- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS.
- `pnpm test`: PASS — 84 files / 542 tests.
- `pnpm build`: PASS; large-bundle advisory remains, not a skipped failure.
- `pnpm verify:learning-loop:local`: PASS under v3.
- `scripts/acceptance/course-navigator.browser.mjs` default export: PASS. Existing/resumed same-card learning; no internal labels; real duration; Material never primary; Practice never primary; four retained debts; submitted; both complete states; locked details/disabled starts; 1440/390; reduced motion; request error/retry; real Material PDF opens through Knowledge detail in an anonymous context.
- `verifyNavigatorCompletion` in that same browser file: PASS using a fresh local-only acceptance learner. Real UI starts A02, performs each interaction, submits through the normal API, returns to Course, confirms durable `learned` and next identity AGC01 under v3. No Hosted write fixture is used.
- `verifyGoldenChapterReview` in the existing Micro browser file: PASSly for all ten actual first-chapter paths, 52 total steps, return-to-Course after every path, zero review writes. It requires real completed paths and never injects completion.
- The existing three-path Micro exercise/review regression: PASSly for RT01, CDS525-K012 and CDS525-K021, including actual challenge completion and zero review writes.
- Hosted correction Preview `https://edu-flow-d67aav1h6-july-nanas-projects.vercel.app` is READY at `abb14bbf64b15fbba1ab83182789f4595dd26ace`. Authenticated API returns v3 / CTX02 / learning_content_unavailable. All ten first-chapter paths and 52 review steps return successfully with zero progress writes. Desktop 1440 and mobile 390 show truthful no-content state and 11 retained practices, no horizontal overflow or page runtime errors. Actual deployment build output contains 12 lambda entries. Hosted Supabase `uyljtdbvlivxniililay` has all 47 local migrations applied; no fixture or schema update was needed. The final documentation-only commit is checked again before the final report.

## Acceptance matrix

| AC | Status | Evidence |
|---|---|---|
| 01 | PASS | v3 engine and legacy Material projection rejection |
| 02 | PASS | card and route no resource labels; browser assertion |
| 03 | PASS | title/reason/real duration/one learning CTA |
| 04 | PASS | existing and resume both 开始学习 |
| 05 | PARTIAL / deferred | no real creation runtime, so no creation CTA is claimed |
| 06 | PASS | capability audit; no synthetic generating/success states |
| 07 | PASS | Assignment decisions rejected; server remains learning-only |
| 08 | PASS | deterministic nextPractice and four-debt/submitted/accepted tests |
| 09 | PASS | learning complete plus unfinished practice count, no CTA |
| 10 | PASS | full completion requires all assignments accepted/completed |
| 11 | PASS | missing/empty/unlearned routes never imply completion |
| 12 | PASS | real supporting PDF opened from Knowledge detail |
| 13 | PASS | all ten Golden paths and 52 review steps; existing challenge regression |
| 14 | PASS | real A02 completion returns and advances to AGC01 |
| 15 | PASS | inspectable aria semantics; locked detail cannot start |
| 16 | PASS | desktop/mobile screenshots, no overflow, working close button |
| 17 | PASS | no dependency/lockfile changes |
| 18 | PASS | no schema/migration changes |
| 19 | PASS | full checks and browser flows above |
| 20 | PASS | same branch pushed; READY correction Preview, authenticated API/UI and 12 generated functions |

## Deferred

Actual learner-specific content creation needs a real authorized creation/persistence/launch flow. Missing Course learning content is intentionally visible, not repaired by generating Agent content or changing learner state. Automatic practice scheduling, Material redesign, broader runtime/authoring work and bundle optimization remain outside this round.

## Original MVP goal AC01–AC17

The reattached original objective is also covered; the later learning-only correction keeps practice separate rather than introducing practice execution.

| AC | Status | Evidence |
|---|---|---|
| 01 | PASS | one current learning recommendation; honest missing-content message |
| 02 | PASS | one strong learning CTA; backlog uses secondary detail controls |
| 03 | PASS | all eligible unfinished practice retained, including submitted waiting items |
| 04 | PASS | deterministic nextPractice respects coverage, dependency and state |
| 05 | PASS | nextPractice remains distinct from learning-only nextAction |
| 06 | PASS | compact circular path nodes replace Knowledge directory cards |
| 07 | PASS | deterministic single snake sequence with chapter sections |
| 08 | PASS | completed/current/available/locked projection and browser tests |
| 09 | PASS | current Knowledge identity links queue and highlighted route node |
| 10 | PASS | repository-driven first chapter: ten real paths, no production fixtures |
| 11 | PASS | ten paths / 52 steps plus existing three-path challenge regression |
| 12 | PASS | real local completion persisted learned and advanced the next action |
| 13 | PASS | 1440/390, dialog bounds, stable connectors, keyboard/reduced-motion checks |
| 14 | PASS | no dependency changes |
| 15 | PASS | no new Assignment/Workflow runtime, event pipeline or learner model |
| 16 | PASS | typecheck, lint, 542 tests, build, local learning loop and browser acceptance |
| 17 | PASS | same feature branch pushed; prototype unchanged; READY Preview above |
