# 课程、课程创建与课程视图

> 由 AGENTS.md 拆出。修改本领域代码前必须阅读本文件；与 AGENTS.md 冲突时以 AGENTS.md 为准。

## Goal-driven Course Selection

- Product/domain state MUST NOT be encoded by concatenating user-facing prose. Goal, preference, constraint, scope adjustment, outcome change, and UI action MUST remain structurally distinct when they affect product behavior.
- Natural-language keyword lists, regexes, or hand-maintained domain glossaries MUST NOT be authoritative for learning-domain decisions when the Assistant can return a structured semantic result. Product code validates structured identities and factual constraints instead of reinterpreting prose.
- Explicit UI actions SHOULD own deterministic workflow navigation when available; the Assistant MUST NOT require phrase matching for actions already represented by product controls.
- A learner Goal is a planning request unless a current product consumer requires an independent Goal lifecycle. Goal resolution MAY use an LLM as a language adapter, but every suggested Knowledge identity MUST be revalidated against visible active Knowledge; deterministic product logic owns prerequisite closure, Course matching, gaps, and persistence.
- Prerequisite closure MUST use only factual `prerequisite` KnowledgeEdges, remain deterministic, deduplicated, and cycle-safe, and keep target Knowledge distinct from prerequisites. Course matching MUST be based on real Knowledge coverage, expose understandable coverage/gaps, and prefer a suitable existing Course identity before Personal Course creation.
- `CourseTargetKnowledge` is the structured Course destination and MUST remain distinct from optional human-readable `targetOutcome`. Standard and Personal Courses share the Course domain, repository, graph projection, and routes.
- A Personal Course is learner-owned and owner-visible only. Course Creator MAY persist it as an owner-private `draft`; it becomes learner-usable only after explicit Publish and full route validation. It MAY project a minimal curriculum from an existing Course or shared Knowledge, but MUST NOT copy KnowledgeNode or KnowledgeEdge facts and MUST NOT require fabricated Material, Micro, Assignment, Outcome, or FinalProject assets.
- Selecting an existing Course and creating a Personal Course are explicit authenticated learner actions. The LLM tool loop MUST NOT perform the Personal Course write, and Goal planning MUST NOT manufacture a formal Next Action before the Navigation Engine exists.
- Learner-facing Course Search results and Course Creation Briefs MUST be persisted at their conversation position as structured Assistant timeline content. A session MAY contain multiple independent planning results and MUST NOT use one global mutable Goal Plan as historical UI authority.
- Course match levels and coverage metrics are advisory ranking/explanation signals. They MUST NOT remove the learner's ability to use a displayed Course, create from it, continue searching, or prepare a personalized Course route.
- Goal Planner MUST hand creation to the Course creation domain through a recoverable Course Creation Brief. The Assistant tool loop MUST NOT silently create a Personal Course, and novice-language acceptance MUST NOT be satisfied with test-specific phrase mappings or Knowledge/Course fixtures.

## Course Creator Pipeline

- Course creation uses one fixed staged pipeline: Requirements -> Knowledge Scope -> Curriculum Structure -> Learning Assets -> persisted Course Draft -> Learner Preview / explicit Publish. Reference Courses, Materials, Knowledge, learner context, and Golden scenarios are optional inputs and MUST NOT select separate creation modes or bypass stage confirmation.
- Reference Material is optional and MUST NOT be required for Course creation, Knowledge scope, curriculum, or structural validity. Unsupported arbitrary Material parsing MUST remain explicit rather than fabricating Knowledge or asset mappings.
- Course Creator AI uses the one visible EduFlow Assistant identity. AI and manual edits MUST converge on Proposal -> visual Preview/Diff -> deterministic validation -> explicit user confirmation -> Apply. The model MUST NOT directly mutate Course authority data or Publish.
- Course Creator prerequisite labels and edges come only from factual Knowledge Graph `prerequisite` relations. Reference Course curriculum order MAY guide teaching order but MUST NOT create or alter KnowledgeEdge facts.
- A user-facing personalized route produced by Course Creator is a Personal/goal-specific Course. It is not the dynamic learner-specific Learning Path, NavigationDecision, eligible frontier, or Next Action owned by the future Navigation Engine.

