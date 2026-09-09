# Observable Micro Action and Shared Rich Text — Acceptance

Date: 2026-09-09. Single Agent. Branch `feat/gold-course-learning-loop`; no prototype merge.

## Baseline

Starting local and fetched remote HEAD: `745798b2d79fa254971b834faf2aeba661e1e3d3`; clean working tree; 16 ahead / 0 behind `origin/prototype`. pnpm-only, packageManager `pnpm@9.15.0` unchanged. Hosted project `uyljtdbvlivxniililay` matches the Preview's public client URL. All 45 pre-existing migrations matched, through `20260909104256`.

Hosted runtime authority is normalized Course/Micro tables, served through `/api/micro`. Prior JSON/TS fixtures are historical/offline authoring inputs. Target remains 12 Published Micro / 65 Steps; Lesson 1 has 52, CTX01 7, RT01 6. S02 had 5 Steps / no interaction. Hosted overall has 19 Paths / 103 Steps; Local overall has 18 / 101, so acceptance did not assume environment-wide fixture equality.

Baseline typecheck, lint, full tests (81 files / 512 tests), production build, Vercel generated build, generated Micro verifier, 23 Micro V2 SQL/TS probes + historical/H5P replay, and Local learning-loop verifier passed. Existing large-bundle warning retained.

## Teaching and content

[Global contract](../docs/TEACHING_PATTERN_LIBRARY.md) now directly replaces private prediction / silent-or-oral recall exceptions with Observable Learner Action. Required task → actual corresponding input/state change → system response. Pure teaching/demonstration/feedback/Summary remains valid without interaction. Continue is browsing, never a correct answer, comprehension or mastery. Runtime demonstration acknowledgment and draft-preview browse acknowledgment follow that distinction.

[Full semantic Step audit](rich-text-action-audit.md) covers all 65 Steps. Required unobserved tasks: **5 → 0**. Unsupported capability/understanding wording: **3 → 0**. A02 s5, R10 s2/s3/s5, S03 s5 and CTX01/RT01 Summary corrected; R10 s1 also loses assumed learner knowledge. S02 s4 now asks how to handle a wrong sales total despite successful sandbox isolation; choice/retry feedback tests the result-validation boundary. No new Step, pattern, runtime or learning-state semantics.

All 65 bodies, all existing Step feedback and existing mechanism teaching explanation/reason content use standard Tiptap JSON. Lists represent real comparisons and process stages, headings identify summaries, code marks identify message fields, sparse emphasis identifies responsibilities, and source locators use secondary typography. No formatting quota forced decorative examples into formal teaching.

## Architecture and compatibility

[Content contract and style policy](../docs/RICH_TEXT_CONTENT.md). Official Tiptap 3.31.3: core, pm, static-renderer, starter-kit, extension-text-style, extension-text-align, extension-highlight; exact versions and pnpm lock. No editor instance or `@tiptap/react`. Measured main bundle gzip: 1,464.62 → 1,565.90 kB (+101.28 kB); this is the cost of the official schema/static renderer rather than hand-written rich-text infrastructure. Shared Zod allowlist, ProseMirror structural check and static React renderer. Canonical JSON in existing text columns; API decoding preserves legacy strings. **Schema DDL = 0.**

Legacy explicit TeX delimiters retain original KaTeX security settings. Native Flow, choice, categorize, ordering, simulation and data-transform remain the existing runtime. Nested mechanism feedback is rendered directly; numeric/matrix diagnostic detail is retained. Flow event captions remain compatible strings. No Publish gate is introduced.

## Technical acceptance

| Command / check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS — 83 files / 518 tests |
| `pnpm build` | PASS — existing large-chunk warning |
| `pnpm exec vercel build` | PASS — 12 actual generated Functions |
| `pnpm verify:micro:generated` | PASS — native Node entrypoint and calculated grading |
| `node --env-file=.env.local --import tsx scripts/verify-micro-v2.ts` | PASS — 23 probes, rollback-isolated historical replay, current revision preservation, H5P stability |
| `pnpm verify:learning-loop:local` | PASS |
| `pnpm exec supabase db lint --local --level warning` | PASS — no schema errors |
| `pnpm audit:client-secrets` | PASS |
| Reviewed content generator + Local forward migration/replay | PASS — all 65 Steps, replay leaves all 51 table fingerprints identical |
| Hosted `validate_micro_interaction` | PASS — 23 interactions / 0 invalid |
| Authenticated Preview content parity | PASS — 65 Steps, body/feedback/interaction/title/kind exact |
| `git diff --check` | PASS |

