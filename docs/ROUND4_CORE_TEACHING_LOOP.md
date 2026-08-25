# Round 4 — Core Teaching Loop

## Status

**Historical planning baseline — superseded for current execution on 2026-08-25.**

The original Round 4 plan targeted a vertical slice centered on:

```text
material ingestion
-> Knowledge extraction/modeling
-> course projection
-> practice mapping
-> real Workflow Runtime
-> evaluation
```

That plan produced useful completed foundation work, especially Phase 4.1–4.3 and the later non-AI learning foundation. However, **real Workflow Runtime and automatic arbitrary material -> Course generation are no longer blockers for the current product MVP**.

The canonical current execution plan is:

- `docs/LEARNING_NAVIGATION_ROADMAP.md`
- `docs/COURSE_DATA_SYSTEM.md`
- GitHub issue #1 as the current product tracker

Historical implementation issues keep their original scopes and rationale; do not rewrite completed work as if it originally targeted the navigation roadmap.

## Historical work retained

The following completed/accepted Phase 4 work remains part of the product foundation:

- Phase 4.1 material parsing / structured `CourseMaterial`;
- Phase 4.2 Knowledge modeling / course-generation experiments;
- Phase 4.3 Knowledge / Material / Assignment mapping;
- persistent non-AI learning foundations, Micro runtime, learner state, course authoring, and related API/repository work.

These capabilities may be reused when they serve the current product, but they do not define the current critical path.

## Current product direction

EduFlow now prioritizes the learning-navigation loop:

```text
Goal
  -> Course
  -> Course Graph          static map
  -> Learner State
  -> Navigation Engine
  -> Learning Path         learner-specific route
  -> Next Learning Action
  -> Attempt / Performance
  -> State update
  -> replan
```

The current stages are tracked by:

- #18 — V0 Course Foundation
- #19 — V1A Global EduFlow Assistant
- #20 — V1B Goal Resolution & Course Selection
- #21 — V1C Rule Navigation
- #22 — V1.5 Dynamic Learning Loop
- #23 — V2 Intelligent Navigation

## Superseded Round 4 requirements

The following requirements from the original Round 4 exit contract are explicitly **not required for the current navigation MVP**:

### Real Workflow Runtime

The existing Workflow demo may remain as a demo/practice-environment illustration.

Issue #11 is deferred/not planned for the current critical path. Reopen/evaluate a real learner Workflow Runtime only when a concrete product requirement justifies it.

### Automatic material -> Course generation

A new Course may be prepared as structured data and imported directly through the validated Course data contract.

The current MVP does not require the user to upload arbitrary material and have the system automatically generate a complete Course.

### Mandatory Assignment/Material completeness

A structurally valid Course does not require every Knowledge node to have Material, Micro, Assignment, FinalProject, or Workflow assets.

Missing assets belong to a non-blocking Asset Coverage Audit.

See `docs/COURSE_DATA_SYSTEM.md`.

### Workflow-centric acceptance

The current first complete product-validation milestone is V1.5:

```text
Next Action
-> supported learning/practice action
-> Attempt / LearningEvent
-> PerformanceResult
-> LearnerKnowledgeState update
-> automatic replan
```

The product is not required to prove this loop through a real Workflow Runtime; Micro and existing supported Assignment/practice paths are sufficient for the first accepted slice.

## Durable constraints that remain valid

The scope change does **not** remove the following architecture invariants:

- shared stable Knowledge identities;
- Course is curriculum/provenance context, not Knowledge ownership;
- curriculum order is not factual Knowledge prerequisite data;
- Supabase PostgreSQL/Auth/Storage remain the core platform;
- product/domain types remain EduFlow-owned and external frameworks remain adapters;
- browser code does not receive server secrets;
- user-owned state remains protected through normal backend/RLS boundaries;
- Course progress and LearnerKnowledgeState are distinct;
- completion must not be silently equated with mastery;
- unsupported/missing content is explicit rather than fabricated.

## Historical detail

The original detailed Round 4 exit contract remains available in Git history and in the original Phase 4 issues (#5, #7, #9, #11, #14). Use those records when investigating historical implementation decisions, but use `LEARNING_NAVIGATION_ROADMAP.md` for new work sequencing and scope.