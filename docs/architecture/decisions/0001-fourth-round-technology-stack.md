# ADR-0001: Phase 4 Default Technology Stack

- Status: Accepted
- Date: 2026-08-13

## Context

Phases 1–3 established feature/domain boundaries, Workflow separation, and a real Supabase-backed data path. Phase 4 must implement the first real teaching loop without replacing those foundations or introducing infrastructure whose problems have not yet appeared.

## Decision

Use the following default stack for Phase 4:

| Capability | Decision |
|---|---|
| Product database | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Source material storage | Supabase Storage |
| Document parsing | Docling |
| Parser deployment | lightweight Python worker |
| Structured material model | EduFlow-owned `CourseMaterial` |
| Knowledge extraction | structured LLM output behind adapter |
| Alternative extraction experiment | Docling Graph adapter |
| Knowledge alignment retrieval | Supabase pgvector |
| Course prerequisite DAG | EduFlow-owned logic |
| Knowledge/Material/Practice mapping | EduFlow-owned logic |
| Workflow canonical model | EduFlow-owned `WorkflowDefinition` |
| Workflow execution | LangGraph behind runtime/compiler adapter |
| Deterministic practice validation | EduFlow Rule Validator |
| Semantic practice evaluation | DeepEval behind evaluator adapter |
| Authoritative Run / Step / Acceptance data | Supabase PostgreSQL |

## Required adapter boundaries

External technologies must not become product domain types.

Recommended contracts include:

- `DocumentParser` -> `DoclingParser`
- `KnowledgeCandidateExtractor` -> `LLMExtractor`, optional `DoclingGraphExtractor`
- `KnowledgeSimilarityRepository` -> `SupabasePgvectorRepository`
- `WorkflowRuntime` -> `LangGraphWorkflowRuntime`
- `SemanticEvaluator` -> `DeepEvalEvaluator`

## Consequences

### Positive

- Reuses mature open-source infrastructure where EduFlow has no product advantage in reimplementing it.
- Keeps one authoritative product database.
- Preserves the current Repository/domain separation.
- Makes parser, vector, runtime, and evaluator technologies replaceable.
- Concentrates custom engineering on teaching semantics and verifiable learning outcomes.

### Cost / constraints

- A Python execution environment is required for the initial parser worker and likely the LangGraph runtime if the Python implementation is selected.
- Adapter contracts and mapping tests are required to prevent vendor models leaking into domain code.
- LLM pipeline quality must be measured per stage rather than assumed from end output.

## Revisit triggers

This ADR should be revisited when a deferred option in ADR-0002 meets one of its explicit trigger conditions or when a default technology cannot meet measured production requirements after appropriate tuning.
