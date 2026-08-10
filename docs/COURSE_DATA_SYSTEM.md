# Course Data System

## 1. Purpose

The course data system makes every course a runtime data package rather than a page-specific implementation. Agentic AI and Python Engineering are fixtures consumed through the same public boundary.

## 2. Core Boundary

`CourseRepository` exposes `listCourseRuntimes()` and `getCourse(courseId)` only. It returns `CourseRuntimeData`, which contains the course definition, chapters, lessons, curriculum coverage, assignments, assignment coverage, materials, and material coverage.

The repository does not know a user identity and therefore does not return fixed `CourseSummary` status or progress. Application projection combines CourseRuntimeData, LearningProgress, and UserKnowledge through `buildCourseSummary()`.

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

Runtime validation verifies unique IDs for Chapter, Lesson, CurriculumCoverage, CurriculumSequence, Assignment, AssignmentCoverage, Material, and MaterialKnowledgeCoverage. Every Chapter, Lesson, Coverage, Sequence, Assignment, and Material with course ownership must belong to the runtime Course.

Referential validation requires every `lesson.chapterId`, Coverage Lesson/Knowledge endpoint, Sequence source/target, AssignmentCoverage endpoint, Material Lesson/Segment, and MaterialKnowledgeCoverage endpoint to resolve. Sequences cannot self-reference or duplicate the same ordered Lesson pair. AssignmentCoverage is unique by `(assignmentId, nodeId)` regardless of role; exact duplicate MaterialKnowledgeCoverage facts are rejected. Every course KnowledgeNode must still have AssignmentCoverage, and workflow Assignments must still declare `workflowTemplateId`.

Ordering validation requires non-negative integer order values. Chapter, Lesson, and CourseAssignment order are unique course-wide; CurriculumCoverage order is unique within a Lesson; Material order is unique within a Lesson; and MaterialSegment order is unique within a Material. PDF page remains the authoritative complete `1..pageCount` ordering.

## 11. Multi-course Fixture

Python Engineering is the second full fixture. It exercises dynamic Course Center discovery, generic overview/focused/full graph modes, instruction and workflow Assignments, N:M mappings, materials, and independent user progress without a Python-specific page branch.

## 12. Seed Boundaries

Course-specific text and fixtures live under `src/v2/demo`. Generic pages, projections, repositories, layout, progress, and material services must not encode Agentic AI or Python Engineering IDs or counts.

## 13. Persistence Evolution

The current repository is in-memory demo infrastructure. Its interface is designed so an API-backed repository can replace it without changing routes, projections, or page behavior.

## 14. Entity Identity Scope

`KnowledgeNode` identity may be reused by multiple Courses. Course-owned entity IDs are stable within a Course and MUST NOT be assumed globally unique across Course boundaries. Cross-course projections use `(courseId, entityId)` identity or runtime-local lookup; this does not add composite ID fields to persisted entities.

## 14. Non-goals

This version does not implement a production course-generation backend, authoring studio, server synchronization, grading, submission history, or artifact dependency engine.

## 15. Scoped Knowledge Resolution

Course runtime mappings may reference any Global, Tenant, or User KnowledgeNode visible to the active actor. Runtime validation resolves CurriculumCoverage, AssignmentCoverage, and MaterialKnowledgeCoverage through KnowledgeRepository with a KnowledgeAccessContext; `globalKnowledgeGraph` is not the universal Course source.

## 16. Independent Progress Projections

Chapter `knowledgeProgress` is derived from visible UserKnowledgeState mastery, with missing evidence contributing no fabricated mastery. `assignmentSummary.progress` is derived independently from UserAssignmentState. Knowledge and Assignment presentation modes select the corresponding projection.

## 17. Chapter Deep Links

`/courses/:courseId/chapters/:chapterId` validates ownership and opens the existing Course Graph in focused mode at that Chapter. An unknown Chapter renders a safe Not Found state rather than silently returning to Overview.

## 18. PDF Course Material

Course data may reference a stable static PDF through MaterialSource. It owns Material metadata, Page/Segment addresses, and MaterialKnowledgeCoverage; it does not recreate or own the PDF's visual layout. Adding another PDF course requires a source file/URL, Material metadata, one Segment per page, and coverage records, without changes to the generic Reader UI.

## 19. CurriculumChapter

`CurriculumChapter` is static curriculum definition only. It contains neither user `progress` nor a duplicated `lessonIds` list. Chapter knowledge progress and Assignment summaries exist only in user-scoped projections.

## 20. CurriculumLesson Ownership

`CurriculumLesson.chapterId` is the sole authoritative Chapter membership relation. Chapter Lesson lists and counts are derived by filtering runtime Lessons; a Chapter does not store a second copy of membership.

## 21. CurriculumCoverage Ordering

Every CurriculumCoverage has an integer `order >= 0`, representing deterministic instruction/display order inside its Lesson. Primary coverage selects `introduce` first, then earliest `lesson.order`, then `coverage.order`, with stable IDs used only for exact ties.

Course Knowledge ordering is `lesson.order -> coverage.order -> role -> nodeId`, with Coverage ID only as a final deterministic tie-break. KnowledgeNode never receives course-specific Lesson, Chapter, or curriculum-order fields, and changing an ID to a UUID does not change business order.

## 22. User State

Course, Chapter, Assignment, and reading progress are not Course definition data. They belong to `UserCourseState`, `UserAssignmentState`, `UserMaterialState`, `UserKnowledgeState`, or projections derived from those records.

## 23. Canonical Ordering Hierarchy

- Course curriculum: `chapter.order -> lesson.order -> coverage.order`.
- Primary Knowledge coverage: introduce first, then `lesson.order -> coverage.order -> coverage.id` final tie.
- Course Knowledge presentation: `lesson.order -> coverage.order -> role -> nodeId -> coverageId`.
- Materials: `lesson.order -> material.order -> material.id` final tie.
- Non-PDF Segments: `segment.order -> segment.id`; PDF Segments: `page -> segment.id`.
- Assignments: `assignment.order -> assignment.id`.

Changing IDs to UUIDs or shuffling repository arrays does not change business presentation order.
