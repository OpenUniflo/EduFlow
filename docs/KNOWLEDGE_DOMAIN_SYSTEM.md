# Knowledge Domain System

## Purpose

Knowledge Domain is governed semantic classification around the shared Knowledge Graph. It supports canonical hue, filtering, search, statistics, and administration without becoming a knowledge fact or changing graph geometry.

Domain is not a KnowledgeNode, Community, Cluster, Island, Chapter, Course group, force anchor, or layout region. Discovery produces proposals only. Domain logic never creates fake nodes, fake edges, hulls, centers, or forces.

## Hard Model Boundary

`KnowledgeNode` contains no `domainId`, copied Domain color, or other authoritative membership field. `KnowledgeGraph` contains only `nodes`, `revisions`, and factual `edges`; it contains no Domain definitions or assignments.

Domain definitions, assignments, candidates, and proposals live behind `DomainGovernanceRepository`. `DomainAssignment` is the only membership truth. Tags, provenance, node fixture location, course context, and relation neighborhoods may be evidence for suggestions, but none is a membership fallback.

Atlas, Material, Profile, and admin projections explicitly join a visible `KnowledgeGraph` with a `DomainGovernanceState`. This join may change presentation metadata such as hue and labels. It must not change node/edge identity, force input, coordinates, ELK input, or camera state.

## KnowledgeDomain

`KnowledgeDomain` stores `id`, `scope`, `name`, optional `description`, `canonicalColor`, lifecycle `status`, and create/update audit fields. Scope is `global | tenant`. `canonicalColor` is the only authoritative Domain color.

Global Admin governs Global Domains. Tenant Admin governs Tenant Domains. Every mutation receives an explicit actor with the matching capability; stores never synthesize administrator authority. Users do not create formal Domains in v1.

## DomainAssignment and Unclassified

`DomainAssignment(nodeId, domainId, source, confidence?, pinned, assignedBy?, assignedAt)` connects one node to at most one primary Domain. `source: admin` requires `pinned: true`; automatic services must preserve pinned assignments.

No assignment is the first-class Unclassified state. Unclassified is not a synthetic Domain or KnowledgeNode and uses presentation fallback `#A7B0BF`. Administrators can inspect, select, and move Unclassified nodes. A manual move writes an admin-pinned assignment. Removing an assignment requires authority for the current Domain scope.

The governance validator rejects duplicate Domains, duplicate primary assignments, orphan assignments, assignments to inactive nodes, assignments to archived Domains, invalid colors, invalid candidate references, invalid proposal node references, and unpinned admin assignments.

## Candidates and Discovery

Existing-Domain scoring combines configurable semantic and structural evidence. Semantic evidence uses title, description, and mastery criteria. Structural evidence uses factual `prerequisite`, `enables`, and `related` neighbors and common neighbors. It never mutates KnowledgeEdges.

Default scoring is `0.60 × semantic + 0.40 × structural`. A score at least `0.85` may create an automatic assignment; `0.60–0.85` creates a review candidate; lower scores remain Unclassified. Admin-pinned assignments always win.

Full-graph discovery creates `DomainProposal` records. A proposal becomes a formal Domain only after authorized review. Proposal acceptance/rejection requires the capability matching `proposal.scope`.

## Lifecycle

An active Domain accepts assignments. An archived Domain is retained for history and rejects new assignments or automatic classification. Archiving is rejected while active members remain; members must first be moved or unclassified.

Renaming a Domain or changing its canonical color does not rewrite KnowledgeNodes. Changing assignment does not create, delete, or alter KnowledgeEdges, MaterialKnowledgeCoverage, curriculum data, layout, or camera state.

## Persistence and Seed Reconciliation

Local prototype persistence uses a versioned envelope:

```ts
{
  schemaVersion,
  seedVersion,
  seededDomainIds,
  seededAssignmentNodeIds,
  state
}
```

`state` contains Domains, assignments, candidates, proposals, and revision. Legacy raw-state storage is detected and migrated. On seed upgrades, new valid fixture records are added while valid administrator rename/color/move/pin changes are preserved. The recorded seeded ID sets preserve an explicit later unassignment instead of silently restoring it. Orphaned or archived references are discarded; invalid persistence falls back to a validated seed.

Legacy raw state did not record seed tombstones, so a one-time migration cannot distinguish a previously removed seed assignment from a seed record that is newly introduced. After the first envelope write, explicit unassignment is preserved across later seed updates.

## Demo Fixtures

Concrete demo Domain definitions and assignments live only under `src/v2/demo/domains`. The core `knowledge/domain` package defines schemas, validation, scoring, repository boundaries, and mutation rules; it does not hardcode Agentic AI, Python Engineering, or other product fixtures.

Demo assignments are generated from active node fixtures rather than duplicated hand-maintained node-ID lists. The deliberately Unclassified bridge node is excluded for candidate review. The demo user node `U-DEMO-01` receives Agentic AI presentation through a demo `DomainAssignment`, not through `KnowledgeNode` metadata.

## Admin UI

`/admin/domains` supports governed membership inspection, Unclassified management, multi-select move, rename, description/color editing, archive, candidates, and proposals. Atlas quick assignment calls the same governance mutations.

The same resolved canonical hue is reused by Global Atlas, Personal Atlas, and Material Knowledge Context. A Domain edit must never reheat Force, rebuild topology, reset camera, or reposition Material content.

## Non-goals

Secondary Domains, Domain geometry anchors, community regions, cluster hulls, scheduled production discovery, automatic authoritative Domains, merge/split workflows, and a full ML pipeline are outside v1.
