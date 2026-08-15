# Phase 4 — Core Business Loop Architecture

## 1. Goal

Phase 4 turns the engineering and data foundations from Phases 1–3 into EduFlow's first real end-to-end teaching loop:

```text
Upload course material
  -> parse and structure
  -> AI knowledge modeling and course generation
  -> knowledge/material/practice mapping
  -> authoring chat / human review
  -> student learning
  -> real Workflow execution
  -> automatic acceptance
```

The success boundary is a vertical product slice, not a count of implemented features.

## 2. Existing boundaries to preserve

Phase 4 builds on the current repository architecture:

- `docs/BACKEND_ARCHITECTURE.md`: browser -> Repository contract -> `/api` -> Supabase PostgreSQL/Auth/Storage; feature/domain code does not import Supabase directly.
- `docs/WORKFLOW_ARCHITECTURE.md`: Workflow domain/editor/application/runtime/repository boundaries are already separated; the current Demo runtime is explicitly replaceable.
- `docs/MATERIAL_SYSTEM.md`: `MaterialSegment` is the addressable reading unit and `MaterialKnowledgeCoverage` is the N:M content-to-Knowledge mapping.
- `docs/KNOWLEDGE_ARCHITECTURE_V1.md`: Knowledge is a stable domain model rather than a course-page artifact.

Phase 4 should extend these contracts instead of bypassing them with vendor-specific models.

## 3. Default architecture

```text
                               EduFlow
                                  |
             +--------------------+--------------------+
             |                    |                    |
             v                    v                    v
      Material pipeline     Knowledge pipeline    Practice runtime
             |                    |                    |
          Docling          Structured LLM         EduFlow-owned
        Python worker          outputs         WorkflowDefinition
             |                    |                    |
             v                    v                    v
       CourseMaterial        align / DAG           LangGraph
             |                    |                    |
             +----------+---------+---------+----------+
                        |                   |
                        v                   v
                    Supabase            Acceptance
             PostgreSQL/Auth/Storage   rules + DeepEval
                        |
                     pgvector
```

Supabase remains the authoritative product data platform. External technologies are adapters, not domain authorities.

### Implemented preflight foundation

Before Phase 4.1, the repository has an opt-in embedding preflight: server-only DMXAPI configuration, a minimal native-fetch `EmbeddingService` using the OpenAI-compatible Embeddings protocol with `text-embedding-3-small`, an explicit request for 1024 dimensions, and a migration-managed pgvector extension in Supabase. Provider identity, protocol compatibility, and model identity remain separate configuration facts. Live verification on 2026-08-13 confirmed that DMXAPI honored `dimensions: 1024`; the local path stored those real vectors in a session-local `extensions.vector(1024)` table and produced the expected semantic ordering without committing an unresolved permanent Knowledge embedding schema.

This preflight does not implement parsing, extraction, alignment decisions, Knowledge mutation, indexing, or model routing.

## 4. Phase 4.1 — Material parsing and structuring

### Default

Use Docling through a lightweight Python parser worker.

```text
Supabase Storage
  -> Parse Job
  -> Python Parser Worker
  -> DoclingDocument
  -> Docling adapter
  -> EduFlow CourseMaterial
```

### EduFlow-owned model

`CourseMaterial` should expose stable product concepts such as:

- Document
- Section
- Page / Slide
- ContentBlock
- Chunk
- SourceLocation

Do not expose `DoclingDocument` directly throughout the application.

Keep the original parsed Docling artifact so CourseMaterial normalization can be re-run without reparsing the source binary.

### Success

Real PDF/PPTX/DOCX input produces persistent, traceable structured material with source locations suitable for downstream AI processing.

## 5. Phase 4.2 — AI knowledge modeling and course generation

Use an explicit pipeline rather than one unconstrained Agent:

```text
CourseMaterial
  -> section-aware high-recall candidate extraction
  -> deterministic normalization and exact deduplication
  -> ingestion-local embedding duplicate retrieval
  -> scoped equivalence classification
  -> embedding-assisted section coverage audit and one-pass recovery
  -> bounded local candidate admission (KEEP / DROP / SUBSUMED_BY)
  -> embedding/provenance relation-pair retrieval
  -> bounded pair classification (prerequisite / enables / related / none)
  -> deterministic graph validation
  -> User Knowledge creation with provenance
  -> chapter organization
  -> Course Skill Tree
```

Each stage has structured input/output, can be retried independently, records model/version metadata, and can be evaluated separately.

