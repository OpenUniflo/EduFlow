# Course Assignment System

## 1. Purpose

EduFlow models two mapped teaching dimensions: Knowledge describes what the learner learns; Assignment describes what the learner does after learning. Every active KnowledgeNode referenced by a course must be covered by at least one course Assignment.

## 2. Terminology

The user-facing views remain `技能树` and `实训树`. Domain and code terminology is `CourseAssignment`, `AssignmentCoverage`, `AssignmentContext`, `assignmentProgress`, and `assignmentCount`.

Assignment is curriculum data. `Assignment != KnowledgeNode`, `Assignment != KnowledgeRelation`, and Assignment never appears as a node in Global or Personal Atlas. A course may define its own Assignment for a reused Global, Tenant, or User KnowledgeNode.

## 3. CourseAssignment schema

`CourseAssignment` owns stable course-local identity, `courseId`, explicit course-wide `order`, title, description, requirements, expected output, acceptance criteria, mode, optional workflow template, estimated time, and optional project contribution. It is a definition and does not contain user completion state.

## 4. AssignmentCoverage

`AssignmentCoverage(assignmentId, nodeId, role)` connects curriculum work to stable knowledge identity. Roles are `practice`, `apply`, and `assess`. Coverage is N:M: one Assignment may integrate several KnowledgeNodes, and one KnowledgeNode may participate in several Assignments. Coverage is curriculum context, never a KnowledgeEdge.

V1 allows at most one coverage for a given `(assignmentId, nodeId)` pair. `role` is one attribute on that relation; changing role does not create a second valid relationship. Projection code must surface duplicate-pair data errors instead of silently overwriting them in a map.

## 5. UserAssignmentState

`UserAssignmentState` stores `assignmentId`, status (`not-started`, `in-progress`, or `completed`), and optional progress. State is separate from CourseAssignment definitions and from UserKnowledgeState. Assignment completion does not automatically set Knowledge mastery.

## 6. Assignment modes

- `instruction`: a self-contained task description with requirements, expected output, criteria, and estimated time.
- `workflow`: the same complete task definition plus a required `workflowTemplateId` and an optional execution action that opens the workflow canvas.

The workflow canvas is an optional execution environment for an Assignment. It is not the Assignment itself, and instruction Assignments do not show a workflow action.

## 7. Assignment generation

Course creation proceeds as:

```text
Upload Materials
  -> Parse
  -> Atomic Knowledge Extraction
  -> Knowledge Relation Extraction
  -> User Knowledge Graph
  -> Curriculum Generation
  -> Chapter / Lesson
  -> Assignment Generation
  -> Assignment Coverage Validation
  -> Course Ready
```

Generation groups genuinely related atomic capabilities into executable tasks. It must not produce placeholder titles such as “学习 X” or “完成 X 练习”.

## 8. Coverage invariant

Before Course Ready, every active KnowledgeNode referenced by CurriculumCoverage must occur in AssignmentCoverage. Coverage references must resolve to an existing CourseAssignment and an existing course KnowledgeNode. Workflow Assignments must have a workflow template. Missing coverage is a data error; UI fallback text is forbidden.

## 9. Skill Tree / 实训树 projection

The two views are stable presentations of one course graph. Each atomic React Flow node renders a Knowledge card and one Assignment companion card inside one fixed footprint. A node with one Assignment shows its title and time; a node with several Assignments shows the unique count and state summary. The companion is not a second graph node.

Switching views changes z-index, transform, opacity, content, and border only. It does not change IDs, topology, ELK inputs, coordinates, pan, zoom, or viewport. The full footprint, including companion offset, is used by ELK in every mode.

Chapter summaries and Atomic Knowledge/Assignment cards use the same companion-layer language. Collapsed Chapters exchange foreground/background companion cards; expanded headers use a restrained slide and crossfade while Atomic cards keep the stronger layer exchange. The graph footprint, coordinates, edges, zoom, and pan remain unchanged.

## 10. Chapter aggregation

Chapter Assignment summary follows `Chapter -> primary KnowledgeNodes -> AssignmentCoverage -> unique assignmentId`. Assignment IDs are deduplicated before count and state aggregation, so one Assignment covering five nodes in a Chapter counts once. Chapter knowledge and Assignment presentations share the same macro position and edges.

Course Assignment summary deduplicates the course Assignment IDs similarly and provides total, completed, in-progress, and progress values for course cards and integrated-project presentation.

## 11. Assignment detail

The existing right-side course Drawer switches entity type between Knowledge Detail and Assignment Detail. Assignment Detail presents associated Knowledge, task description, requirements, expected output, acceptance criteria, estimated time, project contribution, and independent state. A companion with several Assignments provides an in-drawer selector.

## 12. Workflow integration

The “进入工作流画布” action is rendered only when `assignment.mode === "workflow"` and `workflowTemplateId` exists. No KnowledgeNode ID is used to infer workflow availability.

