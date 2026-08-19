# EduFlow Repository Instructions

## Package Manager

- pnpm is the only supported package manager. Dependency changes MUST update `pnpm-lock.yaml` with pnpm.
- `package-lock.json`, `yarn.lock`, and other competing lockfiles MUST NOT be committed.
- Before pushing dependency changes, `pnpm install --frozen-lockfile` MUST succeed.

## Frontend Project Structure

- `src/app` owns application assembly, providers, and the `ApplicationServices` composition root.
- `src/features` owns product feature code. Production Feature code MUST NOT import `src/demo`; pure Feature Core MUST NOT import `src/app` or the `applicationServices` singleton.
- `src/demo` owns concrete Demo fixtures, seeds, and adapters and may depend inward on Feature contracts and types. `src/app` performs the final wiring.
- `src/shared` owns only cross-Feature utilities, components, types, and styles and MUST NOT depend on `src/features`, `src/demo`, or `src/app`.
- Cross-top-level imports SHOULD use the single `@/* -> src/*` alias. Short relative imports within one Feature may remain relative.

## Knowledge and Curriculum Boundaries

- EduFlow MUST maintain one shared Knowledge Graph composed of `KnowledgeNode`, `KnowledgeEdge`, and user-owned `UserKnowledgeState`.
- Global Atlas, Personal Atlas, and Course Skill Tree are views over that shared graph. They MUST NOT maintain separate knowledge facts.
- Curriculum data is separate: Course, Chapter, Lesson, CurriculumCoverage, CurriculumSequence, Material, CourseAssignment, and AssignmentCoverage may reference stable node IDs but MUST NOT duplicate KnowledgeEdge facts.

## KnowledgeNode Is Atomic

- A `KnowledgeNode` is the smallest independently teachable, assessable, and reusable knowledge or capability unit.
- Course, Chapter, Lesson, Stage, Outcome, Project, Community, Island, Domain, and Cluster MUST NOT be KnowledgeNodes.
- Persistent scope is exactly `global`, `tenant`, or `user`; Course is provenance and curriculum context, never node ownership.
- Stable node identity, revision history, provenance, lifecycle, mappings, mastery, and evidence lineage MUST be preserved across edits, split, merge, course deletion, and mapping.

## Relations and Metadata

- Knowledge-to-knowledge facts use only `prerequisite`, `enables`, or `related` KnowledgeEdges.
- CurriculumCoverage, AssignmentCoverage, KnowledgeMapping, and Promotion MUST remain separate from KnowledgeEdge.
- `KnowledgeNode` MUST NOT contain `domainId`; `KnowledgeGraph` MUST NOT contain Domain definitions or assignments.
- `DomainAssignment` is the only authoritative Domain-membership source. Domain membership MUST NOT be inferred from tags, provenance, fixture location, or course context and MUST NOT determine coordinates or grouping.
- `clusterId` and persistent Knowledge Cluster structures MUST NOT be added to the v1 core model.
- Fake nodes or edges MUST NOT be created for layout, composition, islands, bridges, chapters, or demos.

## Knowledge Relation Invariants

- Knowledge Atlas topology MUST be derived from real KnowledgeEdge facts. KnowledgeDomain membership and same-domain visual attraction MUST NOT create or imply synthetic KnowledgeEdges.
- Cross-domain connectivity is not a quality requirement. The absence of a cross-domain KnowledgeEdge may be meaningful and MUST NOT be repaired for presentation.
- Atomic Knowledge extraction MUST be followed by relation reconstruction covering within-module facts, cross-module facts inside the same semantic knowledge system, and relations lost when composite nodes were atomized.
- Unexpected fragmentation in a mature Domain SHOULD trigger relation completeness review before layout compensation.
- Relation quality review SHOULD inspect connected components, isolated nodes, low-degree nodes, and missing cross-module facts. These are audit signals, never reasons to manufacture edges.
- KnowledgeEdge IDs MUST be deterministic from stable relation semantics and MUST NOT depend on seed-array index or ordering. `related` IDs MUST normalize the unordered endpoint pair.
- Domain relation audits MUST enumerate active governed Domains with assigned active nodes; generic audit code MUST NOT hardcode demo Domain identities.

## Atlas Views

- Global Atlas renders active Global-scope nodes and factual edges only.
- Personal Atlas core nodes are active mastered/learning nodes with UserKnowledgeState. Explore nodes are all active non-core nodes directly connected to any core node, treating edge direction as irrelevant for one-hop visibility.
- Personal Atlas uses deterministic relation-driven force layout. It MUST NOT use domain, cluster, chapter, community, or island anchors.
- Community detection is an optional analysis technique, not a required product entity or visible region. Default Personal Atlas MUST NOT render community/island hulls, titles, quotas, or potential bridges.
- Personal edges use a neutral undirected visual by default while preserving their factual relation and direction in data and details.
- Personal Atlas MAY contain disconnected knowledge islands. Explore–Explore edges MUST NOT be revealed solely to preserve visual connectivity.

