# EduFlow Repository Instructions

This file holds only cross-cutting rules. Domain rules live in `docs/rules/`. **Before changing code in a domain, read its rule file** (table below). A domain file never overrides this file.

## Package Manager

- pnpm is the only supported package manager. Dependency changes MUST update `pnpm-lock.yaml` with pnpm; competing lockfiles MUST NOT be committed.
- Before pushing dependency changes, `pnpm install --frozen-lockfile` MUST succeed.

## Infrastructure Reuse

- Prefer mature, maintained, technology-compatible open-source components or official SDKs when they materially reduce protocol and maintenance code. EduFlow keeps ownership of product context, permissions, tools, policy and learning-domain semantics behind thin adapters.
- Do not reimplement mature LLM streaming, tool-call protocols, schema validation, authentication, database/storage or routing infrastructure merely to avoid dependencies. A dependency MUST still justify its deployment, bundle, lockfile, vendor and architectural cost.

## Project Structure and Dependency Direction

- `src/app` owns application assembly, providers and the `ApplicationServices` composition root.
- `src/features` owns product feature code. Feature code MUST NOT import `src/demo` or `tests/fixtures`; pure Feature Core MUST NOT import `src/app`, `applicationServices`, React/application singleton stores, Supabase SDK or environment variables.
- Product content (courses, knowledge, Domains, materials, Micro, workflow starter templates, demo accounts) lives only in the database. The repository holds no product content or seeds; content moves between environments through admin import/export and local snapshots in the git-ignored `content-snapshots/` directory, which MUST NOT be committed.
- The repository keeps only: minimal synthetic test data in `tests/fixtures/` (never product content), and small Feature Preview sample datasets in `src/demo/preview/` with obviously sample identities. `src/app` performs the final wiring; `applicationServices` is a composition root, never a Core dependency, and UI/application adapters bind Core contracts to it.
- `src/shared` owns only cross-Feature utilities, components, types and styles and MUST NOT depend on `src/features`, `src/demo` or `src/app`.
- Core packages define reusable contracts, repositories, validation, algorithms, projections and governance, operating from explicit inputs. Demo depends on Core; Core never depends on Demo. Sample and test data are never runtime authority.
- Separation from sample/test data is enforced by dependency direction, not by blacklists of concrete names, IDs or fixture filenames. Generic barrels MUST NOT re-export sample or test data.
- Cross-top-level imports SHOULD use the single `@/* -> src/*` alias; short relative imports within one Feature may remain relative.

## Product-wide Invariants

- One shared Knowledge Graph (`KnowledgeNode`, `KnowledgeEdge`, user-owned `UserKnowledgeState`); every map, course tree and capability view is a projection over it and MUST NOT keep separate knowledge facts or fabricate nodes/edges.
- Knowledge mastery, Course progress, Material reading, Micro completion and Assignment evaluation are distinct states. Only the centralized learner-state policy changes `UserKnowledgeState`.
- Assistant authority is risk-based. Learner-owned, reversible actions (for example starting a practice or submitting the learner's own hands-on task) MAY be performed by model-called tools after server-side permission and input validation. Publishing, deletion, and changes that affect other people's content still require Proposal → Preview → deterministic validation → explicit confirmation → Apply, revalidated server-side.
- Navigation remains a server-owned teaching-order reference, not the model's only permitted suggestion. The model MAY combine it with the conversation, but it MUST NOT mark unlearned content as learned, skip factual teaching prerequisites, or invent progress, completion or mastery.
- Model-generated exercises are explanation and practice aids, not course content or learning evidence. They MUST NOT change completion, mastery, Evidence or any durable learning record; only real course Micro and Assignments do.
- Presentation state (hover, selection, search, zoom, camera, layer/mode switches, panels) MUST NOT trigger relayout; only structural graph changes may. The explicit Archive layout modes (person focus, course focus; see `docs/rules/knowledge-atlas.md`) are the only exception: they move existing nodes to positions that are deterministic, cached functions of graph structure and the selected people or Course, and never change facts.
- Browser-supplied identities, roles or context payloads are never authority. `SUPABASE_SECRET_KEY` and other secrets stay server-only.

## Validation

- Changes MUST pass `pnpm typecheck`, `pnpm lint`, relevant tests and the production build; touched pages MUST be checked for runtime errors.
- New UI follows `docs/design/new-ui/system/tokens.css`, the latest design artifact linked in `docs/design/new-ui/DESKTOP_MIGRATION_PLAN.md` and `docs/rules/frontend-ui.md`. `docs/design/new-ui/DESIGN_SPEC.md` is a historical record and yields to these.

## Domain Rule Index

| Before changing… | Read |
|---|---|
| Knowledge graph, relations, Domains, Archive/Atlas map | `docs/rules/knowledge-atlas.md` |
| Courses, curriculum, Course Creator, course graph & 3D course view, Assignments as curriculum | `docs/rules/course.md` |
| Materials and the reader | `docs/rules/material.md` |
| Learner state, Micro learning, evidence, evaluation, navigation, Today | `docs/rules/learning-state.md` |
| Project Capability Model, personal routes, Capability Actions | `docs/rules/capability-route.md` |
| Global EduFlow Assistant | `docs/rules/assistant.md` |
| Workflow editor, runtime and runs | `docs/rules/workflow.md` |
| Backend, Supabase, RLS, anonymous access & sharing, Vercel deployment | `docs/rules/platform.md` |
| App shell, navigation, Object Shell, design tokens, Feature Preview | `docs/rules/frontend-ui.md` |
