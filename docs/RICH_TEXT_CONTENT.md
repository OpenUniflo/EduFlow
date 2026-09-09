# Shared learning content

New formal Micro content uses Tiptap/ProseMirror JSON (`type: doc`). Step body (including Summary), success/retry feedback and mechanism `teaching.explanation` / reason feedback accept the same content contract. Existing strings remain supported. This rollout migrates only `ai-agents-in-depth`; no immediate migration of other courses is required.

The database remains runtime authority. Existing `micro_steps.content`, `success_feedback` and `retry_feedback` text columns hold serialized JSON for new content. `/api/micro` decodes explicit documents; ordinary strings stay strings. Mechanism teaching fields already live in JSONB. No DDL, parallel content model or HTML storage is introduced. Flow event messages/explanations and operational labels remain compatible strings; they are not a second rich-text DSL.

`src/shared/content` owns the contract, style allowlist, KaTeX and React renderer. Official Tiptap 3.31.3 core/pm, static-renderer, StarterKit, TextStyleKit, TextAlign and Highlight supply the schema and rendering. No `@tiptap/react` or editor instance is needed. The current TypeScript Node resolution requires the supported package-root static-renderer export; Vite tree-shakes unused exports. Versions are pinned with pnpm 9.15.0 and the lockfile.

Sources checked before installation: [official static rendering](https://tiptap.dev/docs/editor/api/utilities/static-renderer), [TextStyleKit](https://tiptap.dev/docs/editor/extensions/functionality/text-style-kit), and installed package exports/types. Shared Zod checks restrict content and attributes; ProseMirror validates document structure before rendering. Raw HTML is escaped; unsupported documents display the existing unsupported-content fallback. Links allow HTTP(S)/mailto only and always use safe rel attributes. No author-supplied inline CSS, arbitrary px, hex color or font name is accepted.

| Intent | Standard Tiptap attribute / allowed value |
| --- | --- |
| Small / normal / large / xlarge | `textStyle.fontSize`: `0.875em`, `1em`, `1.125em`, `1.25em` |
| Body / display / mono | `fontFamily`: `inherit`, `Inter, sans-serif`, `ui-monospace, monospace` (existing application families) |
| Default / muted / primary / success / warning / danger | `color`: `inherit`, `var(--atlas-muted)`, `var(--atlas-brand)`, `var(--green)`, `var(--amber)`, `var(--red)` |
| Highlight / info / success / warning / danger | `backgroundColor` or Highlight `color`: `var(--panel)`, `var(--atlas-panel)`, `var(--green)`, `var(--amber)`, `var(--red)`; default highlight uses existing amber |
| Alignment | Paragraph/heading `textAlign`: left, center, right, justify |

These are mappings to existing product styles, not a parallel token system. Main prose stays restrained; use true headings, lists for parallel items, sparse emphasis, code for field names, and callouts only for important boundaries. Never communicate a distinction by color alone. Code blocks wrap within cards; text and links break on mobile. Formula content retains explicit `\(...\)` / `\[...\]` through the existing trusted-off KaTeX renderer. Code marks/blocks display literal code. Keep each formula together in one text node; do not split its delimiters across formatting marks.

The teaching contracts are [Observable Learner Action](TEACHING_PATTERN_LIBRARY.md#observable-learner-action-rule) and the global [Student-Facing Content Rule](TEACHING_PATTERN_LIBRARY.md#student-facing-content-rule). Apply both to titles, body/Summary, feedback and all student-visible interaction fields. Source locators and authoring metadata belong outside student prose; retain necessary simulation and factual caveats. When removing a paragraph, remove only newly empty paragraphs/list items and preserve unaffected Tiptap structure and styles. Content audit is semantic review, not a global keyword validator. No Publish Validator, authoring editor, new interaction runtime, grading authority or learner-state changes are included.
