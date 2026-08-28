# User Learning State

## 1. Purpose

Learning state is mutable, user-owned data layered over immutable curriculum definitions and the shared Knowledge Graph.

## 2. Scope

`UserCourseState` is keyed by `userId + courseId`. It contains course activity timestamps, course progress, assignment states, and material states for that exact scope.

## 3. Assignment State

`UserAssignmentState` is keyed by stable `assignmentId` and stores `not-started`, `in-progress`, or `completed` plus optional progress. The CourseAssignment definition never stores user completion.

## 4. Material State

`UserMaterialState` is keyed by `materialId` and stores reading position, progress, and update time. Material definitions remain reusable and immutable.

## 5. Knowledge State

`UserKnowledgeState` remains separate and represents learning/mastery evidence about a KnowledgeNode. Course or Assignment completion does not automatically set mastery to 100%.

Browsing a Knowledge detail, selecting a Course context, opening a Drawer, or viewing a Course route never writes `UserKnowledgeState`. There is no generic “start Knowledge” mutation. A state transition begins only through a real learning activity: starting a Course-scoped Material, starting a resolved Micro path, or starting a real CourseAssignment. Material start validates its Course ownership and MaterialKnowledgeCoverage; Micro start follows the actual Micro runtime; Assignment start validates the stable CourseAssignment identity.

Successful Micro path completion may advance `learning -> learned` and persists evidence, but does not imply `mastered`. Course route presentation keeps `learned` visibly distinct from both “进行中” and “已掌握”. Factual prerequisite reachability continues to require mastery under the current policy, so completing one Micro does not silently unlock dependents that require mastered evidence.

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

## 13. Non-goals

This version does not implement submissions, grading, audit history, teacher overrides, automatic mastery assignment, or a complete evidence pipeline. Authenticated progress itself is synchronized through the backend.

## 14. State Boundaries

- `UserKnowledgeState` / `UserKnowledgeRecord`: mastery, learning status, evidence, and lineage for a KnowledgeNode.
- `UserAssignmentState`: execution and completion for one stable CourseAssignment ID.
- `UserMaterialState`: recent Segment and observed reading coverage for one Material.
- `UserCourseState`: course-local Assignment/Material maps, recent Lesson, timestamps, and aggregate projection inputs.

These records are related but not interchangeable. Assignment completion may later produce KnowledgeEvidence; it never directly overwrites mastery. Material reading likewise does not imply mastery or Assignment completion.

## 15. Material Reading Updates

`updateMaterialReadingState` atomically records recent Segment, viewed Segment IDs, derived reading progress, and the Material's Lesson as `recentLessonId`. Intersection-driven writes are debounced so UI response is immediate without writing local storage on every observer callback.

## 16. PDF Reading State

For PDF Material, `recentSegmentId` identifies the current PDF page/Segment only. `viewedSegmentIds` is the unique set of pages that actually became active at the reading anchor. Completion progress is `viewed / total`, not the numeric page position.

A direct jump from page 1 to page 20 records the pages genuinely made active; it does not mark pages 2 through 19. Persistence remains debounced and is routed through LearningProgressRepository. PDF page position, Material completion, Assignment completion, and Knowledge mastery remain four independent concepts.