The Phase 4.2 structured-output boundary distinguishes semantic corruption from a bounded representation mismatch. Missing, empty, or wrongly typed required fields still fail validation and use the existing bounded retry. A model response containing more than two otherwise valid mastery criteria is deterministically trimmed, deduplicated, capped to the compact generated-candidate representation, and recorded as a validation warning; this repair does not change candidate identity, type, or provenance.

Candidate admission is a local ontology quality gate over already extracted and recovered candidates, limited source evidence, and nearby ingestion-local candidates. It does not regenerate a Chapter or the whole ontology. `SUBSUMED_BY` is a granularity decision, not semantic duplicate identity and not a new KnowledgeRelation; only admitted candidates enter the final Knowledge set.

### Candidate extraction

Default to structured LLM output behind a `KnowledgeCandidateExtractor` contract.

Docling Graph may be evaluated as an alternative extractor adapter. It must not directly define the Course Skill DAG.

### Knowledge ingestion boundary

Knowledge Architecture v1 supersedes the earlier automatic Global alignment proposal for ingestion. Phase 4.2 creates source-traceable User Knowledge owned by the authenticated actor. It does not retrieve, map, merge, promote, replace, or align against Global or Tenant Knowledge.

Embedding-based similarity is used inside one course-ingestion run only to retrieve candidate duplicate pairs, nearby Knowledge for section coverage review, and plausible relation pairs. Vectors stay in run memory; cosine similarity never merges Knowledge or creates a KnowledgeEdge. Scoped LLM judgments decide candidate equivalence and classify each retrieved unordered pair, while deterministic validators remain authoritative. This path never searches or aligns Global/Tenant Knowledge and adds no persistent pgvector candidate schema. Gold embeddings remain isolated evaluator inputs.

### Prerequisite semantics

A generic content relation is not a teaching prerequisite. `prerequisite_of` remains an EduFlow-owned teaching decision with validation for self-edges, cycles, duplicates, invalid references, and unsupported relations.

For the Phase 4.2 MVP, relation classification is precision-first: insufficient, proximity-only, order-only, part/whole, or similarity-only evidence produces `NONE`. Omission is preferable to an unsupported learning edge; higher relation recall remains a post-MVP quality optimization.

The v1 domain continues to support `prerequisite`, `enables`, and `related`. Phase 4.2 automatic generation is deliberately narrower: it publishes supported prerequisite facts only, rejects a prerequisite when the classifier rationale explicitly relies on document order, and suppresses generated `enables`/`related` facts. Live MVP evidence showed that those associative types dominated graph density and were not reliable enough to publish. This is a generator policy, not an ontology change; manually governed and future higher-confidence pipelines may still use every v1 relation type.

Phase 4.2 MVP acceptance prioritizes a stable complete generation, graph invariants, traceability, curriculum/Skill Tree handoff, and a readable precision-first teaching path. One canonical live run plus one independent same-configuration sanity repeat is the merge gate. Gold node/relation metrics, relation recall, and cost remain reported diagnostics rather than fixed MVP thresholds. Formal three-or-more-run statistical stability remains post-MVP model-quality work.

## 6. Phase 4.3 — Knowledge / Material / Practice mapping

This remains EduFlow domain logic.

Core relationships:

```text
Knowledge <-> MaterialSegment
Knowledge <-> Practice
Practice -> Practice
Practice -> ChapterOutcome
ChapterOutcome -> FinalProject
```

`MaterialKnowledgeCoverage` remains the formal N:M material mapping rather than inferring Knowledge from titles or page numbers.

Not every Knowledge node must map to a Workflow. Practice types may include analysis, quiz, template experiment, workflow, and project tasks.

Phase 4.3 Gold uses `Practice` as human evaluation terminology. The production domain continues to use the existing `CourseAssignment` and N:M `AssignmentCoverage`; Gold objective and deliverable semantics map to Assignment description and expected output rather than defining a parallel Practice schema. `instruction` remains the representation for non-canvas tasks, while `workflow` is used only with an existing valid Workflow template.

Course planning is goal-constrained rather than one-Assignment-per-Knowledge:

```text
Conversation / Material -> persisted Course target outcome
Course target outcome + existing Course Knowledge DAG
  -> validated Implementation Steps over real Knowledge IDs
  -> exactly one CourseAssignment per Step (MVP)
  -> AssignmentCoverage -> Assignment DAG
  -> ChapterOutcome -> FinalProject
```

The goal determines direction while existing atomic Knowledge determines the allowed decomposition. The planner may group several KnowledgeNodes into one coherent implementation milestone, but it cannot invent Knowledge, omit Course Knowledge coverage, or create a catch-all task solely to reduce task count. Assignment identity derives from Course identity plus the stable grouped Knowledge set, not model response order or presentation text. Knowledge prerequisite ancestors expand bounded dependency candidates; the model still decides direct teaching/execution prerequisites, followed by DAG validation and transitive reduction.

