# 知识图谱、领域与档案（Atlas）

> 由 AGENTS.md 拆出。修改本领域代码前必须阅读本文件；与 AGENTS.md 冲突时以 AGENTS.md 为准。

## Knowledge and Curriculum Boundaries

- EduFlow MUST maintain one shared Knowledge Graph composed of `KnowledgeNode`, `KnowledgeEdge`, and user-owned `UserKnowledgeState`.
- The Archive (with its own-subset overlay), the Admin governance map and the Course Skill Tree are views over that shared graph. They MUST NOT maintain separate knowledge facts.
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
- `DomainAssignment` is the only authoritative Domain-membership source. Domain membership MUST NOT be inferred from tags, provenance, fixture location, or course context. It may influence node position only through the default-layout same-Domain attraction defined in Atlas Views; it never creates, removes or implies KnowledgeEdges.
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

- The learner Archive (档案) is one 3D Knowledge Atlas (three.js; free orbit rotation, zoom, pan) over active visible Knowledge and factual edges. There is no Personal/Global mode switch. (2026-10-31; interaction spec: `docs/design/new-ui/DESKTOP_MIGRATION_PLAN.md` §10.)
- Zoom distance selects map-like levels of detail and is presentation only: far shows Domains (KnowledgeDomain-colored regions, name and member count, aggregated inter-Domain links; nodes as small points without labels); mid shows topic groups; near shows individual Knowledge with collision-culled labels that never overlap. Levels cross-fade and MUST NOT relayout.
- Topic groups are communities computed deterministically from factual edges inside each Domain and labeled by their most central member. They are presentation only: not persisted, not KnowledgeNodes, never layout anchors. (Supersedes the former ban on visible community titles, 2026-10-31.)
- Default layout: one deterministic force layout driven by factual KnowledgeEdges plus a weak same-Domain attraction (Unclassified counts as one group), so each Domain forms its own visibly separated cluster while cross-Domain edges stay drawn. Domain attraction moves positions only; every drawn line is a real KnowledgeEdge. It MUST NOT use chapter, community, topic or island anchors. (2026-10-31: relations decide which nodes connect; Domain clustering decides where groups sit.)
- Person focus: selecting a person capsule (the learner, or others only from data the server authorizes for the viewer) switches to a person-centred layout. That person's Knowledge forms a compact core marked by person-colored rings; every other node is placed outward by factual hop distance from the core while keeping its default-layout direction, and stays visible at reduced opacity. Several people form a union core with segmented person-colored rings. The layout is a deterministic, cached function of the structural graph and the selected person set; zoom and rotation inside it MUST NOT relayout. Clearing the selection restores the default layout.
- Course focus: selecting a Course moves that Course's own Knowledge nodes (not a copy or overlay) onto a front plane using the Course's ELK coordinates; all other nodes stay behind at reduced opacity, and edges from Course Knowledge to outside Knowledge stay faintly visible and brighten with their endpoints on hover. Clearing restores the previous layout.
- Selecting a node highlights the node, its incident edges and one-hop neighbours, dims the rest and opens its detail side panel; it MUST NOT relayout.
- The learner's own subset is shown through person focus, never as a persistent hull or frame; the Archive has no separate locate-me control or own-subset highlight toggle.
- Anonymous viewers and the Admin governance view render active Global-scope nodes and factual edges only.
- Archive edges use a neutral undirected visual by default while preserving their factual relation and direction in data and details.
- The Archive MAY contain disconnected knowledge islands. Edges MUST NOT be revealed or invented solely to preserve visual connectivity.

## Atlas Stability

- Knowledge Atlas is a stable spatial world.
- Hover, selection, search, learning state, filters, and drawer state MUST NOT trigger graph relayout. Only structural changes and the explicit layout modes in Atlas Views (person focus, course focus) change node positions; every such change animates existing nodes and is reversible.
- Auto rotation MUST pause while a node is hovered or selected. Manual camera interaction MUST receive a grace period before rotation may resume.
- Visual node size and interaction hit target MUST be decoupled.
- Force positions MUST freeze after stabilization and remain frozen until the structural node/edge set changes.

## Atlas Visual Encoding

- Domain hue represents semantic Domain; node size represents graph importance; a marker or ring represents user learning state; opacity represents focus/explore visibility; halo and scale represent interaction; position is driven by KnowledgeEdges plus same-Domain clustering. Domains visible together MUST have distinct hues; the palette is assigned over Domains that have assigned Knowledge and extends beyond six colors when needed.
- Domain color MUST NOT be replaced by mastery or learning colors.
- Atlas nodes use a dot-first visual, KnowledgeEdges use neutral thread colors by default, and ordinary labels use sparse map-label styling.

## Atlas Camera Invariants

- Force lifecycle and camera lifecycle MUST be independent.
- `onEngineStop` MAY freeze structural node positions but MUST NOT automatically alter camera position or zoom.
- Background force simulation completion MUST NOT cause a delayed visible camera transition.
- User camera actions have priority over background graph lifecycle. Reset MUST execute one deterministic camera transition.
- Explicit Fit, Search Focus, and Selection Focus may change the camera because they are user-driven actions.
- Domain changes, status changes, drawer state, and presentation state MUST NOT alter the camera.

## Atlas Layout

- Atlas layouts MUST be deterministic for identical graph data and driven by real relation structure.
- The Archive uses force layout without metadata centers. Course views use deterministic layered DAG layout (see `course.md`).
- The Archive and the Admin governance map MUST use the same three.js `KnowledgeAtlasScene` renderer. Use batched point rendering, cached deterministic layouts (person-centred layouts keyed by structural revision plus person set, computed off the main thread when large) and point-level detail at far zoom rather than per-node meshes.
- Custom layout/routing code MUST NOT duplicate functionality owned by ELK or the Force Graph engine.
- Archive selection MUST operate as camera/highlight presentation over a stable knowledge layout.

