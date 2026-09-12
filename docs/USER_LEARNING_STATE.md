# User Learning State

## 1. Purpose

Learning state is mutable, user-owned data layered over immutable curriculum definitions and the shared Knowledge Graph.

## 2. Scope

`UserCourseState` is keyed by `userId + courseId`. It contains course activity timestamps, course progress, assignment states, and material states for that exact scope.

## 3. Assignment State

`UserAssignmentState` is keyed by stable `assignmentId` and projects `not_started`, `started`, `submitted`, `needs_revision`, or `accepted` plus optional progress. The CourseAssignment definition never stores user completion, submission, or pass state.

## 4. Material State

`UserMaterialState` is keyed by `materialId` and stores reading position, progress, and update time. Material definitions remain reusable and immutable.

## 5. Knowledge State

`UserKnowledgeState` remains separate and represents learning/mastery evidence about a KnowledgeNode. Course or Assignment completion does not automatically set mastery to 100%.

Browsing a Knowledge detail, selecting a Course context, opening a Drawer, or viewing a Course route never writes `UserKnowledgeState`. There is no generic “start Knowledge” mutation. A state transition begins only through a real learning activity: starting a Course-scoped Material, starting a resolved Micro path, or starting a real CourseAssignment. Material start validates its Course ownership and MaterialKnowledgeCoverage; Micro start follows the actual Micro runtime; Assignment start validates published Course ownership, covered Knowledge readiness and hard Assignment dependencies before membership or Knowledge mutations.

Successful Micro path completion may advance `learning -> learned` and persists evidence, but does not imply `mastered`. Course route presentation keeps `learned` visibly distinct from both “进行中” and “已掌握”. Teaching prerequisite reachability accepts `learned`, `practicing`, or `mastered`; `explore` and `learning` remain unsatisfied. This allows instructional continuation without claiming mastery. Course Graph, Path and Navigation share this policy and gate only factual prerequisites whose endpoints both belong to the Course route.

Reopening a completed Micro for active review is presentation-local. It must not reset or rewrite progress, duplicate completion Evidence, change completion timestamps, or downgrade `learned`/`mastered`; the normal first-completion path remains the only persistence path.

## 6. Repository

`LearningProgressRepository` loads, saves, and subscribes to states by user and course. Application composition uses `ApiLearningProgressRepository`, backed by `/api/progress` and owner-scoped PostgreSQL rows. The LocalStorage adapter receives a `UserCourseStateFactory` and remains only for Demo/test compatibility; it does not import Demo fixtures.

Persisted data uses `{ schemaVersion, state }`. Loading validates user/course identity, Assignment and Material maps, key-to-record identity, and timestamps. Legacy raw `UserCourseState` is migrated into the current envelope; invalid data falls back to the injected initial-state factory without treating an unchecked cast as valid state.

Assignment and Material `progress`, when present, must be a finite number in the inclusive range `0..100`. NaN, Infinity, negative values, and values above 100 are rejected both during persistence validation and before a mutation can be saved.

## 7. Isolation

Updating one user's course, Assignment, or material state cannot change another user or another course. Course Center and course pages always request the active user's scoped state.

## 8. Explicit Assignment Identity

Completion APIs require `courseId` and `assignmentId`. They do not select an Assignment by array position, displayed KnowledgeNode, or workflow template ID.

## 9. Workflow Launch Context

A workflow launch may carry `courseId`, `assignmentId`, and `workflowTemplateId`. Completion updates the explicit Assignment only after validating it belongs to the course and uses that template. A shared template may serve several Assignments.

## 10. Derived Progress

Chapter and course summaries aggregate unique Assignment IDs from scoped states. Material progress is independent. Demo UI must not derive assignment completion by copying Knowledge progress.

## 11. Recent Learning

Recent courses are ordered from user-course activity timestamps. The UI does not use a hard-coded featured course as the recent item.

When no Material/Assignment `recentLessonId` exists, the recent Course card may display the most recently updated real Knowledge state within that Course. It must not say “尚未开始” after a Course-scoped Micro has produced durable `learning` or `learned` state.

