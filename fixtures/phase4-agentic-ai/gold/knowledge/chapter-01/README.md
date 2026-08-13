# Phase 4.2 Knowledge Gold — Chapter 1

This package is the first human-reviewed Knowledge Gold baseline for EduFlow Phase 4.2.

## Source

- Corpus: `fixtures/phase4-agentic-ai/corpus/AI-Agents-in-Depth-zh-CN-v1.4.pdf`
- Book: 《深入理解 AI Agent：设计原理与工程实践》
- Author: 李博杰
- Version: v1.4 (2026-08-13)
- Gold scope: Chapter 1, printed pages 7–27 (PDF pages 15–35)

The package contains human-authored summaries/labels derived from the source. It does not copy the chapter text.

## Files

- `source-scope.json` — source identity, page/section scope, annotation principles
- `knowledge-nodes.json` — 28 expected atomic KnowledgeNodes, aliases, mastery criteria, provenance
- `knowledge-relations.json` — reviewed `prerequisite`, `enables`, and `related` relations
- `negative-cases.json` — headings/examples/artifacts that must not become nodes merely because they occur in the source
- `curriculum-reference.json` — one acceptable reference grouping plus hard curriculum invariants
- `evaluation-policy.json` — semantic matching rules and component metrics

## Important semantics

1. **This is Knowledge Gold, not parser output Gold.** Parser expectations remain under `gold/parsing/`.
2. **Do not evaluate by exact title string only.** Aliases and semantic equivalence are intentional.
3. **Do not treat source order as prerequisite truth.** Relations in `knowledge-relations.json` are separately reviewed teaching relations.
4. **Curriculum is not ontology.** Chapter/Lesson grouping is reference curriculum data and must not create Knowledge identity or relation facts.
5. **Negative cases are scoped.** Product/framework names listed as negatives are examples in Chapter 1; they may be valid nodes in another course if they independently satisfy EduFlow's atomic Knowledge definition.
6. **Gold is version-controlled.** Model outputs are not Gold until reviewed and deliberately promoted.

## Repository placement

Copy this directory to:

`fixtures/phase4-agentic-ai/gold/knowledge/chapter-01/`

Do **not** add this Gold directory to `.gitignore`. It is the test oracle/regression baseline and must be reviewed in PRs.

Generated artifacts should live outside the Gold directory, for example:

`tmp/phase4-2-eval/` or another existing ignored build/cache location.

Do not write embeddings, raw LLM responses, ad-hoc run reports, or caches into this Gold directory.
