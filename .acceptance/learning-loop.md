# Core Learning Loop Acceptance Ledger

Baseline: 2026-09-05 CST
Prototype branch: `prototype`
Prototype HEAD: `f91ac063baf6d872020e2669e7e57b03ac1e6231`
Feature branch: `feat/gold-course-learning-loop`

Initial verification: 71 test files / 452 tests PASS; typecheck, lint, and build PASS. The build has pre-existing invalid legacy CSS and large-chunk warnings. Local Supabase DB/Auth/REST/Storage are available; imgproxy, edge runtime, and pooler are stopped. Hosted and local migration histories both contain the same 29 migrations.

Status values: `OPEN`, `CONFIRMED`, `IN_PROGRESS`, `READY_FOR_SOLUTION_REVIEW`, `READY_FOR_RECHECK`, `PASS`, `BLOCKED`.

---

## A-001 — Real local course data

Status: IN_PROGRESS
Area: Local data / Storage
Severity: BLOCKER
Scenario: Load both authoritative courses entirely from Local Supabase.

Acceptance
Expected: `ai-agents-in-depth` and `cds525-deep-learning` definitions, referenced Knowledge, Micro, Assignment, Material metadata, and real source objects are available locally without a remote runtime dependency.
Actual: Agent course is absent locally. CDS 525 has 1 Chapter, 1 Lesson, 1 Knowledge coverage, no Material rows or Storage objects, 1 Micro, and 1 Assignment. Hosted authoritative counts are Agent 9/9/117 and CDS 525 6/26/90 with 12 real PDFs.
Evidence: Local SQL, Storage inventory, hosted public Course API, and hosted Storage metadata dump.
Acceptance Criteria: Allowlisted, idempotent dev sync; exact per-Material page/segment/range/object size/hash manifest; same IDs/paths; no user/auth/history; second run produces zero drift; disconnected remote still works.

Solution Review
Root Cause: Local bootstrap drifted from hosted authoritative definitions and Storage.
Approved Approach: Sync old-schema definition data first through a development-only allowlisted tool, then apply the new migration. Same hash skips; same path/different hash fails.
Must Preserve: Stable course/content identities and local-only runtime after sync.
Must Not Do: Fake PDFs, partial DB-only copy, secrets in source, broad database cloning, remote signed-URL fallback.
Trade-offs: Commit tooling and manifest/hashes, not teacher binaries.

Implementation: PENDING
Solution Review Result: APPROVED
Local Acceptance: PENDING
Remote Acceptance: PENDING

---

## A-002 — Course-owned Material

Status: CONFIRMED
Area: Material model
Severity: BLOCKER
Scenario: A Material covers Knowledge across multiple Lessons without owning one Lesson.

Acceptance
Expected: Material ownership is only `courseId`; Lesson relationship derives through Segment coverage, Knowledge, and CurriculumCoverage.
Actual: DB `materials.lesson_id NOT NULL`, TS `Material.lessonId`, API, runtime, authoring, sorting, reader state, seed, tests, and docs all treat Lesson as owner.
Evidence: schema and repository-wide reference audit.
Acceptance Criteria: One consistent migration/model/API/UI/test/docs change with no dual source of truth; stable Material/Segment identities; CDS regression passes.

Solution Review
Root Cause: Lesson ownership is an end-to-end domain assumption, not an isolated column.
Approved Approach: Deterministically reindex Materials by Course, drop Lesson FK/column and lesson-local uniqueness, add Course-local order uniqueness, update publish RPC and all consumers. Derive recent Lesson from active Segment mappings and canonical curriculum order; unmapped Material does not fabricate recent Lesson.
Must Preserve: Curriculum route, N:M mappings, PDF completeness, auth and course scoping.
Must Not Do: Long-lived nullable compatibility, old/new dual reads, Course-specific branches, deleting Lesson.
Trade-offs: Material order becomes explicitly Course-local.

Implementation: PENDING
Solution Review Result: APPROVED
Local Acceptance: PENDING
Remote Acceptance: PENDING

---

## A-003 — Agent book audit and primary Material

Status: CONFIRMED
Area: Agent AI Material
Severity: BLOCKER
Scenario: Open real book evidence for early, middle, and late course Knowledge.

Acceptance
Expected: One Course-owned 307-page primary book Material with honest evidence mappings; M03 does not compete as primary.
Actual: Local course/book record is absent. Hosted has legacy 36-page M03 plus the full book Storage object, but no full-book Material record.
Evidence: PDF metadata, hosted Course API and Storage inventory.
Acceptance Criteria: Audit each of 117 curriculum Knowledge identities as DIRECT/CROSS_SECTION/EDUFLOW_ADDED/UNSUPPORTED; map only supported evidence using actual PDF pages; report honest mapped/unmapped counts.

Solution Review
Root Cause: Hosted Storage upload was not completed into the Material model and evidence mapping.
Approved Approach: Reuse stable course and Storage identities; create one Material plus pages 1..307; drive mapping from a reviewed audit artifact. Retain M03 history but remove competing primary mappings unless safe archival is already available.
Must Preserve: Printed page metadata remains distinct from actual PDF page.
Must Not Do: Guessing, title matching, nine PDFs, 100% mapping target, another Agent course.
Trade-offs: Unsupported/bridge Knowledge remains explicitly unmapped.

Implementation: PENDING
Solution Review Result: APPROVED
Local Acceptance: PENDING
Remote Acceptance: PENDING

---

## A-004 — Native Micro primitives

Status: CONFIRMED
Area: Micro
Severity: HIGH
Scenario: Real Agent and CDS Knowledge use appropriate interactive teaching rather than quiz-only content.

Acceptance
Expected: Shared renderers/validators cover required Choice, Categorize/Match, Ordering, Fill, Trace, Structure Builder, Parameter Lab, and Matrix/Tensor cases; Explore and Challenge semantics are clear; H5P remains compatible.
Actual: Choice, multiple choice, fill blank, ordering, trace, mini-workflow, and H5P exist; four required families do not.
Acceptance Criteria: Real published examples in both courses, shared data-driven interaction definitions, consistent feedback/accessibility/error states, no gallery or speculative P1 feature.

Solution Review
Approved Approach: Extract one shared pure interaction contract/evaluator and add only categorize, structure-builder, parameter-lab, and matrix-tensor primitives.
Must Not Do: Course-specific components, arbitrary per-Micro HTML, remove H5P, duplicate client/server grading.

Implementation: PENDING
Solution Review Result: APPROVED
Local Acceptance: PENDING
Remote Acceptance: PENDING

---

## A-005 — Attempt and PerformanceResult

Status: CONFIRMED
Area: Practice / evaluation
Severity: BLOCKER
Scenario: Fail, duplicate submit, retry, and pass produce durable, explainable outcomes.

Acceptance
Expected: Server-validated response creates idempotent Attempt, append-only events, versioned PerformanceResult, and honest Assignment projection.
Actual: Browser supplies `deterministicAccepted`; no Attempt/PerformanceResult persistence exists; fail is not a durable result.
Acceptance Criteria: Wrong response fails, correct response passes, same key+payload returns same result, conflicting reuse returns 409, retry creates a new Attempt, open semantic work remains submitted rather than fake-passed.

Solution Review
Approved Approach: Add narrowly scoped attempt/event/result tables and an atomic server transaction using a shared pure rule evaluator.
Must Not Do: Treat submitted/completed as passed, trust a client acceptance boolean, fabricate semantic scores.

Implementation: PENDING
Solution Review Result: APPROVED
Local Acceptance: PENDING
Remote Acceptance: PENDING

---

## A-006 — Result-driven Learner State

Status: CONFIRMED
Area: Learner state
Severity: BLOCKER
Scenario: Micro completion and Practice results update distinct state correctly.

Acceptance
Expected: Micro completion reaches learned, pass may satisfy centralized mastery policy, fail remains durable without regressing monotonic Knowledge state, and Course progress remains separate.
Actual: Existing progress/evidence/monotonic helpers are projections without formal Result input.
Acceptance Criteria: Before/after DB evidence proves each invariant and refresh persistence.

Solution Review
Approved Approach: Preserve the monotonic state ladder; feed it only centralized evidence/result policy; use latest failed result for remediation rather than lowering status.
Must Not Do: Micro completed -> mastered, completion -> pass, Course progress as Knowledge state.

Implementation: PENDING
Solution Review Result: APPROVED
Local Acceptance: PENDING
Remote Acceptance: PENDING

---

## A-007 — Deterministic Navigation

Status: CONFIRMED
Area: Next Action
Severity: BLOCKER
Scenario: Different learner states and fail/pass outcomes produce different reasonable Next Actions.

Acceptance
Expected: Target/prerequisite closure, mastered subtraction, eligible frontier, canonical ordering, action selection, reason code, policy version, and persisted decision are deterministic.
Actual: Existing CoursePath is a static prerequisite display and V1C/V1.5 is documented as deferred.
Acceptance Criteria: Fail -> review/remediation; pass/mastered -> next; mastered work may skip; refresh preserves the same decision; no LLM/random/domain keyword authority.

