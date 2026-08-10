# Knowledge Architecture v1

## 1. Goals

Knowledge Architecture v1 gives EduFlow one durable semantic model for public, institutional, and personal knowledge while keeping curricula and user state separate. The first product version has two core layers:

```text
Knowledge Layer                   Curriculum Layer
├── KnowledgeNode                ├── Course / Chapter / Lesson
├── KnowledgeEdge                ├── CurriculumCoverage / Sequence
└── UserKnowledgeState           └── Material / CourseAssignment / AssignmentCoverage
```

Global Atlas, Personal Atlas, and Course Skill Tree are views over these shared identities, never separate stores of knowledge facts. Mapping, revisions, provenance, lifecycle, and promotion remain supporting governance models without becoming view-specific ontology layers.

## 2. Terminology

- **Knowledge ontology:** persistent KnowledgeNodes and factual KnowledgeRelations.
- **Global / Tenant / User graph:** scope-filtered views over the shared model.
- **Curriculum:** a course-specific teaching arrangement of knowledge.
- **Community:** an optional graph-analysis result, not a required product entity or default visible region.
- **Mapping:** a declared semantic correspondence between independently existing nodes.
- **Promotion:** a governed request to create or select a node in a broader scope.

## 3. Atomic KnowledgeNode definition

> A KnowledgeNode is the smallest independently teachable, assessable and reusable knowledge or capability unit.

An atomic node should support an independent lesson objective, mastery decision, evidence item, prerequisite, and reuse across courses. “Atomic” does not mean the smallest word or term: splitting stops when the child would no longer have independent teaching, assessment, or mastery value.

Course, Chapter, Lesson, Stage, Learning Outcome, Project, Community, Island, Domain, and Cluster are not KnowledgeNodes. Knowledge Cluster is not part of the v1 core data model.

## 4. Node types

Each node has one type:

- `conceptual`: an explanatory model or idea;
- `procedural`: an independently executable capability;
- `representational`: a schema, notation, or information representation;
- `language`: a language construct or communicative capability;
- `meta`: a capability for planning, evaluation, reflection, or learning control.

Every node carries concrete `masteryCriteria`; empty criteria are not valid production ontology content.

## 5. Scope / ownership

Long-lived scope is exactly `global`, `tenant`, or `user`.

- Global: system-owned canonical public knowledge; Global Admin publishes revisions.
- Tenant: school/enterprise shared internal knowledge; `ownerId` identifies the tenant and Tenant Admin publishes revisions.
- User: personally owned knowledge; `ownerId` identifies the user and the owner may edit it.

There is no course scope. A course is a source and curriculum container, not the owner of persistent KnowledgeNodes.

## 6. Provenance

`KnowledgeProvenance` records where a node was discovered or curated, such as a course, uploaded material, tenant source, manual authoring event, or Global catalog. Provenance remains historical even if the source course is deleted. Provenance does not determine ownership, mapping, or promotion.

## 7. Revision lifecycle

`KnowledgeNode.id` is stable identity. Mutable content lives in append-only `KnowledgeNodeRevision` records. `currentRevisionId` selects the active revision. Revisions carry version, author, timestamp, predecessor, and reason.

Referenced nodes are never physically deleted. Lifecycle status is `active`, `deprecated`, or `superseded`; superseded nodes retain lineage (`supersededBy`, `splitFrom`, or `mergedFrom`). Mappings and mastery continue to bind stable node IDs.

## 8. KnowledgeRelation

Knowledge-to-knowledge facts use only:

- `prerequisite`: `A → B` means A is required or recommended before B. Strength is `hard` or `soft` and direction is mandatory.
- `enables`: `A → B` means A enables implementation/application of B without being a cognitive prerequisite. Optional numeric strength is `0..1`.
- `related`: a significant association without prerequisite/enabling semantics. It is structurally undirected by default and may have numeric strength `0..1`.

`implementation-support`, `practice-support`, and `conceptual` are obsolete relation values. Lesson, Assignment, mapping, and promotion relationships are not KnowledgeRelations.

## 9. KnowledgeMapping

`KnowledgeMapping` relates stable nodes N:M using `equivalent`, `narrower-than`, `broader-than`, or `related-to`. Supported directions include User→Global, User→Tenant, and Tenant→Global.

Mapping does not delete, replace, re-own, rewrite, or promote either node. **Mapping != Merge. Mapping != Promotion.** Mapping never copies mastery.

