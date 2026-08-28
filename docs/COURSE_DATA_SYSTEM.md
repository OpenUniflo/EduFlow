# Course Data System

## 1. Purpose

The Course Data System makes every Course a runtime data package rather than a page-specific implementation.

A Course is a **learning-route container over shared Knowledge**, not a bundle that is valid only when every learning asset exists.

The current navigation model is:

```text
Course
  -> Course Graph       static route space
  -> Learner State
  -> Learning Path      learner-specific dynamic route
  -> Next Action
```

See `LEARNING_NAVIGATION_ROADMAP.md` for the current execution plan.

## 2. Core boundary

`CourseRepository` exposes Course runtime data through generic repository/API boundaries. Pages and generic services must not import individual course seeds or encode known Course IDs/counts.

Course definition/projection remains separate from learner progress/state. Application projection combines Course runtime data with learner-scoped state.

## 3. Runtime identity

Every runtime has a stable `course.id` and a structural revision/version. Unknown IDs are invalid; routing must display Not Found rather than substituting a default Course.

## 4. Shared Knowledge Graph

Courses reference stable shared `KnowledgeNode` IDs through curriculum/coverage relations. They do not own or duplicate KnowledgeNodes or KnowledgeEdges. A shared node may appear in any number of Courses.

Knowledge prerequisite facts remain separate from Course teaching order.

## 5. Course Graph projection

The Course Graph is a static curriculum projection over:

- Course;
- Chapter/Lesson where present;
- CurriculumCoverage / ordering data;
- shared KnowledgeNode / KnowledgeEdge;
- optional asset mappings.

The Course Graph answers:

> What Knowledge is in this Course, how is it organized, and what routes are possible?

It is distinct from the learner-specific dynamic `Learning Path` defined by the navigation roadmap.

## 6. Minimum valid Course contract

A Course may be structurally valid even when learning assets are incomplete.

### Lifecycle validation boundary

A `draft` Course is an authoring container, not yet a learner-usable route. It may temporarily contain zero CurriculumCoverage and therefore zero Course Knowledge, as well as zero Material, Micro, Assignment, Outcome, FinalProject, and `targetOutcome`. Repository hydration applies integrity validation to every entity that does exist: owned references, Course ownership, ordering, cardinality, and visible Knowledge endpoints may not be dangling or cross-Course. Draft incompleteness is valid; corrupted Draft data is not.

A `published` Course is learner-usable and must pass the full minimum Course route validation below. Moving a Draft to `published` is blocked until the minimum route exists. `archived` retains the existing full structural validation behavior; Issue #18 does not redefine archive semantics.

### Required for the navigation MVP

At minimum, a usable Course must have:

- stable Course identity;
- title;
- at least one valid Knowledge mapping;
- valid curriculum/graph references required by the current schema;
- a structurally valid Course Graph.

`targetOutcome` / `courses.target_outcome` is optional Course semantic metadata, not a structural-validity requirement. `null` means that the Course currently has no explicit goal description. A Goal or target outcome may be added or derived later by Goal Resolution / Personal Course flows without changing whether the underlying Course route is structurally valid. When `target_outcome` is present, the current database constraint still requires it to be non-empty after trimming.

Chapter/Lesson remain part of the current persisted/runtime model where required by the existing schema. Whether Lesson should become optional is tracked separately and must not be changed opportunistically as part of this contract.

Referential validation requires every `lesson.chapterId`, Coverage Lesson/Knowledge endpoint, Sequence source/target, AssignmentCoverage endpoint, Material Lesson/Segment, and MaterialKnowledgeCoverage endpoint to resolve. Sequences cannot self-reference or duplicate the same ordered Lesson pair. AssignmentCoverage is unique by `(assignmentId, nodeId)` regardless of role; exact duplicate MaterialKnowledgeCoverage facts are rejected. Workflow Assignments that exist must declare `workflowTemplateId`.

Structural validity requires a non-empty Course curriculum route under the current schema: Course → CourseCurriculum → Chapter → Lesson → CurriculumCoverage → an active KnowledgeNode visible to the validating actor. Material, MaterialSegment, MaterialKnowledgeCoverage, Micro, CourseAssignment, AssignmentCoverage, AssignmentDependency, ChapterOutcome, FinalProject, WorkflowTemplate, and `targetOutcome` are not minimum structural requirements. If any optional asset record exists, all of its existing ownership, ordering, reference, cardinality, and DAG rules still apply.

### Optional assets

The following are **not required for Course structural validity** and may be added later:

- Material / MaterialSegment / MaterialKnowledgeCoverage;
- MicroLearningPath / MicroUnit / MicroStep;
- CourseAssignment / AssignmentCoverage;
- ChapterOutcome / FinalProject;
- WorkflowTemplate / Workflow practice;
- other future LearningAction providers.

A Knowledge node with no Material, Micro, or Assignment is a valid state. Learner UI must present explicit unavailable/empty actions instead of inventing synthetic assets.

## 7. Validation split

Course validation is divided into two layers.

### 7.1 Structural Validation — blocking

Structural validation verifies only invariants required for a coherent Course/runtime, including where applicable:

- unique IDs for Course-owned structural entities;
- Course ownership/reference validity;
- valid Chapter/Lesson references under the current schema;
- valid CurriculumCoverage Knowledge endpoints;
- valid CurriculumSequence endpoints;
- no invalid/self/duplicate ordered structural relation where prohibited;
- non-negative deterministic ordering values;
- required Course Graph references resolve;
- graph/curriculum invariants required by the current projection hold.

A structural failure blocks publication/use of that runtime.

### 7.2 Asset Coverage Audit — non-blocking

Asset coverage reports completeness without determining Course validity.

Examples:

```text
WARN 8 Knowledge nodes have no Micro
WARN 12 Knowledge nodes have no Material
WARN 18 Knowledge nodes have no Assignment
Asset completeness: 42%
```

Missing Material/Micro/Assignment/Workflow is a warning, not a structural failure.

The previous invariant that **every Course KnowledgeNode must have AssignmentCoverage** is retired for the navigation MVP.

Workflow-specific validation applies only when a Workflow-mode Assignment actually exists.

## 8. Course Import Contract

V0 must support adding a Course without product-code changes by importing valid structured data through supported persistence/seed/import tooling.

The import contract should be able to represent at minimum:

```text
Course
Chapters / Lessons                when required by current schema
CurriculumCoverage
Course target Knowledge
optional target outcome / goal description
optional CurriculumSequence
optional Materials
optional Micro content
optional Assignments
optional Outcomes / Workflow data
```

Acceptable first implementation forms include:

- committed SQL/seed data;
- Supabase-compatible structured import;
- a validated JSON/import script.

A dedicated import UI is not required for V0.

After import, the normal API-backed CourseRepository must discover the Course automatically.

## 9. Course Center and discovery

Course cards, search, learner membership/progress, and recent activity are projections over repository runtimes plus learner state.

Adding a valid persisted/published Course through the supported data path must expose it through Course discovery without adding a page-specific branch.

`published` means available to eligible learners; it does not itself mean the Course belongs to a learner's `My Courses` membership.

## 10. Course creation adapters

AI/manual Course creation is an application adapter over the same Course contracts.

Automatic arbitrary material -> Course generation is **not required** for the current navigation MVP.

Goal-driven Personal Course creation should prefer selecting/projecting shared Knowledge and should not require Material, Micro, Assignment, or PPT generation.

Goal Planner does not itself create a Personal Course. It persists a `CourseCreationBrief` in the owning Assistant timeline and hands the Creator only the owning message reference. The minimum Brief contains the Goal, validated target Knowledge snapshot, optional readable `sourceCourseId`, optional requested adjustments, and optional reference-material intent. Reference Material is never a creation prerequisite. The learner adapter re-reads and validates the Brief through the authenticated Assistant boundary before any Course-domain write. The teacher adapter instead constructs the same structured `CourseCreatorInput` from explicit Requirements controls and active repository Knowledge; it does not manufacture a Brief or parse prose into authority.

Course Creator uses one fixed pipeline for every input combination:

```text
Requirements -> Knowledge Scope -> Curriculum Structure -> Learning Assets
             -> persisted Course Draft -> Learner Preview / explicit Publish
```

Course, Material, Knowledge, learner context, and a supported Golden scenario are Creation References, not creation modes. Both `/courses/create` and `/teaching/create` render the same six-stage workspace, design model, Proposal reducer, preview, deterministic validation, confirmation boundaries, and Apply path. Steps 1-4 are a client design preview anchored by the validated entry input; changing an upstream confirmed output invalidates downstream results. Raw `requestedAdjustments` remains a supplemental requirement until a stage-owned structured proposal separates foundation, constraint, preference, and scope changes; punctuation is not a semantic parser. Scope Apply always normalizes factual prerequisite closure from the current Target set; every derived prerequisite is a separate read-only item and prerequisite labels are not directly editable. Step 4 distinguishes actual included coverage, reference assets available to reuse, missing coverage, and a desired Asset Plan. Desired markers never manufacture Material, Micro, or Assignment.