Solution Review
Approved Approach: Extend existing pure CoursePath/unlock mechanisms and mount a navigation handler under the existing learner multiplexer. Persist decisions by user/course/policy/input hash.
Must Not Do: Add a top-level Function, parallel recommender, manufacture Knowledge edges, Course-ID branching.

Implementation: PENDING
Solution Review Result: APPROVED
Local Acceptance: PENDING
Remote Acceptance: PENDING

---

## A-008 — UX and recovery

Status: CONFIRMED
Area: Core flow UX
Severity: HIGH
Scenario: Complete both course loops and recover from expected failures without developer guidance.

Acceptance Criteria: Desktop and narrow viewport; Course/route/Micro/Reader/Practice/Result/Next states; refresh/back/double click/stale/invalid link/API and reader failures; understandable loading/empty/error; no visual blockers or context loss.

Solution Review
Approved Approach: Limit cleanup to surfaces touched by the real loop and reuse current design tokens/components.
Must Not Do: Redesign the design system or hide error paths.

Implementation: PENDING
Solution Review Result: APPROVED
Local Acceptance: PENDING
Remote Acceptance: PENDING

---

## A-009 — Repository safety and existing warnings

Status: CONFIRMED
Area: Engineering / docs
Severity: MEDIUM

Acceptance
Actual: The local book is currently ignored only by an untracked `docs/local/.gitignore`, so the repository does not carry the protection. Build also has pre-existing legacy CSS and large chunk warnings.
Acceptance Criteria: Root ignore precisely protects the book and sync cache; existing architecture docs and AGENTS reflect the revised contract; warnings remain non-blocking unless they affect the accepted flow.

Solution Review
Approved Approach: Update existing docs rather than create a duplicate constitution. Fix only warnings that affect the scoped UX.
Must Not Do: Commit local/teacher binaries or perform unrelated bundling/CSS refactors.

Implementation: PENDING
Solution Review Result: APPROVED
Local Acceptance: PENDING
Remote Acceptance: PENDING

---

## Acceptance matrix

1. Data gate: exact definitions, Storage hashes, page/segment completeness, honest Agent book audit.
2. Architecture gate: one Material source of truth, generic routes, no hardcoded course IDs or remote fallback.
3. Learner E2E: Agent and CDS normal, fail/remediation/retry/pass, existing-state skip.
4. Recovery: invalid/missing resources, API/reader errors, refresh/back/repeat/duplicate/stale client.
5. State integrity: DB before/after for Micro, Material, Assignment, Result, Knowledge, Course, Navigation.
6. Visual: 1440x900 and 390x844 across default/hover/focus/selected/correct/incorrect/completed/failed/locked/disabled/loading/empty/error.
7. Regression: Agent early/mid/late, CDS first/middle/last, H5P golden, Not Found boundaries, tests/typecheck/lint/build, offline local Storage.

---

## A-010 — Narrow-screen navigation overlap

Status: CONFIRMED
Area: Responsive navigation
Severity: MEDIUM
Scenario: Use every visible primary navigation and authentication entry at 390x844.

Acceptance
Expected: Visible navigation targets have distinct hit areas and keyboard focus.
Actual: Anonymous “画布” and “登录” overlap; the login button receives the canvas link's center point.
Evidence: Browser element rectangles and `elementFromPoint` at 390x844.
Acceptance Criteria: No overlap at the target narrow viewport; click and keyboard focus reach the intended entries.

Solution Review
Approved Approach: Make the smallest responsive GlobalNav layout correction using existing tokens/components.
Must Not Do: Hide a required entry or redesign global navigation.

Implementation: PENDING
Solution Review Result: APPROVED
Local Acceptance: PENDING
Remote Acceptance: PENDING

---

## Final Local Acceptance — 2026-09-05

**LOCAL ACCEPTANCE: PASS**

The primary Agent and CDS learner loops are operational. The two findings raised in the first final pass, A-011 and A-012, were fixed and independently rechecked on a new clean database and real browser session. No Local blocker remains.

### Gate results

| Finding | Local result | Independent evidence |
| --- | --- | --- |
| A-001 Real local course data | PASS | After clean reset and sync: Agent 9 Chapters / 9 Lessons / 117 coverages / 127 Assignments; CDS 6 / 26 / 90 / 97. Agent has 2 Materials, 343 Segments and 125 Material mappings; CDS has 12 Materials, 790 Segments and 90 mappings. Local `course-materials` contains 18 objects. A second sync reported all course assets and Golden H5P packages as skipped. |
| A-002 Course-owned Material | PASS | Course API hydration, repository tests, Material RLS verifier, signed PDF read, and cross-Lesson primary-book mappings passed. No runtime remote fallback was needed. |
| A-003 Agent book | PASS | The full source opened from Local Storage; UI showed `307 个内容段` and `307 / 307`, page 307 loaded with no alert, and Next Page was disabled. DB pages are exactly 1..307. |
| A-004 Native Micro primitives / H5P | PASS | CDS Parameter Lab updated 0.1 -> 0.502 and live feedback 10% -> 50%; Matrix edit changed sum 7 -> 10 and symmetric -> asymmetric. Golden H5P loaded as a real iframe, accepted LLM/TOOL/MEMORY drag/drop, returned 3/3, and enabled Continue. Four Golden packages are published with Storage objects. Two independent builds were byte-identical with stable SHA-256 values. |
| A-005 Attempt and PerformanceResult | PASS | Browser wrong answer produced a durable failed result; refresh restored it; explicit Retry opened a new response; correct answer passed. Learning-loop verifier proved idempotent duplicate submission and conflicting-key rejection. |
| A-006 Result-driven learner state | PASS | Learning-loop verifier passed fail/pass state invariants, monotonic Knowledge state, evidence, and persisted results. |
| A-007 Deterministic Navigation | PASS | Failure rendered `先复习，再重试`; pass rendered `继续实训`. Browser observed local `GET /api/navigation?courseId=ai-agents-in-depth` returning 200 and refresh preserved the failed decision. |
| A-008 UX and recovery | PASS | Core desktop/mobile paths were usable. The stale-auth reset scenario now clears only the invalid authenticated generation, presents Login without a hard data error, and restores the exact protected URL after reauthentication; see resolved A-012. |
| A-009 Repository safety | PASS WITH WARNINGS | Root ignore protects local book/sync artifacts and no new teacher book/H5P binary is tracked. Build still reports the pre-existing `*width: 100%` CSS warning and 4.45 MB chunk warning; neither blocked the accepted flow. |
| A-010 Narrow navigation | PASS | Anonymous 390x844: Canvas rect x=166..200, Login rect x=312..342, no overlap, document width 390. Login-center hit testing landed inside the Login button. Authenticated Assignment and Micro pages also had no horizontal overflow at 390x844; Assignment Next Action was visible at 1440x900. |

### Verification evidence

- `pnpm test`: PASS, 74 files / 469 tests.
- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS.
- `pnpm build`: PASS with the two pre-existing warnings above.
- `pnpm verify:material-rls:local`: PASS.
- `pnpm verify:learning-loop:local`: PASS.
- `pnpm verify:backend:local`: PASS twice consecutively after one clean reset/sync, with identical authoritative fingerprints and no temporary Course residue after either run; see resolved A-011.
- Pagination regression: course hydration and publish validation use paged aggregate reads; the API regression suite includes an invalid mapping beyond row 1000 and passed.
- Clean reset plus two sync runs completed; final DB/Storage contained all expected Course, Material, Micro, and four Golden H5P package objects. The second sync was zero-drift. Golden H5P package builds were repeated twice and compared byte-for-byte.

### A-011 — Backend verifier repeatability and canonical Golden data isolation

Status: PASS
Area: Acceptance safety / local product data
Severity: BLOCKER
Local Acceptance: PASS

Reproduction:

1. Clean reset Local Supabase and apply the Golden sync.
2. Run `pnpm verify:backend:local`; the first clean run passes.
3. Load the public Course catalog or rerun the verifier.
4. The Golden Course now exposes 38 Assignments rather than its expected 37.
5. Run `pnpm verify:backend:local` again. It fails at `scripts/verify-local-backend.ts:124` with `38 !== 37`.

Expected: A backend acceptance verifier is repeatable or fully cleans its verifier-owned records; running it must not change canonical Golden Course definitions seen by the product.

Original actual: The first successful run left authored verifier data in `agentic-ai-golden`. The public Course card changed to 38 practice tasks, and the second run failed before completing the backend gate.

Resolution recheck: PASS. After a new clean reset and authoritative sync, the pre-run state was Golden 37 Assignments, zero `course-%` temporary Courses, Agent fingerprint `2ad5e5819a09e89767a80e15714ddf998796173cba2859ebe898f1264661c4d0`, and CDS fingerprint `344f304b33b909a6c2b58ca80334f45a45a3b268c25d6c8af8810a603f99af2b`. `pnpm verify:backend:local` then passed twice consecutively. After each run, both fingerprints were unchanged, Golden remained 37, and temporary Course count remained zero. Code inspection confirms verifier authoring now targets its disposable Course and the `finally` block cascade-deletes that Course, verifier Material/Storage object, and created Auth users; the invalid-H5P publish failure path executed during both passing runs without residue.