## 10. Mapping governance

- A user may map their User node to an existing Global or Tenant node without Global Admin approval.
- Suggested candidates are inert until a user confirms a mapping.
- Confirmation records actor and time. Suggestions may record confidence but confidence is not approval.

## 11. Promotion governance

Promotion is a separate request lifecycle:

- User→Tenant: user proposes; Tenant Admin approves and creates/selects a Tenant node; then a mapping may be established.
- Tenant→Global: Tenant Admin proposes; Global Admin approves and creates/selects a Global node; then a mapping may be established.
- User→new Global: user proposes; Global Admin approves.

The source node always remains. Promotion approval does not transfer ownership and does not itself mean nodes are equivalent.

## 12. Split / merge

Split supersedes source A and creates A1..An with stable new identities and `splitFrom: A`. Merge supersedes all sources and creates M with `mergedFrom`. Original nodes, revisions, mappings, and evidence remain addressable.

## 13. Mastery migration

Mastery binds a stable node ID. For split, every child inherits the source score and records `masteryOrigin: inherited-from-split` plus `sourceNodeId`. For merge, M receives the simple arithmetic mean of source scores and records `masteryOrigin: inherited-from-merge` plus all source IDs. Mapping performs no mastery migration. Any future inferred Global mastery must be a separately calculated record with confidence.

## 14. Evidence

Evidence binds the node ID and may capture `nodeRevisionId` at creation time. Evidence is append-only lineage. Split and merge may associate existing evidence with successor nodes without erasing original associations. Course deletion does not remove evidence.

## 15. Global Graph

The Global Graph is the `scope=global` subgraph maintained by system administrators. It contains only real atomic public nodes and factual relations between them. Domain is descriptive metadata only; it is never a graph node, layout group, community, or coordinate owner.

## 16. Tenant Graph

The Tenant Graph is the tenant-owned `scope=tenant, ownerId=tenantId` subgraph. Tenant nodes may map to Global nodes, but Global nodes do not become part of the tenant ontology. Future Tenant UI may render mapped Global context explicitly as context.

## 17. User Graph

The User Graph is the owner-specific `scope=user, ownerId=userId` subgraph. A User node is valid without any Global/Tenant mapping and may enter Personal Atlas and accumulate mastery/evidence independently.

## 18. Course-local discovery semantics

Course creation is strictly:

`Upload → Parse → Atomic Knowledge Extraction → Relation Extraction → User Knowledge Graph → Curriculum Generation → Chapter / Lesson → Assignment Generation → Assignment Coverage Validation → Course Ready`.

It must not automatically retrieve Global/Tenant nodes or perform replacement, merge, mapping, or promotion. Course Ready requires Assignment coverage for every course KnowledgeNode. Course deletion removes curriculum/material/Assignment associations, not discovered User nodes, provenance, mastery, or evidence. **Course deletion != Knowledge deletion. Course != Knowledge Ontology.**

## 19. Curriculum

Curriculum describes how one course chooses to teach knowledge. Its ownership and lifecycle are course-local. It references stable Global, Tenant, or User node IDs and never duplicates ontology facts.

Chapter generation supports `auto`, `auto-fixed-count`, `follow-source`, and `manual`. The model supports manual create/delete/rename/reorder and moving lessons/coverage without changing ontology identity.

## 20. Chapter

A Chapter is an ordered curriculum container with a course-local identity, title, description, outcome, and lesson membership. It may be informed by graph structure but does not share community identity or membership logic. **Community != Chapter. Cluster != Chapter.**

Domain is descriptive metadata, never structural membership. **Domain != Community. Domain != Chapter.**

## 21. Lesson

A Lesson is an ordered teaching unit inside a chapter. Lesson order is curriculum sequence, not a knowledge prerequisite fact.

## 22. CurriculumCoverage

`CurriculumCoverage(courseId, lessonId, nodeId, role)` binds lessons to stable nodes. Roles are `introduce`, `reinforce`, `apply`, and `assess`. The model is many-to-many: a lesson covers many nodes, a node appears in multiple lessons, and multiple courses may reuse one node.

## 23. Course Assignment Model

`CourseAssignment` is course-owned curriculum data describing an executable post-learning task. It contains a task description, requirements, expected output, acceptance criteria, estimated time, optional project contribution, and mode. `Assignment != KnowledgeNode` and `Assignment != KnowledgeRelation`; it never enters Global or Personal Atlas.

