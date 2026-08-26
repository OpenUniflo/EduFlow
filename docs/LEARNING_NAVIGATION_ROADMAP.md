# EduFlow Learning Navigation Roadmap

**Status:** Current product execution plan  
**Effective date:** 2026-08-25  
**Branch baseline:** `prototype`

This document supersedes older Phase 4 execution sequencing where it conflicts with the product direction below. Historical completed Phase 4 work remains valid; do not rewrite completed issue history as if it had a different original scope.

## 1. Product model

EduFlow is a learning navigation system built on a shared Knowledge Graph.

The learner-facing navigation stack is:

```text
Goal
  -> Course
  -> Course Graph          (static route space / map)
  -> Learner State
  -> Navigation Engine
  -> Learning Path         (dynamic personal route)
  -> Next Learning Action  (what to do now)
  -> learning / practice result
  -> Learner State update
  -> replan
```

This stack describes the goal-driven navigation flow. A Course may also exist as a structurally valid learning-route container before an explicit Goal or `targetOutcome` is attached.

### Course Graph vs Learning Path

- **Course Graph** answers: what Knowledge is in this Course, how is it organized, and what routes are possible?
- **Learning Path** answers: for this learner, in this Course, given the current state, what route should be followed now?
- **Next Learning Action** is the immediate instruction selected from available learning assets/actions.

A personalized Learning Path does **not** require a Personal Course. A standard Course may be reused by many learners while each learner receives a different Learning Path.

A **Personal Course** is only required when the Course goal/scope itself must differ from existing Courses.

## 2. Course minimum contract

A Course is allowed to exist and be published as a valid learning route even when learning assets are incomplete.

### Structurally required

At minimum a usable Course must have:

- stable Course identity;
- title;
- at least one valid Knowledge mapping;
- valid Course curriculum / graph references;
- a structurally valid Course Graph.

`targetOutcome` is optional Course metadata and is not part of V0 structural validity. `null` means no explicit Course goal description is currently attached. Goal Resolution or Personal Course creation may later derive or add a Goal/target outcome when the navigation flow needs one.

Chapter/Lesson remain compatibility/current curriculum entities where present; this roadmap does not resolve the separate deferred question of making Lesson optional.

### Optional learning assets

The following are optional and may be added later:

- Material;
- MicroLearningPath / MicroUnit / MicroStep;
- Assignment / Practice;
- ChapterOutcome / FinalProject;
- Workflow.

Missing assets must not make the Course structurally invalid.

### Validation split

Course validation is divided into:

1. **Structural Validation** — PASS / FAIL.
2. **Asset Coverage Audit** — warnings / completeness metrics only.

For example, missing Material or Assignment produces a warning, not a structural failure.

Lifecycle determines which validation boundary applies. A teacher/admin-visible Draft may have no CurriculumCoverage while it is being edited, but all entities and references that do exist must remain internally valid. Published learner-usable Courses must pass the full minimum route validation; Repository hydration must not confuse a legitimately incomplete Draft with corrupted Course data.

## 3. Global EduFlow Assistant

EduFlow has one global Assistant runtime, not separate AI implementations per page.

The same Assistant must support the AI/chat scenarios already present across the product, including:

- Home / Explore;
- Knowledge Atlas;
- Personal Atlas;
- Course / Course Graph;
- Learning Path;
- Material / Lesson;
- Micro Learning;
- Assignment / Practice;
- Workflow/demo surfaces where applicable;
- a full chat surface for longer conversations.

Different pages provide different `AssistantContext`; they do not own separate AI runtimes.

Conceptual context contract:

```text
AssistantContext
  pageType
  courseId?
  chapterId?
  lessonId?
  knowledgeId?
  materialId?
  segmentId?
  actionId?
  taskId?
```

The Assistant may interpret language, retrieve context, explain, and call application tools. It must not become the authority for deterministic navigation business rules.

The V1A implementation uses one authenticated `/api/assistant` boundary. AI SDK Core owns generic streaming/reasoning/tool-call protocol and the bounded multi-step loop; EduFlow owns `AssistantContext`, tool permissions, product retrieval, and learning policy. Contextual surfaces and `/messages` share user-owned database sessions. Specialized Design mutation and evaluation adapters remain separate from learner chat. See `ASSISTANT_ARCHITECTURE.md`.

## 4. Goal resolution and Course reuse

A learning Goal does not immediately create a Personal Course.

Required flow:

```text
Goal
  -> resolve target Knowledge
  -> prerequisite closure
  -> search existing accessible Courses
  -> calculate match / gaps
  -> recommend an existing Course when suitable
  -> optionally customize a close Course
  -> create a new Personal Course only when needed
```

A Course without `targetOutcome` may still participate in matching through its actual Knowledge scope. When a goal-driven flow requires an explicit target, Goal Resolution supplies that target independently rather than treating missing Course metadata as structural invalidity.

### Matching principle

The first version is deterministic and should expose understandable metrics such as:

- target coverage;
- required coverage;
- missing Knowledge;
- extra Knowledge.

Do not introduce an opaque recommendation model for this stage.

### Personal Course

Standard and personal Courses use the same Course concept.

A Personal Course may carry fields such as:

- `course_type = personal`;
- `owner_user_id`;
- optional `source_course_id` when derived from an existing Course.

Personal Course generation should primarily select/project shared Knowledge. It does not require automatic Material, Micro, Assignment, or PPT generation.

## 5. Navigation Engine

The V1 Navigation Engine is rule-based and deterministic.

Inputs conceptually include:

- Course / Course Graph;
- Course target Knowledge;
- LearnerKnowledgeState;
- available Learning Actions.

The engine:

1. finds unsatisfied target Knowledge;
2. computes prerequisite closure;
3. removes requirements already satisfied by Learner State;
4. computes the currently eligible frontier;
5. deterministically ranks eligible Knowledge/actions;
6. returns the current Learning Path projection and Next Learning Action;
7. records a `NavigationDecision` with policy version and reason.

No ML/RL is required for V1.

### LearningAction boundary

Existing learning assets may first be adapted into a common conceptual action surface instead of introducing a new storage model immediately:

- Micro -> learn / review;
- Material -> learn / reference;
- Assignment -> practice / validation;
- future Workflow -> practice.

## 6. Dynamic learning feedback loop

V1.5 adds immutable learning facts and repeatable evaluation.

Core chain:

```text
LearningAction
  -> Attempt
  -> LearningEvent[]
  -> PerformanceResult
  -> LearnerKnowledgeState update
  -> Navigation Engine
  -> new Learning Path / Next Action
```

### Facts vs judgments

- `Attempt` and `LearningEvent` are historical facts and should not be overwritten as model conclusions change.
- `PerformanceResult` is evaluator/version dependent and may be recomputed.
- Learner state is a derived/model state and may evolve.

Important invariant:

```text
completed != success != good performance != learning gain != mastered
```

Micro progress snapshots alone are insufficient for the future model; wrong answers, hints, retries, timing, and other useful events must become durable historical facts when V1.5 is implemented.

## 7. V2 intelligent navigation

V2 begins only after sufficient real Attempt/Performance history exists.

Planned additions include:

- LearningOutcome;
- probabilistic LearnerKnowledgeState fields such as mastery probability, confidence, forgetting risk;
- NavigationCandidate predictions;
- predicted success;
- expected learning gain;
- predicted time;
- goal relevance / forgetting benefit / preference fit;
- utility/ranking;
- offline evaluation and later controlled experiments.

Start with simple statistical/supervised models. Contextual bandits or RL are later options only if data and product needs justify them.

The earlier Capability / CapabilityLevel / CapabilityState / Evidence framework remains a later experimental capability layer. It must not block the navigation MVP. New V2 core work should use the direct path:

```text
Attempt -> PerformanceResult -> LearningOutcome -> LearnerKnowledgeState
```

## 8. Deferred work

The following are explicitly **not blockers** for the current navigation roadmap:

- real Workflow Runtime / LangGraph learner runtime;
- automatic arbitrary material -> Course generation;
- automatic PPT/courseware generation;
- Capability six-dimensional state model;
- Evidence/Capability Assessment pipeline as a new core requirement;
- ML recommendation / RL before real data exists;
- graph database migration;
- broad analytics dashboards;
- additional interaction types unless required by a current accepted flow.

The current Workflow demo may remain as a demo/practice-environment illustration until a concrete product need reopens runtime implementation.

## 9. Execution stages

### V0 — Course Foundation

Goal: a valid Course can be imported/created from structured data and appear in the product without code changes; assets and explicit target outcome may be incomplete/absent.

Tasks:

- finalize the minimum Course contract;
- finalize Course Graph composition rules;
- define a Course Import Contract;
- implement structural validation;
- implement non-blocking asset coverage audit;
- update stale scope documentation.

### V1A — Global EduFlow Assistant

Goal: one real Assistant works across all current AI/chat surfaces.

Tasks:

- implement one Assistant runtime/API;
- unify current AI entry points;
- implement global page context;
- add Knowledge read tools;
- add Course/Material read tools;
- add Learner State read tools;
- persist chat sessions/messages;
- verify all accepted product surfaces use the same runtime.

### V1B — Goal Resolution & Course Selection

Goal: a user states a Goal; EduFlow reuses an existing Course whenever it is suitable and creates/customizes a Personal Course only when needed.

Tasks:

- define Goal resolution contract;
- resolve Goal -> target Knowledge;
- compute prerequisite closure;
- define Course target Knowledge representation;
- implement Course matching metrics;
- build match/gap UI;
- create Personal Course from an existing Course when requested;
- create a Personal Course from shared Knowledge when no existing Course is suitable.

### V1C — Rule Navigation

Goal: Course Graph becomes the static map and Learning Path becomes the learner-specific dynamic route.

Tasks:

- define/adapt LearningAction;
- define Navigation input/output contracts;
- compute unsatisfied targets;
- compute eligible frontier;
- deterministic candidate ordering;
- produce Learning Path + Next Action;
- persist NavigationDecision;
- expose Course Graph / Learning Path as distinct learner views.

### V1.5 — Dynamic Learning Loop

Goal: learning performance changes Learner State and replans the route.

Tasks:

- add Attempt;
- add LearningEvent;
- connect Micro to Attempt/Event history;
- connect Assignment to the same attempt/performance path;
- add PerformanceResult;
- implement deterministic State Updater;
- automatically replan after accepted learning events/results.

### V2 — Intelligent Navigation

Goal: use accumulated real learning data to improve route selection.

Track, but do not implement prematurely:

- LearningOutcome;
- probabilistic state;
- candidate prediction;
- ranking/utility;
- offline/online evaluation.

## 10. Product acceptance milestones

- **V0:** a Course containing only a valid Knowledge/curriculum route can be imported and displayed; `targetOutcome` and learning assets may be absent, and missing assets are warnings.
- **V1A:** the same Assistant runtime can answer context-aware questions from all accepted AI/chat surfaces.
- **V1B:** a Goal produces existing-Course recommendations first, then optional customization/new Personal Course creation.
- **V1C:** two learners in the same Course can receive different Learning Paths/Next Actions from different Learner States.
- **V1.5:** completing/failing a learning action changes state and causes the subsequent path/action to be recalculated.
- **V2:** a data-driven policy must beat the accepted deterministic baseline on defined offline/online learning-efficiency metrics before replacing it.
