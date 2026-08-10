# Prototype Data Model Freeze

**Status:** FROZEN
**Freeze date:** 2026-08-10

This document is the compact backend handoff index. Detailed invariants remain in the linked system documents and `AGENTS.md`.

## Frozen Models

- Shared Knowledge: `KnowledgeNode`, `KnowledgeEdge`, revisions, evidence, and scoped `UserKnowledgeState`.
- Domain governance: Global-only `KnowledgeDomain`, `DomainAssignment`, candidates, proposals, and explicit visibility/authority inputs.
- Course definition: `Course`, `CourseCurriculum`, `CurriculumChapter`, `CurriculumLesson`, `CurriculumCoverage`, and `CurriculumSequence`.
- Assignment definition: `CourseAssignment`, unique-pair `AssignmentCoverage`, and separate `UserAssignmentState`.
- Material definition: `Material`, `MaterialSegment`, `MaterialKnowledgeCoverage`, and separate `UserMaterialState`.
- User Course persistence: `UserCourseState` in a versioned envelope.

## Single Sources of Truth

- Chapter membership: `CurriculumLesson.chapterId` only.
- Lesson Knowledge order: `CurriculumCoverage.order` only.
- Material Assignment context: `MaterialSegment -> MaterialKnowledgeCoverage -> KnowledgeNode -> AssignmentCoverage -> CourseAssignment` only.
- Domain membership: `DomainAssignment` only.
- Knowledge relations: factual `KnowledgeEdge` records only.
- User progress: user-scoped state and derived projections only, never Course/Chapter/Material definitions.

## Ordering Contract

Chapter, Lesson, Coverage, Material, Segment, and Assignment order are explicit validated data. PDF uses its complete unique page sequence. Canonical shared comparators drive all projections; IDs are identity and final deterministic tie-breaks only. Shuffling repository arrays or replacing IDs with UUIDs cannot change business order.

## Boundary Contract

Core packages do not import Demo fixtures or repositories. Demo depends on Core and is injected at the composition root. Knowledge visibility and Domain mutations receive explicit `KnowledgeAccessContext`; progress is finite `0..100`; runtime relations are validated before projection.

## Final Boundary Cleanup

1. Concrete Knowledge fixtures are owned by `src/v2/demo/knowledge`.
2. Core packages no longer own Demo Knowledge data.
3. Cross-course projections treat Course-owned IDs as scoped by `(courseId, entityId)`.
4. Generic `AtlasHome` contains no concrete Demo course identity.
5. Backend work begins from the existing Repository boundaries after this cleanup.

This cleanup does not reopen the frozen V1 domain model.

## Final Core / Demo Boundary

- Generic `KnowledgeGraph` validation is scope-agnostic.
- Global-only validation is explicit.
- Demo `EdgeSeed` parsing and edge building live in the Demo layer.
- Core/Demo separation is enforced structurally through dependency direction rather than business-string blacklists.

This change does not reopen the frozen V1 data model.

## Deferred Beyond Freeze

Real Knowledge, Domain, Course Creation, Workflow, Evaluation, Auth, and asynchronous query backends remain future adapter/application work. WorkflowTemplate referential integrity waits for a WorkflowRepository, and Assignment completion still uses the current Demo run-end behavior until the Evaluation pipeline exists.