`AssignmentCoverage(assignmentId, nodeId, role)` binds an Assignment to stable Global, Tenant, or User knowledge identity with roles `practice`, `apply`, and `assess`. It is N:M and never encoded as a KnowledgeRelation. One integrated Assignment can cover several atomic capabilities, and a KnowledgeNode can contribute to several Assignments.

V1 cardinality allows at most one AssignmentCoverage per `(assignmentId, nodeId)` pair. Role is one attribute of that relation, not part of its uniqueness. CourseAssignment also carries an explicit course-wide display order; repository or ID order has no business meaning.

Assignment mode is `instruction` or `workflow`. Both modes have complete task definitions. Workflow mode additionally requires `workflowTemplateId`; the workflow canvas is an optional execution environment, not the Assignment itself.

`UserAssignmentState(assignmentId, status, progress?)` is separate from Assignment definition and UserKnowledgeState. Assignment completion does not automatically set mastery, though it may produce KnowledgeEvidence in a future evidence pipeline.

Every active course KnowledgeNode must have at least one AssignmentCoverage before Course Ready. Missing coverage is an invariant failure and cannot be replaced by generated UI fallback text. Assignment outputs may be composed into Chapter outcomes and the Course Integrated Project through `expectedOutput` and `projectContribution`; outputs and projects do not become KnowledgeNodes.

## 24. Similarity Analysis

`Analyze Similar Knowledge` is an explicit, user-triggered service boundary. Candidate generation may combine embeddings, title, description, and relation-context similarity. Candidates are suggestions only; the user chooses Mapping, Merge, or Keep Independent. Course ingestion never invokes this service automatically.

## 24A. Knowledge Domain

`KnowledgeDomain` is Global-only first-class governance metadata in v1, not graph geometry. It has a governed name and description, one canonical color, lifecycle status, and audit metadata; it has no scope field. Tenant Domain governance is a future extension. Domain is not a KnowledgeNode, Chapter, Community, Cluster, Island, or force-layout container.

The schema boundary is strict: `KnowledgeNode` has no `domainId`, and `KnowledgeGraph` contains only nodes, revisions, and factual edges. Domain definitions and memberships are loaded through `DomainGovernanceRepository`. Views resolve Domain presentation by explicitly joining graph identity with governance state; tags, provenance, fixture location, and curriculum context are never membership fallbacks.

Formal membership is represented only by explicit `DomainAssignment`, not by copying color into `KnowledgeNode` or inferring fixture location. A node has zero or one primary Domain in v1; no assignment is the valid Unclassified state. Admin assignments are pinned and take precedence over automatic results. Global Admin is the only formal Domain authority in v1.

Domain classification never creates, deletes, or modifies `prerequisite`, `enables`, or `related` KnowledgeEdges. Domain changes may affect hue, filters, search, statistics, and classification only. They cannot change coordinates, topology, force state, or camera state.

Existing-Domain assignment combines semantic evidence from `title`, `description`, and `masteryCriteria` with structural evidence from factual direct relations and common neighbors. Configurable thresholds produce automatic assignment, a pending candidate, or Unclassified. Admin-confirmed pinned members are preferred anchors.

Full-graph discovery produces `DomainProposal` records for administrator review; clustering never creates an authoritative Domain directly. See `KNOWLEDGE_DOMAIN_SYSTEM.md`.

### Domain Application Boundary

Generic Domain application logic composes `KnowledgeRepository + DomainGovernanceRepository` through `DomainGovernanceService`. It reads the graph visible to an explicit `KnowledgeAccessContext` and never imports static graph or demo fixture singletons. The React store is only a subscription adapter over that service and does not inject Global visibility.

### Demo Data Boundary

Agentic AI, Python Engineering, their concrete node and edge lists, demo graph assembly, membership lists, and deterministic proposal identities are demo data under `src/v2/demo/knowledge` and other explicit Demo fixtures/adapters. The Core `src/v2/knowledge` package contains no concrete ontology fixture. Demo fixtures are not ontology rules or production repositories. Moving a KnowledgeNode between fixture files has no effect on membership without a DomainAssignment change.

## 25. Community

Community detection is an optional graph-analysis technique for future advanced analysis. It is not required to construct Personal Atlas, does not determine visible-node selection or layout, and is not a persistent product entity. If used later, it must operate on real relations, may span domains, and must never be implemented as `groupBy(domainId|chapter)`.

