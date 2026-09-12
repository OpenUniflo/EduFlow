# Learning Data & Recommendation Foundation acceptance

Status: PASS for implementation, Local Supabase integration, real browser flow and build verification. Hosted deployment is not performed or claimed; see rollout boundary below. Delivery branch: `feat/learning-data-recommendation-foundation` (no merge).

## Baseline and confirmed architecture

- `git fetch` completed. Clean `prototype...origin/prototype`; both refs were `1d3e32241145a39886c11a27a93cbfa71080ba4a`.
- Created `feat/learning-data-recommendation-foundation` from `origin/prototype`; never developed on prototype.
- Baseline typecheck/lint and 86 files / 574 tests passed. Local and linked Hosted histories matched all 47 repository migrations. Linked Supabase ref: `uyljtdbvlivxniililay`.
- Actual Knowledge has `masteryCriteria` prose arrays on both nodes and revisions. It uses `status`; factual edges use `lifecycle_status`. No independent criterion identity/state table existed.
- Micro already used published Path → Unit → Step, native/H5P evaluation, and an atomic completion/mastery RPC. Incorrect answers were not persisted. Existing `learning_attempts`, `performance_results`, `learning_events` are Assignment-specific. Completion Evidence and mutable progression already exist separately.
- Navigation uses `course-rule-v4`, canonical route frontier and Course-local prerequisite semantics, with idempotent `navigation_decisions`. Assignment eligibility/evaluation and Workflow runtime remain their original systems.
- Baseline `knowledge_evidence` allowed owner insertion and coarse progress had client write grants. The authority migration closes these inputs; new attempts expose owner reads only. Existing Assignment tables accept only not_started/started/submitted/accepted/needs_revision, despite frontend legacy completed aliases.

## Decisions and evidence

Trade-offs are documented in `docs/BACKEND_ARCHITECTURE.md`; semantics and reconstruction in `docs/USER_LEARNING_STATE.md` and `docs/MICRO_LEARNING_AND_EVIDENCE.md`.

Local schema migrations:

1. `20260912182544_learning_data_recommendation_foundation`: Criterion definitions/mappings, immutable Micro observations, Course policy config, Decision fields, service-only atomic recording, publish mapping retention.
2. `20260912183344_learning_data_gold_criteria`: existing A02/AGC01/R10 standards and real Step mappings, no new content or learner backfill.
3. `20260912183901_learning_data_integrity_and_model_selection_criterion`: existing AGC03 model-selection standard/check, Criterion version integrity and content locking.
4. `20260912184908_learning_authority_write_boundary`: server-only coarse state/Micro progress/completion evidence, protected accepted Assignment evaluation; compatible authenticated handlers use validated service writes.

All 51 repository migrations match Local Supabase history. Four tables were added, plus eight fields on the existing Decision table. Criterion composite version identity, one-active-version uniqueness, typed outcomes, bounded duration, user/idempotency and per-step attempt uniqueness, source/ownership checks and learner/course/decision indexes constrain the new facts. No dependencies or lockfile changes.

An independent read-only Critic identified publishing cascade loss, evaluation/content race, historical baseline bypass and optional Course idempotency issues. Publication now retains only unchanged stable mappings; RPC checks and locks the evaluated content; filtered actions cannot be reintroduced; API always passes effective Course identity. Review does not create a new observation.

## Real Gold API/DB loop

`pnpm verify:learning-data:local` uses temporary authenticated ordinary/admin users and the existing `ai-agents-in-depth` runtime. No fake user ID branches, course-specific algorithm, alternate Course or new Micro are introduced. It completes A02 and AGC01, enters the already-legal AGC03 check, records a real incorrect response, changes server policy through the admin API, and performs the Rule-selected action with its explicit Decision ID.

At the recorded run, both policies had these same 9 legal candidates: `aiad-l1-r10`, `aiad-l1-agc03`, `aiad-l1-h02`, `aiad-l1-wf05`, `aiad-l1-s01`, `aiad-l1-s02`, `aiad-l1-s03`, `aiad-ctx01-message-context`, `aiad-rt01-agent-loop`.

Fixed selected R10. Rule selected AGC03 because its model-selection criterion was `insufficient / unknown / low` from one incorrect attempt. The linked correct attempt produced `developing / improving / low` from two observations. No mastery was manufactured. The script verifies Decision snapshots by re-running the estimator with persisted Criterion versions and evidence cutoff; it checks identical retries, conflicting retries, unauthorized policy/state/decision writes and cross-user isolation. Temporary verification users are cleaned up after proof, so run IDs are test receipts rather than retained production learner records.

## Validation record

