# Knowledge Domain System

## Purpose and Definition

Knowledge Domain provides governed semantic classification for the shared Knowledge Graph. A `KnowledgeDomain` is a stable field inferred from node semantics and KnowledgeEdge structure, then confirmed through administration. It supports color, filtering, search, statistics, and governance without changing knowledge facts or spatial layout.

Domain is not a Community, Cluster, Island, Chapter, course grouping, or force-layout region. Analysis may discover a candidate group, but that result remains a proposal. No Domain creates fake nodes, fake edges, anchors, hulls, or forces.

## Domain Scope and Permissions

Formal Domain scope is `global | tenant`. Global Admin governs Global Domains. Tenant Admin governs Tenant Domains. Users may assign a visible Domain to their nodes or remain Unclassified, but cannot create formal Domains in v1. The prototype uses a demo admin capability while preserving scope checks in domain services.

## KnowledgeDomain Schema

`KnowledgeDomain` stores `id`, `scope`, `name`, optional `description`, `canonicalColor`, `status`, and create/update audit fields. `canonicalColor` is the only authoritative Domain color.

## DomainAssignment and Primary Domain Rule

`DomainAssignment` connects one node to one primary Domain and records `source`, optional confidence, pin state, actor, and time. Each KnowledgeNode has zero or one primary Domain in v1. `source: admin` requires `pinned: true`; automatic services must preserve pinned assignments. Secondary Domains are a non-goal.

No assignment is the valid Unclassified state: `domainAssignment == null → Unclassified`. Unclassified uses presentation fallback `#A7B0BF`; it is not a synthetic Domain or KnowledgeNode. It is a manageable collection in Domain Management: administrators can inspect, select, multi-select, and move its members to a formal Domain.

## DomainAssignmentCandidate

A candidate records per-node Domain affinity: combined score, semantic score, structural score, algorithm version, and generation time. Candidates are evidence, not formal membership.

## Existing Domain Auto Assignment

The service scores non-pinned new or unclassified nodes against existing Domains. The configurable default is `0.60 × semantic + 0.40 × structural`.

Semantic input uses only `title`, `description`, and `masteryCriteria`. Course, Chapter, Lesson, Assignment, and curriculum organization are excluded. Structural evidence uses direct `prerequisite`, `enables`, and `related` neighbors plus common-neighbor evidence. It never mutates KnowledgeEdges.

Default thresholds are: score at least `0.85` creates an automatic assignment; `0.60–0.85` creates a pending suggestion; lower scores remain Unclassified. Admin-confirmed pinned assignments are preferred Domain anchors and always have higher authority.

## Domain Discovery and DomainProposal

Discovery builds a weighted similarity graph from semantic neighbor evidence and factual KnowledgeEdges. Its algorithm is replaceable; a future Leiden implementation may replace the deterministic v1 scaffold.

Discovery outputs `DomainProposal` with suggested identity, members, confidence, lifecycle status, algorithm version, and timestamp. A clustering result becomes a Domain only after an administrator accepts and creates it.

## Admin Override and Governance UI

Moving a node in Domain Management or the Atlas quick editor writes `source: admin` and `pinned: true`. Subsequent automation cannot overwrite it.

An Admin Move from Unclassified to a Domain creates the same admin, pinned assignment and immediately updates Unclassified and Domain counts. Candidate recomputation and Domain proposals cannot replace this result.

`/admin/domains` contains Domain Management and Automatic Suggestions tabs. Management supports search/filter, membership inspection, multi-select move, rename, description/color editing, archive, and creation. Suggestions support accepting or redirecting node candidates and reviewing Domain proposals.

## Color Governance

`DOMAIN_COLOR_PALETTE` contains calibrated choices. New Domains receive the most visually distinct unused palette color. Administrators may enter a valid HEX value. KnowledgeNode never owns Domain color.

## Atlas Integration and Layout Independence

Atlas hue resolves through `DomainAssignment → KnowledgeDomain.canonicalColor`. Global Admin can change a selected node's Domain from its drawer; name and color governance remain on the management page.

Domain changes may change color, filters, statistics, search, and classification. They must not reconstruct structural graph data, reheat Force, reset the camera, alter coordinates, or mutate KnowledgeEdges.

The current semantic scorer is a deterministic tokenization + Jaccard scaffold. The current discovery service is a review-flow scaffold, not real automatic Domain discovery. P1 replaces them with embedding kNN, a KnowledgeEdge-weighted similarity graph, and Leiden or an equivalent community algorithm; proposals still require governance confirmation.

## Future Merge/Split and Non-goals

Future Domain merge/split requires audit and review while preserving node and edge identity. Secondary Domains, Domain layout anchors, community regions, cluster hulls, automatic production Domains, scheduled discovery, and a full ML training pipeline are outside v1.

## Persistence and Runtime Authority

`DomainGovernanceRepository` persists Domain definitions, assignments, candidates, and proposals. Explicit demo data initializes an empty repository; it is not recomputed from `KnowledgeNode.domainId`. All Atlas and management projections resolve membership from `DomainAssignment`, making it the single runtime authority.

## Lifecycle and Archive Rules

An active Domain may accept membership. An archived Domain is retained for history but rejects new assignments and automatic classification. Archiving is rejected while the Domain still has active members; an administrator must move or unclassify them first. Unclassified remains the absence of a DomainAssignment.

## Mutation Authority

Every manual create, edit, move, archive, or restore operation receives an explicit actor with the appropriate global or tenant governance capability. Stores do not synthesize a default administrator. Manual moves produce `source=admin` and `pinned=true`, and automated assignment never overwrites that result.

## Multi-course Independence

Domain membership belongs to the shared KnowledgeNode, not to any course that covers it. Adding a course context, Assignment, Material, or user progress does not change Domain membership. Domain definition and membership edits alter classification presentation only; they never alter KnowledgeEdges, structural graph keys, coordinates, or camera state.
