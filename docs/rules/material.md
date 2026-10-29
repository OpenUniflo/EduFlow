# 资料与阅读器

> 由 AGENTS.md 拆出。修改本领域代码前必须阅读本文件；与 AGENTS.md 冲突时以 AGENTS.md 为准。

## Material Invariants

- `Material` belongs to a Course, not a Lesson, and is composed of addressable `MaterialSegment` records. Lesson context derives only through CurriculumCoverage, Knowledge, and MaterialKnowledgeCoverage.
- `MaterialKnowledgeCoverage` is the authoritative N:M mapping between material segments and KnowledgeNodes. Page-number switches and course-specific material lookup tables are forbidden in generic viewers.
- Material routes MUST validate both material existence and course ownership.
- Zero, one, and multiple matching materials MUST be represented honestly; generic UI MUST NOT silently open an unrelated fixed material.

## Material / Assignment Relation

- `MaterialSegment` MUST NOT contain Assignment IDs.
- Material Assignment context follows only `MaterialSegment -> MaterialKnowledgeCoverage -> KnowledgeNode -> AssignmentCoverage -> CourseAssignment`.
- Generic projection MUST NOT synthesize fallback AssignmentCoverage records. A future direct Material/Assignment relation requires its own explicit relation entity.

## Material Reader Invariants

- The current Material Reader DOM and layout CSS MUST have one scoped authority. Archived reader selectors MUST be removed or isolated so build output never depends on HMR or stylesheet injection order.
- Material navigation MUST support explicit `?segment=` deep links. An explicit valid URL Segment takes precedence over saved reading position, which takes precedence over the first Segment.
- KnowledgeNode-to-Material navigation MUST resolve a deterministic primary Segment by `introduce > explain > example > practice-reference > authoritative segment order` (`order` for non-PDF, `page` for PDF), then stable ID only as a final tie.
- Scrolling, active Segment, outline selection, Knowledge context, Assignment context, URL, and recent reading position MUST represent the same MaterialSegment.
- Segment-to-URL synchronization MUST use history replacement, not one history entry per viewed Segment.
- Reading completion MUST be derived from actually viewed/completed Segment identities and MUST NOT be inferred from the current Segment's numeric position.
- MaterialKnowledgeCoverage is authoritative for Segment-to-Knowledge relationships. Generic readers MUST NOT contain course-specific page mappings.

## Original Material Invariants

- Original course material is authoritative presentation content. For PDF Material, the center reader MUST render the original PDF pages instead of reconstructing them from HTML cards.
- Knowledge, Assignment, Domain, and progress metadata remain external to the source PDF. Changing mappings MUST NOT require rewriting the PDF file.
- The source PDF is curriculum content and MUST NOT become a KnowledgeNode or determine Knowledge identity.

## PDF Material Invariants

- For PDF Material, one PDF page equals one MaterialSegment. `MaterialSegment.page` maps deterministically to a source page in the complete range `1..pageCount`.
- PDF source metadata, Segment count, unique page numbers, and MaterialKnowledgeCoverage references MUST be validated before rendering.
- PDF.js worker assets MUST be bundled by Vite with production-stable URLs. An iframe or browser-native PDF toolbar is not the primary reader.
- Document and Article renderers MUST coexist with the PDF renderer.

## Reader State Invariants

- `activeSegmentId` is the single live reading-position state for PDF page, Outline, Knowledge context, Assignment context, URL, and persisted recent position.
- Initial alignment runs only for a new Material or genuine external Segment navigation. Normal scrolling and reader-originated URL replacement MUST NOT restart it.
- Programmatic navigation and observer navigation MUST be explicitly distinguished. Observer changes are ignored until the requested page is stably visible.
- Reader URL updates preserve unrelated query parameters and use history replacement.
- Pinning Knowledge detail survives page changes until the user explicitly unpins it.
- Programmatic jumps MUST NOT mark intermediate PDF pages as viewed.

## Material Header Layout Invariants

- Material Reader MUST reserve layout space for GlobalNav. GlobalNav and Material Header MUST NOT overlap or resolve overlap through z-index competition.
- Material Header, Outline, PDF viewport, Knowledge panel, and bottom controls SHOULD share Material layout tokens instead of independent magic offsets.
- Responsive GlobalNav reserve MUST contract when the global brand copy is hidden.
- GlobalNav and Material Header MUST be visually independent floating panels; their backgrounds, borders, shadows, and panel surfaces MUST NOT overlap.

## Material Knowledge Context Invariants

- Current Page Knowledge, Selected Knowledge, and Pinned Knowledge are distinct presentation concepts. Selecting a KnowledgeNode MUST NOT automatically pin it.
- Pinning is an explicit action and stores only the stable KnowledgeNode ID, never a copied Knowledge object, description, Domain color, or Assignment snapshot.
- Effective Knowledge resolves as pinned Knowledge, then selected Knowledge, then the deterministic current-page primary Knowledge.
- While pinned, Knowledge Detail and Knowledge-specific Assignment Context stay attached to the pinned Knowledge; Current Page Knowledge coverage continues following the active MaterialSegment.
- Unpinning immediately restores current-page-linked selection. Material identity changes clear the presentation-only Pin state.
- Current-page Knowledge contexts MUST be ordered deterministically by `introduce > explain > example > practice-reference`, then stable `nodeId`, independent of MaterialKnowledgeCoverage input order.
- Pinned Knowledge Context MUST remain stable while the PDF reading position changes. Pinned mode hides the primary Current Page Coverage region so page changes cannot displace or visually compete with pinned detail.
- Pinning MUST NOT control PDF navigation. Unpinning MUST restore context from the current active MaterialSegment without changing the PDF position.

## Material Assignment Context Invariants

- Page-level Assignment Context and Knowledge-specific Assignment Context are separate projections.
- Knowledge Detail MUST show Assignments covered by its effective KnowledgeNode and MUST NOT include unrelated Assignments from other KnowledgeNodes on the same MaterialSegment.
- Knowledge selection and Pin state are downstream of `activeSegmentId`; they MUST NOT restart PDF initialization or change PDF scroll, URL ownership, activeSegmentId, or zoom.