## 26. Knowledge Island

Knowledge Island is not part of the v1 default product model or rendering. Personal Atlas does not render island hulls, contours, titles, centers, quotas, or cross-island metrics. Any future island visualization would be a temporary view of an optional Community result, never a node or knowledge fact.

## 27. Global Atlas

Global Atlas answers “世界里有哪些知识，它们如何关联？” It renders active Global nodes and factual Global KnowledgeRelations. Superseded nodes remain in lineage data but are not rendered by default. It never renders Tenant/User/Course/Domain/Chapter/Community/Island nodes. Deterministic force geometry is relation-driven and independent of curriculum.

## 28. Personal Atlas

Personal Atlas answers “我真正掌握/学习了哪些知识，它们如何连接？” Core is exactly the active Global, Tenant, or User nodes with mastered/learning UserKnowledgeState. Explore is every active non-core node directly connected to at least one core node, ignoring direction for visibility. The visible graph is Core plus all direct one-hop Explore nodes and every factual edge whose endpoints are both visible.

Default rendering is a deterministic force graph with neutral undirected edge visuals. It does not run Community detection, use per-community quotas, add multi-hop candidates, or expose Potential Bridge / Connection Analysis. Direction and relation semantics remain available in data and selected-node details. `crossDomainConnections` compares domain metadata; cross-island metrics do not exist in v1.

## 29. Course Skill Tree

Course Skill Tree answers “这门课准备怎样组织知识？” Full Skill Tree renders the active atomic nodes referenced by CurriculumCoverage and the real KnowledgeRelations among them, with N:M curriculum/Assignment contexts. Dependency rank uses prerequisite/enables; related is detail context rather than default structure.

The user-facing `技能树` and `实训树` are two presentations of this same course graph. Every atomic projection contains a Knowledge card plus one Assignment companion card; multiple AssignmentCoverages are summarized inside that single companion. Chapter Assignment summaries deduplicate by assignmentId through `Chapter → primary KnowledgeNodes → AssignmentCoverage → unique Assignments`. Switching presentation changes appearance and content only, never topology, ELK layout, coordinates, or viewport.

Chapter Overview is the chapter aggregation of that same atomic DAG, not a second graph. Each node has one projection-only primary chapter: earliest `introduce`, otherwise earliest coverage. Cross-chapter prerequisite/enables facts are grouped into one ordered chapter pair with support counts, checked for cycles, and transitively reduced. CurriculumSequence can constrain ranking or minimally connect an otherwise isolated chapter, but never becomes a KnowledgeRelation.

Structural adjacency may treat all relation types as undirected for layout/community/reachability. Directed learning adjacency preserves prerequisite/enables direction and is used for learning paths.

## 30. Data invariants

1. KnowledgeNode IDs, mappings, mastery, and evidence remain stable across revisions.
2. Every node has type, mastery criteria, scope, provenance, and current revision.
3. Tenant/User nodes have owners; Global nodes do not require one.
4. A relation connects existing nodes and uses relation-specific strength.
5. Curriculum/Assignment coverage and Mapping are not KnowledgeRelations.
6. Course deletion cannot delete KnowledgeNodes, mastery, evidence, or historical provenance.
7. Mapping never mutates nodes or copies mastery.
8. Global Atlas filters `scope=global`; Personal/Course views do not assume all nodes are Global.
9. Community, Domain, Chapter, and Course identities are distinct; Knowledge Cluster is absent from the v1 core model.
10. No layout-only node or edge may enter the ontology.
11. Personal visible nodes equal active Core plus all direct one-hop Explore nodes.
12. Curriculum and Assignment projections preserve all N:M coverage records.
13. Chapter dependency pairs are unique and derived only from primary membership.
14. Every active course KnowledgeNode has at least one valid AssignmentCoverage.
15. Workflow Assignments have a workflowTemplateId; instruction Assignments do not require one.
16. KnowledgeEdge IDs are stable semantic identities and never depend on seed-array order or position.
17. Concrete Domain seed data belongs to demo fixtures, never the core knowledge/domain package.
18. Material Knowledge contexts sort by coverage-role priority, authoritative Segment order, and stable identity only as a final tie, independent of source record order.

## 31. Explicit non-goals / forbidden shortcuts

