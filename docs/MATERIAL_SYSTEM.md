# Material System

## 1. Purpose

The Material system represents reusable course-owned learning content without encoding a particular PDF, lesson number, or page switch in the viewer.

## 2. Material

A `Material` has a stable ID, `courseId`, `lessonId`, title, kind, and ordered segment IDs. It is curriculum data, not a KnowledgeNode.

## 3. MaterialSegment

`MaterialSegment` is the addressable reading unit. It owns ordered, renderer-neutral content blocks such as headings, paragraphs, lists, callouts, and code.

## 4. MaterialKnowledgeCoverage

Coverage maps `materialId + segmentId` to a stable `nodeId` with a role. It is the only content-to-knowledge mapping and supports N:M in both directions.

## 5. Assignment Context

The viewer derives related Assignments by following the segment's KnowledgeNodes through AssignmentCoverage. It does not infer Assignments from page numbers or titles.

## 6. Generic Projection

Material projection takes a runtime, material ID, segment ID, and user state. It validates course ownership, orders content, resolves Knowledge contexts, and exposes Assignment contexts.

## 7. Routing and Ownership

`/courses/:courseId/materials/:materialId` is the canonical route. Missing materials and course/material mismatches render Not Found; no fixture is used as fallback.

## 8. Zero, One, and Many

A course or selected graph anchor may have no materials, one material, or several. The UI renders an empty state, opens the one explicit match, or presents a chooser respectively.

## 9. Reading State

Reading position and completion belong to `UserMaterialState`, keyed within a user/course state by `materialId`. They are not fields on Material or MaterialSegment.

## 10. Shared Knowledge

One segment may cover several nodes, and one KnowledgeNode may be covered by segments from several materials and courses. This mapping does not create KnowledgeEdges.

## 11. Validation

Every coverage record must reference an existing material, one of that material's segments, and an active KnowledgeNode included by the course curriculum.

## 12. Non-goals

This version does not provide file upload storage, PDF parsing, rich authoring, annotations, highlights, collaborative comments, or content version synchronization.