## Atlas Stability

- Knowledge Atlas is a stable spatial world.
- Hover, selection, search, learning state, Domain changes, filters, and drawer state MUST NOT trigger graph relayout.
- Auto rotation MUST pause while a node is hovered or selected. Manual camera interaction MUST receive a grace period before rotation may resume.
- Visual node size and interaction hit target MUST be decoupled.
- Force positions MUST freeze after stabilization and remain frozen until the structural node/edge set changes.

## Atlas Visual Encoding

- Domain hue represents semantic Domain; node size represents graph importance; a marker or ring represents user learning state; opacity represents focus/explore visibility; halo and scale represent interaction; position is driven by KnowledgeEdges.
- Domain color MUST NOT be replaced by mastery or learning colors.
- Atlas nodes use a dot-first visual, KnowledgeEdges use neutral thread colors by default, and ordinary labels use sparse map-label styling.

## Domain Invariants

- `KnowledgeDomain` is a governed semantic classification entity and MUST NOT be represented as a `KnowledgeNode`.
- V1 supports Global KnowledgeDomain governance only. Tenant Domain governance is deferred.
- Core V1 models, stores, services, permissions, persistence, and UI MUST NOT expose partial Tenant Domain behavior.
- A future Tenant Domain implementation MUST add tenant ownership, tenant-scoped authority, repository isolation, assignment isolation, and persistence isolation as one coherent feature.
- `KnowledgeDomain` MUST NOT directly constrain graph geometry. Changing Domain membership MUST NOT trigger graph relayout.
- Every `KnowledgeNode` has at most one primary Domain in v1. Unclassified is a valid state.
- Domain assignment uses semantic and structural evidence. Automatic discovery creates proposals, not authoritative Domains.
- An admin `DomainAssignment` is pinned and MUST NOT be overwritten automatically.
- Changing Domain membership MUST NOT create, delete, or modify `KnowledgeEdge` facts.
- Domain color belongs to `KnowledgeDomain.canonicalColor` and MUST NOT be copied into `KnowledgeNode`.
- Formal Domains are governed only by Global Admin in v1. Users do not create formal Domains.

## Core / Demo Domain Boundary

- Core Domain services MUST NOT import demo KnowledgeNode or KnowledgeEdge fixtures, concrete demo Domain definitions, concrete demo DomainAssignments, or demo Domain proposals.
- Concrete demo identities MUST live under explicit demo fixtures/adapters.
- Domain membership MUST be represented explicitly by `DomainAssignment` and MUST NOT be inferred from fixture file location, module name, course provenance, tags, node naming, or node ID prefix.
- Generic Domain application logic MUST consume Knowledge data through `KnowledgeRepository` or explicit `KnowledgeGraph` input. Generic Domain code MUST NOT read static demo graph singletons.

## Course Views

- Full Skill Tree renders CurriculumCoverage-referenced active KnowledgeNodes and their shared KnowledgeEdges.
- Full Skill Tree uses prerequisite/enables for layered DAG rank; related edges are hidden unless their endpoint is selected.
- Chapter Overview is a derived aggregation of the atomic course graph by each node's primary chapter. It is not a second knowledge graph.
- Primary chapter is the earliest `introduce` coverage, falling back to the earliest coverage.
- Chapter edges aggregate prerequisite/enables counts per ordered chapter pair and undergo transitive reduction. CurriculumSequence may constrain or minimally connect the projection but MUST NOT become a KnowledgeEdge.
- CurriculumCoverage and AssignmentCoverage remain N:M. Lesson or chapter fields MUST NOT be written into KnowledgeNode.

## Course Assignment Invariants