## Course Views

- Full Skill Tree renders CurriculumCoverage-referenced active KnowledgeNodes and their shared KnowledgeEdges.
- Full Skill Tree uses prerequisite/enables for layered DAG rank; related edges are hidden unless their endpoint is selected.
- Chapter Overview is a derived aggregation of the atomic course graph by each node's primary chapter. It is not a second knowledge graph.
- Primary chapter is the earliest `introduce` coverage, falling back to the earliest coverage.
- Chapter edges aggregate prerequisite/enables counts per ordered chapter pair and undergo transitive reduction. CurriculumSequence may constrain or minimally connect the projection but MUST NOT become a KnowledgeEdge.
- CurriculumCoverage and AssignmentCoverage remain N:M. Lesson or chapter fields MUST NOT be written into KnowledgeNode.

## Course Layout and Validation

- Course nodes MUST NOT overlap, share coordinates, or use modulo-based placement. Edges MUST route outside node interiors with readable source/target ports.
- ELK (layered DAG) is the single layout authority for course structure; every renderer consumes the same ELK coordinates for the same structural revision.
- The learner course immersive view (skill tree, practice shadow layer, capability model 3D, flattened route editor) is one three.js scene. The front pose uses a near-orthographic camera so the tree reads as 2D; rotation, flattening and skill/practice layer swaps are camera/node animations inside that scene. Node capsules, labels and Object Shell cards are DOM overlays anchored to scene coordinates. The learner view MUST NOT switch renderers at runtime.
- React Flow remains the renderer for editing canvases (Course Creator structure editing, Workflow editor).
- Chapter and Atomic views MUST share one hierarchical course topology and MUST NOT use unrelated independent layout systems.
- Renderer-specific graph objects are projections only and MUST NOT become domain data.
- Layout stability is a product invariant.
- Selection, hover, search, drawer state, and knowledge/assignment presentation mode MUST NOT alter graph layout.
- Only structural graph changes may trigger ELK or force-layout recomputation.
- Course Overview, Focused, and Full views MUST share the same Chapter macro topology.
- Changes MUST pass TypeScript compilation and production build. Relevant pages MUST be checked for runtime errors.

## Course Foundation Invariants

- A structurally valid Course is a learning-route container composed from Course, CourseCurriculum, the current required Chapter/Lesson structure, CurriculumCoverage, and shared active KnowledgeNode/KnowledgeEdge facts.
- Material, MaterialSegment, MaterialKnowledgeCoverage, Micro content, CourseAssignment, AssignmentCoverage, AssignmentDependency, ChapterOutcome, FinalProject, and WorkflowTemplate are optional attached assets and MUST NOT be required for Course structural validity.
- Structural validation is blocking and validates the required route plus every optional asset record that exists. Asset coverage audit is non-blocking and reports missing resources without manufacturing fallback content.
- Course Graph remains a projection of curriculum coverage and shared Knowledge facts. A persisted CourseGraph table or parallel graph ontology MUST NOT be introduced for asset completeness.

## Course Assignment Invariants

