# Learning Data & Recommendation Hosted Closeout

Status: PASS for the completed staged Hosted rollout and the verified application code. Final delivery Preview metadata is recorded with the closing report; READY alone was not used as acceptance evidence.

## Baseline

Clean `feat/learning-data-recommendation-foundation`, fetched HEAD/remote `f8a84d20b5604432c3c44a9b5608be90cf70dea5`; prototype unchanged at `1d3e32241145a39886c11a27a93cbfa71080ba4a`, so no rebase. Automatic Preview `dpl_BUcCGqqBeXDrWKjowZ8VCPJeEhYo`, `edu-flow-gorxxhjzt-july-nanas-projects.vercel.app`, source Git, preview target, READY, 12 Node Functions. Production `dpl_5CmrC4mKWii5EGMycPgVfvXDzHyT` still used prototype.

Both deployed browser bundles identify `uyljtdbvlivxniililay.supabase.co`. The four Supabase variables are Sensitive and scoped to Preview and Production; CLI env pull masks them and is not value evidence. Authenticated Preview writes were independently found in this linked database, confirming the server target too. No secret values are recorded.

Initial Hosted history: 47 migrations, last `20260909194539`; repository had 51, last `20260912184908`. All four Foundation migrations were missing.

## Confirmed problems and decisions

- Previous wording missed the automatic Git deployment; corrected the historical acceptance record.
- Navigation filtered Criterion definitions in application code and fetched all own attempts. SQL now filters definitions, cutoff and paginated attempts by Course Knowledge in bounded identity chunks, using the existing `(user_id,knowledge_id,sequence)` index. Shared Knowledge evidence from another Course remains relevant; unrelated Knowledge is excluded. Saved-reference historical replay stays separate. Query-argument tests prove this without a fabricated benchmark.
- The existing learner card now says “推荐下一步”; presentation maps actual Decision reasonCode, falling back to the server reason. Admin alone sees current Fixed/Rule. Switching remains the existing authenticated admin API; no new management UI or learner-state dashboard.
- Full migration application before compatible code would break old Production user-JWT writers. Staged rollout is required because environments share the database. Production promotion requires explicit authorization; prototype is not merged or moved.
- Hosted advisors found two Foundation FK indexes missing. A small follow-up migration covers Criterion revision and policy updater. Intentional server-only policy-table RLS without client policies is retained; fresh indexes are not deleted due to unused-index notices. No cache or materialized state is introduced.

## Phase 1 evidence

Applied exactly migrations `20260912182544`, `20260912183344`, `20260912183901` using a staged CLI workdir and reviewed dry run. Hosted history became 50. Verified all four RLS-enabled tables, eight Decision fields, 29 constraints, 13 indexes, denied authenticated attempt-RPC execution, and expected Publish patch anchors. CLI catalog caching warned about a missing pg-delta certificate; independent history/schema/API queries proved the migrations succeeded. No reset or repeated migration was used.

Both authorized accounts logged in successfully; profile roles are admin/student with empty extra capabilities. Historical A02 completion existed, so no history was deleted; AGC01 had no Criterion Evidence. On the real initial Preview, admin Decision `c92d83c6-e979-4d4a-a55e-d97269c3a542` selected `aiad-l1-agc01`. Five real Step submissions produced sequences 1–5; correct Criterion Evidence `6d64afb3-a157-418c-8072-e30c26823a6f` at sequence 4 changed `criterion-agent-action-space` from unknown to developing / unknown / low. Historical replay reproduced the unchanged original snapshot after these new facts. Learner policy mutation returned 403, anonymous learner-data 401, cross-user Decision replay 404.

## Compatibility repair and real Publish

Preview commit `8a0d63c711f017b763bd5a9c6463669f22e6d7cb` deployed READY at `edu-flow-97pd6mn2q-july-nanas-projects.vercel.app` with 12 Functions. Ordinary-user browser login, recommendation CTA, AGC01 completion and return-to-Course refresh were exercised; the next Fixed action became ReAct.

