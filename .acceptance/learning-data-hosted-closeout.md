# Learning Data & Recommendation Hosted Closeout

Status: IN PROGRESS. Do not infer Hosted acceptance from READY or the previous local PASS.

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

## Remaining acceptance gates

Updated Preview, real learner browser/Fixed–Rule loop, Production compatibility authorization, final authority migration, post-restriction security/write regression, real Hosted Publish, final advisors, deployment/commit evidence and final clean push are still required.