Solution Review — 2026-09-05
Result: APPROVED APPROACH; IMPLEMENTATION PENDING

Verified root cause: `verify-local-backend.ts` correctly registers its verifier-owned `manualCourseId` for final Course deletion, but the later authoring/publish scenario switches to canonical `agentic-ai-golden`. It appends `authoredAssignmentId` and `authoredPathId`, publishes the complete preview into canonical Course authority, and subsequently deletes only the authoring draft. The final cleanup never restores that canonical Course. Publish is a transactional replacement that also changes canonical revision and may rewrite other Course-owned rows, so deleting the one visible extra Assignment after the fact would not restore the original definition.

Approved minimum implementation:

1. Keep every authoring mutation and Publish exercised by the verifier inside the existing verifier-owned temporary Course. Do not use any named seeded/Golden Course as a mutable test fixture.
2. Extend that temporary Course into a small but fully valid two-publish fixture. Its first published version must contain stable baseline optional assets needed by the preservation assertions (Material/Segment/mapping if Material state is tested, one covered Assignment, and one valid Micro Path/Unit/Step). Create learner state against those stable IDs. Its second draft/publish may add the authored Assignment and Micro and must prove draft invisibility, post-Publish visibility, and preservation of the baseline learner state.
3. Reuse existing active shared Knowledge IDs and existing published H5P content where needed; the verifier must not copy, modify, or delete shared Knowledge facts or canonical H5P packages.
4. Register the temporary Course for cleanup immediately after creation. Delete the entire verifier-owned Course in `finally` so its Course-owned definitions and learner references are removed through the schema's ownership/cascade rules; retain the existing explicit cleanup for verifier users and Storage objects. Cleanup must also run after an intermediate assertion failure.
5. Snapshot the canonical `agentic-ai-golden` definition before the mutation tests and assert after the tests that its assignment count and a deterministic Course-owned definition fingerprint are unchanged. This is a guard against future verifier leakage, not a restoration mechanism.

Must preserve: the verifier must continue to cover draft visibility, stale draft denial, invalid-reference publish denial, explicit Publish, Native/H5P Micro validation, Assignment execution, and learner-state preservation across a valid Publish. Moving these checks to the temporary Course must not weaken their assertions.

Must not do: change the expected count from 37 to 38 or derive it from already-polluted state; reset/resync the database after verification; hide the extra Assignment in the public projection; delete only the known extra row from `agentic-ai-golden`; republish a reconstructed canonical preview as cleanup; or depend on successful process completion to restore canonical data. Those approaches retain revision/row drift or fail on verifier crashes.

Required implementation verification: after one clean reset and one Golden sync, record the canonical Course count/fingerprint; run `pnpm verify:backend:local` twice consecutively without reset or sync; require both runs to PASS; require `agentic-ai-golden` to remain at 37 Assignments with the same fingerprint after each run; require the verifier-owned Course and its learner rows to be absent after both success and an injected/controlled failure path; and confirm the public Course card remains unchanged.

Implementation Solution Review — 2026-09-05
Result: APPROVED

The implementation keeps canonical `agentic-ai-golden` out of the Course-authoring Publish path and reuses the verifier-owned temporary Course for a route-only Publish, a stable baseline Material/Segment/mapping + Assignment/coverage + Micro Publish, learner-state creation, and a second authored-asset Publish. It verifies preservation of Assignment, Material, and Micro learner state across that second Publish. The temporary Course is registered immediately and deleted from `finally`, while canonical Golden is guarded by both the exact 37-Assignment count and a SHA-256 fingerprint of its hydrated definition. Remaining Golden operations create only verifier-user learning records and do not mutate Course definition authority.

Implementation evidence: after one clean reset/sync, two consecutive full backend verifier runs were reported PASS; canonical Golden remained at 37 Assignments and no temporary Course remained. The reviewer found no Course-authoring call targeting canonical Golden and no count masking, resync, or row-restoration workaround.

### A-012 — Expired local Supabase session recovery after database reset

Status: PASS
Area: Authentication recovery / stale client state
Severity: HIGH
Local Acceptance: PASS

Reproduction:

1. Sign in locally and retain the browser session.
2. Reset Local Supabase, which invalidates the stored refresh/access session.
3. Refresh or navigate in the existing browser session.
4. `/api/knowledge` returns 401 `session invalid or expired` and the product renders a hard `数据连接失败 / 部分学习数据加载失败，请重试` state.

Expected: The application recognizes an expired/invalid session, clears stale auth state, and presents the login flow while preserving a safe return destination.

Original actual: Retry remained inside the authenticated shell with the invalid token. Manual localStorage/cookie clearing was required before login could recover.

Resolution recheck: PASS in a real browser. A signed-in learner opened `/courses/ai-agents-in-depth?view=full#chapter-2`, then Local Supabase was reset while the browser retained its bearer. Reload produced an actual `/api/knowledge` 401. The client attempted only local sign-out; although the reset GoTrue instance returned 403 to that logout, browser local/session storage was cleared, the app moved to `/login`, and no hard data-connection error appeared. Anonymous Knowledge/Course/Micro reads then returned 200. After sync, local-user bootstrap, and reauthentication, the browser returned exactly to `/courses/ai-agents-in-depth?view=full#chapter-2`. The regression suite independently covers bearer-401 coalescing and proves anonymous 401 plus authenticated 403/500 do not clear a valid session.

### Final recheck gates

- `pnpm test`: PASS, 76 files / 475 tests.
- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS.
- `pnpm build`: PASS with the same non-blocking legacy CSS and large-chunk warnings.
- A-011 clean reset/sync, two consecutive backend verifiers, fingerprint guards, canonical count guard, and temporary-Course cleanup: PASS.
- A-012 real-browser expired-bearer recovery and exact pathname/query/hash restoration: PASS.
- Previously accepted course hydration, pagination, Storage, H5P, native Micro, Assignment, Navigation, Reader, RLS, and responsive behavior remain covered by the full regression suite and were not reopened by the final changes.

Solution Review — 2026-09-05
Result: APPROVED APPROACH; IMPLEMENTATION PENDING

Verified root cause: `apiRequest()` obtains the cached Supabase session and adds its access token to every request, including public catalog requests. A Local Supabase reset makes that bearer invalid, so startup `hydratePublicApplicationServices()` receives 401. `App.restore()` and `retryStartup()` classify every exception as a generic hydration failure and set the hard startup error. The existing `onAuthStateChange` recovery runs only after `SIGNED_OUT`, but no invalid-API-session path currently performs sign-out. Retrying therefore reuses the same stale session. Existing `authGateState()` / `resolveAuthRedirect()` already provide the correct safe pathname/search/hash round trip and must be reused.

Approved minimum implementation:

1. Handle invalid bearer centrally at the shared API/auth boundary: only when a request actually attached an access token and its response is 401, coalesce recovery for that token and invoke `supabaseClient.auth.signOut({ scope: "local" })`. Current Supabase JS documents local scope as clearing the current browser session and the installed Auth client explicitly removes the local session even when logout returns 401/403 for an invalid JWT. Do not make the API client own React routing.
2. Continue recovery through the existing synchronous `onAuthStateChange` subscription. On `SIGNED_OUT`, stop the active workflow, clear authenticated UI/session state, clear any startup error, reset all user-scoped repositories, and hydrate only the anonymous public catalog. A protected current route must then reach `/login` through the existing auth gate so its safe pathname, query, and hash are retained.
3. Add one composition-root `clearAuthenticatedApplicationServices()` boundary (or an equivalently small explicit reset boundary). It must clear `ApiUserKnowledgeRepository`, `ApiLearningProgressRepository`, authenticated Micro progress, and workflow state/settings. It must also invalidate/discard queued or failed writes from the old session; it must not flush them after invalidation or allow a queued closure to execute under a later signed-in user. `RecoverableWriteQueue` therefore needs generation/cancellation semantics or the equivalent, not only removal of its recorded error.
4. Make startup and retry recognize this token-attached 401 recovery path. They must finish readiness without replacing Login with `数据连接失败`, and concurrent hydration failures must not cause repeated sign-out, repeated navigation, or a public-hydration loop. A later new session/token must be eligible for its own independent recovery.
5. After a successful sign-in, run the normal authenticated hydration and use `resolveAuthRedirect(location.state)` to return to the preserved safe destination.

Authorization boundary: an anonymous request receiving the expected 401 from an authenticated-only endpoint is not an expired-session signal. Neither a 403 authorization denial nor network/5xx failure may clear the session. Server authentication and authorization remain authoritative; the client recovery only removes an invalid local credential and returns the user to Login.

Must not do: manually delete guessed Supabase localStorage/cookie keys; hard-reload the page; parse or refresh JWTs in product code; retry the same stale bearer; downgrade an invalid bearer to anonymous within the same request; globally convert every 401 to Login without checking that a bearer was attached; retain old user projections; or flush/replay old queued writes after another user signs in.