## 12. Persistence Evolution

Local storage is a compatibility adapter. The server repository is the application source of truth and preserves the same scoped identity and update semantics. Existing LocalStorage payloads are not automatically imported into a Supabase account.

## 13. Attempt and Result Boundary

Every authenticated Assignment submission stores the actual typed response in an immutable numbered `LearningAttempt`. An atomic server-only transaction appends the corresponding versioned `PerformanceResult` and learning events. Rule-supported experiences are evaluated against the published Assignment contract; open answer/code/workflow evidence remains `pending` until a teacher review appends a manual Result version. Authenticated clients cannot call the result-writing RPC directly.

An idempotency key is scoped to learner, Course, and Assignment. Exact retries return the original Attempt/Result; a new retry key creates the next Attempt. `submitted` and `completed` are never aliases for `passed`. A failed Result projects `needs_revision` without lowering monotonic Knowledge state; a passed Result projects `accepted` and may contribute evidence to the centralized mastery policy.

## 14. State Boundaries

- `UserKnowledgeState` / `UserKnowledgeRecord`: mastery, learning status, evidence, and lineage for a KnowledgeNode.
- `UserAssignmentState`: execution and completion for one stable CourseAssignment ID.
- `UserMaterialState`: recent Segment and observed reading coverage for one Material.
- `UserCourseState`: course-local Assignment/Material maps, recent Lesson, timestamps, and aggregate projection inputs.

These records are related but not interchangeable. Assignment completion may later produce KnowledgeEvidence; it never directly overwrites mastery. Material reading likewise does not imply mastery or Assignment completion.

## 15. Deterministic Navigation

The `course-rule-v4` Navigation Engine consumes the existing Course route and learner state. The earliest unfinished curriculum route node is the frontier; only learned/skipped nodes are passed. Historical underway after this frontier cannot preempt it. Empty learner state uses this same initial deterministic rule, not personalization; Course-local factual prerequisites require learned, practicing or mastered state. It selects only an existing executable learning path for the current frontier, or emits a truthful no-action reason. Material and formal Assignment never compete for this learning action. Historical action/resource unions remain readable for compatibility; the Course Navigator defensively rejects legacy Material and Assignment actions.

Each input state is hashed canonically and persisted as one `NavigationDecision` per learner/Course/policy/input hash. Re-reading unchanged state returns the same decision. Practice outcomes do not schedule practice or replace instructional continuation. The policy version changes when selection semantics change, so prior Material decisions cannot be reused under v3. The LLM is not Navigation authority.

## 16. Material Reading Updates

`updateMaterialReadingState` atomically records recent Segment, viewed Segment IDs, and derived reading progress. `recentLessonId`, when available, is presentation context derived from the Segment's Knowledge mapping and canonical CurriculumCoverage rather than a Material ownership field. Intersection-driven writes are debounced so UI response is immediate without writing local storage on every observer callback.

## 17. PDF Reading State

For PDF Material, `recentSegmentId` identifies the current PDF page/Segment only. `viewedSegmentIds` is the unique set of pages that actually became active at the reading anchor. Completion progress is `viewed / total`, not the numeric page position.

A direct jump from page 1 to page 20 records the pages genuinely made active; it does not mark pages 2 through 19. Persistence remains debounced and is routed through LearningProgressRepository. PDF page position, Material completion, Assignment completion, and Knowledge mastery remain four independent concepts.

## Course Adaptive Learning Navigator MVP

The default learner Course page uses `CourseNavigator`: a left action queue and a single, vertical, gently alternating Knowledge sequence. The existing graph view remains available and its renderer, geometry, authoring and selection contracts are unchanged.