- A Course may be structurally valid with no CourseAssignment or AssignmentCoverage. Missing Assignment coverage is a non-blocking asset gap reported by the Course asset coverage audit.
- Assignment is curriculum data and MUST NOT be represented as a KnowledgeNode or KnowledgeRelation.
- The user-facing UI term remains "实训树"; the domain model uses Assignment.
- Assignments are not limited to workflow-canvas tasks. Workflow canvas is an optional execution environment selected by `Assignment.mode`.
- AssignmentCoverage is N:M. One Assignment may cover multiple KnowledgeNodes, and one KnowledgeNode may be covered by multiple Assignments.
- Knowledge and Assignment companion cards occupy one stable graph footprint.
- Switching 技能树 / 实训树 is presentation-only and MUST NOT trigger ELK, fitView, coordinate changes, or viewport reset. The two layers share coordinates: each Knowledge node has its practice shadow offset behind it; switching swaps front/back layers in place. Knowledge without an Assignment shows an empty dashed slot; a multi-Knowledge Assignment is marked on every covered node with the same identity.
- When CourseAssignment or AssignmentCoverage records exist, their ownership, references, cardinality, ordering, and dependency DAG MUST remain structurally valid. Missing coverage MUST NOT be replaced with generated fallback Assignment content.
- Assignment progress is distinct from Knowledge mastery.
- Assignment outputs may contribute to larger chapter/course outcomes without becoming KnowledgeNodes.
- Assignment completion may produce KnowledgeEvidence in a future evidence pipeline, but completion MUST NOT automatically set mastery.
- Phase 4.3 Mapping Gold uses Practice as evaluation terminology; production continues to use CourseAssignment and AssignmentCoverage and MUST NOT introduce a parallel Practice domain for the same teaching task.
- AssignmentDependency is a course-owned direct teaching/execution prerequisite between Assignments. It MUST use stable Assignment IDs, remain acyclic, and MUST NOT be mechanically copied from KnowledgeEdge.
- ChapterOutcome and FinalProject composition MUST use stable course-owned identities and explicit Assignment-to-Outcome and Outcome-to-FinalProject relations; titles and projectContribution text are presentation content, not relationship identity.
- Goal-constrained Assignment planning MUST combine the persisted Course target outcome with existing Course Knowledge and its factual DAG; planning Steps MUST reference only real active Course Knowledge IDs and MUST NOT invent Knowledge.
- When the optional goal-constrained Assignment planning pipeline runs, every planning Step contains at least one Knowledge ID, the generated mapping covers all Course Knowledge, and one MVP planning Step produces exactly one CourseAssignment. An integrated Assignment MAY cover multiple KnowledgeNodes. This mapping-output invariant MUST NOT become a minimum Course structural requirement.

## Course Presentation Stability

- 技能树 / 实训树 switching is presentation-only.

## Learner Course Membership and Context

- A Published Course is platform-available; it is not automatically a learner's Course. `UserCourseState.isActive` is the durable My Courses membership signal, and client projection placeholders MUST be inactive.
- The first Course-scoped Start Knowledge, Micro, Material, or Assignment action activates that Course. Browsing a Course, opening a Drawer, or switching Knowledge context MUST NOT activate it; Standalone Global Micro MUST NOT activate any Course.
- Removing a Course changes only membership and MUST preserve Knowledge state, evidence, Micro progress, Material progress, and Assignment state. A later Course-scoped learning action may reactivate it.
- Learner Knowledge context options include Standalone plus Published Courses covering that Knowledge. Context switching is presentation-only and MUST NOT mutate learner state.
- Standalone exposes only Global Micro. A Course context resolves its own Micro before Global fallback, and exposes only that Course's Materials and Assignments. Using Global Micro inside an explicit Course context remains a Course-scoped learning action.

## Course Authoring Drafts

- Persisted Course authoring drafts are server-side, teacher/admin-only, and are never learner-visible.
- A Draft Course is a valid editing container and MAY temporarily have zero CurriculumCoverage, Course Knowledge, Material, Micro, Assignment, Outcome, FinalProject, or targetOutcome. Missing minimum-route content is incompleteness, not corruption.
- Draft repository hydration MUST still validate every existing owned entity, reference, ownership boundary, and ordering invariant; `draft` MUST NOT suppress dangling or cross-Course data failures.
- A Course MUST pass the full minimum route validation before its lifecycle becomes `published` and learner-usable. Published and archived runtimes retain strict structural validation during repository hydration.
- Editing a published Course changes only its draft projection until validated Publish succeeds.
- Preview is derived from the published base plus the current persisted authoring draft; browser localStorage is not authoring content authority.
- Publish must materialize the validated draft transactionally into canonical Course data and clear the applied draft.
- Chapter and Atomic nodes MUST use a consistent Knowledge / Assignment companion visual language.
- Mode switching MUST NOT trigger ELK, fitView, coordinate changes, edge changes, or viewport reset.