Required implementation verification:

- API unit coverage: a token-attached 401 clears the local session; concurrent 401s for the same token coalesce; a no-token 401, 403, network error, and 5xx do not sign out.
- App integration coverage: a cached stale session plus `/api/knowledge` 401 renders Login rather than the data-error screen, clears the local Supabase session and authenticated projections, and preserves pathname/search/hash in safe return state.
- Isolation coverage: pending/failed writes from the invalidated user are discarded and cannot execute under the next user; public Course/Knowledge/Micro definitions remain available anonymously.
- Browser acceptance: with an authenticated protected page left open, reset Local Supabase and refresh; observe automatic Login without manual storage intervention; sign in with a valid recreated account and return to the exact requested page without a redirect loop or stale learner data.

Implementation Solution Review — 2026-09-05
Result: APPROVED

The shared API boundary now signs out only after a 401 response to a request that obtained and attached a Supabase session token. Recovery is coalesced by token and uses official local-scope sign-out; anonymous 401 and bearer 403/500 responses do not clear auth. The App continues through the existing synchronous `SIGNED_OUT` boundary, stops the active workflow, synchronously clears user Knowledge, Course progress, Micro progress, and workflow projections, and does not flush invalid-session writes. Startup/retry classify the bearer 401 separately, anonymously rehydrate public data, and navigate through the existing safe auth return-state helpers.

`RecoverableWriteQueue.cancel()` advances a generation, drops queued work from the old generation, clears its recorded failure, and permits new-generation work. Repository reset methods cancel their queues before clearing user-scoped state. Reviewer-run focused API/queue/repository tests passed 19/19; reviewer-run typecheck, lint, and `git diff --check` passed. The implementer reports the complete 76-file / 475-test suite and production build PASS.

Acceptance boundary: Solution implementation is approved; the ledger's existing Local Acceptance result remains independently pending re-execution of the documented real-browser reset/open-session/login/returnTo scenario.

---

## Post-implementation Solution Review — 2026-09-05

Overall Result: APPROVED
Blocking Findings: NONE

| Ledger | Result | Reviewed implementation evidence |
| --- | --- | --- |
| A-001 | APPROVED | Local-only allowlist guard; authoritative manifest and finalized fingerprints; complete learner/history refusal guard; transactional definition replacement; hash-checked Storage sync; clean-safe/idempotent finalization. Clean reset, first sync, and zero-drift second sync were reported PASS. |
| A-002 | APPROVED | `Material.courseId` is the sole ownership source; Lesson context is derived through Segment/Knowledge/Curriculum coverage across schema, API, runtime, authoring, reader state, tests, and docs. No dual Material Lesson source remains. |
| A-003 | APPROVED | 117-row reviewed audit has 112 DIRECT, 4 CROSS_SECTION, 1 EDUFLOW_ADDED, and 0 unsupported rows; generated mappings validate printed/PDF ranges, the +8 offset, evidence, and deep links. Multi-range evidence produces 125 full-book mappings while legacy M03 remains unmapped. |
| A-004 | APPROVED | Shared TS/server interaction contract supports the four missing native families with aligned validation/evaluation, explicit Explore/Challenge semantics, touched-state gating, observable feedback, real Agent/CDS records, and unchanged H5P compatibility. No Course-specific renderer exists. |
| A-005 | APPROVED | Actual responses enter immutable numbered Attempts and versioned Results through service-only RPCs; exact duplicates reuse persisted results, conflicting reuse returns 409, retries create new Attempts, manual review locks and revalidates state, and UI retries retain one logical key. |
| A-006 | APPROVED | Micro progress/evidence/Knowledge transitions and Assignment result/evidence/mastery finalization are transactional server operations. Monotonic Knowledge state is preserved; Micro alone reaches learned; mastery remains centralized and requires required learning plus required accepted Assignments. Explicit Course context is preserved through Micro completion. |
| A-007 | APPROVED | Navigation uses required Course targets, factual prerequisite closure, mastered subtraction, blocked remediation, explicit curriculum/asset order, required-before-optional selection, persisted policy/input identity, authenticated server hydration, and no LLM or Course-ID authority. |
| A-008 | APPROVED | Existing course surfaces received only scoped loop UI: persisted result hydration, fail/pass feedback, logical retry, deterministic Next Action cards, and visible/retryable Micro, Assignment, Navigation, and reader failures. No design-system rewrite was introduced. |
| A-009 | APPROVED | Root ignores protect the exact local book and sync cache; existing architecture documents and AGENTS were updated in place; no dependency or competing lockfile was introduced. |
| A-010 | APPROVED | The narrow GlobalNav uses a bounded three-column layout with distinct navigation/auth hit areas and accessible icon-only auth labels while retaining all required entries. |

Review verification: focused 7 files / 117 tests PASS; reviewer-run typecheck, lint, and `git diff --check` PASS. Implementer reports the final full suite at 74 files / 468 tests plus typecheck, lint, build, clean database reset, first sync, second-sync zero drift, and the local learning-loop verifier PASS. Local and Remote Acceptance remain independently owned by the acceptance reviewer and are not changed by this Solution Review.

Non-blocking follow-up: reject unknown `/api/learning` action strings explicitly instead of allowing them to fall through to submission parsing. This does not create an authority bypass, but would make the API contract and error reporting stricter.

### Targeted pagination re-review

Result: APPROVED

The new 500-row `fetchAll` pagination correctly fixes runtime Course hydration beyond PostgREST's default 1000-row response cap. It is Course-agnostic, propagates query failures, and uses deterministic total ordering for the aggregate GET queries. Browser evidence now shows complete Agent and CDS definitions and the final page of the 307-page Agent PDF.

Resolved: `validatePersistedCourseForPublish()` now paginates every Course-owned table and the active Knowledge lookup with stable total ordering. Aggregate GET hydration also includes stable ID tie-breaks. The PostgREST-cap mock and 1001-Segment/1001-mapping regression prove that a dangling mapping on the final page is loaded and rejected with 422, so trailing assets cannot evade structural validation. The local Vite adapter now routes `/api/navigation` through the existing learner multiplexer consistently with the hosted rewrite; this adds no deployable Function and does not broaden authorization.

Final targeted verification: reviewer-run focused Course/API contract tests 16/16 PASS, typecheck, lint, and `git diff --check` PASS. Implementer reports the complete 74-file / 469-test suite and production build PASS, plus browser PASS for persisted failed-result hydration, explicit retry/pass, deterministic Next Action, complete Agent/CDS counts, and the Agent PDF final page. No remaining pagination or navigation-multiplexer blocker was found.

### Targeted Golden H5P bootstrap re-review

Result: APPROVED

Replaying the existing guarded Golden Micro migration after seed is appropriately narrow, and importing through the existing validated H5P adapter preserves the canonical runtime boundary. The temporary directory is created with `mkdtemp`, passed explicitly to the builder/importer, and removed in `finally`, so cleanup is correctly scoped.

Resolved: all four Golden packages now pass through one `writePackage()` using the fixed valid ZIP timestamp `2020-01-01T00:00:00Z`. The helper performs two independent compressions of the same prepared input and fails unless their SHA-256 values match; the builder reports a four-package hash manifest. A separate pair of complete builds compared all four outputs byte-for-byte and produced identical files, removing the partial-import retry and clean-reset reproducibility blocker. Reviewer-run typecheck and `git diff --check` PASS.

Non-blocking hardening: the published/`package_sha256` skip check does not verify that the expected Storage object set still exists. Clean-reset recovery works because seeded metadata is draft, but checking an object manifest/count would also recover from externally missing or partial Storage data.

---

## Global Final Solution Review — 2026-09-05

**FINAL SOLUTION REVIEW = FAIL**

Blocking Findings: A-013, A-014
Commit / push / deploy authorization: NOT GRANTED

The complete change set was reviewed against plan section 44, not only the latest acceptance fixes. The implementation remains blocked by one directly reproduced database regression and one incomplete deterministic-Navigation read boundary.

### A-013 — Material ownership migration leaves Knowledge Generation RPC invalid

Status: OPEN
Area: Material source of truth / incremental migration safety
Severity: BLOCKER

Verified root cause: migration `20260905010000_course_owned_materials.sql` correctly removes `materials.lesson_id` and replaces the Course authoring Publish function, but it does not replace the pre-existing production function `public.persist_knowledge_generation(uuid,jsonb)`. The installed function from `20260813173446_phase4_2_knowledge_generation.sql` still declares `first_lesson_id` and executes `update public.materials set lesson_id = first_lesson_id`. The TypeScript verifier fixture was updated to stop inserting `lesson_id`, which hides the schema mismatch until the RPC executes.

Independent evidence:

- `pnpm exec supabase db lint --local --level warning`: reports PostgreSQL `42703`, `column "lesson_id" of relation "materials" does not exist`, inside `public.persist_knowledge_generation`.
- `pnpm verify:knowledge-generation:local`: FAIL on the first persistence call with the same missing-column error.