A no-content-change Publish of the existing Gold Course failed with SQL 23514: the baseline Publish function deleted/reinserted PDF Materials without their stored source fields. The transaction rolled back and retained its revision-1 draft. Inspection also found unconditional Assignment deletion would cascade existing attempts, and the wrapper deleted stable workflow runs. Migration `20260913062043` preserves retained Material/Assignment identities through upserts, keeps canonical PDF source metadata, shifts order values before swaps, and deletes workflow runs only for removed Assignments. It does not fabricate sources for newly created PDFs or change explicit deletion semantics.

After a reviewed staged dry run, applied only compatible follow-ups `20260913061042` and `20260913062043`; authority migration `20260912184908` remains pending. Hosted has 52 migrations. Retried the same unchanged revision-1 draft through the real Preview API: 200, draft cleared. Verified 2 Material sources including creation identity, 1 existing Assignment attempt (all fields), 8 Criterion mappings, 12 Paths and 65 Steps retained. No Hosted fixture or learner history reset was used.

Expanded the local backend verifier with a stored PDF and a real Assignment submission before republishing. PDF source, immutable attempt, submitted Assignment state, Criterion mapping, Material state and Micro progress survive. The later Micro assertion now expects practicing, reflecting that real earlier Assignment, rather than lowering it to learned. Backend verification passes.

After the repair: typecheck, lint, all 89 test files / 587 tests, production build, learning-loop verifier, learning-data verifier, Knowledge/client-secret audits and generated Micro verification pass. Hosted DB lint reports no errors. Advisors report 38 INFO, 4 WARN, 0 ERROR; the two missing Foundation FK indexes are resolved. Remaining WARNs concern the pre-existing can_read_course definer helper (anon/auth), Auth leaked-password protection configuration, and existing draft SELECT policies. These are not reported as new Foundation defects.

## Hosted learner Golden and replay

The ordinary user followed the displayed recommendation into AGC01, completed its real choice interaction, and returned to a refreshed Course recommendation for ReAct. They selected the legal later Agent Model Selection route through the Course drawer and answered its check incorrectly. Attempt `362596cc-ef6c-4bc6-b074-6a8174cd7d25`, sequence 14, supports insufficient / unknown / low for criterion-agent-model-selection.

Fixed Decision `e492324e-d99c-4eb0-a508-fdd5b2f4c25e` selected `aiad-l1-r10`. After the authenticated admin API switched the Course to rule_v1, Decision `95c84bb4-0ea0-4d2b-9b2b-fa970e8ff76c` selected `aiad-l1-agc03` with criterion_insufficient. Both Decisions contain exactly the same 9 candidates; deep equality was checked. The learner browser displayed the changed title and “你最近在这一能力检查中未通过，先补强相关内容。”

The learner clicked that recommendation and answered correctly. Attempt `edacdbe3-ebfa-4d4f-8246-e54391de784d`, sequence 15, references the Rule Decision and moved the state to developing / improving / low, supported by the two immutable evidence IDs. The next recommendation returned to ReAct. Replaying the original Rule Decision after the new evidence reproduces its saved state exactly. Finishing the path and answering again in explicit Review left the entire Learning Data response unchanged (11 learner attempts).

Rule also omitted the real blocked Agent Harness path `aiad-l1-agc02`; attempting to start it returned 403 teaching_prerequisite_required with no Learning Data change. This Hosted account did not have insufficient Evidence on that blocked Knowledge; the combined insufficient-plus-blocked condition is covered by deterministic local policy tests, not falsely claimed as a Hosted observation.

On the latest code Preview, anonymous Assistant and Learning Data return 401, learner policy mutation returns 403, another user's Decision replay returns 404, and own-JWT queries for another user's micro_step_attempts return no rows. Admin browser shows “当前推荐策略 · Rule”; the learner does not see admin configuration. Both browser sessions report no runtime errors. Course policy currently remains rule_v1, as exercised in the acceptance.