## Course Authoring Overlay Invariants

- Prototype Course authoring MUST derive an Editable View from immutable Repository data plus a course-scoped Draft Overlay; it MUST NOT mutate repository fixtures or duplicate the complete `CourseRuntimeData`.
- A course-local Draft Knowledge Candidate MUST remain inside the authoring overlay and MUST NOT silently create, replace, or delete a Global KnowledgeNode or appear in the Global-only map.
- AI structure authoring MUST emit a Proposal/Patch, show its operations for preview, and pass deterministic reference and DAG validation before Apply; providers MUST NOT directly mutate React Flow nodes, KnowledgeEdges, or Course runtime data.
- Course authoring selection and Drawer visibility are independent presentation state. Closing the Drawer MUST release its layout reservation without clearing the selected graph anchor or resetting the viewport.
- A cross-Chapter Knowledge drop MUST commit Chapter ownership and Chapter-relative manual position in one Draft Overlay snapshot and MUST be rejected if the resulting Chapter projection is cyclic.

## Course Selection & Drawer Invariants

- In the new UI, "Drawer" means the node Object Shell (card S anchored at the node, expandable to a side panel); it never slides in from the screen edge.

- Course selection MUST be anchor-based. A selected anchor is a stable location in the course graph: a Chapter or an atomic KnowledgeNode.
- 技能树 / 实训树 mode determines the active Knowledge / Assignment detail facet. Switching mode MUST preserve the selected anchor and synchronize an open Drawer instead of closing it or leaving stale content.
- Chapter Assignment detail is an aggregate presentation derived from Assignments covered by the Chapter; it MUST NOT create a `ChapterAssignment` ontology or domain entity.
- If a KnowledgeNode has multiple Assignments, the Assignment facet MUST first expose an Assignment Group and MUST NOT silently open the first Assignment.
- Search, prerequisite navigation, and focus actions MUST preserve the current Course mode and facet.
- Only the foreground Knowledge / Assignment companion layer may receive pointer events.

## Data-driven Frontend Invariants

- Generic pages and services MUST resolve course data by route `courseId`; an unknown course or cross-course material reference MUST render Not Found and MUST NOT fall back to a demo course.
- Course Center cards, search results, metrics, recent learning, Atlas course links, material navigation, and workflow launch context MUST be derived from repositories and runtime data.
- Agentic AI and Python Engineering identifiers, titles, counts, lesson rules, or workflow mappings may exist only in explicit demo seeds/adapters, never in generic UI algorithms.
- Adding a valid course seed to the demo repository MUST be sufficient for it to appear in Course Center and work through the shared routes and projections.

## Repository and Projection Invariants

- `CourseRepository` is the read boundary for `CourseRuntimeData`; pages MUST NOT import a specific course seed.
- `CourseRepository` exposes Course definitions only through `listCourseRuntimes()` and `getCourse(courseId)`; it MUST NOT return fixed user status or progress summaries.
- Course graph projection, ELK layout, and React Flow adaptation MUST be pure functions of explicit runtime/projection inputs.
- ELK caches MUST be keyed by course identity plus structural revision. Presentation state MUST NOT participate in that cache key.
- CurriculumCoverage, AssignmentCoverage, MaterialKnowledgeCoverage, and Atlas course contexts remain N:M projections over shared stable KnowledgeNode IDs.

## Course Repository Boundary

- `CourseRepository` exposes `CourseRuntimeData` definitions only.
- User-specific status and progress MUST be derived from Course runtime, LearningProgress, and UserKnowledge inputs by application/projection logic.
- Repositories MUST NOT manufacture fixed `not-started` or `0%` summaries without user identity and state.

## Course Definition Purity