## 13. Integrated project composition

Assignments need not be isolated exercises:

```text
Assignment outputs
  -> may be reused or composed
  -> Chapter Outcome
  -> Course Integrated Project
```

V1 expresses this through `expectedOutput` and `projectContribution`. These outputs remain curriculum artifacts and never become KnowledgeNodes.

## 14. Data validation

Initialization and tests validate complete course-node coverage, reference integrity, workflow template requirements, N:M examples in both directions, unique chapter aggregation, stable atomic footprints, unique node coordinates, and Chapter bounds containing every expanded footprint.

## 15. Evidence relationship

Assignment completion may later produce KnowledgeEvidence for the covered nodes. That pipeline must preserve evidence lineage and remain separate from mastery calculation; completion alone never means 100% mastery.

## 16. Non-goals

V1 does not implement submissions, teacher grading, automatic scoring, an Artifact Graph, Assignment DAG editor, project assembly runtime, full learner history, tenant sharing, a global Assignment library, or backend LLM generation.

## 17. Course Assignment Drawer Projection

Course selection uses a stable `SelectedAnchor`: either `{ kind: "chapter", id }` or `{ kind: "knowledge", id }`. `CourseDetailFacet` is `knowledge | assignment` and is authoritative from the current Course mode.

The Drawer projects the selected Anchor through the active facet:

- Chapter + Knowledge: Chapter introduction, lesson coverage, Knowledge progress, primary atomic KnowledgeNodes, materials, and a light Assignment cross-reference.
- Chapter + Assignment: a deduplicated aggregate of `Chapter → KnowledgeNodes → AssignmentCoverage → unique AssignmentIds`, including completion counts, outcome, Assignment list, and project contributions.
- Atomic + Knowledge: atomic Knowledge definition, curriculum coverage, prerequisites, materials, and a light Assignment cross-reference.
- Atomic + Assignment with one Assignment: direct Assignment Detail.
- Atomic + Assignment with multiple Assignments: Assignment Group first, then an internal Assignment Detail.

Assignment Group is a UI projection, not a business entity. Chapter Assignment View is an aggregate projection, not a `ChapterAssignment` entity. Entering or leaving an Assignment Detail never changes the graph Anchor.

## 18. Course Mode and Drawer Synchronization

Course mode is authoritative for the Knowledge / Assignment facet. When mode changes, the selected Anchor stays, an open Drawer stays open, its facet switches, and graph geometry and viewport stay unchanged. Search and prerequisite navigation set only an Anchor; the active facet remains the current mode. Only the foreground companion layer accepts pointer input.

## 19. Multi-course Identity and Progress

Every Assignment is owned by its `courseId`, while user state is stored separately under the `userId + courseId` scope and keyed by stable `assignmentId`. Completion code must receive the explicit Assignment identity. It must not infer the target from list order, the selected KnowledgeNode, or a workflow template because one template may execute several Assignments.

Workflow launch context carries `courseId`, `assignmentId`, and `workflowTemplateId`. The canvas validates that relationship before updating state. Launching a template without an Assignment context may run the canvas but must not mark an arbitrary Assignment complete.

Course, chapter, and node summaries are projections over unique Assignment IDs. Progress from another user or course is never included.

## 20. Material Integration

Assignments associated with a Material segment are derived through `MaterialKnowledgeCoverage -> KnowledgeNode -> AssignmentCoverage`. The material viewer does not contain course-specific Assignment lookup tables.

`MaterialSegment` has no Assignment ID field, and the viewer never synthesizes fallback AssignmentCoverage. A future product need for a direct Material-to-Assignment fact must introduce a separately identified relation entity rather than another embedded ID list.

A Segment may expose a page-level Assignment projection aggregated across every KnowledgeNode it covers. The Assignment list adjacent to a selected or pinned Knowledge Detail is a different, Knowledge-specific projection: it filters `AssignmentCoverage` by that effective KnowledgeNode ID and deduplicates by Assignment identity. It MUST NOT show unrelated Assignments contributed by other KnowledgeNodes on the same Segment.

While Knowledge Context is pinned, this list remains the Knowledge-specific Assignment Context of the pinned KnowledgeNode even as the active MaterialSegment changes.

## 21. Workflow Run Identity

WorkflowTemplate is reusable execution infrastructure. A run launched from an Assignment records `workflowTemplateId`, `courseId`, and `assignmentId`; an independently opened workflow may omit course context. Run History can therefore filter two Assignments that share one template without reverse lookup.

Assignment completion continues to update explicit UserAssignmentState by Assignment ID. Evaluation results, when present, are runtime/evidence records and remain separate from CourseAssignment definitions and WorkflowTemplate definitions. Current fixed acceptance scores are explicitly a Demo Evaluation adapter.