- Authenticated Next Action and sequence identities come from the existing `/api/navigation` decision. The browser does not rank a second global action. Anonymous browsing uses curriculum/prerequisite presentation only and has no personal queue or navigation request.
- Only the queue's executable learning action has a primary start button, always labelled 开始学习. The card contains only theme, a short learner-language reason, and an estimated duration from the actual matching published path when available. Resource types and policy fields stay internal. Path nodes open existing Knowledge details; their completed/current/available/locked appearance is a presentation projection. `learned` is labelled 已学完 and `mastered` 已掌握. Micro completion does not manufacture mastery.
- Practice debt derives from real Course Assignment coverage and durable Assignment states. All covered Knowledge must meet teaching prerequisites before a new debt becomes ready. Begun/submitted debts remain visible if route scope changes. Accepted and legacy completed items are excluded; submitted remains visible and never becomes `nextPractice`.
- Hard Assignment dependencies must be accepted/completed before `nextPractice`. Among ready items, order by the latest covered Knowledge position in the navigation sequence, then Assignment display order, then stable identity. There is no persisted debt timestamp in the current read model, so this MVP makes no oldest-debt claim and adds no schema.
- `nextPractice` means the first ready pending practice, independently of `nextAction`. A task definition can appear in the backlog without implying a runtime. Details offer status-aware links (start, continue, revise, view submission/result) to the existing Assignment page; the dialog does not contain an editor or submit logic. Formal practice is independent of the top learning action. No Assignment, including answer/code/trace or Workflow, is promoted into the top card. The existing execution surfaces remain available through their own entries.
- The queue reloads Navigation when the hydrated Course state changes, including after the existing Micro completion refresh and return. Invalid/error responses show a retry state. Learning-complete with unfinished Assignments, fully complete learning plus all accepted/completed Assignments, and missing/blocked learning assets are distinct states. An empty or partially unlearned route never claims completion. Material-only nodes stay at the real frontier without skipping ahead, changing prerequisites or manufacturing learned/mastered state.
- Desktop queue/path ratio is approximately 30/70. At 900px and below the queue precedes the path. SVG connectors and fixed index-derived offsets express sequence, not KnowledgeEdge facts. Motion respects reduced motion; native task dialogs support focus containment, Escape and focus restoration. No graph/animation dependency is added.

Acceptance and real-data evidence: [Adaptive Navigator MVP](acceptance/ADAPTIVE_NAVIGATOR_MVP.md).

- No learner-personalized content creation runtime exists in this release. Offline generated Micro scripts and teacher/admin draft editing are not learner creation capabilities; Course Creator desired-assets proposals are plans only. No creation CTA, busy state, success or estimated generation time is fabricated. A future real authorized create/persist/launch loop is required before exposing 创建专属学习.
- Locked path nodes remain focusable and inspectable, labelled 尚未解锁 with no aria-disabled. Their details disable Micro and Assignment starts, and the launch handler also checks the lock. Supporting Material remains inspectable; opening it from a locked detail does not issue a learning-start mutation.


## Assignment execution guard and authorized history reset

The shared `assignmentEligibility` rule checks published Course, valid nonempty Course Knowledge coverage, learned/practicing/mastered coverage state, and accepted/completed hard dependencies. UI adapters and the authenticated learning API use it. Start permits not_started/started/needs_revision (and existing legacy aliases); submit requires started or needs_revision. Submitted and accepted/completed are view-only. The API validates before membership, practicing, attempt or result writes. Replays of an existing scoped idempotency key preserve the RPC's identical-response behavior; a new submission in a read-only state is rejected. Direct URLs show a blocked explanation without mounting an executable editor or starting the task. Manual teacher acceptance retains its existing submitted-only authorization.

The explicitly authorized one-time Hosted reset clears learning_events, knowledge_evidence, performance_results, learning_attempts, navigation_decisions, user_micro_unit_progress, user_micro_path_progress, user_assignment_states, user_material_states, user_course_states, user_knowledge_states and workflow_runs. It preserves Auth, Profiles/roles/capabilities, all teaching/authoring definitions, Assistant conversations, and user workflow definitions/editor settings; those are not navigation/progress history. `scripts/dev/reset-learner-history.sql` is never a migration or automatic build step. Capture preflight counts first; the locked transaction verifies all preserved table checksums and requires all reset tables empty, otherwise it aborts. Subsequent acceptance actions create new real progress, distinguished from removed historical data.
