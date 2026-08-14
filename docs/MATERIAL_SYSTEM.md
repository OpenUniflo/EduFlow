# Material System

## 1. Purpose

The Material system represents reusable course-owned learning content without encoding a particular PDF, lesson number, or page switch in the viewer.

## 2. Material

A `Material` has a stable ID, `courseId`, `lessonId`, explicit Lesson-local `order`, title, kind, and addressable Segments. It is curriculum data, not a KnowledgeNode.

## 3. MaterialSegment

`MaterialSegment` is the addressable reading unit. Non-PDF content uses its explicit Material-local `order`; PDF content uses the source `page` as authoritative order. It owns renderer-neutral content blocks such as headings, paragraphs, lists, callouts, and code and contains no Assignment IDs.

## 4. MaterialKnowledgeCoverage

Coverage maps `materialId + segmentId` to a stable `nodeId` with a role. It is the only content-to-knowledge mapping and supports N:M in both directions.

## 5. Assignment Context

The viewer derives related Assignments only through `MaterialSegment -> MaterialKnowledgeCoverage -> KnowledgeNode -> AssignmentCoverage -> CourseAssignment`. It does not infer Assignments from page numbers or titles and does not synthesize fallback relations.

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

Phase 4.3 derives generated-course coverage from persisted Phase 4.2 `KnowledgeProvenance.sourceLocations`. PDF pages resolve exactly to page Segments. Non-PDF locations resolve only when an explicit unique Segment section address exists; unresolved or ambiguous locations are review failures rather than order-based guesses. Because provenance proves source support but not first introduction, generated coverage uses the conservative `explain` role unless a future explicit teaching-role source is added.

## 12. Structured Parsing Contract

Uploaded PDF, PPTX, and DOCX sources may have a versioned structured parse attached to the existing `Material`. The vendor-neutral `CourseMaterial` document contains ordered Sections, ContentBlocks, structure-first Chunks, and honest SourceLocations. PDF locations use source pages, PPTX locations use slides, and DOCX locations use section paths plus stable raw-block identity and ordinal; DOCX page numbers are not manufactured.

The source binary remains in private `course-materials` Storage. Raw Docling JSON and normalized `CourseMaterial` JSON remain separate immutable artifacts in private `material-parser-artifacts` Storage, so adapter changes can renormalize saved raw output without rerunning Docling. The worker persists raw JSON immediately after Docling conversion and before normalization. PostgreSQL stores only the material-owned parsing lifecycle, versions, checksums, artifact paths, and bounded diagnostics. One job row per Material moves through `pending -> running -> completed | failed`; retry reuses that row and increments its attempt. Retry clears the prior attempt's artifact pointers. A failed attempt may reference its reusable raw artifact but never a normalized artifact; a completed attempt is visible only after both current-attempt artifacts have been written. Operational job rows and parser artifacts are service-role-only.

Rich authoring, annotations, highlights, collaborative comments, content version synchronization, Knowledge extraction, and semantic chunking remain non-goals.

## 13. Reader Lifecycle and Deep Links

The active reader uses the `material-reader-current` scope as the sole layout authority. Archived reader generations are isolated under `legacy-material-reader`, so the development server and production bundle do not depend on CSS injection order.

The canonical resource URL is `/courses/:courseId/materials/:materialId?segment=:segmentId`. Segment is a reading position inside a Material, not another pathname resource. Initialization resolves `valid URL segment > valid recentSegmentId > first segment`, then performs one non-animated DOM alignment using the stable `data-segment-id` attribute.

After initialization, outline clicks and previous/next actions may scroll smoothly. IntersectionObserver selects the Segment nearest the viewport center during manual reading. One `activeSegmentId` drives outline highlight, slide highlight, Knowledge context, Assignment context, URL, and recent reading position. URL synchronization uses replace semantics; browser navigation back to another Segment is also honored.

## 14. Knowledge Material Entry Resolution

A KnowledgeNode may map to several Segments in one Material and to several Materials. Each Material gets one deterministic entry using `introduce > explain > example > practice-reference`, then authoritative Segment order (`order` for non-PDF, `page` for PDF), then stable ID. Multiple Materials order by primary Lesson, `lesson.order`, `material.order`, then ID only as the final tie. Zero entries render an explicit empty state, one opens directly, and several produce a chooser showing Material, Segment order/title, and role.

## 15. Reading Position and Completion

`recentSegmentId` is position. `viewedSegmentIds` is observed reading coverage. `progress` is the ratio of viewed Segment IDs to total Segments. Jumping directly to the final Segment therefore records that position and one viewed Segment; it cannot produce 100% completion. Reader persistence is debounced and atomically updates the Material state and its `recentLessonId` through LearningProgressRepository.

## 16. Knowledge, Assignment, and Domain Context