- Final unit suite: **89 files / 585 tests PASS**, including estimator, policy, archived-definition replay, and accepted-only hard-dependency semantics.
- Typecheck/lint and production build passed. Existing CSS `*width` and large-chunk warnings remain unchanged.
- `supabase db lint --local --schema public --level error --fail-on error`: no errors.
- `supabase db advisors --local --type security --level error --fail-on error`: no issues.
- Existing learning-loop verifier passed.
- Backend verifier initially failed on an unready RT14 Assignment start. A detached baseline checkout at the exact starting SHA failed on the same assertion (baseline line 392), proving an existing test-precondition error. Only the local integration fixture was repaired to prepare real covered/dependency identities; production eligibility remains unchanged and a blocked-start assertion was added. The full backend verifier then passed, including new stable Criterion mapping preservation through actual Publish, native/H5P, mastery, auth, personal Course visibility, Workflow and storage.
- Final `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`: PASS. `pnpm audit:knowledge`, `pnpm audit:client-secrets`, `pnpm verify:micro:generated`: PASS.
- Final `pnpm verify:learning-loop:local`, `pnpm verify:backend:local`, `pnpm verify:learning-data:local`: PASS. Concurrency retry produces one fact; conflicting payload returns 409; own historical replay and other-user 404 verified. Direct forged accepted/progression/Micro/Evidence/policy writes fail.
- `pnpm exec vercel build --yes`: PASS. Fresh generated `.vercel/output/functions` contains **12 Functions**, unchanged entrypoint set and within Hobby's 12 limit. This is local build evidence, not Hosted acceptance.
- Final read-only Critic findings addressed: exact recommended Path resolution, cutoff-based decision identity, immutable content locking, historical refs replay independent of current catalog visibility, and accepted-only hard dependencies. The proposed completed-status DB bypass was disproved by the existing database CHECK; its legacy frontend meaning is explicitly documented.

## Real browser validation

Used agent-browser against Vite + real Local API at `http://localhost:5186`, with a temporary authenticated learner, without API response mocks or injected progress. Anonymous home and authenticated Course route rendered without errors. Clicked the initial Fixed CTA into A02 and completed all six UI steps, including playing both real flow demonstrations and categorizing the four roles. All six persisted attempts carried the clicked Decision ID and client-reported duration: five observed instructions and one correct performance observation. The API replay showed initial unknown state becoming developing / unknown / low with one evidence ID, not stable or mastered.

Browser receipt: Decision `e0fc207f-4073-4154-b207-a9e9f3e970ec`, correct Evidence `214a5545-6f51-436a-8d8e-011bf8e7e025`, sequence 161. Entering Review and advancing a page generated **zero** Micro writes. Returned to completion and clicked the real next action into AGC01. No runtime errors were reported. Screenshots were visually inspected (`/tmp/eduflow-learning-data-home.png`, `/tmp/eduflow-learning-data-completed.png`). QA users/credentials are removed after verification; receipt IDs document the observed run, while the repeatable verifier recreates the proof.

## Hosted rollout boundary

No Hosted Preview was opened/deployed and no shared Hosted migrations or fixtures were changed. Baseline linked project `uyljtdbvlivxniililay` matched 47 migrations; the four new migrations were tested locally only. Hosted validation was conditional in the objective, so it is not claimed as a completed test. A shared rollout must apply additive migrations, deploy compatible validated server writers, then apply privilege restriction and smoke auth/API/browser behavior. Applying the final restriction while the old user-JWT writers remain deployed would break them. No reset or automatic Preview migration has been added.

## Success criteria evidence

| Criterion | Evidence |
| --- | --- |
| A Data Foundation | Four explicit standards on existing Knowledge revisions and real step mappings; immutable evaluated attempts and instruction distinction; Golden DB/API receipts. |
| B Learner State | Versioned deterministic projection; bounded evidence lineage; unknown/single-pass/transitions tests; no progression/mastery promotion. |
| C Candidates | Real published route assets; prerequisite/completion/ownership gating before shared policies; candidate unit and authenticated API tests. |
| D Recommendation | Separate generator, Fixed/Rule registry and admin server config; unsupported Model interface; existing Decision authority. |
| E Learning loop | Same 9 candidates produce R10 vs AGC03 from actual insufficient evidence; linked correct outcome updates state; exact-version/cutoff replay. |
| F Compatibility | Full backend/learning-loop/generated Micro verification; Publish mapping retention; native/H5P/Assignment/Workflow/Personal/anonymous boundary checks; real browser Review writes zero facts. |
| G Testing | All required commands plus new integration and local generated Function count pass. |

Deferred intentionally: complex Assignment/Workflow training and evaluation, independence/transfer/retention evidence loops, Expected Gain/Time, Model Ranking, ML/RL/Bandit and experimentation platforms. The estimator is an explainable engineering baseline, not a psychometrically calibrated ability measure.
