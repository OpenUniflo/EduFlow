# Course Assignment System

## 1. Purpose

EduFlow models two mapped teaching dimensions: Knowledge describes what the learner learns; Assignment describes what the learner does after learning. Every active KnowledgeNode referenced by a course must be covered by at least one course Assignment.

## 2. Terminology

The user-facing views remain `技能树` and `实训树`. Domain and code terminology is `CourseAssignment`, `AssignmentCoverage`, `AssignmentContext`, `assignmentProgress`, and `assignmentCount`.

Assignment is curriculum data. `Assignment != KnowledgeNode`, `Assignment != KnowledgeRelation`, and Assignment never appears as a node in Global or Personal Atlas. A course may define its own Assignment for a reused Global, Tenant, or User KnowledgeNode.

## 3. CourseAssignment schema

`CourseAssignment` owns stable course-local identity, `courseId`, title, description, requirements, expected output, acceptance criteria, mode, optional workflow template, estimated time, and optional project contribution. It is a definition and does not contain user completion state.

## 4. AssignmentCoverage

`AssignmentCoverage(assignmentId, nodeId, role)` connects curriculum work to stable knowledge identity. Roles are `practice`, `apply`, and `assess`. Coverage is N:M: one Assignment may integrate several KnowledgeNodes, and one KnowledgeNode may participate in several Assignments. Coverage is curriculum context, never a KnowledgeEdge.

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