## Deployment before Production authorization

Code commit `fdbae9b70fd86bcc444de462f422a32cb67496f8` is pushed and READY at `https://edu-flow-gis2m6v28-july-nanas-projects.vercel.app` (`dpl_7qbCDV5nUsjLbLvMebvcUAmqjjV6`), branch feat/learning-data-recommendation-foundation, Preview target, 12 generated Node Functions. Authenticated API reproduces the same Rule Decision there; the admin browser login and policy display were checked on this deployment. No prototype merge occurred.

At this checkpoint the status was PARTIAL: Production still used older prototype writers and explicit Production authorization was pending. The user subsequently authorized publishing the verified compatible version, changing the shared Hosted Supabase in staged order, and completing Production/Preview regressions, with no reset or real-data deletion.

## Authorized Phase 2 rollout

Promoted verified commit `2e981da4d5699f981315cf9bf67d7e07cd967357`. Vercel created Production deployment `dpl_84Af6b5ypySqjzm5fa6XtXG3VM2a`, `edu-flow-lnhmpystj-july-nanas-projects.vercel.app`, READY, 12 Node Functions. The Production alias `https://edu-flow-six-phi.vercel.app` and immutable deployment both returned authenticated Rule Navigation successfully before the restriction. The production build retains the expected shared Supabase configuration.

Reviewed `supabase db push --linked --include-all --dry-run`: only `20260912184908_learning_authority_write_boundary.sql` pending, no seeds. Applied exactly that migration after Production compatibility was confirmed. Hosted history now matches all 53 repository migration versions exactly. No reset, fixture synchronization, user-history deletion, or prototype merge occurred.

Production must not be rolled back to the older prototype code while these restrictions are active. Merge this validated branch before allowing subsequent prototype-based Production builds; deploying older user-JWT writers would reintroduce write failures. A rollback needs a reviewed compatible application, not an automatic rollback of authoritative learner data.

## Post-restriction writes and security

Production admin completed the existing AGC03 Micro through real API evaluation: unknown → incorrect → insufficient; Rule Decision `2a54b6ca-7fe7-4897-bb9d-3f9edeabb3f9`; failed attempt `69c83af0-3e78-4de4-9712-4a2a011be762`; linked correct attempt `1e14ef07-d111-4b1d-89d2-25a5237aa3dc`; developing / improving and then learned progression. Historical state replay remains identical. Ordinary learner completed the existing five-Step H02 Micro through the Preview API after restriction; start, completion and progress persistence all succeeded.

A real structured Assignment answer describing the current EduFlow Global Assistant's Model/Context/Tool/State/Runtime boundaries was submitted through Production. Attempt `4d23cfaa-b507-4b4a-8abb-3d12608213d2` received pending result version 1, then explicit admin review created passed version 2. Learner acceptance was denied 403, duplicate acceptance denied 409, and Preview read the accepted state. This exercises the existing manual-review authority, not a new evaluator. The previous learner submission was not overwritten or deleted.

For both student and admin user JWTs, direct writes to user_knowledge_states, user_micro_path_progress, user_micro_unit_progress, knowledge_evidence, micro_step_attempts, course_recommendation_policies and forged accepted Assignment records returned 403/42501. navigation_decisions PATCH returned 204 with no affected rows; the saved reason and historical replay were verified unchanged. The initial test used an obsolete Evidence field name and got 400; it was corrected to a valid-column request to prove permission denial rather than request-shape rejection. No forged state was saved.

Both Production and Preview reject the real blocked AGC02 path with 403, an existing path in an unrelated Course with 400 knowledge_not_in_course, and a nonexistent path with 404. Anonymous Micro catalogs contain no path/unit learner progress. Earlier admin/learner policy, cross-user Decision and Personal Course isolation checks remain valid; private Course owner read is 200 while another user and anonymous reads are 404, and the anonymous Course catalog contains no Personal Courses.

## Production browser and compatibility

