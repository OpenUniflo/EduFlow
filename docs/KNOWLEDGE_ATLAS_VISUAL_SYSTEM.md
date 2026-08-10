# Knowledge Atlas Visual System

## Purpose

The Atlas is a data-first, stable spatial world inspired by Marble's dot-and-thread language. The shared graph stays factual and relation-driven while presentation explains domain, importance, learning state, and focus without moving nodes.

## Visual Encoding

| Visual channel | Meaning |
| --- | --- |
| Hue | Governed Knowledge Domain |
| Size | Projection-only graph importance |
| Marker / ring | User learning status |
| Opacity | Focus and Explore visibility |
| Halo / scale | Hover and selection |
| Position | KnowledgeEdge-driven layout |

One channel has one primary meaning. Mastery and learning never replace Domain hue.

## Dot + Thread

Nodes are solid Domain-colored dots with a small soft halo. Hover scales a dot slightly; selection scales it more and strengthens its halo. KnowledgeEdges are thin neutral blue-gray threads by default. Direct hover relations become clearer; selected incident relations become prominent; unrelated relations nearly disappear.

## Stable Spatial World

Force simulation runs only for a changed structural node/edge set. At engine stop, positions are frozen. Hover, selection, search, learning state, Domain changes, filters, and drawer state are presentation state and never reheat simulation.

## Sparse Map Labels and Priority

Ordinary labels are small deep gray-blue map labels without pills, borders, card shadows, or blur. A subtle text halo preserves legibility. Selected labels may use a restrained background. Screen-space collision detection remains active.

Priority is selected, hovered, search result, current learning, high visual importance, then other nodes. Selected is always rendered.

## Domain Color and Importance Size

Atlas color resolves from `KnowledgeDomain.canonicalColor` through the primary `DomainAssignment`. Unclassified uses `#A7B0BF`. Learning status is a ring/marker, not a hue replacement.

V1 KnowledgeDomains are Global-only. Atlas styling receives Domain data through the governance projection join; it exposes no Tenant Domain branch.

`KnowledgeGraph` does not carry Domains. Atlas projection explicitly joins its visible graph with `DomainGovernanceState`; this produces presentation fields only. Missing assignment remains Unclassified, with no fallback to node tags, provenance, courses, or fixture location.

`visualImportance` is projection-only and derived from weighted degree. `prerequisite` and `enables` carry more weight than `related`; normalized importance maps Global dots from approximately 3.4 to 7.0 units.

## Focus Storytelling and Camera

Focus contains the selected node and direct one-hop neighbors. Selected is fully visible with strong interaction treatment, neighbors remain near-full opacity, and unrelated nodes dim to approximately 0.08–0.15. Incident threads strengthen while others approach hidden. Coordinates do not change.

Selection smoothly frames the node and its direct neighborhood rather than zooming to one oversized point. Clearing focus preserves the current camera and never calls whole-graph fit.

## Hover Pause and Manual Interaction

Global auto rotation pauses immediately while a node is hovered, selected, or search-focused. Mouse leave starts a roughly 250 ms resume timer; entering another node cancels it. Manual orbit pauses rotation and receives a longer grace period after interaction. Personal Atlas never auto-rotates.

## Hit Target

Visual dot radius and raycast target are separate. An invisible sphere approximately twice the dot radius improves clicking without enlarging the visual mark.

## Camera Lifecycle

Structural layout lifecycle is not Camera lifecycle. Force boot, cooling, engine stop, and coordinate freezing control world positions only. Engine stop does not fit, zoom, reset, focus, or otherwise change the Camera.

Explicit Fit, Reset, Search Focus, Selection Focus, and current-learning focus may move the Camera because they express user intent. Domain edits, learning-state presentation, Drawer state, hover, and background engine completion do not.

Reset performs exactly one deterministic transition. It does not chain a canonical Camera move with a delayed `zoomToFit`.

## Initial Camera Policy

Initial Camera setup may occur once during scene initialization, but it must complete without a delayed visible jump after the scene has become interactive. Any later Camera movement requires explicit user intent or an explicit search/selection focus action.

## Multi-course Context

A visible KnowledgeNode may participate in zero, one, or several courses. Atlas details expose these as `courseContexts[]` and require an explicit course choice when more than one navigation target exists. Course context changes labels and navigation only; it does not change node coordinates, force lifecycle, or camera state.

Material Knowledge Context uses the same `KnowledgeDomain.canonicalColor` hue as Global and Personal Atlas, including the shared Unclassified fallback.

## Topology Responsibility

Atlas renders the active KnowledgeNode and factual KnowledgeEdge topology supplied by its projection. It does not repair missing semantic relations, add same-domain links, infer course or layout edges, or force disconnected components together.

KnowledgeDomain controls governed semantic classification and canonical hue; it does not constrain geometry or imply connectivity. Different Domains may legitimately appear as separate islands. Before adding layout compensation for surprising fragmentation inside one coherent, mature Domain, relation completeness should be audited first. Personal Atlas may likewise contain disconnected islands when the user's core and one-hop Explore facts do not connect them.