- Every course KnowledgeNode MUST have at least one AssignmentCoverage.
- Assignment is curriculum data and MUST NOT be represented as a KnowledgeNode or KnowledgeRelation.
- The user-facing UI term remains "实训树"; the domain model uses Assignment.
- Assignments are not limited to workflow-canvas tasks. Workflow canvas is an optional execution environment selected by `Assignment.mode`.
- AssignmentCoverage is N:M. One Assignment may cover multiple KnowledgeNodes, and one KnowledgeNode may be covered by multiple Assignments.
- Knowledge and Assignment companion cards occupy one stable graph footprint.
- Switching 技能树 / 实训树 is presentation-only and MUST NOT trigger ELK, fitView, coordinate changes, or viewport reset.
- Missing AssignmentCoverage is a course-data invariant failure and MUST NOT be silently replaced with generated fallback UI text.
- Assignment progress is distinct from Knowledge mastery.
- Assignment outputs may contribute to larger chapter/course outcomes without becoming KnowledgeNodes.
- Assignment completion may produce KnowledgeEvidence in a future evidence pipeline, but completion MUST NOT automatically set mastery.
- Phase 4.3 Mapping Gold uses Practice as evaluation terminology; production continues to use CourseAssignment and AssignmentCoverage and MUST NOT introduce a parallel Practice domain for the same teaching task.
- AssignmentDependency is a course-owned direct teaching/execution prerequisite between Assignments. It MUST use stable Assignment IDs, remain acyclic, and MUST NOT be mechanically copied from KnowledgeEdge.
- ChapterOutcome and FinalProject composition MUST use stable course-owned identities and explicit Assignment-to-Outcome and Outcome-to-FinalProject relations; titles and projectContribution text are presentation content, not relationship identity.
- Goal-constrained Assignment planning MUST combine the persisted Course target outcome with existing Course Knowledge and its factual DAG; planning Steps MUST reference only real active Course Knowledge IDs and MUST NOT invent Knowledge.
- Every planning Step contains at least one Knowledge ID, all Course Knowledge remains covered by AssignmentCoverage, and one MVP planning Step produces exactly one CourseAssignment. An integrated Assignment MAY cover multiple KnowledgeNodes.

## Layout and Validation

- Atlas layouts MUST be deterministic for identical graph data and driven by real relation structure.
- Global and Personal views use force layout without metadata centers. Course Full and Chapter Overview use deterministic layered DAG layout.
- Course nodes MUST NOT overlap, share coordinates, or use modulo-based placement. Edges MUST route outside node interiors with readable source/target ports.
- Course graph production rendering uses React Flow + ELK hierarchical layout.
- Chapter and Atomic views MUST share one hierarchical course topology and MUST NOT use unrelated independent layout systems.
- Global and Personal Atlas MUST use the same `KnowledgeAtlasScene` renderer.
- Renderer-specific graph objects are projections only and MUST NOT become domain data.
- Custom layout/routing code MUST NOT duplicate functionality owned by ELK or the Force Graph engine.
- Layout stability is a product invariant.
- Selection, hover, search, drawer state, and knowledge/assignment presentation mode MUST NOT alter graph layout.
- Only structural graph changes may trigger ELK or force-layout recomputation.
- Course Overview, Focused, and Full views MUST share the same Chapter macro topology.
- Personal and Global Atlas selection MUST operate as camera/highlight presentation over a stable knowledge layout.
- Changes MUST pass TypeScript compilation and production build. Relevant pages MUST be checked for runtime errors.

## Course Presentation Stability

- 技能树 / 实训树 switching is presentation-only.

## Course Authoring Drafts

- Persisted Course authoring drafts are server-side, teacher/admin-only, and are never learner-visible.
- Editing a published Course changes only its draft projection until validated Publish succeeds.
- Preview is derived from the published base plus the current persisted authoring draft; browser localStorage is not authoring content authority.
- Publish must materialize the validated draft transactionally into canonical Course data and clear the applied draft.
- Chapter and Atomic nodes MUST use a consistent Knowledge / Assignment companion visual language.
- Mode switching MUST NOT trigger ELK, fitView, coordinate changes, edge changes, or viewport reset.

## Course Selection & Drawer Invariants

- Course selection MUST be anchor-based. A selected anchor is a stable location in the course graph: a Chapter or an atomic KnowledgeNode.
- 技能树 / 实训树 mode determines the active Knowledge / Assignment detail facet. Switching mode MUST preserve the selected anchor and synchronize an open Drawer instead of closing it or leaving stale content.
- Chapter Assignment detail is an aggregate presentation derived from Assignments covered by the Chapter; it MUST NOT create a `ChapterAssignment` ontology or domain entity.
- If a KnowledgeNode has multiple Assignments, the Assignment facet MUST first expose an Assignment Group and MUST NOT silently open the first Assignment.
- Search, prerequisite navigation, and focus actions MUST preserve the current Course mode and facet.
- Only the foreground Knowledge / Assignment companion layer may receive pointer events.

## Atlas Camera Invariants

- Force lifecycle and camera lifecycle MUST be independent.
- `onEngineStop` MAY freeze structural node positions but MUST NOT automatically alter camera position or zoom.
- Background force simulation completion MUST NOT cause a delayed visible camera transition.
- User camera actions have priority over background graph lifecycle. Reset MUST execute one deterministic camera transition.
- Explicit Fit, Search Focus, and Selection Focus may change the camera because they are user-driven actions.
- Domain changes, status changes, drawer state, and presentation state MUST NOT alter the camera.

## Domain Unclassified Invariants

- Unclassified is a first-class valid governance state. A node with no `DomainAssignment` is Unclassified.
- Domain Management MUST allow administrators to inspect, select, and move Unclassified nodes.
- Moving a node manually to a Domain creates an admin, pinned `DomainAssignment`.
- Domain assignment and Domain color changes MUST NOT alter KnowledgeEdges, graph layout, or camera state.

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

