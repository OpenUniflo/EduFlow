# Phase 4.3 Mapping Gold — Chapter 1

This package is the **human-reviewed Mapping Gold baseline** for EduFlow Phase 4.3.
It is derived from:

1. the existing human-reviewed Phase 4.2 Knowledge Gold for Chapter 1; and
2. the established Agentic AI curriculum design already used by EduFlow.

It deliberately covers a small representative set rather than the whole course.

## Scope

- 10 KnowledgeNodes from the existing Chapter 1 Knowledge Gold
- 10 Knowledge → Material provenance mappings
- 7 representative Practices
- 12 Knowledge → Practice links
- 5 direct Practice prerequisite edges
- 4 representative ChapterOutcomes
- 1 FinalProject reference

The sample covers:
- one Knowledge → one Practice
- multiple KnowledgeNodes → one Practice
- Practice → Practice prerequisites
- Practice → ChapterOutcome
- ChapterOutcome → FinalProject
- non-workflow analysis tasks and workflow-based implementation tasks

## Files

- `knowledge-material-links.json`
- `practices.json`
- `knowledge-practice-links.json`
- `practice-dependencies.json`
- `outcomes.json`
- `evaluation-policy.json`
- `MANIFEST.sha256`

## Important rule

The repository's existing Knowledge Gold policy states that model-produced artifacts do not become Gold
until reviewed and deliberately promoted.

This package has been manually reviewed and promoted to:

`datasetVersion = mapping-gold-v0.1`

`reviewStatus = reviewed`

Repository location:

`fixtures/phase4-agentic-ai/gold/mapping/chapter-01/`

Do not gitignore it. Gold is a version-controlled regression oracle.

Generated Phase 4.3 outputs, LLM responses, evaluation reports and caches should instead go to an ignored
location such as:

`tmp/phase4-3-eval/`

## Design boundary

This Gold does NOT require exact Practice title strings.
The semantic teaching task is what matters.

Knowledge → Material should primarily preserve the existing 4.2 provenance instead of re-running semantic
search over the entire source document.

This dataset is intentionally small. It is for MVP regression and architecture verification, not exhaustive
pedagogical coverage.
