# Round 4 — Core Teaching Loop

## Status

Planning baseline. No Round 4 implementation task is complete merely because this document exists.

This document defines the minimum scope boundary and exit contract for Round 4. Detailed implementation Issues may refine internal sequencing, but they MUST NOT silently expand the round beyond this contract or violate `AGENTS.md`.

## Goal

Round 4 turns the Round 3 persisted platform into an end-to-end teaching loop:

```text
Course Material
  -> Parse
  -> Knowledge Extraction
  -> Knowledge Resolution
  -> Knowledge Relation Resolution
  -> Course Projection
  -> Assignment Generation
  -> Workflow Template / Practice Environment
  -> Workflow Runtime
  -> Evaluation
```

A teacher should be able to provide course material, obtain structured course/knowledge/practice data, launch an executable practice, and receive an evaluation result through real application boundaries rather than static demo-only generation or timed runtime simulation.

## Existing Baseline

Round 4 starts from the completed Round 3 architecture:

- one shared `KnowledgeNode` / `KnowledgeEdge` graph;
- separate curriculum entities and coverage relations;
- separate `CourseAssignment` / `AssignmentCoverage`;
- Material and `MaterialKnowledgeCoverage`;
- Supabase-backed Auth, Postgres, Storage, RLS, and repository/API boundaries;
- `CourseRepository` as the course read boundary;
- Workflow Domain, Editor, Runtime contract, persistence contract, and assignment provenance boundaries;
- Local-only acceptance identities and Local Supabase verification;
- Vercel `main` Production deployment backed by Hosted Supabase.

Round 4 MUST preserve these boundaries.

## In Scope

### 1. Material ingestion and parsing

Introduce the application/service contracts required to turn uploaded supported course material into structured source content suitable for downstream extraction.

The parser output must preserve source provenance and addressable material structure. Parsing is not allowed to invent Knowledge Graph facts.

### 2. Atomic Knowledge extraction

Extract candidate atomic knowledge/capability units from parsed material.

A candidate must respect the repository definition of `KnowledgeNode`: independently teachable, assessable, and reusable. Course, Chapter, Lesson, Project, Outcome, Domain, Cluster, and layout/composition entities are not KnowledgeNodes.

Extraction output is candidate data until it is resolved against the shared Knowledge Graph.

### 3. Knowledge identity resolution

Resolve extracted candidates against existing visible KnowledgeNodes before creating new knowledge identities.

Resolution must distinguish at minimum:

- match an existing node;
- create a genuinely new node;
- leave a candidate unresolved for explicit handling when confidence or evidence is insufficient.

Course ownership MUST NOT be introduced into KnowledgeNode scope.

### 4. Knowledge relation reconstruction

For resolved atomic nodes, reconstruct factual `prerequisite`, `enables`, and `related` relations supported by the material/context.

Relation work must include relations that can be lost when composite concepts are atomized. Connectivity or visual neatness is never sufficient evidence for an edge.

### 5. Course projection generation

Create or update curriculum/course projection data by referencing stable KnowledgeNode IDs rather than duplicating graph facts.

Generated course data must preserve the existing separation among:

- Course / Chapter / Lesson;
- CurriculumCoverage / CurriculumSequence;
- Material / MaterialSegment / MaterialKnowledgeCoverage;
- CourseAssignment / AssignmentCoverage;
- shared KnowledgeNode / KnowledgeEdge.

### 6. Assignment generation

Generate valid Assignments and AssignmentCoverage for course knowledge.

Every course KnowledgeNode must continue to have at least one AssignmentCoverage. Assignment remains curriculum/practice data, never a KnowledgeNode.

Assignments may use Workflow Canvas or another declared environment. Do not redefine Assignment as Workflow-only.

### 7. Workflow template generation or selection

For Workflow-mode Assignments, produce or select a valid WorkflowTemplate compatible with the existing Workflow Domain and Editor contracts.

Course/Assignment provenance belongs to the application/integration layer and must not become WorkflowRuntime input.

### 8. Real Workflow Runtime