## Course Repository Boundary

- `CourseRepository` exposes `CourseRuntimeData` definitions only.
- User-specific status and progress MUST be derived from Course runtime, LearningProgress, and UserKnowledge inputs by application/projection logic.
- Repositories MUST NOT manufacture fixed `not-started` or `0%` summaries without user identity and state.

## Learning Progress Boundary

- Core LearningProgress repositories MUST NOT import Demo state fixtures.
- Demo initial state MUST be injected through a `UserCourseStateFactory` at the application composition root.
- Persisted learning progress MUST use a versioned schema envelope, validate nested state identity, and migrate supported legacy records before use.

## Domain Visibility

- Global Domain governance does not imply Global-only Knowledge visibility.
- Generic automatic Domain assignment and topology inspection MUST operate on an explicitly supplied `KnowledgeAccessContext` or `KnowledgeGraph`.
- Domain services and adapters MUST NOT silently replace caller visibility with `globalKnowledgeAccess`.

## Prototype Data Model Freeze

- The prototype model frozen on 2026-08-10 is the backend contract baseline. Backend adapters MUST preserve these identities, ownership relations, ordering fields, and validation rules.
- IDs provide stable identity only. They MUST NOT encode business order, fixture position, or relationship meaning.

## Material / Assignment Relation

- `MaterialSegment` MUST NOT contain Assignment IDs.
- Material Assignment context follows only `MaterialSegment -> MaterialKnowledgeCoverage -> KnowledgeNode -> AssignmentCoverage -> CourseAssignment`.
- Generic projection MUST NOT synthesize fallback AssignmentCoverage records. A future direct Material/Assignment relation requires its own explicit relation entity.

## AssignmentCoverage Cardinality

- V1 permits at most one `AssignmentCoverage` for each `(assignmentId, nodeId)` pair. `role` is the single attribute of that relation and MUST NOT be used to make duplicate pairs distinct.
- Projections MAY deduplicate the same Assignment reached through different KnowledgeNodes, but MUST NOT hide duplicate Assignment–Knowledge relations.

## Explicit Ordering

- `CurriculumChapter.order` and `CurriculumLesson.order` are unique course-wide; `CurriculumCoverage.order` is unique within a Lesson.
- `Material.order` is unique within a Lesson. Non-PDF content uses `MaterialSegment.order`; PDF content uses the complete unique `page` sequence. `CourseAssignment.order` is unique course-wide.
- Canonical helpers own curriculum, material coverage, segment, material, and Assignment sorting. Fixture-array order and IDs MUST NOT substitute for these fields.

## Shared Selection Rules

- Primary CurriculumCoverage is `introduce` first, then `lesson.order`, `coverage.order`, and stable ID only for a final tie.
- Course Knowledge order is `lesson.order -> coverage.order -> role -> nodeId -> coverageId`.
- Material coverage role priority is `introduce -> explain -> example -> practice-reference`, followed by the authoritative Segment order and stable identity tie-breaks.

## Domain Mutation Integrity

- Manual assignment, batch assignment, candidate acceptance, and proposal membership writes MUST receive explicit `KnowledgeAccessContext`.
- Before mutation, every target KnowledgeNode MUST exist, be visible to that context, and be active. Candidate and proposal acceptance MUST revalidate rather than trust stored suggestions.

## Core / Demo Dependency Rule

- Code under Core `src/features/knowledge`, `src/features/course`, `src/features/material`, `src/features/learning/progress`, and `src/features/profile` MUST NOT import `src/demo`.
- Demo repositories, user fixtures, concrete courses, Domains, and static graphs depend inward on Core interfaces and types. The application composition root may wire Demo adapters into Core boundaries.
- Static demo Knowledge graphs are fixtures only; production repositories MUST NOT import or treat them as runtime authority.

## Core / Demo Boundary

- Core packages define reusable contracts, repositories, validation, algorithms, projections, and governance.
- Concrete Demo fixtures and Demo-specific fixture parsing/building utilities MUST live under `src/demo`.
- Demo may depend on Core. Core MUST NOT depend on Demo.

## Architectural Enforcement

- Core/Demo separation MUST be enforced by dependency direction, not by blacklists of concrete course names, node IDs, user identities, or fixture filenames.

## Knowledge Graph Validation

- `validateKnowledgeGraph` validates generic `KnowledgeGraph` invariants across all supported Knowledge scopes.
- Global-only graph requirements MUST use `validateGlobalKnowledgeGraph` or an equivalently explicit Global validator.

## Pure Core Dependency Boundary

- Pure Core models, algorithms, validators, and projections MUST operate from explicit inputs and MUST NOT import the application composition root or React/application singleton stores.
- `applicationServices` is a composition root, not a Core dependency. UI/application adapters may bind Core contracts to application services.

## Compatibility Export Rule