V1 does not require full admin or curriculum-editing UI, database migrations, production embeddings, inferred cross-mapping mastery, Community/Island UI, Potential Bridge, prerequisite-gap UI, learning-path recommendations, or advanced recommendation models. It forbids automatic Global/Tenant recall during course generation, course-scoped persistent nodes, physical deletion of referenced nodes, mastery replication through mapping, chapter/community equivalence, domain-driven coordinates, fake layout bridges, duplicated `prerequisiteNodeIds`, and hand-maintained `stageEdges`.

The Python ontology retains some broad nodes for a later bounded cleanup; v1 splits the clearest violations (thread/process/GIL, timeout/cancellation, task queue/worker, plugin/registry) and forbids adding new composite nodes. A legacy composite ID is retained as `superseded` and is never reused for one atomic successor.

## 32. Rendering Architecture

Rendering consumes the shared `KnowledgeNode + KnowledgeEdge` graph through view projections. Renderer-specific nodes, links, ports, bend points, coordinates, chapter groups, and interaction state are presentation data only and are never written back to the Knowledge Schema.

Global Atlas and Personal Atlas use the same `KnowledgeAtlasScene` based on `react-force-graph-3d`. Global projects active Global-scope nodes and their factual edges. Personal projects mastered/learning Core nodes, direct one-hop Explore nodes, and the default Core↔Core / Core↔Explore visible edges. The shared scene owns force geometry, camera interaction, node and edge materials, selection, focus, label priority, zoom-dependent label density, and screen-space label collision. Domain and personal status affect appearance but do not create layout centers or graph entities.

Atlas projection receives `KnowledgeGraph` and `DomainGovernanceState` as separate inputs. DomainAssignment-to-Domain resolution adds hue and classification labels only after structural graph selection; a governance-only revision cannot change the structural node/edge key.

Course Skill Tree projects the same atomic knowledge identities through CurriculumCoverage and Chapter/Lesson context, then uses ELK layered hierarchical layout and React Flow rendering. Chapter Overview keeps the dependency DAG derived from aggregated prerequisite/enables facts and visually distinguishes minimal CurriculumSequence fallback edges. Focused mode expands one Chapter at its macro position while other Chapters remain collapsed; Full mode expands every Chapter while preserving the shared chapter-level topology. Chapter containers are compound presentation groups, never KnowledgeNodes.

ELK is the production owner of course macro layer/order, local atomic coordinates, group sizing, crossing minimization, and local orthogonal routes. React Flow connects presentation endpoints across the already-composed Chapter groups without feeding cross-Chapter atomic edges back into placement. The Force Graph engine is the sole production owner of Atlas force coordinates. Legacy handcrafted layout and routing helpers may remain for tests or migration comparison but must not participate in these production render paths.

## 33. Rendering Stability

Rendering distinguishes structural state from presentation state. Structural state includes the actual node/edge set, curriculum composition, Chapter expansion state, and course graph revisions; it may trigger ELK or force-layout computation. Selection, hover, search, drawer visibility, labels, relation highlighting, and knowledge/Assignment visual mode are presentation state and must not alter coordinates or reheat the force simulation.

Course rendering computes one Chapter Macro Layout from the Chapter dependency DAG and caches one Local Atomic Layout per Chapter from internal prerequisite/enables facts. Overview, Focused, and Full compose those same results at different expansion levels. Expanded groups may push neighboring groups outward to avoid overlap, but layer order, branch order, and Chapter topology remain stable. Cross-Chapter atomic relations are routed over the composed positions and never determine Chapter placement. Assignment companions are presentation layers inside the corresponding atomic knowledge card, not graph nodes. ELK sizes each atomic child with the full Knowledge-card-plus-companion footprint, which stays identical in 技能树 and 实训树 modes.

Global and Personal Atlas use stable structural graphData until the underlying visible knowledge set or factual edges change. Atlas Focus Mode derives the selected node and its direct factual neighbors, changes camera, material opacity, edge emphasis, and label priority, and leaves force coordinates untouched. Clearing focus restores default appearance without reheating the simulation or resetting the camera.

## 34. Multi-course Runtime Boundary

Course definitions are loaded as `CourseRuntimeData` through `CourseRepository`. A runtime references shared KnowledgeNode IDs through curriculum, assignment, and material coverage; it does not create course-local ontology facts. Generic pages and graph services receive the runtime selected by route `courseId` and never fall back to a particular demo course.

The same KnowledgeNode may be covered by several courses. Atlas exposes this as `courseContexts[]`, preserving the N:M relationship rather than choosing a single owning course.

