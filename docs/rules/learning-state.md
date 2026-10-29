# 学习状态、微学习、评估与导航

> 由 AGENTS.md 拆出。修改本领域代码前必须阅读本文件；与 AGENTS.md 冲突时以 AGENTS.md 为准。

## Micro Learning Runtime

- Micro authors and AI authoring MUST follow `docs/TEACHING_PATTERN_LIBRARY.md` for Knowledge-to-Pattern selection, cognitive strategies, existing-runtime recommendations, feedback, and independent review. Teaching Patterns are instructional semantics, never new runtime enum values or Course-specific branches.
- Ordinary Micro MUST default to bounded clicks, classification, ordering, connections, parameter changes or short causal judgments, without long-text input. Long-form Practice/Assignment/Evidence work remains separate. New patterns and runtime dependencies must pass their distinct documented addition gates.

- Runtime Micro content authority is the database; Demo fixtures and providers MUST NOT become a Production fallback. Golden demo content MUST use the same persistence and API path as ordinary product content.
- H5P is a `MicroStep` interaction adapter, never a parallel learning domain. H5P completion MUST flow through EduFlow Step, Unit, Path, Evidence, and mastery rules.
- Native and H5P completion MUST NOT bypass mastery or Course-context membership semantics. Micro completion may reach `learned`; it MUST NOT directly manufacture mastery.
- Published Micro edits SHOULD preserve stable Path, Unit, and Step identities so existing learner progress remains valid.
- H5P assets MAY be publicly readable when relative asset loading requires it, but privileged write access MUST remain server-only and imported packages MUST pass controlled validation.

## Micro Learning Assessment Integrity

- Assistant hints and explanations MUST NOT mutate MicroStep answers, grading feedback, Step completion, or Lesson completion, and Assistant actions MUST NOT bypass interaction validation.
- `MicroLearningPath -> MicroUnit -> MicroStep` is the canonical Micro Learning hierarchy. A legacy MicroLesson/provider may exist only as a demo/test adapter and is never runtime authority.
- Required Unit completion and resume state MUST be persisted. A completed required Learn Path creates learning evidence and may reach `learned`; it MUST NOT itself claim `mastered`.
- A Quick Learn CTA MUST be executable only for a published, repository-loaded MicroLearningPath in the Knowledge and Course context. Unsupported and unadapted H5P content MUST render a visible fallback rather than a blank experience.
- Native Micro definitions are content data interpreted by shared renderers. Course-specific arbitrary HTML/CSS and course-ID renderer branches are forbidden. Explore interactions teach through valid manipulation without claiming a unique answer; Challenge interactions carry an explicit deterministic target.

## Micro Completion Context

- Micro completion reaches `learned`, never Micro-alone `mastered`. Existing stronger mastery evidence remains distinct.
- Course Graph, Course Path and Navigation MUST share teaching prerequisite semantics. Only factual hard prerequisites with both endpoints in the selected Course route gate that route; soft prerequisites MUST NOT gate learning; external facts remain facts without a hidden entry gate.
- Micro body owns teaching and Summary; the system shell owns optional Material, Practice, Next Knowledge and Course/source actions. Absent capabilities are omitted, not empty cards.
- Completion Next uses the Navigation Knowledge identity and preserves optional Course context. Material uses real coverage/Segment and returns to the original Micro completion. Review MUST NOT write formal completion or downgrade progress/state.
- Historical Micro scope/course fields are compatibility data, not two learner-facing products. Physical cleanup remains deferred to #32.

## User Learning State Invariants

- User progress is mutable user state and MUST NOT be persisted in course, curriculum, material, or structural graph definitions; user-scoped presentation projections MAY derive it from explicit user-state inputs.
- `UserCourseState` is scoped by both `userId` and `courseId`; material state is additionally keyed by `materialId`, and assignment state by stable `assignmentId`.
- Assignment completion MUST update the explicit launched `assignmentId`; workflow template identity alone is insufficient because templates may be shared.
- Knowledge mastery remains separate from course progress, material reading progress, and assignment completion.

## Learning Progress Boundary

- Core LearningProgress repositories MUST NOT import Demo state fixtures.
- Demo initial state MUST be injected through a `UserCourseStateFactory` at the application composition root.
- Persisted learning progress MUST use a versioned schema envelope, validate nested state identity, and migrate supported legacy records before use.

## Knowledge Progress Invariants

- Knowledge mastery and Assignment completion are separate states and separate projections.
- Knowledge presentation MUST use UserKnowledgeState evidence; it MUST NOT display Assignment completion as Knowledge mastery.
- UserMaterialState reading position and reading coverage are separate concepts.
- Opening or reading a Material MAY update the user's recent Lesson only when it can be derived from the active Segment's Knowledge mapping and canonical CurriculumCoverage; it MUST NOT copy Lesson ownership onto Material.

## Learning Experience Ordering

- Course instructional order is the learning-path backbone; factual prerequisite edges determine new-learning eligibility; explicit UserKnowledgeState determines Learn or Continue presentation.
- Today Queue and Micro Learning entry order MUST use canonical curriculum ordering. IDs, fixture-array order, graph coordinates, Assignment completion, and Material progress MUST NOT determine Knowledge mastery or new-learning order.
- Without reliable review-due data, the product MUST NOT present spaced-repetition due claims. Prototype Micro Learning completion is learning activity, not mastery evidence.

## Learner State, Evidence, and Assignment Lifecycle

