# Course Data System

## 1. Purpose

The course data system makes every course a runtime data package rather than a page-specific implementation. Agentic AI and Python Engineering are fixtures consumed through the same public boundary.

## 2. Core Boundary

`CourseRepository` exposes `listCourses()`, `getCourse(courseId)`, and summary lookup. It returns `CourseRuntimeData`, which contains the course definition, chapters, lessons, curriculum coverage, assignments, assignment coverage, materials, and material coverage.

Pages and generic services depend on this interface. They do not import individual course seeds.

## 3. Runtime Identity

Every runtime has a stable `course.id` and a structural `revision`. Unknown IDs are invalid; routing must display Not Found instead of substituting a default course.

## 4. Shared Knowledge Graph

Courses reference stable shared `KnowledgeNode` IDs through `CurriculumCoverage`. They do not own or duplicate KnowledgeNodes or KnowledgeEdges. A shared node may appear in any number of courses.

## 5. Course Graph Projection

`buildCourseGraphData(runtime, userState, knowledgeGraph)` derives chapter, atomic node, edge, assignment, material, and progress presentation data. Projection is pure and receives its data explicitly.

## 6. Layout and Cache

ELK receives the projected structural graph. Its cache key is `courseId + runtime revision`; mode, selection, search, Drawer state, and progress do not invalidate it. React Flow adaptation is also input-driven and does not import a demo course.

## 7. Routing

Generic routes are parameterized by `courseId`, with material routes additionally parameterized by `materialId`. Route ownership is validated. A material from another course is treated as Not Found.

## 8. Course Center

Course cards, metrics, search, progress, and recent activity are computed from repository runtimes and scoped user state. Adding a valid runtime to the repository automatically exposes it to Course Center.

## 9. Course Creation Adapter

`CourseCreationService` is an adapter boundary. The current demo implementation returns the Agentic AI fixture, but that choice exists only in the demo adapter; Atlas and other generic UI consume the returned `courseId`.

## 10. Validation

Runtime validation verifies unique IDs, valid chapter/lesson/course references, complete AssignmentCoverage, valid coverage endpoints, workflow template requirements, and course-owned material mappings before a course is considered ready.

## 11. Multi-course Fixture

Python Engineering is the second full fixture. It exercises dynamic Course Center discovery, generic overview/focused/full graph modes, instruction and workflow Assignments, N:M mappings, materials, and independent user progress without a Python-specific page branch.

## 12. Seed Boundaries

Course-specific text and fixtures live under `src/v2/demo`. Generic pages, projections, repositories, layout, progress, and material services must not encode Agentic AI or Python Engineering IDs or counts.

## 13. Persistence Evolution

The current repository is in-memory demo infrastructure. Its interface is designed so an API-backed repository can replace it without changing routes, projections, or page behavior.

## 14. Non-goals

This version does not implement a production course-generation backend, authoring studio, server synchronization, grading, submission history, or artifact dependency engine.

## 15. Scoped Knowledge Resolution

Course runtime mappings may reference any Global, Tenant, or User KnowledgeNode visible to the active actor. Runtime validation resolves CurriculumCoverage, AssignmentCoverage, and MaterialKnowledgeCoverage through KnowledgeRepository with a KnowledgeAccessContext; `globalKnowledgeGraph` is not the universal Course source.

## 16. Independent Progress Projections

Chapter `knowledgeProgress` is derived from visible UserKnowledgeState mastery, with missing evidence contributing no fabricated mastery. `assignmentSummary.progress` is derived independently from UserAssignmentState. Knowledge and Assignment presentation modes select the corresponding projection.

## 17. Chapter Deep Links

`/courses/:courseId/chapters/:chapterId` validates ownership and opens the existing Course Graph in focused mode at that Chapter. An unknown Chapter renders a safe Not Found state rather than silently returning to Overview.