## 35. Material Knowledge Mapping

`Material` and `MaterialSegment` are curriculum content. `MaterialKnowledgeCoverage` maps addressable segments to shared KnowledgeNodes N:M. It is neither a KnowledgeEdge nor a replacement for CurriculumCoverage. Course- and page-specific lookup switches are not part of the architecture.

## 36. User Learning State Separation

Course, Assignment, and Material definitions contain no user completion. Mutable state is scoped by `userId + courseId`, then stable `assignmentId` or `materialId`. Knowledge mastery remains a separate `UserKnowledgeState` concern and may later consume course evidence without being mechanically inferred from completion.

## 37. Domain Runtime Authority

`DomainAssignment` is the only authoritative runtime membership source. `KnowledgeNode` has no Domain-membership field, and Domain definitions and assignments are persisted independently from the Knowledge Graph structure. V1 Domain governance is Global-only; Tenant Domain ownership, permissions, repository isolation, and persistence are deferred as one coherent extension.

## 38. Scoped Knowledge Access

Course, Assignment, and Material mappings may reference any KnowledgeNode visible to the actor across Global, Tenant, and User scopes. KnowledgeRepository provides scoped lookup over KnowledgeGraph data; it does not replace KnowledgeGraph or create new ontology facts.

Global Atlas still projects only active Global nodes. Personal Atlas may project visible Global, Tenant, and User nodes selected by the active user's UserKnowledgeState plus factual direct Explore relations. Course and Material validation use the same scoped repository context.

## 39. Source PDF Boundary

Source PDF files remain outside the Knowledge Ontology. Knowledge is connected to addressable source pages through `Material -> MaterialSegment -> MaterialKnowledgeCoverage -> KnowledgeNode`. PDF page identifiers do not become KnowledgeNode identities, and PDF visual content is not duplicated into KnowledgeNode definitions.

## 40. Atomic Relation Reconstruction

The canonical construction flow is `Source Content -> Atomic Knowledge Extraction -> Relation Reconstruction -> KnowledgeGraph`. Atomizing a composite node does not finish the migration: every active successor must be reviewed against both its sibling atoms and relevant atoms in other modules of the same semantic knowledge system. Relations previously implied by the composite title must be recreated only when they remain direct, factual `prerequisite`, `enables`, or `related` relations between active atomic nodes.

Superseded composite nodes preserve identity and lineage but never act as topology bridges. Reconstruction preserves stable atomic IDs, revisions, provenance, and split/merge lineage.

## 41. Relation Quality Audit

Static canonical data is reviewed with undirected connected-component metrics, isolated-node review, degree-one review, and cross-module completeness review. Direction is ignored only for the connectivity metric; the stored relation retains its factual direction and strength.

These metrics are review signals, not business validity thresholds. A mature Domain that unexpectedly fragments into many components should prompt a semantic completeness review before any layout response. Global cross-domain connectivity is not a Knowledge Graph quality requirement, and disconnected Domains may be correct.

## 42. Repository Visibility Boundary

Knowledge visibility is determined by the caller's `KnowledgeAccessContext`. Generic services must pass that context through to `KnowledgeRepository` and must not silently replace it with Global access. Global-only Domain governance describes who governs the Domain definition; it does not restrict assignable Knowledge to Global-scope nodes.

## 43. LearningProgress Core / Demo Boundary

Core LearningProgress repository interfaces and persistence adapters know only `UserCourseState` and an injected `UserCourseStateFactory`. Demo fixtures flow inward from the application composition root; Core must never import a Demo initial state.

Local persistence uses a versioned envelope. Load validates scope identity and nested Assignment/Material record keys, migrates supported legacy raw `UserCourseState`, and falls back to the injected factory only when stored data is absent or invalid. A production backend or empty-state factory can replace Demo initialization without changing Core persistence semantics.

## 44. Core / Demo Dependency Direction

Core Knowledge, Course, Material, Progress, and Profile modules define reusable models, validators, repositories, and projections. They never import `src/v2/demo`. Concrete Course repositories, personal Knowledge fixtures, Domain seeds, and static Knowledge graphs live on the Demo side and depend inward on Core contracts; only the composition root wires them together.

The current static Knowledge graph is owned by `src/v2/demo/knowledge` as a prototype fixture, not a production runtime source. Backend repositories must supply scoped graph data through `KnowledgeRepository` without importing fixture singletons.
