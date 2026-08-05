# EduFlow Repository Instructions

## Knowledge Graph Architecture

### Single Global Knowledge Graph

- EduFlow MUST maintain exactly one system-level Global Knowledge Graph. Python Engineering, Agentic AI, Machine Learning, and other domains MUST be registered in that same graph.
- All factual knowledge relationships MUST use the shared `KnowledgeEdge` schema. Pages MUST NOT assemble domain-specific or cross-domain graphs with special-case logic.

### KnowledgeNode Is the Atomic Unit

- A real `KnowledgeNode` is the only atomic node that Global and Personal Knowledge Atlas views may render.
- Domain, Cluster, Course, Chapter, Community, and Island are metadata or view concepts. They MUST NOT be fabricated as peer knowledge nodes for layout or visual completeness.
- Fake nodes or edges MUST NOT be created to fill space, form islands, create bridges, or improve composition.

### Metadata Does Not Dictate Layout

- `domainId` and `clusterId` describe knowledge. They MAY support search, filters, labels, community naming, recommendations, and weak algorithmic priors.
- Domain or cluster metadata MUST NOT directly determine node coordinates, Knowledge Island membership, or graph community membership.
- Atlas spatial structure MUST be driven primarily by `KnowledgeEdge`, `relation`, and `strength`. Strongly related nodes should naturally remain closer than weakly related nodes.

### Global Atlas Rendering

- The homepage Global Knowledge Atlas MUST render real KnowledgeNodes and KnowledgeEdges without explicit Domain center nodes, Cluster rectangles, chapter containers, or manually drawn islands.
- Global layout MUST be deterministic for the same graph data. Force initialization, simulation order, and any depth assignment MUST be stable rather than refreshed with unseeded randomness.
- Force simulation MUST run when graph data changes and stabilize before rendering. Camera rotation and projection MUST remain separate from force simulation.

### Personal Atlas Is a Derived Subgraph

- The Personal Knowledge Atlas MUST be derived from `Global Knowledge Graph + User Knowledge State`; it is never a separately maintained knowledge ontology.
- `mastered`, `learning`, `mastery`, progress, and evidence belong only to user state and MUST NOT be written into `KnowledgeNode`.
- `explore` MUST NOT be persisted as user state. It MUST be derived from relevant neighbors of the user's core mastered/learning nodes.
- Global and Personal Atlas views MUST share graph-driven layout principles, KnowledgeNode/edge visual grammar, selection, and hover behavior. The Personal view may additionally encode user state, evidence, communities, and connection analysis.

### Knowledge Islands Are Community Views

- A Personal Knowledge Island MUST be produced from graph community structure: relatively dense internal connections and relatively sparse external connections.
- Community membership MUST NOT be implemented as `groupBy(domainId)`, `groupBy(clusterId)`, or course chapter grouping.
- A Connected Component only answers whether nodes are reachable. It MUST NOT automatically be treated as one Knowledge Island; one connected component may contain several communities connected by sparse bridge edges.
- An Island is a region, not a node. It MUST be rendered as a hull, contour, halo, or background around real KnowledgeNodes. Do not create an Island center circle or other nonexistent graph node.
- Cross-community edges MAY remain visible as thin bridges and MUST NOT force their communities to merge solely because the graph becomes connected.
- Potential Bridge nodes are analysis results. They MUST remain outside the user's core graph until learned and SHOULD appear only in Connection Analysis near the communities and path endpoints they could connect.

### Course Skill Tree Is a Different View

- Global Knowledge Atlas and Personal Knowledge Atlas are graph exploration views. A Course Skill Tree is a curriculum view and MAY use chapters, stages, prerequisites, and deterministic DAG layout.
- Course chapter or skill-tree layout conventions MUST NOT be applied to Global or Personal Knowledge Atlas pages.
