# Knowledge Architecture v1

## 1. Goals

Knowledge Architecture v1 gives EduFlow one durable semantic model for public, institutional, and personal knowledge while keeping curricula, user state, mappings, and graph analysis separate. It prioritizes stable identity, auditable evolution, course-local discovery, reusable atomic knowledge, and graph-driven Atlas views.

## 2. Terminology

- **Knowledge ontology:** persistent KnowledgeNodes and factual KnowledgeRelations.
- **Global / Tenant / User graph:** scope-filtered views over the shared model.
- **Curriculum:** a course-specific teaching arrangement of knowledge.
- **Community:** a relatively dense structural subgraph with sparser external connections.
- **Knowledge Island:** a visual region around a community's real nodes.
- **Mapping:** a declared semantic correspondence between independently existing nodes.
- **Promotion:** a governed request to create or select a node in a broader scope.

## 3. Atomic KnowledgeNode definition

> A KnowledgeNode is the smallest independently teachable, assessable and reusable knowledge or capability unit.

An atomic node should support an independent lesson objective, mastery decision, evidence item, prerequisite, and reuse across courses. “Atomic” does not mean the smallest word or term: splitting stops when the child would no longer have independent teaching, assessment, or mastery value.

Course, Chapter, Lesson, Stage, Learning Outcome, Project, Community, Island, Domain, and Cluster are not KnowledgeNodes.

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

`implementation-support`, `practice-support`, and `conceptual` are obsolete relation values. Lesson, practice, mapping, and promotion relationships are not KnowledgeRelations.

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

The Global Graph is the `scope=global` subgraph maintained by system administrators. It contains only real atomic public nodes and factual relations between them. Domain/cluster remain labels and weak analysis priors, not graph nodes or coordinate owners.

## 16. Tenant Graph

The Tenant Graph is the tenant-owned `scope=tenant, ownerId=tenantId` subgraph. Tenant nodes may map to Global nodes, but Global nodes do not become part of the tenant ontology. Future Tenant UI may render mapped Global context explicitly as context.

## 17. User Graph

The User Graph is the owner-specific `scope=user, ownerId=userId` subgraph. A User node is valid without any Global/Tenant mapping and may enter Personal Atlas and accumulate mastery/evidence independently.

## 18. Course-local discovery semantics

Course creation is strictly:

`Upload → Parse → Atomic Knowledge Extraction → Relation Extraction → User Knowledge Graph → Curriculum Generation`.

It must not automatically retrieve Global/Tenant nodes or perform replacement, merge, mapping, or promotion. Course deletion removes curriculum/material/practice associations, not discovered User nodes, provenance, mastery, or evidence. **Course deletion != Knowledge deletion. Course != Knowledge Ontology.**

## 19. Curriculum

Curriculum describes how one course chooses to teach knowledge. Its ownership and lifecycle are course-local. It references stable Global, Tenant, or User node IDs and never duplicates ontology facts.

Chapter generation supports `auto`, `auto-fixed-count`, `follow-source`, and `manual`. The model supports manual create/delete/rename/reorder and moving lessons/coverage without changing ontology identity.

## 20. Chapter

A Chapter is an ordered curriculum container with a course-local identity, title, description, outcome, and lesson membership. It may be informed by graph structure but does not share community identity or membership logic. **Community != Chapter. Cluster != Chapter.**

## 21. Lesson

A Lesson is an ordered teaching unit inside a chapter. Lesson order is curriculum sequence, not a knowledge prerequisite fact.

## 22. CurriculumCoverage

`CurriculumCoverage(courseId, lessonId, nodeId, role)` binds lessons to stable nodes. Roles are `introduce`, `reinforce`, `apply`, and `assess`. The model is many-to-many: a lesson covers many nodes, a node appears in multiple lessons, and multiple courses may reuse one node.

## 23. PracticeCoverage

`PracticeCoverage(practiceId, nodeId, role)` binds practice/assessment to knowledge with roles `practice`, `reinforce`, and `assess`. It is never encoded as a KnowledgeRelation.

## 24. Similarity Analysis

`Analyze Similar Knowledge` is an explicit, user-triggered service boundary. Candidate generation may combine embeddings, title, description, and relation-context similarity. Candidates are suggestions only; the user chooses Mapping, Merge, or Keep Independent. Course ingestion never invokes this service automatically.

## 25. Community

A Community is a derived graph-analysis result: relatively dense internal structure with sparser external links. Detection uses real relations and weights, can span domains, is not `groupBy(domainId|clusterId|chapter)`, and may change with user state. A connected component may contain several communities joined by sparse bridges; small authentic communities must not be forcibly absorbed solely to satisfy a minimum size.

## 26. Knowledge Island

A Knowledge Island is the UI rendering of a community as hull, contour, halo, or region around real nodes. It is never a center node. Cross-community edges may remain thin visible bridges.

## 27. Global Atlas

Global Atlas answers “世界里有哪些知识，它们如何关联？” It renders only active/deprecated-as-context Global nodes and factual Global KnowledgeRelations. It never renders Tenant/User/Course/Domain/Cluster/Chapter/Community/Island nodes. Deterministic force geometry is relation-driven.

## 28. Personal Atlas

Personal Atlas answers “我真正掌握/学习了哪些知识，它们如何连接？” Its visible graph may contain known Global, Tenant, and User nodes, user mastery/evidence, derived explore neighbors, communities, and connection analysis. Potential bridge nodes are analysis-only and hidden outside Connection Analysis. `crossDomainConnections` compares domain metadata; `crossIslandConnections` compares current community membership.

## 29. Course Skill Tree

Course Skill Tree answers “这门课准备怎样组织知识？” Full Skill Tree renders the atomic nodes referenced by CurriculumCoverage and the real KnowledgeRelations among them, with curriculum annotations. Chapter Overview is a projection of that same DAG plus explicit CurriculumSequence; chapter edges are derived, not hand-authored as a second graph.

Structural adjacency may treat all relation types as undirected for layout/community/reachability. Directed learning adjacency preserves prerequisite/enables direction and is used for learning paths.

## 30. Data invariants

1. KnowledgeNode IDs, mappings, mastery, and evidence remain stable across revisions.
2. Every node has type, mastery criteria, scope, provenance, and current revision.
3. Tenant/User nodes have owners; Global nodes do not require one.
4. A relation connects existing nodes and uses relation-specific strength.
5. Curriculum/Practice coverage and Mapping are not KnowledgeRelations.
6. Course deletion cannot delete KnowledgeNodes, mastery, evidence, or historical provenance.
7. Mapping never mutates nodes or copies mastery.
8. Global Atlas filters `scope=global`; Personal/Course views do not assume all nodes are Global.
9. Community, Domain, Cluster, Chapter, and Course identities are distinct.
10. No layout-only node or edge may enter the ontology.

## 31. Explicit non-goals / forbidden shortcuts

V1 does not require full admin or curriculum-editing UI, database migrations, production embeddings, or inferred cross-mapping mastery. It forbids automatic Global/Tenant recall during course generation, course-scoped persistent nodes, physical deletion of referenced nodes, mastery replication through mapping, chapter/community equivalence, domain-driven coordinates, fake layout bridges, duplicated `prerequisiteNodeIds`, and hand-maintained `stageEdges`.

The Python ontology retains some broad nodes for a later bounded cleanup; v1 splits the clearest violations (thread/process/GIL, timeout/cancellation, task queue/worker, plugin/registry) and forbids adding new composite nodes.
