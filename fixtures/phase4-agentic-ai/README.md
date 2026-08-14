# Phase 4 Agentic AI Parser Fixtures

This fixture package is for EduFlow Phase 4.1 material parsing and later Phase 4 end-to-end validation.

## Directory layout

```text
phase4-agentic-ai/
├── corpus/
│   └── AI-Agents-in-Depth-zh-CN-v1.4.pdf
├── fixtures/
│   ├── representative-agent-course.pdf
│   ├── representative-agent-course.pptx
│   └── representative-agent-course.docx
├── invalid/
│   └── not-a-real-pdf.pdf
└── gold/
    └── parsing/
        ├── document-structure.json
        ├── source-locations.json
        └── parsing-cases.json
```

## Canonical corpus

- Title: 深入理解 AI Agent：设计原理与工程实践
- Author: 李博杰
- Version: v1.4, 2026-08-13
- Source repository: https://github.com/bojieli/ai-agent-book
- License: Apache-2.0, with attribution retained in this README.
- Purpose: canonical Phase 4 Agentic AI course corpus for full-book parsing, AI course generation, knowledge graph generation, practice mapping, and E2E validation.

The full-book PDF should not be parsed in normal PR CI by default. Use it for manual verification, parser stress tests, milestone checks, and Phase 4.6 E2E validation.

## Fast parser fixtures

The generated PDF/PPTX/DOCX fixtures are deliberately small but representative. They include headings, body text, bullet lists, tables, a code block, and an Agent diagram image extracted from the canonical corpus. They are intended for fast parser compatibility tests and regular local/CI validation.

## Gold scope

The `gold/parsing` JSON files are Parsing Gold v0 and assert document structure, ordering, and source location/provenance expectations. The separate, human-reviewed `gold/knowledge/chapter-01` package is the Phase 4.2 Knowledge Gold v0.1 oracle for PDF pages 15–35. Production generation never imports it; only the isolated acceptance evaluator reads it.
