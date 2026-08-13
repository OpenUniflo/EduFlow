# EduFlow

EduFlow is an AI-assisted teaching platform that turns course materials into a shared knowledge graph, course skill and assignment views, executable practice workflows, and eventually evidence-backed learning state.

## Product Loop

```text
Course materials
  -> structured curriculum/material data
  -> shared Knowledge Graph resolution
  -> Course Skill Tree / Assignment Tree
  -> Material Reader
  -> Workflow / practice execution
  -> Evaluation
  -> evidence and mastery (later stage)
```

The Global Knowledge Atlas, Course Skill Tree, and Personal Atlas are projections over one shared Knowledge Graph. Curriculum, materials, assignments, workflow execution, and mutable user learning state remain separate domain concerns.

## Current Status

- Round 1: frontend project structure refactor — complete.
- Round 2: workflow module boundary refactor — complete.
- Round 3: Supabase-backed data, Auth, and persistence layer — complete.
- Next: Round 4 — Core Teaching Loop.

Round 4 scope and exit criteria are defined in [`docs/ROUND4_CORE_TEACHING_LOOP.md`](docs/ROUND4_CORE_TEACHING_LOOP.md).

## Architecture

```text
React / Vite
  -> Feature contracts and application services
  -> Vercel /api functions
  -> Supabase Auth / Postgres / Storage
```

Repository boundaries:

- `src/features` — reusable product feature code, domain logic, contracts, repositories, and projections.
- `src/app` — application assembly, providers, routing, integrations, and composition root.
- `src/demo` — concrete demo fixtures, seeds, workflow templates, and demo adapters.
- `src/shared` — cross-feature utilities, API helpers, types, and styles.
- `api` — Vercel server functions and authenticated API boundary.
- `supabase` — authoritative business-schema migrations, local configuration, seed data, and storage seed assets.
- `docs` — architecture and product-system specifications.

Repository-wide implementation invariants are authoritative in [`AGENTS.md`](AGENTS.md).

## Local Development

Requirements:

- pnpm `9.15.0`.
- Docker and the Supabase CLI for the Local Supabase stack.

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Start and reset Local Supabase:

```bash
pnpm db:start
pnpm db:reset
```

Configure `.env.local` from `.env.example` using the credentials printed by Local Supabase. `.env.local` is ignored by Git.

For repeatable local acceptance identities, set the local-only passwords in `.env.local` and run:

```bash
pnpm auth:bootstrap-local
```

Then start EduFlow:

```bash
pnpm dev
```

Local acceptance bootstrap commands are guarded to reject non-local Supabase URLs and must never be used against Hosted Supabase.

## Validation

Run the checks relevant to a change before merge. The standard validation set is:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm audit:knowledge
pnpm audit:client-secrets
pnpm verify:backend:local
pnpm build
```

`pnpm verify:backend:local` requires the Local Supabase stack and local environment configuration.

## Documentation

Start with:

- [`AGENTS.md`](AGENTS.md) — durable repository and architecture constraints.
- [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md) — Supabase/Vercel backend and persistence boundaries.
- [`docs/KNOWLEDGE_ARCHITECTURE_V1.md`](docs/KNOWLEDGE_ARCHITECTURE_V1.md) — shared Knowledge Graph model.
- [`docs/COURSE_DATA_SYSTEM.md`](docs/COURSE_DATA_SYSTEM.md) — curriculum and course runtime model.
- [`docs/COURSE_ASSIGNMENT_SYSTEM.md`](docs/COURSE_ASSIGNMENT_SYSTEM.md) — Assignment and course-practice mapping.
- [`docs/MATERIAL_SYSTEM.md`](docs/MATERIAL_SYSTEM.md) — Material and knowledge coverage model.
- [`docs/USER_LEARNING_STATE.md`](docs/USER_LEARNING_STATE.md) — mutable user learning state boundaries.
- [`docs/WORKFLOW_ARCHITECTURE.md`](docs/WORKFLOW_ARCHITECTURE.md) — Workflow domain, editor, runtime, and persistence boundaries.
- [`docs/ROUND4_CORE_TEACHING_LOOP.md`](docs/ROUND4_CORE_TEACHING_LOOP.md) — current development-round scope and exit contract.

## Deployment

`main` is the Production branch for the Vercel `edu-flow` project. Production uses Hosted Supabase; normal local development uses the Local Supabase stack.

Do not commit secrets. Browser code may use only the Supabase URL and publishable key; privileged Supabase credentials remain server-only.

## License

EduFlow is licensed under the [MIT License](LICENSE).

The existing MIT license is retained intentionally as the repository-level license for the code in this repository. Hosted services, private data, course content, or separately distributed modules may be governed separately when applicable.