## Knowledge Graph Validation

- `validateKnowledgeGraph` validates generic `KnowledgeGraph` invariants across all supported Knowledge scopes.
- Global-only graph requirements MUST use `validateGlobalKnowledgeGraph` or an equivalently explicit Global validator.

## Knowledge Source Invariants

- Generic Course and Material code MUST NOT assume all KnowledgeNodes belong to the Global graph.
- Visible Global, Tenant, and User KnowledgeNodes may be referenced by curriculum, Assignment, and Material mappings.
- The anonymous and Admin governance maps remain Global-only. The learner Archive may include visible Global, Tenant, and User nodes according to the active user's state.
- Knowledge lookup MUST use KnowledgeRepository or an explicitly supplied KnowledgeGraph context. KnowledgeRepository is access infrastructure, not a new ontology layer.
- Personal Knowledge data MUST be loaded by active user identity; a shared all-session fixture is not a runtime source.

## Domain Invariants

- `KnowledgeDomain` is a governed semantic classification entity and MUST NOT be represented as a `KnowledgeNode`.
- V1 supports Global KnowledgeDomain governance only. Tenant Domain governance is deferred.
- Core V1 models, stores, services, permissions, persistence, and UI MUST NOT expose partial Tenant Domain behavior.
- A future Tenant Domain implementation MUST add tenant ownership, tenant-scoped authority, repository isolation, assignment isolation, and persistence isolation as one coherent feature.
- `KnowledgeDomain` influences geometry only through the default-layout same-Domain attraction. Domain membership is part of the layout's structural key: a membership change recomputes the cached layout on next load, never as a live relayout while the Atlas is open.
- Every `KnowledgeNode` has at most one primary Domain in v1. Unclassified is a valid state.
- Domain assignment uses semantic and structural evidence. Automatic discovery creates proposals, not authoritative Domains.
- An admin `DomainAssignment` is pinned and MUST NOT be overwritten automatically.
- Changing Domain membership MUST NOT create, delete, or modify `KnowledgeEdge` facts.
- Domain color belongs to `KnowledgeDomain.canonicalColor` and MUST NOT be copied into `KnowledgeNode`.
- Formal Domains are governed only by Global Admin in v1. Users do not create formal Domains.

## Core / Demo Domain Boundary

- Core Domain services MUST NOT import demo KnowledgeNode or KnowledgeEdge fixtures, concrete demo Domain definitions, concrete demo DomainAssignments, or demo Domain proposals.
- Concrete Domain and Knowledge identities are database content, never repository fixtures.
- Domain membership MUST be represented explicitly by `DomainAssignment` and MUST NOT be inferred from fixture file location, module name, course provenance, tags, node naming, or node ID prefix.
- Generic Domain application logic MUST consume Knowledge data through `KnowledgeRepository` or explicit `KnowledgeGraph` input. Generic Domain code MUST NOT read static demo graph singletons.

## Domain Unclassified Invariants

- Unclassified is a first-class valid governance state. A node with no `DomainAssignment` is Unclassified.
- Domain Management MUST allow administrators to inspect, select, and move Unclassified nodes.
- Moving a node manually to a Domain creates an admin, pinned `DomainAssignment`.
- Domain assignment and Domain color changes MUST NOT alter KnowledgeEdges, graph layout, or camera state.

## Domain Visibility

- Global Domain governance does not imply Global-only Knowledge visibility.
- Generic automatic Domain assignment and topology inspection MUST operate on an explicitly supplied `KnowledgeAccessContext` or `KnowledgeGraph`.
- Domain services and adapters MUST NOT silently replace caller visibility with `globalKnowledgeAccess`.

## Domain Resolution

- Pure Domain resolution from `DomainGovernanceState` MUST live in a Core pure helper.
- React/application stores MAY delegate to this helper but MUST NOT be required by pure projections.

## Domain Lifecycle and Authority

- Domain definitions and assignments are loaded and persisted through a governance repository; initial definitions are imported into the database, never read from the repository.
- Archiving a Domain requires explicit governance authority, MUST be rejected while active members remain, and archived Domains MUST reject new assignments.
- Domain mutations require an explicit actor/capability. Generic stores MUST NOT manufacture default administrator authority.
- Pinned admin assignments have precedence over automatic scoring, candidate recomputation, and proposals.
- Concrete Domain definitions and assignments are database content, never part of the repository.
- Persisted Domain governance state MUST use a versioned schema envelope and reconcile imported content upgrades while preserving valid administrator changes and explicit unassignment.

## Domain Mutation Integrity

- Manual assignment, batch assignment, candidate acceptance, and proposal membership writes MUST receive explicit `KnowledgeAccessContext`.
- Before mutation, every target KnowledgeNode MUST exist, be visible to that context, and be active. Candidate and proposal acceptance MUST revalidate rather than trust stored suggestions.

## Administrator Base Capability

- `role=admin` MUST receive administrator base UI capabilities without requiring the legacy `global-domain-admin` capability. The legacy capability remains a supported additive grant for compatible non-admin accounts.

## Domain Scope Permission Invariants

- Every manual Domain mutation, including unassignment and proposal review, requires `global-domain-admin` in v1.
- `tenant-domain-admin`, Domain scope branching, and proposal scope branching MUST NOT exist in the V1 runtime.