Required minimum correction: add a new forward-only migration after the current migration set that `create or replace`s `persist_knowledge_generation` with the existing transaction, authorization, graph-replacement, stable-identity, rerun, and rollback semantics intact, while removing only the obsolete Material-to-Lesson assignment and its now-unused variable. Material remains Course-owned; Lesson context continues to derive through the generated `CurriculumCoverage` and `MaterialKnowledgeCoverage`. Retain `security definer set search_path = ''`, the explicit schema qualifications, and the existing service-role-only execute grant/revokes.

Must not do: restore `materials.lesson_id`; suppress schema lint; stop running the Knowledge Generation verifier; catch/ignore `42703`; bypass the RPC with a second persistence path; edit an already-applied historical migration instead of adding the incremental repair; or invent a replacement Material/Lesson association.

Required recheck: clean reset and upgrade-existing migration paths both apply; schema lint has no missing-column issue; `verify:knowledge-generation:local` passes all first-write, rerun, relation lifecycle, idempotency, and rollback checks; Course authoring/material tests remain green; and a repository-wide live-schema reference scan finds no function, view, trigger, or policy reading/writing `materials.lesson_id`.

### A-014 — Navigation authority inputs can be silently truncated at 1000 rows

Status: OPEN
Area: Deterministic Navigation / PostgREST aggregate reads
Severity: HIGH

Verified root cause: the newly added `api/_handlers/navigation.ts` builds one authoritative Navigation input from unpaged PostgREST reads. In particular it reads every global prerequisite edge without a Course-node filter, and reads the learner's entire Course PerformanceResult history before selecting the latest result per Assignment. PostgREST's configured/default maximum page silently limits those result sets to 1000 rows. The PerformanceResult query also lacks a final unique tie-break. Once unrelated global prerequisite facts or accumulated retries cross the cap, required prerequisites or Assignment outcomes can disappear from the input, changing both `nextAction` and `input_hash` without any explicit error. The prior Course hydration pagination fix does not cover this separate handler.

Required minimum correction: make every potentially aggregate Navigation query complete and totally ordered. Fetch the Course route first, then restrict prerequisite edges to relevant target Course Knowledge before paginating them. Page Course assets and learner result history with stable total order including a unique final ID; alternatively introduce one narrow server-owned query returning exactly the latest result per Course Assignment. Reuse or extract the existing bounded `fetchAll` pattern rather than creating a second inconsistent pagination abstraction. Preserve RLS/user scoping and the current pure `computeNavigationPlan()` boundary.

Must not do: raise the global PostgREST row cap; assume the current 451 KnowledgeEdges are a permanent bound; slice Course Knowledge/Assignments; use only the newest 1000 results globally; add Course-ID exceptions; perform client-side fallback recommendations; or omit truncated rows from the canonical hash.

Required recheck: API-level regression mocks the 1000-row cap and places a decision-changing prerequisite and/or latest failed result on page 3; the handler must load it, produce the correct remediation/blocking decision, and return the same decision ID for identical inputs. Include equal-timestamp rows to prove the unique tie-break and verify unchanged authorization/RLS behavior.

### Checks that passed

- Full unit/integration suite: 76 files / 475 tests PASS.
- TypeScript, ESLint, `git diff --check`, client-secret audit, Knowledge relation audit, and production Vite build PASS. Build retains the already-recorded legacy CSS and large-chunk warnings.
- `pnpm install --frozen-lockfile` PASS; no dependency or `pnpm-lock.yaml` change and no competing lockfile was found.
- Generated Vercel output contains exactly 12 Functions. `/api/navigation` uses the existing `/api/learner` multiplexer and adds no thirteenth Function.
- Material RLS verifier, learning-loop verifier, and two consecutive backend verifier runs PASS. Afterward canonical Golden remains at 37 Assignments, verifier temporary Courses are absent, and Agent/CDS definition fingerprints remain the reviewed values.
- Agent audit contains 117 unique decisions: 112 DIRECT, 4 CROSS_SECTION, 1 EDUFLOW_ADDED, 125 valid evidence ranges, and no offset/evidence mismatch. Local final Course counts are Agent 9/9/117/127 with 2 Materials, 343 Segments and 125 mappings; CDS 6/26/90/97 with 12 Materials, 790 Segments and 90 mappings.
- The reviewed sync manifest contains the expected 12 CDS PDFs plus the Agent legacy and full-book assets with sizes, page ranges, and SHA-256 values. Local target fingerprints exactly match `FINALIZED_FINGERPRINTS`.
- No new secret or credential was found. The local Agent book and sync temp directory are ignored; no new PDF, H5P, ZIP, cache, or generated binary appears in the change set.
- Course-specific identifiers remain confined to seeds, content migrations, reviewed data, and local verification/sync scripts. No new Course/Knowledge/user-ID branch was found in generic runtime UI/API algorithms.
- A-011 and A-012 remain Solution-approved: the backend verifier is repeatable without canonical Course-definition drift, and invalid bearer recovery is scoped to token-attached 401 responses with local sign-out and authenticated projection/queue reset.

### Targeted A-013 / A-014 implementation re-review — 2026-09-05

Result: CHANGES REQUESTED
`FINAL SOLUTION REVIEW = FAIL` remains unchanged.
Commit / push / deploy authorization: NOT GRANTED

#### A-013 implementation

Status: IMPLEMENTATION APPROVED; FINAL MIGRATION-CHAIN RECHECK PENDING

The forward-only repair now uses the latest migration version, `20260905051000_repair_knowledge_generation_for_course_materials.sql`, so an already-migrated Hosted environment will not require `--include-all`. Code comparison confirms that it recreates the existing `persist_knowledge_generation(uuid,jsonb)` boundary, removes only the obsolete `first_lesson_id` / `materials.lesson_id` write, retains the non-empty Lesson assertion, and preserves the locked run state, single-Material and no-Assignment guards, graph/curriculum replacement, rerun lifecycle behavior, atomic function transaction, schema-qualified access, `search_path = ''`, and service-role-only execution grant.

Reviewer execution against the currently running local database passed:

- `pnpm verify:knowledge-generation:local`: PASS, including atomic write, rerun strength changes, stale-edge lifecycle, and rollback.
- `pnpm exec supabase db lint --local --level warning`: PASS with no schema errors.

The local database had temporarily applied the identical repair under the superseded `20260905011000` filename before it was renamed. Therefore the final numbered migration chain still needs one clean reset (or an equivalent fresh shadow-database application) with only `20260905051000` present, followed by the same lint and verifier. This is an evidence gate, not a requested code change.

#### A-014 implementation

Status: OPEN
Severity: HIGH

The handler improvement is directionally correct: every selected authority relation uses 500-row range pagination and a stable final identity tie-break; prerequisites are restricted to active `prerequisite` edges whose targets are Course route nodes; learner state, Micro progress, and PerformanceResult data retain user/Course/entity scope; and Results use the deterministic `(evaluated_at DESC, version DESC, id DESC)` order. Reads still use the authenticated client and existing RLS, while only the already-authorized NavigationDecision persistence boundary uses the server client. The existing `knowledge_edges(target_node_id)` and user/assignment history indexes make the filters viable; no correctness-blocking index regression was found.

Two corrections are still required:

1. Bound the PostgREST filter URL size. `nodeIds`, `assignmentIds`, `revisionIds`, and Micro path IDs are currently interpolated into single unbounded `.in(...)` filters. A valid sufficiently large Course, long text IDs, or the proposal boundary's allowed 1000 Knowledge IDs can exceed proxy/server URL limits even though result rows are paginated. Add one generic bounded-ID query helper that chunks each ID set (using a conservative fixed item/encoded-length bound), applies `fetchAllNavigationRows()` to every chunk, and deterministically combines the rows. Apply it to Knowledge, prerequisite edge targets, UserKnowledgeState, Global Micro, PerformanceResult assignment IDs, revisions, and completed Micro path IDs. Do not impose a Course-specific row limit or silently slice IDs. Existing RLS and all user/Course predicates must remain on every chunk.
2. Replace the helper-only regression with an API/handler-level regression. The current `api/_handlers/navigation.test.ts` calls only `fetchAllNavigationRows()` over 1,201 inert `{id}` rows. It does not exercise the handler, query scopes/order, decision computation, canonical hash, persistence/readback, or authorization. The test must run the handler with a PostgREST mock that caps every range response, place a decision-changing active prerequisite and a latest failed PerformanceResult beyond row 1000 (or in a later bounded-ID chunk), and assert the expected blocked/remediation action. Invoke the identical request twice and assert the same persisted decision ID. Include equal `evaluated_at`/`version` rows with distinct IDs to prove the final tie-break, and assert that another user's state/result cannot affect the decision and an unauthenticated request remains 401.

Required recheck: the new handler regression passes and proves at least three fetched pages plus multiple ID chunks; focused Navigation tests, typecheck, lint, and `git diff --check` pass. For query-plan hardening, inspect `EXPLAIN` on representative large PerformanceResult history; adding a `(user_id, course_id, evaluated_at DESC, version DESC, id DESC)` index is recommended only if the plan shows the current assignment-leading index cannot serve the paged read acceptably—it is not presently a correctness blocker.

