# Knowledge Source System

## 1. Purpose

KnowledgeRepository is scoped lookup/access infrastructure over KnowledgeGraph data. It is not a new ontology layer and does not copy KnowledgeNode or KnowledgeEdge facts.

## 2. Scopes and Visibility

Global nodes are shared. Tenant nodes are visible inside their owning tenant context. User nodes are visible to their owner. `KnowledgeAccessContext` carries the active user, optional tenant, and requested visible scopes.

## 3. KnowledgeRepository

The repository exposes stable node lookup, ordered multi-node lookup, and a visible KnowledgeGraph projection. Returned edges are factual KnowledgeEdges whose endpoints are both visible. Renderer state, curriculum data, and Domain geometry are excluded.

## 4. Global Atlas

Global Atlas requests Global visibility and applies an explicit `scope=global` projection. Repository support for other scopes never broadens the Global Atlas product boundary.

## 5. Personal Atlas

Personal Atlas requests the active user's visible Global/Tenant/User graph, then projects that user's mastered/learning core and direct one-hop Explore nodes. UserKnowledgeRepository is keyed by user identity, so changing session changes the personal graph source rather than only changing the displayed name.

## 6. Course Resolution

CurriculumCoverage, AssignmentCoverage, and MaterialKnowledgeCoverage may reference visible nodes from any scope. Course projection receives an explicit visible KnowledgeGraph and never imports the Global demo graph as a default.

## 7. Material Resolution

MaterialSegment Knowledge contexts are resolved from MaterialKnowledgeCoverage through KnowledgeRepository. Invisible or unknown node references fail runtime validation rather than producing partial UI silently.

## 8. Validation

CourseRuntime validation receives KnowledgeRepository plus KnowledgeAccessContext and checks course identity, unique Chapter/Lesson/Assignment/Material/Segment IDs, ownership, sequences, and all coverage endpoints before layout or rendering.

## 9. UserKnowledgeRepository

UserKnowledgeRepository returns UserKnowledgeRecord data for one user. Records are separate from KnowledgeNode definitions and from UserCourseState. The demo adapter deliberately returns distinct fixtures for different users.

## 10. Permissions

Visibility is enforced at lookup time using scope and owner context. Formal backend adapters may add tenant membership and policy checks without changing Course, Material, Atlas, or projection code.

## 11. Non-goals

This version does not implement backend authorization, cross-tenant sharing, public user nodes, secondary scopes, vector search, or a database-backed repository.
