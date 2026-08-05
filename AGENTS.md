# EduFlow Repository Instructions

## Knowledge Architecture invariants

- EduFlow MUST use one shared knowledge model across Global, Tenant, User, Personal, and Course views. A `KnowledgeNode` is the smallest independently teachable, assessable, reusable knowledge or capability unit; it is not the smallest vocabulary fragment.
- Course, Chapter, Lesson, Stage, Learning Outcome, Project, Domain, Cluster, Community, and Island MUST NOT be represented as `KnowledgeNode`.
- Persistent nodes MUST use exactly one scope: `global`, `tenant`, or `user`. A course is provenance and a curriculum container, never a persistent node owner. Deleting a course MUST NOT delete knowledge discovered from it or its mastery/evidence.
- Node identity is stable. Content changes MUST create `KnowledgeNodeRevision`; referenced nodes are deprecated or superseded, never physically deleted.
- Factual knowledge-to-knowledge relations MUST use `KnowledgeRelation` and only `prerequisite`, `enables`, or `related`. Prerequisite direction and hard/soft strength MUST be preserved.
- Mapping, promotion, curriculum coverage, practice coverage, and curriculum sequence MUST use their own models. `Mapping != Merge`, `Mapping != Promotion`, and mapping MUST NOT copy mastery.
- Course ingestion MUST first produce a course-faithful User Knowledge Graph. It MUST NOT automatically retrieve, replace, merge, or map Global/Tenant nodes. Similarity analysis is an explicit user-triggered action.
- Global Atlas MUST render only real Global KnowledgeNodes. Personal Atlas MAY render visible Global, Tenant, and User nodes plus user state and derived explore nodes. Course Skill Tree MAY reference all three scopes.
- Personal mastery and evidence bind stable node IDs; evidence MAY bind the revision observed. They MUST NOT be stored on `KnowledgeNode`.
- Community is a graph-analysis result and Knowledge Island is its region/hull visualization. `Community != Chapter`, `Domain != Community`, `Cluster != Community`, and connected components MUST NOT be treated automatically as communities.
- Domain, cluster, chapter, and community metadata MUST NOT dictate atlas coordinates. Layout and community structure MUST be driven primarily by real `KnowledgeRelation` structure and strength.
- Fake nodes or edges MUST NOT be created for composition, layout, bridges, islands, or Demo appearance. Structural algorithms MAY view relations as undirected; learning-path algorithms MUST respect prerequisite direction.
- Course Skill Tree MUST be derived from the atomic knowledge graph plus curriculum coverage/sequence. It MUST NOT maintain a second hand-authored knowledge graph or duplicate prerequisite facts.