The active Segment's Knowledge list comes only from MaterialKnowledgeCoverage and scoped KnowledgeRepository lookup. Assignment context follows the resulting Knowledge IDs through AssignmentCoverage and deduplicates stable Assignment IDs. Knowledge hue resolves from `DomainAssignment -> KnowledgeDomain.canonicalColor`, with the shared Unclassified fallback used by Atlas and Personal Atlas.

## 17. Original PDF Material

EduFlow treats the source PDF as authoritative presentation content. The center reader renders PDF pages through PDF.js and does not reproduce the teacher's layout from `lead`, `bullets`, or HTML cards. Knowledge, Assignment, Domain, and progress metadata remain outside the PDF. Changing `MaterialKnowledgeCoverage` never requires changing the source file.

`MaterialSource { kind: "pdf", url, pageCount }` identifies a static or remotely hosted PDF. A PDF Material has exactly one ordered MaterialSegment per source page, and `segment.page` covers every integer from 1 through `pageCount` once. Segment IDs are curriculum addresses, not ontology identities.

## 18. Renderer Coexistence

MaterialRenderer selects `PdfMaterialViewer` for PDF sources and the structured Document/Article renderer for non-PDF content. PdfMaterialViewer owns only PDF loading, canvas rendering, continuous vertical page layout, visible-page detection, programmatic scrolling, zoom, loading, and friendly error states. It does not import Course, Knowledge, Domain, or Assignment repositories.

PDF.js worker code is imported as a Vite URL asset, producing a hashed production worker file. The reader does not use iframe or browser-native PDF controls.

## 19. Stable Reader State Machine

`activeSegmentId` is the only live reading position. Two event families may change it: genuine external navigation and user reading actions. Initialization resolves `valid explicit URL > valid recentSegmentId > first Segment` once per Material navigation context.

Outline, Previous, Next, initial deep links, and external URL changes create guarded programmatic navigation. IntersectionObserver may report intermediate pages during the scroll, but those reports cannot replace the target until it intersects the 42% reading anchor. Natural reading selects the visible page nearest that anchor. Reader-originated `replace` query updates are classified separately and never cause alignment feedback.

URL synchronization clones existing query parameters, sets only `segment`, and uses replace history. Zoom and Fit Width never reset the active page. Knowledge Pin stores the selected context independently from current-page coverage and persists until explicit unpin.

## 20. PDF Validation and Errors

Course runtime validation rejects PDF Material without a non-empty PDF source, positive page count, matching Segment count, complete unique page range, or valid coverage references. PdfMaterialViewer exposes loading, unsupported/password, 404/load-error, retry, and normal rendered states without leaking stack traces.

## 21. Demo PDF Fixtures

`scripts/generate-demo-pdfs.py` uses repository-owned teaching content to produce committed static fixtures under `public/materials/`. Generation is an explicit development task (`pnpm generate:demo-pdfs`), not a browser or Vercel runtime operation. Current fixtures are Agentic AI Lesson 04 and Python Engineering Lessons 02, 04, and 07. Their source page counts are validated against Material Segments.

## 22. Material Knowledge Context State

The Reader separates three presentation states. Current Page Knowledge is the deterministic `MaterialKnowledgeCoverage` projection for `activeSegmentId`. Selected Knowledge is the current detail choice within that page. Pinned Knowledge is an explicit, ID-only override that survives page changes.

The effective detail identity is `pinnedKnowledgeId ?? selectedKnowledgeId ?? currentPagePrimaryKnowledgeId`. In Auto Mode, changing the active Segment resets selection to the first deterministic Knowledge context for that Segment. Clicking another current-page item changes selection without pinning. In Pinned Mode, the primary Current Page Coverage region is hidden and the complete Knowledge Context—indicator, title, roles, description, and Knowledge-specific Assignment list—remains attached to the pinned node. Unpin immediately selects the current-page primary node. A Material change clears the Pin and initializes selection from the new Material position.

Page Assignment Context is the unique Assignment projection for all KnowledgeNodes covered by a Segment through formal coverage records. Knowledge-specific Assignment Context filters `AssignmentCoverage` by one KnowledgeNode ID. The adjacent list under Knowledge Detail always uses the latter, so a multi-Knowledge page cannot leak unrelated Assignments into the selected detail.

Selection and Pin are session-only Reader UI state. They do not persist in UserMaterialState and do not control PDF page, Outline, URL, zoom, or navigation initialization.

## 23. Floating Panel Contract

GlobalNav, Material Header, Outline, PDF Reader, Knowledge Context, and Material Controls are independent floating panels. Their backgrounds, borders, shadows, and visible surfaces do not overlap to form a larger container.

Material Header starts at a real `--material-header-left` boundary derived from the shared shell margin, responsive GlobalNav width, and panel gap. Its normal internal padding never acts as navigation reserve. When GlobalNav hides brand copy, a responsive token override contracts the same geometry without duplicated pixel offsets.
