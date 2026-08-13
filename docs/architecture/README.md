# EduFlow Architecture Decisions

This directory records architecture decisions that should survive individual implementation rounds.

## Purpose

Use these documents for decisions, trade-offs, boundaries, and revisit conditions. They are not a backlog and do not imply that every deferred technology will eventually be adopted.

Use GitHub Issues only when there is current executable work. A deferred option becomes an Issue when one or more of its recorded revisit triggers are actually observed and the next action is to evaluate or implement it.

## Current records

- `FOURTH_ROUND_ARCHITECTURE.md` — Phase 4 target architecture and implementation boundaries.
- `decisions/0001-fourth-round-technology-stack.md` — accepted default technology choices for Phase 4.
- `decisions/0002-deferred-technology-options.md` — technologies intentionally not introduced now, why, and explicit revisit triggers.

## ADR convention

Each Architecture Decision Record should contain:

- Status
- Context
- Decision
- Consequences
- Alternatives / Deferred options
- Revisit triggers

When a revisit trigger occurs, create an evaluation Issue first. Do not create a migration Issue that assumes the replacement technology has already been selected.

## Related existing architecture documents

- `../BACKEND_ARCHITECTURE.md`
- `../WORKFLOW_ARCHITECTURE.md`
- `../MATERIAL_SYSTEM.md`
- `../KNOWLEDGE_ARCHITECTURE_V1.md`
