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
- `src/features` owns product feature code. Feature code MUST NOT import `src/demo`; pure Feature Core MUST NOT import `src/app`, `applicationServices`, React/application singleton stores, Supabase SDK or environment variables.
- `src/demo` owns concrete Demo fixtures, seeds, sample datasets, adapters and Demo-specific fixture parsing/building utilities; it may depend inward on Feature contracts. `src/app` performs the final wiring; `applicationServices` is a composition root, never a Core dependency, and UI/application adapters bind Core contracts to it.
- `src/shared` owns only cross-Feature utilities, components, types and styles and MUST NOT depend on `src/features`, `src/demo` or `src/app`.
- Core packages define reusable contracts, repositories, validation, algorithms, projections and governance, operating from explicit inputs. Demo depends on Core; Core never depends on Demo. Static Demo data is never production runtime authority.
- Core/Demo separation is enforced by dependency direction, not by blacklists of concrete names, IDs or fixture filenames. Generic barrels MUST NOT re-export Demo fixtures; temporary Demo compatibility exports live under `src/demo` and are named as such.
- Cross-top-level imports SHOULD use the single `@/* -> src/*` alias; short relative imports within one Feature may remain relative.

## Product-wide Invariants

- One shared Knowledge Graph (`KnowledgeNode`, `KnowledgeEdge`, user-owned `UserKnowledgeState`); every map, course tree and capability view is a projection over it and MUST NOT keep separate knowledge facts or fabricate nodes/edges.
- Knowledge mastery, Course progress, Material reading, Micro completion and Assignment evaluation are distinct states. Only the centralized learner-state policy changes `UserKnowledgeState`.
- The LLM is never navigation, mutation or publication authority: Assistant changes go through Proposal → Preview → deterministic validation → explicit confirmation → Apply, and every authority check is revalidated server-side.
- Presentation state (hover, selection, search, zoom, camera, layer/mode switches, panels) MUST NOT trigger relayout; only structural graph changes may.
- Browser-supplied identities, roles or context payloads are never authority. `SUPABASE_SECRET_KEY` and other secrets stay server-only.

## Validation

- Changes MUST pass `pnpm typecheck`, `pnpm lint`, relevant tests and the production build; touched pages MUST be checked for runtime errors.
- New UI follows `docs/design/new-ui/` (tokens, components, design spec) and `docs/rules/frontend-ui.md`.

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