Replace the demo timed simulation as the production execution authority for the Round 4 acceptance path.

The real runtime must:

- implement the existing `WorkflowRuntime` contract or an intentionally revised generic contract;
- remain Course-independent;
- execute the supported Round 4 workflow subset;
- return explicit success/failure/runtime output;
- preserve application-attached `courseId`, `assignmentId`, and `workflowTemplateId` provenance in persisted Run History when launched from an Assignment.

Do not redesign the Workflow module unless the real runtime demonstrates a concrete contract gap.

### 9. Evaluation

Evaluate the completed practice/run against explicit Assignment expectations.

Evaluation output is runtime/evaluation data. It must not mutate CourseAssignment or WorkflowTemplate definitions.

Round 4 may persist evaluation results required to demonstrate the closed loop, but it must not collapse evaluation into Knowledge mastery.

## Out of Scope

The following are explicitly deferred unless a later approved scope revision says otherwise:

- automatic Knowledge mastery updates from Assignment completion;
- the full Evidence -> Mastery pipeline;
- mastery confidence aggregation;
- recommendation/ranking systems;
- adaptive learning path generation;
- Personal Atlas intelligence beyond consuming existing UserKnowledgeState;
- new Tenant Domain governance;
- new `admin` role ontology;
- OAuth expansion;
- general-purpose LMS features;
- broad analytics dashboards;
- multi-provider AI optimization not required for the accepted Round 4 path;
- speculative graph cleanup or synthetic edges for layout/connectivity;
- Project-board automation;
- unrelated UI redesigns or repository refactors.

These belong to later rounds or separate tasks.

## AI / Model Boundary

Round 4 may add model/provider infrastructure required for parsing, extraction, resolution, generation, and evaluation.

Provider-specific code must stay behind explicit application/service contracts. Core Knowledge, Course, Material, Assignment, and Workflow domain models must not depend directly on a model vendor SDK.

Model output must be validated before becoming authoritative persisted domain data.

Do not persist raw model output as a substitute for normalized domain entities.

## Persistence Boundary

New persisted business data requires normalized schema changes through committed Supabase migrations.

Rules:

- migrations are authoritative;
- Local Supabase verification precedes Hosted migration;
- React business Features do not directly query Supabase tables;
- browser code never receives `SUPABASE_SECRET_KEY`;
- user-owned rows remain protected by RLS;
- AI orchestration may use trusted server-side credentials only behind server/API boundaries.

## Shared Knowledge Graph Invariants

Round 4 MUST preserve:

- one shared Knowledge Graph;
- stable KnowledgeNode identity;
- KnowledgeNode scope exactly `global`, `tenant`, or `user`;
- Course as provenance/curriculum context, not Knowledge ownership;
- `DomainAssignment` as authoritative Domain membership;
- only `prerequisite`, `enables`, and `related` as KnowledgeEdge relation types;
- no fake nodes or edges for chapters, islands, bridges, projects, composition, or visual layout;
- course views as projections over shared knowledge identities.

If a proposed ingestion design requires violating these rules, the design is invalid and must be revised before implementation.

## Workflow Invariants

Round 4 MUST preserve:

- pure Workflow Domain under `src/features/workflow/domain`;
- WorkflowRuntime remains generic and Course-independent;
- Course/Assignment provenance is application/persistence metadata attached to a run, not Runtime input;
- Assignment completion uses explicit validated `courseId`, `assignmentId`, and `workflowTemplateId`;
- independent Workflow runs do not infer Assignment provenance;
- launch provenance is frozen at launch;
- Workflow persistence remains behind its repository contract.

## Assignment and Evaluation Invariants

- Assignment completion is not Knowledge mastery.
- Evaluation output is not Course definition data.
- One Assignment may cover multiple KnowledgeNodes.
- One KnowledgeNode may be covered by multiple Assignments.
- WorkflowTemplate identity alone must never identify the Assignment that launched it.
- Evaluation may become evidence input in a later round, but Round 4 does not automatically promote it to mastery.

## Minimum Acceptance Scenario

