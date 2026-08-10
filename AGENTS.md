# EduFlow Repository Instructions

## Package Manager

- pnpm is the only supported package manager. Dependency changes MUST update `pnpm-lock.yaml` with pnpm.
- `package-lock.json`, `yarn.lock`, and other competing lockfiles MUST NOT be committed.
- Before pushing dependency changes, `pnpm install --frozen-lockfile` MUST succeed.

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
- KnowledgeNode-to-Material navigation MUST resolve a deterministic primary Segment by `introduce > explain > example > practice-reference > earliest segment order`.
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

## Domain Scope Permission Invariants

- Every manual Domain mutation, including unassignment and proposal review, requires `global-domain-admin` in v1.
- `tenant-domain-admin`, Domain scope branching, and proposal scope branching MUST NOT exist in the V1 runtime.