Step 5 is the first Course-domain write and displays the real persisted result before another confirmation. Personal creation uses `courses.creation_brief_message_id` as its unique recovery/idempotency key and stores only confirmed Creator metadata needed for restoration. Standard teacher creation uses the existing canonical Course draft plus `CourseAuthoringDraftRepository`, including revision-checked recovery and transactional Publish. Step 6 reuses the real Course graph/learner projection and changes `draft -> published` only after explicit user action and validation. Personal completion opens the learner Course; Standard completion enters the existing advanced Design Mode for optional deeper editing. Missing assets remain warnings. Arbitrary Material extraction/alignment and full asset generation remain deferred.

Course inclusion, prerequisite reachability, and activity actionability are three separate projections. Included means the active Knowledge identity is referenced by real CurriculumCoverage. Reachable means its factual `prerequisite` predecessors satisfy the learner-state rule; curriculum sequence and display order do not grant eligibility. Actionable means at least one real Course-context activity can be launched: Course Material, Course Micro (including valid Global Micro fallback in an explicit Course context), or CourseAssignment. The shared asset audit reports structure separately from Material/Micro/Assignment gaps and never manufactures fallback records. A structurally valid Course may therefore be included and reachable while having no executable activity.

Learner and teacher/admin creation now share one literal Course Creator UI and fixed pipeline. Entry adapters differ only where product authority differs: the learner validates an Assistant Brief and creates an owner-private Personal Course, while the teacher supplies explicit Requirements and creates a Standard Course authoring draft. The advanced Design Mode remains a downstream Standard-Course editing surface after the fixed creation flow; it is not a second creation mode or Course ontology.

## 11. Standard and Personal Course

Standard and Personal Courses use the same Course domain concept.

The persisted Course discriminator and ownership fields are:

```text
course_type = personal
owner_user_id
source_course_id?    when derived from an existing Course
```

`course_type = standard` requires no learner owner. `course_type = personal` requires an owner and permits `draft`, `published`, or `archived`. A Personal Draft is owner-private and preview-only: learner progress, start, activation, and submission actions stay unavailable. Explicit completion requires the full minimum route. Completion activates the owner's `UserCourseState.isActive` membership so the Course appears in My Courses, but does not start the first Knowledge or create mastery. Standard published Courses keep the existing public/authenticated visibility; Personal Courses and every Course-owned child row are owner-only, including from other learners, teachers, administrators, and anonymous users.

`CourseTargetKnowledge(course_id, knowledge_id, required)` stores the structured Knowledge destination. It is distinct from optional human-readable `targetOutcome`, and each target must be visible, active, and covered by the Course curriculum. A Goal-driven Personal Course contains the target set plus the deterministic factual prerequisite closure in a minimal Course-owned curriculum. It reuses KnowledgeNode and KnowledgeEdge identities and may validly contain no Material, Micro, Assignment, Outcome, or FinalProject.

Personal Course is needed only when the learning goal/scope itself differs from existing Courses.

A learner-specific dynamic Learning Path inside a standard Course does **not** require copying that Course into a Personal Course.

## 12. Entity identity scope

`KnowledgeNode` identity may be reused by multiple Courses. Course-owned entity IDs are stable within a Course and must not be assumed globally unique across Course boundaries. Cross-course projections use Course context plus entity identity as required by the runtime model.

## 13. Persistence

Course runtime data is persisted and read through the API-backed repository/application service layer and Supabase-backed backend contracts.

Demo fixtures may remain for examples/tests, but they must not be authoritative for normal runtime behavior.

React feature/domain code must continue to respect repository/API boundaries rather than querying Supabase tables directly.

## 14. Scoped Knowledge resolution

Course runtime mappings may reference Global, Tenant, or User KnowledgeNodes visible to the active actor. Runtime validation resolves Knowledge endpoints using the applicable access context; a separate Course-owned Knowledge ontology must not be introduced.

## 15. Progress and learner state

Course, Chapter, Assignment, Material, Micro, and Knowledge learner state are not Course definition data.

Keep distinct concepts distinct:

```text
Course Progress
!= Micro Progress
!= Assignment State
!= LearnerKnowledgeState
```

The current learner Knowledge status remains user-scoped. Course presentation must not claim that a globally mastered Knowledge necessarily means every Course-specific requirement is completed.

## 16. Ordering contract

Canonical business ordering remains explicit data; IDs are identity and deterministic tie-breakers only.

Under the current schema:

- Course curriculum: `chapter.order -> lesson.order -> coverage.order`;
- primary Knowledge coverage: role/order rules defined by curriculum projection;
- Materials: curriculum context -> material order -> stable tie-break;
- PDF Segments: page order is authoritative;
- Assignments: assignment order -> stable tie-break.

Shuffling repository arrays or replacing IDs with UUIDs must not change business order.

## 17. Routing and deep links

Generic routes remain parameterized by stable Course/entity IDs. Route ownership must be validated. Unknown or cross-Course entity references render a safe Not Found/unsupported state rather than silently substituting another asset.

## 18. Non-goals for the current V0 contract

V0 Course Foundation does not require:

- automatic document parsing/course generation;
- Material completeness;
- Micro completeness;
- Assignment completeness;
- real Workflow Runtime;
- automatic evaluation/mastery;
- ML recommendation;
- Capability/Evidence advanced modeling;
- a Course import UI.

The goal is simply:

> A structurally valid Course route can enter the database and normal product runtime without code changes, while missing learning assets remain explicit non-blocking gaps.

## 19. Normalized Course import details

The accepted MVP import path is a Supabase-compatible SQL/seed transaction against normalized tables. No import UI or Course-specific frontend registration is required.

Required records, inserted in dependency order:

1. An active KnowledgeNode and its current KnowledgeNodeRevision must already exist and be visible to the learner/actor who will load the Course. Imports reference stable Knowledge IDs; they do not duplicate Knowledge.
2. One `courses` row with a unique stable `id`, non-empty `title`, `description`, and `revision`. `generation_status = 'ready'` is the accepted directly discoverable import state; target outcome, subtitle, and accent color are optional.
3. Exactly one `course_curricula` row for the Course, with a unique curriculum ID and valid generation mode.
4. At least one `curriculum_chapters` row owned by the Course.
5. At least one `curriculum_lessons` row owned by the Course and referencing an owned Chapter. Lesson remains required by the current schema; making Lesson optional is outside this contract.
6. At least one `curriculum_coverages` row owned by the Course and referencing an owned Lesson plus the existing visible active KnowledgeNode.

Chapter and Lesson orders are non-negative and unique course-wide. CurriculumCoverage order is non-negative and unique inside its Lesson. Course-owned IDs are resolved with `course_id`; cross-course references are invalid. Optional CurriculumSequence rows must reference owned Lessons and remain valid structural input.

The following tables may contain zero rows for an imported Course: `course_assignments`, `assignment_coverages`, `assignment_dependencies`, `chapter_outcomes`, `assignment_outcome_compositions`, `final_projects`, `final_project_outcome_compositions`, `materials`, `material_segments`, and `material_knowledge_coverages`. Micro content and Workflow templates are separate optional domains and are not required by the Course import.

`generation_status` is the existing generation/pipeline state and remains distinct from the persisted `courses.lifecycle` value. A directly imported learner-usable Course uses `generation_status = 'ready'` and `lifecycle = 'published'`; an incomplete authoring container uses `lifecycle = 'draft'` and remains teacher/admin-only until it passes the minimum route gate.

Import verification is:

1. Run the SQL in a transaction and confirm every required row persists without optional asset rows.
2. Request authenticated `GET /api/courses` and confirm the Course runtime contains the required route plus empty optional arrays.
3. Hydrate `ApiCourseRepository`; `validateCourseRuntime` must pass.
4. Confirm Course Center discovery and open Overview/Focused/Full Course Graph projections.
5. Run `auditCourseAssetCoverage`; missing assets must appear as warnings/information and must not become fake content or structural errors.

Because every stage enumerates normalized records generically, adding another conforming Course requires data changes only, not product-code changes. A new importer helper would duplicate this already testable path and is therefore not part of the MVP.

## 20. Asset Coverage Audit implementation

`auditCourseAssetCoverage(runtime)` is a pure, non-blocking audit. It reports total Course Knowledge plus covered/missing counts and IDs for AssignmentCoverage and MaterialKnowledgeCoverage. It also reports ChapterOutcome and FinalProject gaps. These findings describe asset completeness only and never determine structural validity.

`CourseRuntimeData` currently has no Micro ownership or coverage relation. The audit reports Micro coverage as unavailable information rather than guessing from unrelated data or importing the Micro domain into the Course runtime. A future Micro-aware audit must compose through an explicit Micro boundary.

Course type (`standard | personal`), `owner_user_id`, and `source_course_id` are deferred to #20 / V1B because Issue #18 has no current runtime or persistence need for those fields.
