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

### Required for the navigation MVP

At minimum, a usable Course must have:

- stable Course identity;
- title;
- target outcome / goal description;
- at least one valid Knowledge mapping;
- valid curriculum/graph references required by the current schema;
- a structurally valid Course Graph.

Chapter/Lesson remain part of the current persisted/runtime model where required by the existing schema. Whether Lesson should become optional is tracked separately and must not be changed opportunistically as part of this contract.

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

## 11. Standard and Personal Course

Standard and Personal Courses use the same Course domain concept.

Conceptually a Personal Course may include:

```text
course_type = personal
owner_user_id
source_course_id?    when derived from an existing Course
```

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