- Course and Curriculum definitions MUST NOT contain mutable user progress.
- `CurriculumChapter` MUST NOT contain `progress`; Chapter progress is derived only in user-scoped Course projections or summaries.
- User progress belongs to `UserCourseState`, `UserKnowledgeState`, and derived Course projections/summaries.

## Chapter / Lesson Ownership

- `CurriculumLesson.chapterId` is the sole authoritative Chapter-membership relation.
- `CurriculumChapter` MUST NOT duplicate Lesson membership through `lessonIds`.
- Chapter Lesson lists and counts MUST be derived from the runtime Lessons.

## Curriculum Ordering

- Instructional order MUST be explicit curriculum data.
- `CurriculumCoverage.order` is the deterministic Knowledge coverage order inside one Lesson; it is not KnowledgeNode, Domain, or graph-topology order.
- Entity IDs, ID prefixes, UUID lexical order, Coverage ID order, and fixture-array order MUST NOT define curriculum presentation order. IDs MAY be used only as a final deterministic tie-break.

## Explicit Ordering

- `CurriculumChapter.order` and `CurriculumLesson.order` are unique course-wide; `CurriculumCoverage.order` is unique within a Lesson.
- `Material.order` is unique within a Course. Non-PDF content uses `MaterialSegment.order`; PDF content uses the complete unique `page` sequence. `CourseAssignment.order` is unique course-wide.
- Canonical helpers own curriculum, material coverage, segment, material, and Assignment sorting. Fixture-array order and IDs MUST NOT substitute for these fields.

## Shared Selection Rules

- Primary CurriculumCoverage is `introduce` first, then `lesson.order`, `coverage.order`, and stable ID only for a final tie.
- Course Knowledge order is `lesson.order -> coverage.order -> role -> nodeId -> coverageId`.
- Material coverage role priority is `introduce -> explain -> example -> practice-reference`, followed by the authoritative Segment order and stable identity tie-breaks.

## Course-Scoped Identity

- `Course.id`, `KnowledgeNode.id`, and governed `KnowledgeDomain.id` are global identities within their respective repositories.
- Course-owned `CurriculumChapter`, `CurriculumLesson`, `CurriculumCoverage`, `CurriculumSequence`, `Material`, `MaterialSegment`, `CourseAssignment`, `AssignmentCoverage`, and `MaterialKnowledgeCoverage` IDs MUST NOT be assumed globally unique across Courses.
- Cross-course projections MUST scope Course-owned identity by `courseId` or resolve entities inside each `CourseRuntimeData`.

## AssignmentCoverage Cardinality

- V1 permits at most one `AssignmentCoverage` for each `(assignmentId, nodeId)` pair. `role` is the single attribute of that relation and MUST NOT be used to make duplicate pairs distinct.
- Projections MAY deduplicate the same Assignment reached through different KnowledgeNodes, but MUST NOT hide duplicate Assignment–Knowledge relations.

## Prototype Data Model Freeze

- The prototype model frozen on 2026-08-10 is the backend contract baseline. Backend adapters MUST preserve these identities, ownership relations, ordering fields, and validation rules.
- IDs provide stable identity only. They MUST NOT encode business order, fixture position, or relationship meaning.

## UI Demo Boundary

- Generic product pages MUST NOT contain concrete Demo course identities such as Agentic AI or Python Engineering unless that content is explicitly injected by a Demo configuration or adapter.

## Assignment Experience and Demo Provider Boundaries

- `AssignmentExperience` is optional execution/presentation metadata on CourseAssignment; it MUST NOT create a parallel Practice ontology or change Assignment ownership and coverage semantics.
- Generic Assignment UI may select an answer, code/file, trace, or workflow renderer only from explicit Assignment metadata and MUST NOT branch on Demo Course or Assignment identities.
- Generic Lesson and Workflow UI consume provider/result contracts. Concrete Demo lesson scripts and fixed assessment content MUST live under `src/demo` and be injected by the application composition root.
- Workflow assessment resolution MUST use the complete explicit `(courseId, assignmentId, workflowTemplateId)` launch context; template identity alone MUST NOT select Course-specific feedback.