Future course-authoring orchestration may use LangGraph pause/resume and checkpoints for `Generate Knowledge -> Human Review -> Generate Assignments -> Human Review -> Finalize`. That authoring state machine is separate from learner-facing `WorkflowDefinition` execution and is not implemented in Phase 4.3.

Direct Assignment prerequisites are persisted as course-owned `AssignmentDependency` records and validated as a DAG independently from Knowledge topology. Stable `ChapterOutcome` and `FinalProject` identities plus explicit composition relations represent `Assignment -> ChapterOutcome -> FinalProject`; chapter outcome and project-contribution strings remain display content rather than relationship keys.

Material coverage is resolved deterministically from persisted Phase 4.2 material provenance. PDF source pages resolve to the matching one-page MaterialSegments; exact non-PDF section locations may resolve to explicitly addressed Segments. Ambiguous or missing addresses fail for review and are never replaced with whole-document embedding search or order-based guesses. Provenance alone yields the conservative `explain` role because it does not prove first introduction.

## 7. Phase 4.4 — Real Workflow runtime

Keep `WorkflowDefinition` owned by EduFlow and compile/adapt it to LangGraph:

```text
React Flow editor
  -> EduFlow WorkflowDefinition
  -> LangGraphCompiler / WorkflowRuntime adapter
  -> LangGraph execution
  -> EduFlow Run / Step persistence
```

Do not persist LangGraph-specific JSON as the canonical product model.

Phase 4 runtime scope is intentionally limited to teaching requirements: graph validation, LLM/tool nodes, state passing, routing/conditions, basic retry/error handling, pause/resume where required, and durable Run/Step records.

Do not build a general LangGraph replacement.

## 8. Phase 4.5 — Automatic acceptance

Use two layers:

```text
AcceptanceSpec
  -> deterministic Rule Validator
  -> semantic evaluator when needed
  -> AcceptanceResult
```

Deterministic checks have priority for graph structure, required nodes, schemas, actual tool calls, run status, limits, and expected machine-verifiable outputs.

DeepEval may back a semantic evaluator adapter for open-ended task completion, quality, tool-choice, argument-quality, or plan-quality checks.

Authoritative `PracticeAttempt`, evidence, and `AcceptanceResult` remain in EduFlow PostgreSQL.

## 9. Phase 4.6 — Authoring Chat & Human Review

Phase 4.6 turns the current single-turn CourseIntent surface into a persistent course-authoring conversation and review flow. It should support the smallest product contract needed for:

- persistent Conversation / Message history;
- multi-turn context across course creation and clarification;
- uploaded material/file context;
- persisted CourseIntent / target outcome context;
- `Generate Knowledge -> Human Review/Edit -> Resume`;
- `Generate Assignments -> Human Review/Edit -> Resume`;
- final course confirmation/finalization;
- reopening an interrupted authoring session without rebuilding context manually.

The implementation should preserve human-approved Knowledge and Assignment state as EduFlow-owned domain data. LangGraph pause/resume/checkpoints may be used to orchestrate authoring HITL once the concrete workflow requires them, but the authoring state machine remains separate from learner-facing `WorkflowDefinition` execution.

Phase 4.6 is not a general-purpose chat platform. The MVP is complete when the existing homepage conversation can carry one course-creation session through clarification, generated Knowledge review, generated Assignment review, and finalization with persistent state.

## 10. Phase 4.7 — End-to-end closeout

Using real Agentic AI material, without manually editing database rows or depending on production DemoRepository/fixtures, the system must:

1. start from the homepage course-authoring conversation and upload/source context;
2. parse source material into structured CourseMaterial;
3. generate User Knowledge and a valid Course Skill DAG;
4. let the author review/edit the Knowledge result and continue;
5. establish formal Material and Assignment mappings and let the author review/edit Assignments;
6. finalize the course and let a learner navigate from Knowledge to real material and practice;
7. execute the Workflow through a backend runtime;
8. persist Run/Step evidence;
9. return persistent pass/fail/review acceptance feedback;
10. rerun the complete real flow without manual database fixes or DemoRepository fallbacks.

## 11. Phase 5 boundary

Phase 4 records raw learning, runtime, acceptance, and course-authoring evidence. It does not yet turn that evidence into the full Mastery model, Personal Knowledge Atlas, connection analysis, recommendation, adaptive learning paths, class analytics, or a full teacher analytics dashboard.