- Generic compatibility barrels MUST NOT re-export concrete Demo fixtures.
- Concrete Demo compatibility exports, if temporarily required, MUST live under `src/demo` and be explicitly named as Demo compatibility code.

## Domain Resolution

- Pure Domain resolution from `DomainGovernanceState` MUST live in a Core pure helper.
- React/application stores MAY delegate to this helper but MUST NOT be required by pure projections.

## Course-Scoped Identity

- `Course.id`, `KnowledgeNode.id`, and governed `KnowledgeDomain.id` are global identities within their respective repositories.
- Course-owned `CurriculumChapter`, `CurriculumLesson`, `CurriculumCoverage`, `CurriculumSequence`, `Material`, `MaterialSegment`, `CourseAssignment`, `AssignmentCoverage`, and `MaterialKnowledgeCoverage` IDs MUST NOT be assumed globally unique across Courses.
- Cross-course projections MUST scope Course-owned identity by `courseId` or resolve entities inside each `CourseRuntimeData`.

## UI Demo Boundary

- Generic product pages MUST NOT contain concrete Demo course identities such as Agentic AI or Python Engineering unless that content is explicitly injected by a Demo configuration or adapter.

## Material Invariants

- `Material` belongs to a Course and Lesson and is composed of addressable `MaterialSegment` records.
- `MaterialKnowledgeCoverage` is the authoritative N:M mapping between material segments and KnowledgeNodes. Page-number switches and course-specific material lookup tables are forbidden in generic viewers.
- Material routes MUST validate both material existence and course ownership.
- Zero, one, and multiple matching materials MUST be represented honestly; generic UI MUST NOT silently open an unrelated fixed material.

## User Learning State Invariants

- User progress is mutable user state and MUST NOT be persisted in course, curriculum, material, or structural graph definitions; user-scoped presentation projections MAY derive it from explicit user-state inputs.
- `UserCourseState` is scoped by both `userId` and `courseId`; material state is additionally keyed by `materialId`, and assignment state by stable `assignmentId`.
- Assignment completion MUST update the explicit launched `assignmentId`; workflow template identity alone is insufficient because templates may be shared.
- Knowledge mastery remains separate from course progress, material reading progress, and assignment completion.

## Domain Lifecycle and Authority

- Domain definitions and assignments are loaded and persisted through a governance repository; demo seeds are initialization data only.
- Archiving a Domain requires explicit governance authority, MUST be rejected while active members remain, and archived Domains MUST reject new assignments.
- Domain mutations require an explicit actor/capability. Generic stores MUST NOT manufacture default administrator authority.
- Pinned admin assignments have precedence over automatic scoring, candidate recomputation, and proposals.
- Concrete Domain definitions and seed assignments MUST live in demo adapters/fixtures, never in the core Domain package.
- Persisted Domain governance state MUST use a versioned schema/seed envelope and reconcile seed upgrades while preserving valid administrator changes and explicit unassignment.

## Material Reader Invariants

- The current Material Reader DOM and layout CSS MUST have one scoped authority. Archived reader selectors MUST be removed or isolated so build output never depends on HMR or stylesheet injection order.
- Material navigation MUST support explicit `?segment=` deep links. An explicit valid URL Segment takes precedence over saved reading position, which takes precedence over the first Segment.
- KnowledgeNode-to-Material navigation MUST resolve a deterministic primary Segment by `introduce > explain > example > practice-reference > authoritative segment order` (`order` for non-PDF, `page` for PDF), then stable ID only as a final tie.
- Scrolling, active Segment, outline selection, Knowledge context, Assignment context, URL, and recent reading position MUST represent the same MaterialSegment.
- Segment-to-URL synchronization MUST use history replacement, not one history entry per viewed Segment.
- Reading completion MUST be derived from actually viewed/completed Segment identities and MUST NOT be inferred from the current Segment's numeric position.
- MaterialKnowledgeCoverage is authoritative for Segment-to-Knowledge relationships. Generic readers MUST NOT contain course-specific page mappings.

## Original Material Invariants

- Original course material is authoritative presentation content. For PDF Material, the center reader MUST render the original PDF pages instead of reconstructing them from HTML cards.
- Knowledge, Assignment, Domain, and progress metadata remain external to the source PDF. Changing mappings MUST NOT require rewriting the PDF file.
- The source PDF is curriculum content and MUST NOT become a KnowledgeNode or determine Knowledge identity.

## PDF Material Invariants

- For PDF Material, one PDF page equals one MaterialSegment. `MaterialSegment.page` maps deterministically to a source page in the complete range `1..pageCount`.
- PDF source metadata, Segment count, unique page numbers, and MaterialKnowledgeCoverage references MUST be validated before rendering.
- PDF.js worker assets MUST be bundled by Vite with production-stable URLs. An iframe or browser-native PDF toolbar is not the primary reader.
- Document and Article renderers MUST coexist with the PDF renderer.

