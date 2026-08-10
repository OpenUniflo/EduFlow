# Knowledge Domain System

## Purpose

Knowledge Domain provides governed semantic classification around the shared Knowledge Graph. It supports canonical hue, filtering, search, statistics, and administration without becoming a knowledge fact or changing graph geometry.

Domain is not a KnowledgeNode, Community, Cluster, Island, Chapter, Course group, force anchor, or layout region. Domain logic never creates KnowledgeEdges, fake nodes, hulls, centers, or layout forces.

## V1 Scope

`KnowledgeDomain` is Global-only in V1. Its schema contains identity, name, optional description, canonical color, lifecycle status, and create/update audit fields. It has no `scope` field because `scope: global` would be redundant.

V1 exposes one authority: `global-domain-admin`. Domain definitions, assignments, candidates, proposals, persistence, and admin UI have no Tenant branch. Tenant Domains are a future architecture extension, not a current runtime capability.

## Hard Model Boundary

`KnowledgeNode` contains no `domainId`, Domain name, or copied color. `KnowledgeGraph` contains only nodes, revisions, and factual edges. Domain governance is loaded independently through `DomainGovernanceRepository`.

The Domain application boundary is:

```text
KnowledgeRepository + DomainGovernanceRepository
                    ↓
          DomainGovernanceService
                    ↓
       React domainStore adapter / UI
```

Generic Domain logic obtains the active Global graph from `KnowledgeRepository`. It does not import `knowledgeNodes`, `knowledgeEdges`, `globalKnowledgeGraph`, or any demo fixture singleton.

## Explicit Membership

```text
KnowledgeNode ← DomainAssignment → KnowledgeDomain
```

`DomainAssignment` is the only authoritative membership source. A node has zero or one primary Domain; no assignment is the valid Unclassified state. `source: admin` requires `pinned: true`, and automation cannot replace pinned assignments.

Fixture location has no semantic meaning. A node stored in `agenticAiNodes.ts` does not automatically belong to Agentic AI. Only an explicit `DomainAssignment` establishes membership. Module name, course provenance, tags, title, node ID prefix, and neighboring nodes are not membership fallbacks.

Unclassified is not a synthetic Domain or KnowledgeNode and uses presentation fallback `#A7B0BF`. Administrators may inspect, move, or explicitly unassign nodes. Explicit unassignment is preserved across later seed reconciliation.

## Validation

Governance validation rejects duplicate Domains, duplicate primary assignments, orphan node/domain references, assignments to archived Domains, invalid colors, invalid candidates/proposals, and unpinned admin assignments. Demo fixture registration runs this validation against the configured Knowledge graph.

## Scoring and Candidates

Existing-Domain scoring combines `0.60 × semantic + 0.40 × structural` evidence. Semantic evidence uses title, description, and mastery criteria. Structural evidence uses only supplied factual `prerequisite`, `enables`, and `related` edges. A score at least `0.85` may auto-assign; `0.60–0.85` creates a candidate; lower scores remain Unclassified.

The scorer is generic and operates only on nodes, edges, Domains, and assignments passed by the application service. Embeddings, Leiden, and LLM classification are deferred.

## Discovery Boundary

Core defines only the `DomainDiscoveryService` interface. It knows no concrete proposal IDs, node IDs, or Domain names. The deterministic prototype discovery implementation lives under `src/v2/demo/domains` and may contain demo-specific identities.

Discovery creates reviewable `DomainProposal` data. A proposal has no scope in V1; authorized acceptance always creates a Global KnowledgeDomain. Discovery never writes an authoritative Domain or KnowledgeEdge by itself.

## Demo Governance

Demo may preload KnowledgeDomains, explicit DomainAssignments, candidates, and proposals, but every concrete identity lives in demo fixtures/adapters. Demo membership is an explicit node-ID relation list; it is not derived from which node fixture exported a record. BR01 remains Unclassified because no assignment exists, while its review candidates are declared separately.

Demo data is initialization data, not ontology behavior or a production repository. Moving a node between fixture files cannot change its Domain.

## Lifecycle and Mutation Authority

Every create, update, move, unassign, candidate decision, proposal review, and archive operation requires `global-domain-admin`. An active Domain accepts assignments. An archived Domain is retained for history and rejects assignments; archiving is rejected while members remain.

Renaming or recoloring a Domain does not rewrite KnowledgeNodes. Assignment changes do not alter KnowledgeEdges, curriculum, MaterialKnowledgeCoverage, force state, ELK layout, or camera state.

## Persistence and Migration

Prototype persistence uses a versioned envelope containing `schemaVersion`, `seedVersion`, seeded identity sets, and governance state. Schema version 2 removes Domain and proposal scope.

Migration strips `scope: global` from legacy records. Legacy `scope: tenant` Domains are discarded, along with assignments and candidates that reference them; Tenant proposals are discarded. Tenant records are never silently promoted into Global governance. Valid Global administrator rename, color, move, pin, and explicit unassignment state is reconciled and preserved.

## Atlas and Material Projection

Atlas, Personal Atlas, Material, and admin projections explicitly join Knowledge identity with governance state. Hue resolves through `DomainAssignment → KnowledgeDomain.canonicalColor`; missing assignment remains Unclassified. Governance changes affect presentation only and cannot change topology or geometry.

## Future Tenant Domain

A future Tenant Domain implementation must add all of the following together: tenant ownership identity, tenant-scoped repository queries, tenant-specific admin authority, tenant assignment isolation, and tenant persistence isolation. It must extend the governance layer without adding Domain fields to KnowledgeNode or KnowledgeGraph.

## Non-goals

Tenant Domain runtime, secondary Domains, Domain anchors, community hulls, production automatic discovery, merge/split workflows, embeddings, and a full ML pipeline are outside V1.
