# Knowledge Relation System

## Purpose

The Knowledge Relation System defines factual topology between atomic KnowledgeNodes. Global Atlas, Personal Atlas, and Course Skill Tree project these shared facts; they do not own or repair them.

## KnowledgeEdge

A KnowledgeEdge connects two active atomic KnowledgeNodes with exactly one relation: `prerequisite`, `enables`, or `related`. Curriculum coverage, Assignment coverage, Material coverage, mappings, promotions, Domain membership, and layout metadata are separate models.

Every KnowledgeEdge carries a required, non-empty `reason` that explains the direct semantic fact. Reasons support review; they are not display copy or generated ontology.

## prerequisite

`A prerequisite B` means understanding or performing B normally requires A first.

- `hard`: B is not correctly understandable or implementable without A.
- `soft`: A materially prepares B but is not an absolute dependency.

Prerequisite direction is source to target. Conflicting reverse prerequisites are rejected unless the underlying model is deliberately redesigned; current canonical data does not store prerequisite cycles.

## enables

`A enables B` means mastery of A directly makes capability B possible or supplies a major execution foundation. Direction is always significant. Feedback relationships that are naturally bidirectional should normally be modeled as `related`, not two opposing enables edges.

## related

`related` represents an important direct semantic association without strict prerequisite or unambiguous one-way enablement. It is semantically symmetric and stored once per unordered pair. It must never be used merely to connect components or improve Atlas appearance.

## Strength

Prerequisite strength is required as `hard | soft`. Enables and related strength is required as a finite number in `0..1`: roughly `0.9+` for a very direct relationship, `0.75..0.9` for a clear important relationship, and `0.55..0.75` for a useful secondary relationship. Relations too weak to add practical graph value are omitted.

TypeScript definitions and runtime validation enforce the same contract. Runtime checks remain necessary because future backend records are not compile-time trusted.

## Directionality and Duplicate Rules

Prerequisite and enables records are directional. Related records are symmetric even though storage uses one source and target. The same directed pair and relation may occur only once; reverse related duplicates, self edges, unknown endpoints, inactive endpoints, invalid strength, and missing reasons are validation failures.

## Stable Edge Identity

Canonical KnowledgeEdge IDs are deterministic from relation semantics, never from array index. Directed IDs preserve `source → target`; `related` IDs normalize the two endpoints into a sorted unordered pair. Reordering, splitting, or combining seed arrays therefore does not rename unchanged facts. Duplicate generated IDs are a validation failure.

## Atomic Relation Reconstruction

The canonical workflow is:

`Source Content -> Atomic Knowledge Extraction -> Relation Reconstruction -> KnowledgeGraph`

After a composite node is split, review its atomic successors against sibling atoms and against atoms in other modules of the same semantic knowledge system. This recovers real facts that the composite concept previously implied. Superseded nodes remain only for identity and lineage and never become active topology bridges.

## Within-module and Cross-module Relations

Within-module review checks local sequences such as schema to validation or retrieval to reranking. Cross-module review checks direct facts such as reasoning to tool results, state to memory, runtime to evaluation, functions to types, exceptions to testing, and async execution to HTTP. Sharing a Course, Chapter, or Domain is never evidence by itself.

## Domain-internal Relation Completeness

Mature semantic Domains are reviewed for unexpected fragmentation. The review includes missing relations between modules that jointly describe one system, especially after atomization. DomainAssignment is used only to select the audit population; it does not generate edges.

## Connected Component Audit

Connectivity is computed over active nodes and internal factual edges, treating all three relation types as undirected for this metric only. The report includes active node count, internal edge count, component count, largest component size and ratio, isolated nodes, and degree-one nodes. Cross-domain edges do not affect a Domain's internal score.

The audit command enumerates every active governed Domain that has at least one assigned active graph node. Domain names and IDs are not hardcoded in generic audit logic. Membership is selected only from DomainAssignment; node tags, provenance, course coverage, and historical node fields are ignored.

## Isolated and Low-degree Audits

Degree zero identifies isolated nodes. Degree one identifies low-degree review candidates, not errors. Both lists include stable IDs and titles in the development report so reviewers can inspect semantics rather than optimize a number.

## Manual Canonical Relation Data

Agentic AI and Python Engineering demo relations are manually reviewed static canonical data. They preserve stable node identity, active-only endpoints, relation direction, calibrated strength, and reviewable reasons. They are ground truth fixtures for the current demo and may later serve as reference data for automated candidate evaluation.

## Demo Seed Governance

Domain-specific node and edge fixtures are organized under `src/v2/demo/knowledge`. Ordinary genuine relations that span current Domain assignments live in a shared Demo fixture; they have no special cross-domain business status. These fixtures are prototype/reference data, not a production repository. `pnpm audit:knowledge` prints the current quality report and performs relation validation.

## Future Relation Candidate Generation

Future systems may retrieve candidates with embeddings, classify relation and direction with an LLM, attach confidence and provenance, and submit proposals for administrator accept/reject/edit review. They must not write authoritative KnowledgeEdges without governance. Candidate generation, CRUD, history, and approval workflow are outside the current implementation.

## Cross-domain Relations

Real cross-domain KnowledgeEdges are allowed and behave exactly like other facts. Domain-to-domain connectivity is not a target. A missing cross-domain edge may mean the current graph contains no covered direct relationship, and Atlas may correctly render separate islands.

## Non-goals

- Synthetic connectivity or layout-generated edges.
- Same-domain fake links or attraction that implies a fact.
- Forced cross-domain bridges or a special cross-domain edge model.
- Using Chapter, Course, cluster, community, island, or composite legacy nodes as topology.