Reviewer focused evidence: `api/_handlers/navigation.test.ts` plus `api/_lib/navigationEngine.test.ts` passed 9/9, but inspection confirms only one of those tests covers pagination and it stops below the handler boundary. Accordingly A-014 and the global final review cannot yet be approved.

### Second targeted A-013 / A-014 re-review — 2026-09-05

Result: CHANGES REQUESTED
`FINAL SOLUTION REVIEW = FAIL` remains unchanged.
Commit / push / deploy authorization: NOT GRANTED

#### A-013 closure

Status: PASS / CLOSED

The final clean migration chain now contains and applies `20260905051000_repair_knowledge_generation_for_course_materials.sql` after `20260905050000`; the superseded `011000` version is absent. Reviewer checks confirm `supabase migration list --local` reports the complete ordered local/remote history through `051000`, `supabase db lint --local --level warning` reports no schema errors, and `pnpm verify:knowledge-generation:local` passes atomic persistence, rerun strength changes, stale-relation lifecycle, and rollback. Together with the prior code/privilege review and reported clean sync fingerprints, A-013 is resolved.

#### A-014 second implementation review

Status: OPEN
Severity: HIGH

Resolved since the prior review:

- The handler now deduplicates and sorts every dynamic Knowledge, Assignment, revision, and Micro path ID set, then applies the scoped query and 500-row pagination per chunk. No Course-specific identity or silent slicing was introduced; user/Course predicates and authenticated RLS remain attached to their corresponding chunk queries.
- The replacement regression invokes the actual handler. It forces 1,201 active prerequisite edges for one Course target so the decision-changing edge appears on page three, proves the first 1,200 mastered sources are not selected, expects the exact remaining source, and proves the same request reuses `decision-1`.
- A second handler case proves `(evaluated_at DESC, version DESC, id DESC)` selects the higher-ID `passed` result and excludes higher-ID failed rows belonging to another user or Course. The test also verifies the published-Course guard receives the authenticated client. The focused handler/engine suite passes 12/12; reviewer-run typecheck, lint, and `git diff --check` pass.

Remaining blocker — the URL bound is still item-count-only. `fetchNavigationRowsByChunks()` uses 100 IDs per `.in(...)`, regardless of their encoded length. These IDs are `text` in PostgreSQL with no database length constraint, and an existing API identity schema permits IDs up to 240 characters. One valid 100-ID chunk can therefore exceed 24 KB before the rest of the PostgREST query string and can still fail at an HTTP gateway/request-line limit. Range pagination does not mitigate that failure.

Minimum correction: keep the maximum 100-item cap, and additionally build chunks against a conservative encoded-value budget (for example, sum `encodeURIComponent(id).length` plus separators and stop well below the smallest supported request-line limit). A single exceptionally long valid ID must still be issued alone rather than dropped; if the platform cannot transport an individually valid identity, reject that identity at the authoritative write/validation boundary with a documented global maximum rather than failing only in Navigation. Add a helper regression with long and URL-sensitive IDs proving both item and encoded-length bounds, deduplication, stable order, and complete row recovery. All existing handler tests must remain green.

Authorization note: an explicit unauthenticated handler case would strengthen the suite, but it is not retained as a blocker because authentication still occurs unconditionally through the unchanged `createUserSupabase(request)` boundary before Course lookup or any Navigation read, and the changed query tests exercise user/Course filtering and the authenticated Course guard.

### Final A-014 closure — 2026-09-05

**FINAL SOLUTION REVIEW = APPROVED**

Blocking Findings: NONE
Commit / push / deploy authorization: NOT GRANTED BY THIS REVIEW

A-014 Status: PASS / CLOSED

The final `fetchNavigationRowsByChunks()` implementation supplies both required URL controls. It deduplicates and lexically sorts IDs, limits every normal chunk to at most 100 identities, and also flushes before the sum of `encodeURIComponent(id).length + 3` would exceed the conservative 4,000-character value budget. An individually over-budget identity remains a singleton rather than being silently omitted. Empty inputs issue no query. Every caller continues to construct its own authenticated, user/Course/entity-scoped PostgREST query before the shared 500-row range pagination runs, so the helper changes transport batching without broadening authority.

The encoded-length regression uses reversed input, a duplicate, and long Chinese IDs containing slash, spaces, `?`, `&`, and `=`. It proves complete deduplicated sorted output, at most 100 IDs per chunk, and at most 4,000 encoded value characters for every non-singleton chunk. The original 251-ID count-limit case remains. Handler-level regressions still prove a decision-changing prerequisite on page three, exact route selection, stable decision ID on identical requests, unique Result ID tie-breaking for equal timestamp/version, and exclusion of other-user/other-Course Results.

Reviewer verification:

- `pnpm vitest run api/_handlers/navigation.test.ts api/_lib/navigationEngine.test.ts`: PASS, 2 files / 13 tests.
- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS.
- `git diff --check`: PASS.

A-013 was closed in the preceding re-review after the clean final migration chain, schema lint, and Knowledge Generation persistence verifier passed. With A-013 and A-014 now closed, the Global Final Solution Review has no remaining blocker. This approval does not itself authorize commit, push, or deployment.

---

## Final Local Acceptance Recheck — A-013 / A-014 — 2026-09-05

**LOCAL ACCEPTANCE: PASS**

This recheck was performed independently against a newly reset Local Supabase database and the final working tree. It did not modify product source, migrations, schema definitions, or product tests. Previously accepted browser behavior, including A-012, was not reopened because the final changes do not touch that path.

### A-013 — PASS

- `pnpm db:reset` applied the complete clean migration chain successfully, including `20260905051000_repair_knowledge_generation_for_course_materials.sql` immediately after `20260905050000_navigation_decisions.sql`. The superseded `20260905011000` filename is absent.
- `pnpm exec supabase migration list --local` reports matched Local/Remote history through `20260905051000`.
- `pnpm exec supabase db lint --local --level warning`: PASS, `No schema errors found`.
- `pnpm verify:knowledge-generation:local`: PASS, explicitly covering atomic persistence, strength-changing reruns, stale-relation lifecycle, and rollback.
- Live-schema inspection found no view, trigger, or policy reading/writing the removed `materials.lesson_id`. The installed persistence function still uses curriculum `lesson_id` where appropriate but no longer declares or writes Material Lesson ownership.

### A-014 — PASS

- `pnpm vitest run api/_handlers/navigation.test.ts api/_lib/navigationEngine.test.ts`: PASS, 2 files / 13 tests.
- The handler regression loads 1,201 prerequisite edges through three 500-row pages, places the decision-changing prerequisite on page three, selects the exact remaining prerequisite, and reuses the same persisted `decisionId` for identical input.
- Result ordering is total: equal `evaluated_at` and `version` rows resolve by descending unique Result `id`. Results belonging to another user or another Course are excluded before decision computation.
- Dynamic-ID reads are both count-bounded and encoded-length-bounded. Tests prove 251 IDs split as 100/100/51 and long Chinese IDs containing slash, spaces, `?`, `&`, and `=` remain complete, deduplicated, stably sorted, at most 100 per chunk, and within the 4,000-character encoded-value budget for every non-singleton chunk.
- Existing authenticated Course guard and user/Course predicates remain exercised at the handler boundary.

### Final regression and data guards

- `pnpm test`: PASS, 77 files / 480 tests.
- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS.
- `pnpm build`: PASS. The previously recorded legacy CSS syntax and large-chunk warnings remain non-blocking.
- `pnpm verify:learning-loop:local`: PASS with distinct failed/retry Attempts and remediation/post-pass Navigation decisions.
- Final Agent fingerprint: `2ad5e5819a09e89767a80e15714ddf998796173cba2859ebe898f1264661c4d0`; counts remain 9 Chapters / 9 Lessons / 117 coverages / 127 Assignments.
- Final CDS fingerprint: `344f304b33b909a6c2b58ca80334f45a45a3b268c25d6c8af8810a603f99af2b`; counts remain 6 Chapters / 26 Lessons / 90 coverages / 97 Assignments.
- Canonical `agentic-ai-golden` remains at 37 Assignments; verifier temporary `course-%` count is zero.
- `git diff --check`: PASS.

No Local Acceptance blocker remains. This acceptance does not authorize commit, push, or deployment.

## Micro Learning V2 — 2026-09-05 goal round

Scope: course-independent Teaching/Interaction/Motion, Drag/Spatial, Flow/Execution, Simulation, Matrix/Data Transformation and Timeline capabilities; four source-backed native references only in `ai-agents-in-depth` and `cds525-deep-learning`; existing CDS K001 H5P compatibility repair. Historical Golden content is retained only for regression. Implementation owns code; Solution Reviewer owns architecture review; independent Acceptance Agent alone owns product PASS.

### Baseline and findings