- Durable `UserKnowledgeState` values are `explore`, `learning`, `learned`, `practicing`, and `mastered`. State transitions are monotonic and belong to a centralized policy/application action, never an individual React component.
- Assignment lifecycle is `not_started -> started -> submitted -> accepted` (with optional `needs_revision`). Submission is not acceptance and neither submission nor course completion is Knowledge mastery.
- Assignment start/submit MUST revalidate published Course ownership, covered Knowledge instructional readiness, hard Assignment dependencies and legal learner status server-side before any mutation. UI uses the same eligibility semantics. Submitted/accepted work is view-only; only an identical saved-attempt retry may remain idempotent. Task details link to the existing Assignment runtime and MUST NOT copy its editor or submission logic.
- An authenticated Assignment submission MUST persist the actual response as an immutable numbered Attempt and append a versioned PerformanceResult through a server-only atomic boundary. Clients MUST NOT provide or directly write an authoritative pass/fail flag.
- A submission is addressed to an evaluator chosen by the learner at submit time (a teacher or the AI evaluator). All evaluators are treated alike: same formal evaluation, same PerformanceResult semantics (`accepted` / `needs_revision`), same mastery rules, no evaluator-type distinction. A teacher may use AI assistance while remaining the evaluator. Course-level restriction of allowed evaluators is deferred to organization/course-publishing design.
- KnowledgeEvidence is user-owned, source-identified, and idempotent. Supported MVP evidence is completed Micro paths, accepted Assignments, and passed Workflows.
- Mastery requires a completed required Learn Path plus every explicitly required Assignment accepted. A Knowledge without an explicit required Assignment remains `learned` after its required Learn Path.
- Course progress and UserKnowledgeState are separate projections. PersonalLearningPlan is removed; systematic multi-Knowledge learning belongs to a Course, while MicroLearningPath is a within-Knowledge experience.
- Deterministic Navigation selects the earliest unfinished Course route frontier by explicit curriculum order; later historical underway state MUST NOT preempt it. It skips only learned/skipped route nodes and gates teaching eligibility only with Course-local factual prerequisites satisfied by `learned | practicing | mastered`. Course Navigator executes the current adopted Personal Route Step and its exact selected Action/ActionRun. It MUST NOT rerank alternatives or prioritize unrelated in-progress history. Unavailable selected Actions require explicit Project route adjustment. Micro and Practice share this Action authority; Practice executes through CourseAssignment. Ordinary Material remains supporting context and incomplete Assignment work remains discoverable. Missing content MUST NOT cause Material fallback, prerequisite skipping, fabricated completion, or a fake generation CTA. Versioned NavigationDecision retains teaching navigation authority, not a separate Action selection authority. See docs/architecture/CAPABILITY_ROUTE_ACTION_CONTRACT.md (2026-10-04).
- Course Navigator MUST distinguish completed learning with unfinished practices, fully completed learning and practices, and unavailable learning assets. Its card hides resource/policy types, uses real duration only, and labels existing learning 开始学习. Locked nodes MAY expose details but MUST NOT be aria-disabled when inspectable; detail actions MUST NOT bypass prerequisite locks.

## Learner Entry and Today Invariants

- Today is a quick-access projection of active `learning`, `learned`, and `practicing` Knowledge. It MUST NOT add Course candidates, imply curriculum or prerequisite order, or include `explore` or `mastered` Knowledge.
- Carousel selection and Course navigation are presentation-only. Micro and Material entry first raise the Knowledge to at least `learning`; Assignment entry raises covered Knowledge to at least `practicing`; no weaker action may downgrade state.
- A Course-specific required Learn Path takes precedence. A published Global required Learn Path is the fallback only when that Course has no matching required Learn Path; Course and Global paths MUST NOT become simultaneous mastery requirements.
- Standalone Knowledge may use Global Micro but has no Global Material or Global Assignment in the MVP. Starting Knowledge does not require Micro, and Material completion does not infer `learned`; without a required Learn Path the learner may remain `learning`; Assignment start still requires instructional readiness and MUST NOT fabricate it.

## Learning Data and Recommendation Foundation

- Progression Stage (`explore`, `learning`, `learned`, `practicing`, `mastered`) MUST remain separate from criterion-level Learner State. Criterion attainment MUST NOT change existing mastery authority.
- Existing Knowledge mastery-criteria prose is authored definition context. Operational Criterion identities MUST reference real Knowledge and its revision, be versioned, and MUST NOT be inferred from prose at runtime.
- Evidence records what occurred; Learner State is a versioned deterministic projection. Unknown MUST NOT mean failed, one successful check MUST NOT imply stable ability, and confidence denotes evidence support.
- Formal Micro attempts MUST retain failed as well as successful observations, stable source identities, evaluated-content identity, idempotency and frozen Criterion versions. Instruction/exploration completion and client H5P reports MUST NOT manufacture criterion-performance evidence.
- Candidate generation MUST precede recommendation policy. Ownership, publish state, real assets, completion and factual instructional prerequisites are hard constraints; policy MUST NOT reintroduce filtered actions.
- Fixed and Rule MUST share action/selection contracts and the existing NavigationDecision authority. Model policy remains unsupported until independently implemented and validated; LLM output is not recommendation authority.
- State–Action–Outcome lineage MUST use explicit validated decision attribution, bounded state summaries, version/hash/cutoff and immutable observations. Manual actions MUST NOT be attributed to a guessed previous recommendation.
- Course policy is server configuration. Browsers and learners MUST NOT select production policy, write authoritative criterion state, or provide authoritative evaluations. Review remains presentation-local.