Round 4 is not closed until one supported real course-ingestion path can complete this sequence without demo-only shortcuts:

1. An authenticated authorized user supplies supported course material.
2. The source is stored and parsed.
3. Atomic Knowledge candidates are extracted.
4. Candidates are resolved against the shared Knowledge Graph.
5. Factual Knowledge relations are reconstructed and validated.
6. Course curriculum/coverage projection is persisted using stable KnowledgeNode IDs.
7. Valid Assignments and AssignmentCoverage are generated.
8. At least one Workflow-mode Assignment has a valid WorkflowTemplate.
9. The learner can open the generated course path from normal repository-backed UI.
10. The learner launches the Assignment.
11. A real Workflow Runtime executes the supported workflow.
12. Run History persists correct course/assignment/template provenance.
13. An evaluation result is produced and persisted or returned through an explicit evaluation boundary.
14. Assignment completion/progress may update as defined, while Knowledge mastery remains unchanged unless changed by a separate explicit user/evidence mechanism already permitted by current architecture.

## Data Quality Acceptance

For the accepted generated course:

- every persisted KnowledgeNode is valid under atomic-node rules;
- every new KnowledgeEdge is factual and uses an allowed relation type;
- no duplicate shared graph is introduced;
- every course KnowledgeNode has AssignmentCoverage;
- course-owned identity is correctly scoped by `courseId`;
- MaterialKnowledgeCoverage references valid visible nodes;
- generated data passes existing Knowledge and Course invariants;
- unknown or low-confidence model output fails explicitly or remains unresolved rather than being silently promoted.

## Security Acceptance

Round 4 must demonstrate:

- no client secret exposure;
- authenticated server boundaries for ingestion/generation/evaluation operations as appropriate;
- existing RLS ownership isolation remains intact;
- Local-only test/bootstrap commands still refuse Hosted Supabase;
- uploaded source access follows the existing private storage model unless an explicit reviewed change is required.

## Validation Contract

Each implementation Issue must define the subset of validation relevant to its change.

Before Round 4 closure, the full repository validation set must pass:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm audit:knowledge
pnpm audit:client-secrets
pnpm verify:backend:local
pnpm build
```

Any new Round 4 verification command must be documented here and in the appropriate architecture document if it becomes a durable repository workflow.

Round 4 closure also requires:

- Local end-to-end acceptance through Local Supabase;
- Hosted Preview/Production smoke checks appropriate to the changed server paths;
- no new Vercel build TypeScript errors;
- no unexplained runtime 5xx errors on the accepted path.

## Task Definition Rules

Round 4 implementation work should be tracked as independently verifiable GitHub Issues.

Each Issue must define:

- Goal;
- Context;
- Scope;
- Out of Scope;
- Constraints;
- Acceptance Criteria;
- Validation;
- Dependencies;
- Documentation / `AGENTS.md` impact.

An Issue represents an independently verifiable engineering capability, not an individual file edit.

Do not create dozens of micro-Issues for implementation details that cannot be independently accepted.

## Documentation Rules

- `AGENTS.md` stores durable invariants only.
- This document stores Round 4 scope, sequencing assumptions, and exit criteria.
- Architecture documents store stable subsystem design.
- GitHub Issues store task-specific execution contracts.
- PR descriptions record what changed and how it was validated.

Do not duplicate the same rule across multiple documents unless the duplication is necessary to make a safety or acceptance boundary explicit.

## Exit Criteria

Round 4 can be marked complete only when all of the following are true:

- the minimum acceptance scenario works through repository-backed production architecture;
- parsing/extraction/resolution/generation data is normalized and validated;
- the accepted Workflow path uses a real runtime rather than demo timed simulation;
- evaluation is present through an explicit boundary;
- existing Knowledge/Course/Material/Workflow boundaries remain valid;
- Assignment completion remains distinct from Knowledge mastery;
- Local and hosted validation pass;
- new durable constraints are reflected in `AGENTS.md` only where necessary;
- no known Round 4 blocker remains hidden as deferred work.

At closure, record the final accepted commit and deployment separately from this planning document.