- Branch `feat/gold-course-learning-loop`; initial HEAD `2e7acb48fa85163294ae62a01054fc89cc4ea686`; worktree clean with no preexisting user modifications.
- TypeScript PASS, full lint PASS, 77 test files / 480 tests PASS, production build PASS (8.94 s). Existing main bundle 4,448.11 kB / gzip 1,304.21 kB, existing large-chunk warning. Reviewer baseline Local schema lint PASS, no schema errors.
- Existing architecture: canonical Path → Unit → Step in normalized database tables; Native content/validation/grading shared by browser and API, independent SQL JSONB constraint, server completion RPC and existing evidence/state/navigation boundary. Existing Step kinds already express teaching stages; no new progress table required.
- Existing libraries: React 19, React Flow 12, h5p-standalone; no direct Motion/dnd-kit/visx/D3/TensorFlow. Reuse React Flow, add pinned stable dnd-kit/core+sortable+utilities and Motion only.
- Actual local migration history initially through `20260905051000`; official Course coverage counts 117 / 90. The three old reference paths each contained two questions. CTX01 had no published Micro.
- Acceptance baseline P0: K012 opened directly into slider/value/percentage, no explanation or derived trajectory; K021 opened directly into four number inputs/sum/symmetry, no corpus or cell meaning; RT01 opened into four trace answer buttons, no worked execution; CTX01 had no published path. P1 RT01 wrong answer only said to choose the earliest invalidating step, without concrete causal feedback.
- Allowed-course H5P descriptor existed as draft, while K001 had been migrated to native Categorize. Historical published Golden H5P is not a final acceptance substitute. Local learner credentials failed initially; the established Local-only bootstrap restored test identity without database reset or credential disclosure.

### Reviewed solution and implementation

Solution Reviewer independently inspected real Knowledge identities, curriculum/Material mappings and source pages. Approved RT01 and CTX01 from original Agent book pp.39–47, K012 from Lecture 2 p.50, and K021 from Lecture 3 pp.25–26. CTX01 is the existing active Message Context node; it now includes a worked context flow before role classification and single-tool ordering. No invented Knowledge facts, mandatory verifier node, Course renderer branches, or course-owned LLM runtime were introduced.

Approved minimum schema change: three additional native JSONB variants (`flow-execution`, `simulation`, `data-transform`), retaining existing teaching kinds and all legacy interaction capabilities. New shared Zod schemas/reducers/calculations/grader own semantics; React Flow/dnd-kit/Motion own mature rendering/manipulation infrastructure. Small SVG and table visualizations avoid unnecessary ML/chart frameworks. Research-only teaching-project patterns and dependency licenses are recorded in `docs/MICRO_LEARNING_AND_EVIDENCE.md`; no external project code/assets were copied.

Implemented four full paths (6 / 7 / 6 / 6 Steps), with Hook/Explain, worked demonstration/exploration, insight, changed-scenario practice, causal feedback and summary. Learning-rate target grades actual loss under changed curvature. Corpus events generate matrix counts with incorrect cell rejection. Flow supports connect/disconnect, current-node/message state, failure, Step/Play/Pause/Reset; category and ordering use direct drag with keyboard alternatives and rollback. Shared learner/authoring rendering and actual Step identities prevent blank/stale previews.

Forward migration `20260905083836_micro_learning_v2.sql` extends JSONB validation and upserts stable reference identities. The generator emits readable JSON SQL; only known reference Step positions are temporarily offset. Original completed paths/evidence are preserved; in-progress presentation resumes the earliest uncompleted teaching Step. No new mastery, progress, Attempt, PerformanceResult or Navigation authority exists. Existing sync replays the same migration and maintains reviewed fingerprints.

H5P uses player-owned responsive height with no forced 320/400 px iframe minimum, isolated async mount cleanup, exact active root xAPI IRI validation and a retry submission action. The existing CDS K001 builder/importer was reused, ZIP timestamps made deterministic, 420 validated package files imported locally, and the intended K001 H5P Step restored through the migration. Two independent package builds were byte-identical, SHA-256 `9e90b4d9171940ab9be477c10b7a3d4b85a44f5869ab3c05329913e528e3de96`.

### Verification and review ledger

- Implementation full checks after reviewed core/UI fixes: TypeScript PASS; full lint PASS; 79 files / 493 tests PASS. Meaningful tests cover real gradient/loss, altered curvature, flow transitions/required connections/failures, directional corpus events, event-to-cell counts, malformed definitions, exact H5P root events, timeline pause/reset/cancelled late callbacks, and revised in-progress resume.
- First full run caught the new reference test incorrectly importing Demo from Shared. The test was moved to top-level `tests/`; the existing architecture guard was preserved. Duplicate test imports were fixed; no failing test was deleted or weakened.
- Local Micro V2 verifier PASS: 19 SQL/TypeScript malformed/valid definition probes and exact idempotent four-reference replay. Includes missing/null shape, wrong scalar types, overlong labels, invalid window, unsupported numeric overflow. Reviewer post-migration schema lint PASS.
- `pnpm install --frozen-lockfile` PASS. Existing learning-loop regression verifier PASS (immutable failed/retry attempts and deterministic remediation/next decisions). Historical regression is not product acceptance for these references.
- Reviewer independent pure slice: initially 3 files / 18 tests PASS; subsequent mechanisms/native/H5P/server slice 4 files / 22 tests PASS. These are technical checks, not product PASS.
- Reviewer independently compared canonical SHA-256 for 20 non-Micro definition tables (17 official Course-definition tables and 3 shared Knowledge/revision/fact tables): all UNCHANGED after migration/bootstrap.
- Reviewer exact verdict: **“SOLUTION REVIEW: current product architecture/code APPROVED FOR LOCAL ACCEPTANCE (not final product PASS).”** Final reviewed corrections included Flow disabled deletion, actual edge selection/removal, invalid drag rollback, namespaced zones, reduced motion, preview identity/index reset, readable SQL/scalar bounds, and exact H5P root event handling. `git diff --check` PASS.
- Initial V2 production build PASS (9.63 s): main gzip 1,383.92 kB, +79.71 kB over baseline; lazy mechanism renderer gzip 4.50 kB. Existing large-chunk and vendored H5P CSS warnings retained. Final production build after the last reviewed fixes PASS (10.73 s): main gzip 1,384.00 kB; lazy mechanism renderer gzip 4.54 kB. Existing backend verifier PASS: Auth, Health, Knowledge, Goal timeline/Briefs, Course visibility, Micro progress, learning state/evidence, signed PDF, RLS, Workflows, upload and authorization.

Independent Local product/UX/instructional/student acceptance: **PENDING**. Remote acceptance: **NOT RUN**. No commit/push or final product PASS has occurred in this round.

### Independent local acceptance — first findings and reviewed repair

Acceptance reported P1: Flow retained desktop zoom after narrowing to 390 px; category pointer drops on a header could land in its neighbor; complex Micro content shifted left of the centered header; the fixed Assistant overlapped the narrow Check CTA. K012 also labeled the computed next update as the current update.

Root causes and minimum fixes: React Flow now fits only when its container dimensions change and offers an explicit Fit action while preserving execution; Categorize now uses dnd-kit's pointer collision instead of dragged-rectangle intersection; the complex-content grid again centers horizontally and aligns vertically from the top; the narrow footer reserves space for the existing Assistant; the numeric label now says “下一步更新 Δθ”. Solution Reviewer approved this patch for independent retest. No lesson data, progress, or database records changed. After the viewport helper typing change: TypeScript PASS, full lint PASS, 79 files / 493 tests PASS, production build PASS (9.52 s), and diff whitespace check PASS. Product verdict remains pending independent retest.

### Native Reference acceptance verdict and H5P revision repair

Independent Acceptance Agent verdict: **all four Reference novice / misconception / stress PASS after reviewed P1 fixes**. This is the native subset verdict; overall Local acceptance remained FAIL while the H5P compatibility gate was outstanding.

- RT01: weather demonstration → stock repair, actual Backspace edge deletion and handle connection; missing return stops at 3/5 with causal explanation, corrected trace reaches 5/5.
- CTX01: role mapping and call-ID chain taught; causal wrong-role feedback; five precise header-target pointer drops correct; pointer ordering shows insertion/displacement; keyboard Space/arrow/Space and Esc verified; outside drop rolls back.
- K012: real values independently observed at four updates: η=.02 gives θ3.3974/Loss11.5422; .3 gives θ.1024/Loss.0105; .8 gives θ.5184/Loss.2687; 1.2 gives θ15.3664/Loss236.1262. Changed-curvature .8 diverges (Loss 5.29e9), .3 succeeds. Numeric delta label clarified as the next update.
- K021: 14-event corpus matrix independently matches all six neighbor pairs (I–love twice, other pairs once, symmetric); reversed/non-neighbor operations leave counts unchanged; four-event I/enjoy/AI transfer passes.
- Each native path completed, refreshed, returned to its correct Course, and replayed. DB held exactly one completion evidence per path and all four Knowledge states at `learned`; completion timestamps remained unchanged on replay. Native console errors: zero. Desktop 1440 and narrow 390 had no horizontal page overflow. Narrow Flow nodes x43..332 and execution 2/5 survived resize/Fit; Check x195..289 was separate from Assistant x323..375.