## Reader State Invariants

- `activeSegmentId` is the single live reading-position state for PDF page, Outline, Knowledge context, Assignment context, URL, and persisted recent position.
- Initial alignment runs only for a new Material or genuine external Segment navigation. Normal scrolling and reader-originated URL replacement MUST NOT restart it.
- Programmatic navigation and observer navigation MUST be explicitly distinguished. Observer changes are ignored until the requested page is stably visible.
- Reader URL updates preserve unrelated query parameters and use history replacement.
- Pinning Knowledge detail survives page changes until the user explicitly unpins it.
- Programmatic jumps MUST NOT mark intermediate PDF pages as viewed.

## Material Header Layout Invariants

- Material Reader MUST reserve layout space for GlobalNav. GlobalNav and Material Header MUST NOT overlap or resolve overlap through z-index competition.
- Material Header, Outline, PDF viewport, Knowledge panel, and bottom controls SHOULD share Material layout tokens instead of independent magic offsets.
- Responsive GlobalNav reserve MUST contract when the global brand copy is hidden.
- GlobalNav and Material Header MUST be visually independent floating panels; their backgrounds, borders, shadows, and panel surfaces MUST NOT overlap.

## Material Knowledge Context Invariants

- Current Page Knowledge, Selected Knowledge, and Pinned Knowledge are distinct presentation concepts. Selecting a KnowledgeNode MUST NOT automatically pin it.
- Pinning is an explicit action and stores only the stable KnowledgeNode ID, never a copied Knowledge object, description, Domain color, or Assignment snapshot.
- Effective Knowledge resolves as pinned Knowledge, then selected Knowledge, then the deterministic current-page primary Knowledge.
- While pinned, Knowledge Detail and Knowledge-specific Assignment Context stay attached to the pinned Knowledge; Current Page Knowledge coverage continues following the active MaterialSegment.
- Unpinning immediately restores current-page-linked selection. Material identity changes clear the presentation-only Pin state.
- Current-page Knowledge contexts MUST be ordered deterministically by `introduce > explain > example > practice-reference`, then stable `nodeId`, independent of MaterialKnowledgeCoverage input order.
- Pinned Knowledge Context MUST remain stable while the PDF reading position changes. Pinned mode hides the primary Current Page Coverage region so page changes cannot displace or visually compete with pinned detail.
- Pinning MUST NOT control PDF navigation. Unpinning MUST restore context from the current active MaterialSegment without changing the PDF position.

## Material Assignment Context Invariants

- Page-level Assignment Context and Knowledge-specific Assignment Context are separate projections.
- Knowledge Detail MUST show Assignments covered by its effective KnowledgeNode and MUST NOT include unrelated Assignments from other KnowledgeNodes on the same MaterialSegment.
- Knowledge selection and Pin state are downstream of `activeSegmentId`; they MUST NOT restart PDF initialization or change PDF scroll, URL ownership, activeSegmentId, or zoom.

## Knowledge Progress Invariants

- Knowledge mastery and Assignment completion are separate states and separate projections.
- Knowledge presentation MUST use UserKnowledgeState evidence; it MUST NOT display Assignment completion as Knowledge mastery.
- UserMaterialState reading position and reading coverage are separate concepts.
- Opening or reading a Material MUST update its Lesson as the user's recent Lesson through LearningProgressRepository, never through direct local-storage writes.

## Learning Experience Ordering

- Course instructional order is the learning-path backbone; factual prerequisite edges determine new-learning eligibility; explicit UserKnowledgeState determines Learn or Continue presentation.
- Today Queue and Micro Learning entry order MUST use canonical curriculum ordering. IDs, fixture-array order, graph coordinates, Assignment completion, and Material progress MUST NOT determine Knowledge mastery or new-learning order.
- Without reliable review-due data, the product MUST NOT present spaced-repetition due claims. Prototype Micro Learning completion is learning activity, not mastery evidence.

## Unified EduFlow Assistant

- The product has one user-visible EduFlow Assistant identity and shell language. Workspace, experience mode, active context, role, and capabilities determine available actions; Feature-specific providers may remain behind adapters.
- Assistant mutation requires both Design Mode and the existing capability checks. Proposal preview, deterministic validation, Apply, and Undo MUST NOT be bypassed by the unified shell.
- Learn and Explore Assistant actions may explain, recommend, focus, or start supported experiences, but MUST NOT expose curriculum, material, publication, or Domain mutation without the corresponding authority and validation path.

## Product Chrome

- GlobalNav is the single primary top-level chrome. A page title, contextual control, or workspace tool MUST NOT introduce a second full-width fixed header.
- Content and management pages use headings in normal document flow; graph, canvas, and reader pages use only lightweight contextual overlays so their primary workspace remains dominant.
- Micro Learning is interaction-first. Assistant help may be contextual, but product chrome and Assistant actions MUST NOT visually or behaviorally dominate the assessment.