Logged into the real Production browser and completed all seven Steps of the existing Global AG01 Micro: native short answer, multiple choice, H5P fill blanks, H5P drag words, mini-workflow ordering and summary. The real H5P runtime emitted failed fill result attempt `2b159818-534d-463f-aece-0977f66fe410` (sequence 32), successful fill result `877f86df-538d-4d32-9c0f-7cd3b78b934f` (33), and successful drag result `2b147bce-f9f2-435f-b711-35fd6febeebe` (34). These were browser-generated H5P events, not injected success events. The complete Path persists learned, not mastered. Browser reported no runtime errors.

Production Workflow GET → unchanged PUT → GET preserved all 20 existing workflow definitions and all existing run history. The test checked the history was within the pruning bound first and did not add synthetic runs or delete records. Existing local backend verification covers execution/history isolation and the shared Workflow domain.

Repeated real no-content-change Course Publish after the authority migration: 200, test draft cleared, all 12 Micro Paths and the complete admin Micro data response unchanged. The new Assignment's pending/passed results survived this republish; stable PDF/source and mapping preservation was already compared during the previous Hosted Publish. Published canonical entities were not removed.

## Final checks and success audit

- Typecheck, lint, 89 files / 587 unit tests and build PASS on the final application changes; no application source changed during the subsequent rollout.
- `verify:learning-loop:local`, `verify:backend:local`, `verify:learning-data:local`, `audit:knowledge`, `audit:client-secrets`, `verify:micro:generated`: PASS. These cover estimator transitions, shared candidate policies, combined insufficient-plus-blocked filtering, concurrent idempotency, content/version integrity, H5P, Assignment/manual evaluation, mastery, Course visibility, Workflow, and Publish preservation.
- Hosted db lint PASS, no schema errors. One final read-only CLI attempt exited without a result; the retry completed successfully. Security/performance advisors: 38 INFO, 4 existing WARN, 0 ERROR. No new missing Foundation FK index remains.
- Production deployment's 5xx request-log scan after rollout returned no entries. Expected permission denials and incorrect learning answers are verified outcomes, not hidden failures.
- Hosted golden, ordinary learner UI updates, admin policy visibility, exact replay, Review no-writes, native/H5P completion, Assignment acceptance, Personal/Standard/anonymous visibility, Workflow persistence and Publish all have direct evidence above. Local broad regressions supplement these Hosted checks; a local-only result is not presented as a Hosted execution.

| Success criterion | Evidence |
| --- | --- |
| A Hosted schema | All 53 versions identical to repository; staged foundation → compatible Production → restriction; no reset/backfill/deletion. |
| B Deployment | Verified branch/commit, expected shared Supabase, READY Production and Preview, 12 generated Functions. |
| C–D Learning data/state | Real incorrect/correct Micro and H5P facts; immutable identities, cutoff/version replay; unknown/single-pass semantics; Review unchanged. |
| E–G Policies/authority | Same nine candidates selected R10 vs AGC03 from insufficient evidence; actual admin API switch and learner denial; hard-filter tests and Hosted rejections. |
| H–I Outcome/replay | Explicit Decision → attempt → sequence → state identities above, reproduced after newer facts. |
| J Security | Both roles denied authoritative direct writes, accepted evaluation protected, server writers tested after restriction. |
| K Performance | SQL identity filters for definitions/cutoff/attempts; unrelated Knowledge excluded, shared Knowledge retained; query tests and historical replay. |
| L Frontend | Actual reasonCode-mapped recommendation, refreshed learner UI, admin-only current policy. |
| M Regression | Required local commands plus authenticated Hosted APIs, real browsers, H5P, Publish, isolation and 5xx scan. |

Deferred remains unchanged: complex Assignment/Workflow evaluation, independence/transfer/retention evidence loops, Expected Gain/Time, Model Ranking, ML/RL/Bandit and experimentation infrastructure. No additional product capabilities or runtime frameworks were introduced.
