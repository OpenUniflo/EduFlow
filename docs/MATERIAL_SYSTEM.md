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

## 13. Reader Lifecycle and Deep Links

The active reader uses the `material-reader-current` scope as the sole layout authority. Archived reader generations are isolated under `legacy-material-reader`, so the development server and production bundle do not depend on CSS injection order.

The canonical resource URL is `/courses/:courseId/materials/:materialId?segment=:segmentId`. Segment is a reading position inside a Material, not another pathname resource. Initialization resolves `valid URL segment > valid recentSegmentId > first segment`, then performs one non-animated DOM alignment using the stable `data-segment-id` attribute.

After initialization, outline clicks and previous/next actions may scroll smoothly. IntersectionObserver selects the Segment nearest the viewport center during manual reading. One `activeSegmentId` drives outline highlight, slide highlight, Knowledge context, Assignment context, URL, and recent reading position. URL synchronization uses replace semantics; browser navigation back to another Segment is also honored.

## 14. Knowledge Material Entry Resolution

A KnowledgeNode may map to several Segments in one Material and to several Materials. Each Material gets one deterministic entry using `introduce > explain > example > practice-reference > earliest segment.order`. Zero entries render an explicit empty state, one opens directly, and several produce a chooser showing Material, Segment order/title, and role.

## 15. Reading Position and Completion

`recentSegmentId` is position. `viewedSegmentIds` is observed reading coverage. `progress` is the ratio of viewed Segment IDs to total Segments. Jumping directly to the final Segment therefore records that position and one viewed Segment; it cannot produce 100% completion. Reader persistence is debounced and atomically updates the Material state and its `recentLessonId` through LearningProgressRepository.

## 16. Knowledge, Assignment, and Domain Context

The active Segment's Knowledge list comes only from MaterialKnowledgeCoverage and scoped KnowledgeRepository lookup. Assignment context follows the resulting Knowledge IDs through AssignmentCoverage and deduplicates stable Assignment IDs. Knowledge hue resolves from `DomainAssignment -> KnowledgeDomain.canonicalColor`, with the shared Unclassified fallback used by Atlas and Personal Atlas.