## Micro Learning Assessment Integrity

- Assistant hints and explanations MUST NOT mutate MicroStep answers, grading feedback, Step completion, or Lesson completion, and Assistant actions MUST NOT bypass interaction validation.
- `MicroLearningPath -> MicroUnit -> MicroStep` is the canonical Micro Learning hierarchy. A legacy MicroLesson/provider may exist only as a demo/test adapter and is never runtime authority.
- Required Unit completion and resume state MUST be persisted. A completed required Learn Path creates learning evidence and may reach `learned`; it MUST NOT itself claim `mastered`.
- A Quick Learn CTA MUST be executable only for a published, repository-loaded MicroLearningPath in the Knowledge and Course context. Unsupported and unadapted H5P content MUST render a visible fallback rather than a blank experience.

## Learner State, Evidence, and Assignment Lifecycle

- Durable `UserKnowledgeState` values are `explore`, `learning`, `learned`, `practicing`, and `mastered`. State transitions are monotonic and belong to a centralized policy/application action, never an individual React component.
- Assignment lifecycle is `not_started -> started -> submitted -> accepted` (with optional `needs_revision`). Submission is not acceptance and neither submission nor course completion is Knowledge mastery.
- KnowledgeEvidence is user-owned, source-identified, and idempotent. Supported MVP evidence is completed Micro paths, accepted Assignments, and passed Workflows.
- Mastery requires a completed required Learn Path plus every explicitly required Assignment accepted. A Knowledge without an explicit required Assignment remains `learned` after its required Learn Path.
- Course progress and UserKnowledgeState are separate projections. PersonalLearningPlan is removed; systematic multi-Knowledge learning belongs to a Course, while MicroLearningPath is a within-Knowledge experience.

## Knowledge Source Invariants

- Generic Course and Material code MUST NOT assume all KnowledgeNodes belong to the Global graph.
- Visible Global, Tenant, and User KnowledgeNodes may be referenced by curriculum, Assignment, and Material mappings.
- Global Atlas remains Global-only. Personal Atlas may include visible Global, Tenant, and User nodes according to the active user's state.
- Knowledge lookup MUST use KnowledgeRepository or an explicitly supplied KnowledgeGraph context. KnowledgeRepository is access infrastructure, not a new ontology layer.
- Personal Knowledge data MUST be loaded by active user identity; a shared all-session fixture is not a runtime source.

## Workflow Run Invariants

- WorkflowTemplate is reusable. A Workflow run launched from a Course Assignment MUST preserve `courseId`, `assignmentId`, and `workflowTemplateId`.
- Two Assignments sharing one WorkflowTemplate MUST remain distinguishable in Run History and completion updates.
- Evaluation output is runtime/evidence data, not CourseAssignment or WorkflowTemplate definition data.

## Assignment Experience and Demo Provider Boundaries

- `AssignmentExperience` is optional execution/presentation metadata on CourseAssignment; it MUST NOT create a parallel Practice ontology or change Assignment ownership and coverage semantics.
- Generic Assignment UI may select an answer, code/file, trace, or workflow renderer only from explicit Assignment metadata and MUST NOT branch on Demo Course or Assignment identities.
- Generic Lesson and Workflow UI consume provider/result contracts. Concrete Demo lesson scripts and fixed assessment content MUST live under `src/demo` and be injected by the application composition root.
- Workflow assessment resolution MUST use the complete explicit `(courseId, assignmentId, workflowTemplateId)` launch context; template identity alone MUST NOT select Course-specific feedback.

## Course Authoring Overlay Invariants

- Prototype Course authoring MUST derive an Editable View from immutable Repository data plus a course-scoped Draft Overlay; it MUST NOT mutate repository fixtures or duplicate the complete `CourseRuntimeData`.
- A course-local Draft Knowledge Candidate MUST remain inside the authoring overlay and MUST NOT silently create, replace, or delete a Global KnowledgeNode or appear in the Global Atlas.
- AI structure authoring MUST emit a Proposal/Patch, show its operations for preview, and pass deterministic reference and DAG validation before Apply; providers MUST NOT directly mutate React Flow nodes, KnowledgeEdges, or Course runtime data.
- Course authoring selection and Drawer visibility are independent presentation state. Closing the Drawer MUST release its layout reservation without clearing the selected graph anchor or resetting the viewport.
- A cross-Chapter Knowledge drop MUST commit Chapter ownership and Chapter-relative manual position in one Draft Overlay snapshot and MUST be rejected if the resulting Chapter projection is cyclic.

## Administrator Base Capability

- `role=admin` MUST receive administrator base UI capabilities without requiring the legacy `global-domain-admin` capability. The legacy capability remains a supported additive grant for compatible non-admin accounts.

## Domain Scope Permission Invariants