Independent H5P P1 failure: 407 px cards were spaced only 235 px apart, with 179 px height but 84 px row spacing, producing overlap/clipping. Reviewer and Implementation both inspected the actual H5P.DragQuestion 1.14 code: `x/y` are percentages, `width/height` are em, and font size scales from authored width at 16 px. The old builder treated both as percentages.

Reviewed minimum repair: card width 13 em and height 3.575 em; zones 20.5 em wide with 42%-equivalent vertical room; native auto-align/fullscreen, no duplicate internal title/background words, and authored 1.4 em card text for narrow legibility. Category's drop overlay also respects reduced motion. New guarded migration `20260905092253_cds_h5p_geometry_v2.sql` advances only revisions below 2 to new `/2` storage; stable content/Step identity, progress, and original `/1` assets remain. Imported revision 2 checksum: `bbc374d7fe8a16b0ef375faad7e6d565f540170d00416d8941343b9933e4d2ed`.

Reviewer approved the geometry source and immutable-revision guard for independent visual/completion retest. Post-fix TypeScript/full lint/79 files and 493 tests PASS. Local verifier repeated 19 parity probes and four-reference replay PASS; H5P revision/checksum/status replay stability PASS; schema lint PASS. No reset occurred. H5P independent retest and overall Local PASS remain pending.

Reviewer final Local Vercel output generation PASS (build only, no deployment): full TypeScript + Vite production build 9.72 s; main gzip 1,384.01 kB and lazy mechanism gzip 4.66 kB. Fresh `.vercel/output/functions` contains exactly 12 `.func/.vc-config.json` entrypoints: assistant, course-intent, course-mapping, course, domains, health, knowledge-generation, knowledge, learner, material-parsing-jobs, materials and workflows. No new Function was added. Reviewer log: `/tmp/eduflow-micro-v2-review/vercel-build.log`.

Reviewer final source verdict: **“FINAL SOLUTION REVIEW current source APPROVED: course-independent contracts/calculations/renderers, existing progress/evidence boundary, source-backed4refs, minimal library reuse, guarded H5P rev2, docs/license inventory and final generated12functions.”** This is Architecture/code-review PASS only; independent H5P and overall Local product acceptance remain required. The corrected revision-2 package was built twice independently with the same `bbc374d7fe8a16b0ef375faad7e6d565f540170d00416d8941343b9933e4d2ed` checksum.

### FINAL independent LOCAL ACCEPTANCE PASS

Acceptance Agent exact verdict: **“FINAL independent LOCAL ACCEPTANCE PASS.”** This supersedes the pending/FAIL intermediate statuses above; the Implementation Agent did not award the verdict.

All four native References retain the novice, misconception and operation-stress PASS evidence above. H5P revision 2 passed desktop/narrow initial and placed-card layout. An incorrect/partial 1/6 did not complete the Step. Retry followed by six actual pointer drops at 390 px produced 6/6, the real H5P completion event, formal Step completion, remaining native content/Summary and completed Path. Successful result resubmission, refresh, correct Course return and full keyboard Space/drop replay at 6/6 were independently verified. DB held all five tested Knowledge nodes (`RT01`, `CTX01`, `CDS525-K012`, `CDS525-K021`, compatibility `CDS525-K001`) at `learned` with exactly one completion evidence each. Latest browser console errors: zero.

Acceptance evidence was relocated outside the repository to `/tmp/eduflow-micro-v2-acceptance`; no unnecessary binary evidence is included in the change. Final Architecture/code review is approved as recorded above. Remote acceptance: **NOT RUN — pending authorized commit/push and actual Preview/Hosted rollout**. No merge to Prototype is authorized or performed.

### Preview ESM smoke failure and focused correction

Reviewer authenticated API smoke on the actual READY Preview at `a9c064b` found a P0: learner multiplexer endpoints returned 500 because generated `nativeMicroInteraction.js` imported extensionless `./microMechanisms`. TypeScript/Vitest had masked native Node ESM resolution. Hosted incremental migrations and H5P revision-2 import were already complete; all 20 non-Micro definition fingerprints remained unchanged. Remote acceptance is therefore **FAIL pending corrected deployment and independent retest**, superseding the prior NOT RUN status.

The shared import now uses `./microMechanisms.js`, matching existing server imports. No UI, schema or learner-state change was made. Added `pnpm verify:micro:generated`, which imports the full generated learner entrypoint in native Node, invokes its routing boundary and exercises the generated server grader on actual convergent, divergent and incomplete simulations. The new check first reproduced the exact `ERR_MODULE_NOT_FOUND` against the prior output; after fresh local Vercel generation it PASSed. Fresh output still contains 12 Functions. Build log: `/tmp/eduflow-micro-v2-review/vercel-build-esm.log`. Typecheck, full lint and diff whitespace check PASS; Reviewer independently reported three files / 20 tests PASS and approved the exact import correction.

Independent Acceptance Agent focused verdict: **Local PASS preserved after the `.js` patch**; `/api/micro` returned 200 with all four References, and K021 actual wrong/correct operations, 14-event completion, checking and replay remained correct. Remote product PASS still requires the corrected Git deployment and independent Preview acceptance. No merge to Prototype was performed.

### Corrected Hosted rollout and authenticated API smoke

Reviewer confirmed actual Git deployment `dpl_4TxPwiRCQvJ7WxB3euRL9K4FKpum`, commit `d7cbf9b8504e4a2a4af8af812726114958931354`, READY with 12 Functions at `https://edu-flow-9hzouaa2q-july-nanas-projects.vercel.app`. The initial `a9c064b` learner-Function 500 is corrected by the explicit ESM import; the follow-up changes no schema or UI. Reviewer independently reran the generated native Node verifier: PASS.

Hosted Supabase `uyljtdbvlivxniililay` received exactly migrations `20260905083836` and `20260905092253` incrementally through the CLI; connector history independently confirmed both canonical versions. A transient pg-delta cache-export warning followed application, but the CLI exited 0 and linked schema lint PASSed. No shared database reset occurred. H5P revision 2 imported 420 files through the controlled importer into `/2`, with checksum `bbc374d7fe8a16b0ef375faad7e6d565f540170d00416d8941343b9933e4d2ed`; all 20 non-Micro definition fingerprints remained unchanged.

Reviewer authenticated smoke using the ordinary acceptance account returned 200 for Courses, Knowledge, progress and Micro. Four Reference step counts were CTX01 7, RT01 6, K012 6 and K021 6. H5P resolution and revision-2 content asset both returned 200; the teacher-only submissions request correctly returned 403. Credentials were not included in source, evidence or logs. Independent remote browser acceptance is **IN PROGRESS**, and no Remote product PASS is claimed by Implementation or inferred from READY/API smoke. No merge to Prototype was performed.

### FINAL independent REMOTE ACCEPTANCE PASS

Acceptance Agent exact verdict: **“Independent REMOTE ACCEPTANCE PASS”**, tested against runtime commit `d7cbf9b8504e4a2a4af8af812726114958931354`, deployment `dpl_4TxPwiRCQvJ7WxB3euRL9K4FKpum`, `https://edu-flow-9hzouaa2q-july-nanas-projects.vercel.app`. This supersedes the intermediate Remote failure and in-progress statuses above. All four Native References passed novice, misconception and operation-stress personas; Implementation did not award the verdict.

- RT01: actual handle connection and Backspace deletion, broken-return execution causality, completion and full replay PASS.
- CTX01: precise category header drops, outside-drop rollback, keyboard ordering/cancel and completion PASS. Course graph → existing graph search → drawer → Micro made CTX01 discoverable while preserving the presentation list gate and domain semantics.
- K012: actual .02/.3/.8 trajectories, changed-curvature wrong .8 → correct .3, completion and replay PASS.
- K021: wrong-cell/window feedback, 14 corpus events and four-event keyboard transfer PASS. Legacy in-progress state resumed at the new missing teaching Hook.
- CDS K001 H5P: desktop/narrow geometry, actual wrong 0/6 → Retry → 6/6 using pointer and keyboard, subsequent formal content completion, refresh and full replay PASS.

Final authenticated API evidence held five paths and five Knowledge states: K001 retained `practicing` and its original August 22 completion; K012 retained `learned` and its original September 4 completion; RT01, CTX01 and K021 were newly `learned`. Each had exactly one Micro completion evidence, without overwriting historical completion timestamps or manufacturing mastery. After an additional full RT01 replay, `remote-final-replay.json` exactly equaled `remote-after.json`. Browser console: zero errors and warnings. Acceptance made no product/DB edits or resets.

Reviewer final 30-minute deployment log query found zero HTTP 500s. All 20 non-Micro definition fingerprints remained unchanged after full remote QA. Evidence is outside the repository at `/tmp/eduflow-micro-v2-acceptance`: `remote-before.json`, `remote-after.json`, `remote-final-replay.json` and `remote-*.png`. Full independent acceptance applies to runtime `d7cbf9b`; the ensuing documentation-only closeout preserves that runtime and will receive READY/API smoke verification. No product source changes accompany this closeout, and no merge to Prototype was performed.
