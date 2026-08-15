## What changed

Summarize the behavior and architecture changes in this PR.

## Why

What problem or Issue does this solve?

## Scope boundaries

State what this PR intentionally does **not** change.

## Validation

Check only what is applicable, and add any task-specific verification below.

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm audit:knowledge`
- [ ] `pnpm audit:client-secrets`
- [ ] `pnpm verify:backend:local`
- [ ] `pnpm build`
- [ ] Relevant UI/runtime behavior checked

Additional validation:

```text

```

## Backend / database

- [ ] No schema change.
- [ ] Schema changed through committed Supabase migration(s).
- [ ] Local Supabase migration/reset path verified when applicable.
- [ ] Hosted migration history/dry-run checked separately from Vercel Production deployment when applicable.
- [ ] Existing RLS/ownership boundaries preserved.
- [ ] No client secret exposure introduced.

## Architecture

- [ ] Relevant `AGENTS.md` invariants are preserved.
- [ ] No unrelated refactor is included.
- [ ] Core / Demo dependency direction is preserved.
- [ ] Shared Knowledge Graph boundaries are preserved when applicable.
- [ ] Course / Assignment / Material boundaries are preserved when applicable.
- [ ] Workflow Domain / Runtime / provenance boundaries are preserved when applicable.
- [ ] Assignment completion is not treated as Knowledge mastery.

## Documentation

- [ ] No documentation change required.
- [ ] Relevant subsystem documentation updated.
- [ ] `AGENTS.md` updated only because a new durable invariant was introduced or an existing one changed.

## Issue

Closes #
