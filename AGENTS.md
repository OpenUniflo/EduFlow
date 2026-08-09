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
- `DomainAssignment` is the only authoritative Domain-membership source. A legacy seed `KnowledgeNode.domainId` is never runtime authority. Domain membership MUST NOT determine coordinates or grouping.
- `clusterId` and persistent Knowledge Cluster structures MUST NOT be added to the v1 core model.
- Fake nodes or edges MUST NOT be created for layout, composition, islands, bridges, chapters, or demos.

## Atlas Views

- Global Atlas renders active Global-scope nodes and factual edges only.
- Personal Atlas core nodes are active mastered/learning nodes with UserKnowledgeState. Explore nodes are all active non-core nodes directly connected to any core node, treating edge direction as irrelevant for one-hop visibility.
- Personal Atlas uses deterministic relation-driven force layout. It MUST NOT use domain, cluster, chapter, community, or island anchors.
- Community detection is an optional analysis technique, not a required product entity or visible region. Default Personal Atlas MUST NOT render community/island hulls, titles, quotas, or potential bridges.
- Personal edges use a neutral undirected visual by default while preserving their factual relation and direction in data and details.

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
- `KnowledgeDomain` MUST NOT directly constrain graph geometry. Changing Domain membership MUST NOT trigger graph relayout.
- Every `KnowledgeNode` has at most one primary Domain in v1. Unclassified is a valid state.
- Domain assignment uses semantic and structural evidence. Automatic discovery creates proposals, not authoritative Domains.
- An admin `DomainAssignment` is pinned and MUST NOT be overwritten automatically.
- Changing Domain membership MUST NOT create, delete, or modify `KnowledgeEdge` facts.
- Domain color belongs to `KnowledgeDomain.canonicalColor` and MUST NOT be copied into `KnowledgeNode`.
- Global Domains are governed by Global Admin; Tenant Domains are governed by Tenant Admin. Users do not create formal Domains in v1.

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
- Course graph projection, ELK layout, and React Flow adaptation MUST be pure functions of explicit runtime/projection inputs.
- ELK caches MUST be keyed by course identity plus structural revision. Presentation state MUST NOT participate in that cache key.
- CurriculumCoverage, AssignmentCoverage, MaterialKnowledgeCoverage, and Atlas course contexts remain N:M projections over shared stable KnowledgeNode IDs.

## Material Invariants

- `Material` belongs to a Course and Lesson and is composed of addressable `MaterialSegment` records.
- `MaterialKnowledgeCoverage` is the authoritative N:M mapping between material segments and KnowledgeNodes. Page-number switches and course-specific material lookup tables are forbidden in generic viewers.
- Material routes MUST validate both material existence and course ownership.
- Zero, one, and multiple matching materials MUST be represented honestly; generic UI MUST NOT silently open an unrelated fixed material.

## User Learning State Invariants

- User progress is mutable user state and MUST NOT be stored in course definitions, material definitions, or graph projections.
- `UserCourseState` is scoped by both `userId` and `courseId`; material state is additionally keyed by `materialId`, and assignment state by stable `assignmentId`.
- Assignment completion MUST update the explicit launched `assignmentId`; workflow template identity alone is insufficient because templates may be shared.
- Knowledge mastery remains separate from course progress, material reading progress, and assignment completion.

## Domain Lifecycle and Authority

- Domain definitions and assignments are loaded and persisted through a governance repository; demo seeds are initialization data only.
- Archiving a Domain requires explicit governance authority, MUST be rejected while active members remain, and archived Domains MUST reject new assignments.
- Domain mutations require an explicit actor/capability. Generic stores MUST NOT manufacture default administrator authority.
- Pinned admin assignments have precedence over automatic scoring, candidate recomputation, and proposals.
