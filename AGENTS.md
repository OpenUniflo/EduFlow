# EduFlow Repository Instructions

## Knowledge and Curriculum Boundaries

- EduFlow MUST maintain one shared Knowledge Graph composed of `KnowledgeNode`, `KnowledgeEdge`, and user-owned `UserKnowledgeState`.
- Global Atlas, Personal Atlas, and Course Skill Tree are views over that shared graph. They MUST NOT maintain separate knowledge facts.
- Curriculum data is separate: Course, Chapter, Lesson, CurriculumCoverage, CurriculumSequence, Material, Practice, and PracticeCoverage may reference stable node IDs but MUST NOT duplicate KnowledgeEdge facts.

## KnowledgeNode Is Atomic

- A `KnowledgeNode` is the smallest independently teachable, assessable, and reusable knowledge or capability unit.
- Course, Chapter, Lesson, Stage, Outcome, Project, Community, Island, Domain, and Cluster MUST NOT be KnowledgeNodes.
- Persistent scope is exactly `global`, `tenant`, or `user`; Course is provenance and curriculum context, never node ownership.
- Stable node identity, revision history, provenance, lifecycle, mappings, mastery, and evidence lineage MUST be preserved across edits, split, merge, course deletion, and mapping.

## Relations and Metadata

- Knowledge-to-knowledge facts use only `prerequisite`, `enables`, or `related` KnowledgeEdges.
- CurriculumCoverage, PracticeCoverage, KnowledgeMapping, and Promotion MUST remain separate from KnowledgeEdge.
- `domainId` is metadata for color, filtering, search, statistics, and details. It MUST NOT determine coordinates or grouping.
- `clusterId` and persistent Knowledge Cluster structures MUST NOT be added to the v1 core model.
- Fake nodes or edges MUST NOT be created for layout, composition, islands, bridges, chapters, or demos.

## Atlas Views

- Global Atlas renders active Global-scope nodes and factual edges only.
- Personal Atlas core nodes are active mastered/learning nodes with UserKnowledgeState. Explore nodes are all active non-core nodes directly connected to any core node, treating edge direction as irrelevant for one-hop visibility.
- Personal Atlas uses deterministic relation-driven force layout. It MUST NOT use domain, cluster, chapter, community, or island anchors.
- Community detection is an optional analysis technique, not a required product entity or visible region. Default Personal Atlas MUST NOT render community/island hulls, titles, quotas, or potential bridges.
- Personal edges use a neutral undirected visual by default while preserving their factual relation and direction in data and details.

## Course Views

- Full Skill Tree renders CurriculumCoverage-referenced active KnowledgeNodes and their shared KnowledgeEdges.
- Full Skill Tree uses prerequisite/enables for layered DAG rank; related edges are hidden unless their endpoint is selected.
- Chapter Overview is a derived aggregation of the atomic course graph by each node's primary chapter. It is not a second knowledge graph.
- Primary chapter is the earliest `introduce` coverage, falling back to the earliest coverage.
- Chapter edges aggregate prerequisite/enables counts per ordered chapter pair and undergo transitive reduction. CurriculumSequence may constrain or minimally connect the projection but MUST NOT become a KnowledgeEdge.
- CurriculumCoverage and PracticeCoverage remain N:M. Lesson or chapter fields MUST NOT be written into KnowledgeNode.

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
- Selection, hover, search, drawer state, and knowledge/practice presentation mode MUST NOT alter graph layout.
- Only structural graph changes may trigger ELK or force-layout recomputation.
- Course Overview, Focused, and Full views MUST share the same Chapter macro topology.
- Personal and Global Atlas selection MUST operate as camera/highlight presentation over a stable knowledge layout.
- Changes MUST pass TypeScript compilation and production build. Relevant pages MUST be checked for runtime errors.
