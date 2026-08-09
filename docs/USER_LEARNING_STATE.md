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

## 6. Repository

`LearningProgressRepository` loads, saves, and subscribes to states by user and course. The demo implementation persists each scope under a versioned local-storage key and uses explicit demo fixtures only for initialization.

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

## 12. Persistence Evolution

Local storage is a demo adapter. A server repository can replace it while preserving the same scoped identity and update semantics.

## 13. Non-goals

This version does not implement submissions, grading, cross-device synchronization, audit history, teacher overrides, automatic mastery assignment, or a complete evidence pipeline.