- Every manual Domain mutation, including unassignment and proposal review, requires `global-domain-admin` in v1.
- `tenant-domain-admin`, Domain scope branching, and proposal scope branching MUST NOT exist in the V1 runtime.

## Workflow Module Boundaries

- Pure Workflow Domain types, factories, and graph operations live under `src/features/workflow/domain` and MUST NOT depend on React, browser storage, Demo fixtures, `src/app`, or the `applicationServices` singleton.
- Workflow Editor UI and editor-only state live under `src/features/workflow/editor` and `src/features/workflow/pages`. App MUST NOT own node, edge, branch, selection, canvas-position, Schema, Environment, Run, or Run History behavior.
- Workflow execution uses the `WorkflowRuntime` contract. The current timed simulation is a Demo adapter under `src/demo/workflows`; the Runtime contract MUST NOT reference Course or Assignment types.
- Workflow Runtime creates Course-independent base Run records. Validated `courseId` and `assignmentId` are optional application/persistence metadata attached before Run History persistence and MUST NOT become Runtime inputs.
- Workflow persistence uses the `WorkflowPersistence` contract. Application runtime uses the API adapter; the LocalStorage adapter and v2 keys remain compatibility/test contracts.
- Any compatibility writer sharing the v2 workflow-settings key MUST preserve Environment, active Environment, and unknown current payload fields when updating legacy preferences.
- Concrete Workflow templates, description-to-template selection, Demo runtime behavior, Demo Environment defaults, and template-specific code exports live under `src/demo/workflows` and depend inward on Workflow contracts.
- Course integration belongs to the application integration layer. Assignment completion requires a validated explicit `courseId`, `assignmentId`, and `workflowTemplateId`; independent runs MUST NOT complete an Assignment, and template identity MUST NOT be used to infer one.
- Assignment metadata is frozen at Workflow Run launch. Completion MUST use that launch snapshot rather than the current route or callback context.
- Generate from Description may select a Demo Template in the Workflow application layer, but the App/page routing layer owns synchronizing `/workflows/:workflowId` and removing stale Assignment query context.

## Backend and Data Runtime

- Committed files under `supabase/migrations` are the authoritative business-schema history. Hosted schema changes MUST use those same locally verified migrations and MUST NOT be recreated manually in Dashboard.
- Local destructive database commands MUST explicitly target Local Supabase. Hosted Supabase MUST NOT be reset by the normal development workflow.
- Local acceptance users MUST never be seeded into Hosted Supabase. Any bootstrap command that creates or updates them MUST reject non-Local Supabase URLs before reading privileged credentials or mutating Auth or database state.
- Browser code may use only the Supabase URL and publishable key. `SUPABASE_SECRET_KEY` MUST remain server-only, MUST NOT use a `VITE_` prefix, and MUST NOT enter client source, build output, logs, health responses, or error responses.
- Feature Core, Domain logic, and repository contracts MUST NOT import Supabase SDK or environment variables. React Features MUST NOT perform direct Supabase table access; `src/app` selects concrete API repositories and may bind Supabase Auth at the application boundary.
- Production and Preview Knowledge, Domain, Course, Material, Learning Progress, and Workflow persistence MUST flow through Repository contracts to `/api` and Supabase. Concrete Demo data is seed/test input, never production runtime authority.
- Shared catalog data uses authenticated read and no browser write. User-owned rows MUST enforce `auth.uid()` ownership through RLS even when trusted server clients also exist.
- `auth.users.id` is the stable user ownership identity. Profiles MUST NOT copy passwords or auth tokens, and email MUST NOT be used as row ownership identity.
- `course-materials` remains private. Browser uploads MUST use a short-lived authorized direct-to-Storage mechanism; large binaries MUST NOT be proxied through Vercel Functions. Trusted metadata writes MUST validate the Course, Lesson, object, type, and PDF Segment completeness.
- Normalized database tables are the persistence source. `CourseRuntimeData` MUST be reconstructed by API mapping and MUST NOT be persisted as one JSONB blob. JSONB is reserved for genuinely document-shaped or structural values.
- Assignment completion remains separate from Knowledge mastery in database writes. Workflow Runs preserve explicit launch-time `courseId`, `assignmentId`, and `workflowTemplateId`; independent Runs MUST NOT infer Course provenance.
- Backend persistence adapters MUST recover serial write sequencing after a rejected request. A failed write remains caller-visible through `flush()`, but MUST NOT permanently prevent later queued writes from executing.
- Workflow Run History is bounded to the newest 20 Runs per `(owner_user_id, workflow_id)` in both application state and backend persistence. The API MUST physically prune obsolete rows without affecting another Workflow or user.
- `DemoWorkflowRuntime` remains the execution adapter until a future runtime round. Backend persistence MUST NOT introduce Course or Assignment dependencies into the Workflow Runtime contract.