Dedicated rendering tests verify paragraph, bold, italic, heading, ordered/bullet lists, blockquote, inline/block code, safe links, alignment, controlled font size/family/text/background colors, highlight and KaTeX; malformed structure, HTML and unsafe styles/URLs fail safely. Full-course tests render each body/Step feedback and validate all interactions. Existing Native and server grading tests remain green.

The old Micro V2 verifier directly replayed historical migrations into current Local Reference rows. Baseline happened to match that history; after upgrade it overwrote newer content. This round restored only those verifier-caused Local changes (all-table fingerprints returned exactly to the post-migration snapshot) and moved historical replay into a rollback transaction. The same historical replay/idempotence assertions remain, and current revisions are now preserved. Historical migration files were not edited. Hosted was not exposed to that verifier.

## Browser acceptance

Real Local API and real Hosted ordinary-user sessions: A02, R10, S02, S03, CTX01, RT01; **all 34 representative Steps × 1440/390 = 68 viewport checks per environment**. Body hierarchy, Why explanations, Summary, choice/categorize/ordering/Flow, S02 incorrect answer + retry, CTA hit testing and no document horizontal overflow passed. All final representative runs report zero runtime errors. Hosted completed-user review reports **zero application writes**.

The CTX01 initial keyboard sorting runner sent keys faster than the drag sensor settled; it failed its success assertion. Waiting between keyboard drag moves and checking the actual resulting order resolved the harness issue without a product change.

Existing `scripts/acceptance/micro-review.browser.mjs` passed against RT01 and unchanged CDS525 K012/K021: simulation, matrix interaction, review/resume and zero review writes. K012 formula page additionally renders seven KaTeX expressions at both widths with no horizontal overflow. Formal other-course content was not migrated to satisfy these checks.

Private screenshots/logs and credential-derived browser storage remain outside Git under `/tmp/eduflow-richtext`; no password/token is included here. The existing ordinary test account was already complete on all 12 target Paths; no test learner was created and no completion history was reset.

## Hosted and data integrity

Forward migration `20260909140829_micro_rich_text_observable_content` precisely guards Course/Path/revision, Unit and Step IDs, counts and positions. It modifies only body/feedback/interaction/title/kind and increments affected Path revisions once; rerun verifies new content instead of overwriting edits. No seed, reset, schema DDL or history rewrite.

Final revisions: A02 3; AGC01/AGC02/AGC03/H02/S01/S02/WF05 2; R10/CTX01/RT01 4; S03 3. Stable Course, Knowledge, Path, Unit, Step IDs and positions preserved.

[Full before/after fingerprints](rich-text-data-integrity.json): only `micro_steps` and `micro_learning_paths` changed; the other 49 business tables are identical, including Course/Chapter/Lesson/coverage, Knowledge, Material/mappings, Attempt, PerformanceResult, Evidence, learner state, Navigation and completion history. For the two shared changed tables, replacing target rows with their exact baseline values reconstructs the original whole-table hash: non-target Micro content and revisions are unchanged too. Counts remain 19 Paths / 103 Steps overall and 12 / 65 in target scope.

Supabase CLI reported a catalog-cache connection timeout after the successful push. Migration-history SQL, final content queries, validation and fingerprints confirm successful application. No migration was reapplied to compensate for a cache-only warning.

Initial accepted Preview: `https://edu-flow-p5btu8m4e-july-nanas-projects.vercel.app`, READY, 12 actual lambda outputs; ordinary-user Health/Courses/Knowledge/Micro/Progress all 200. A final runtime-equivalent deployment includes the small draft-preview acknowledgment and preserved matrix error detail; its readiness/smoke is recorded below. A slow optional archive upload was stopped and replaced with the normal incremental upload.

## Deferred by scope

Full Publish Validator/gates, future authoring editor and other-course Rich Text migration. No Practice/Assignment/Evidence/mastery/navigation/progress redesign is included.

## Final deployment acceptance

`https://edu-flow-c5u12qdit-july-nanas-projects.vercel.app` (`dpl` identity recorded in private inspect evidence): READY, exactly 12 deployed lambda outputs. Ordinary-user login and all five API probes return 200; all 65 current Steps match reviewed content. All six representative Micro were rerun on this exact final deployment at 1440 and 390: 68 checks, zero runtime errors and zero application writes, including S02 wrong-answer/retry and CTX01 keyboard ordering. Final source checks and frozen lockfile pass.
