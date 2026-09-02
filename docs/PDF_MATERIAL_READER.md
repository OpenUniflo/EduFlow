# PDF Material Reader

## 1. Responsibilities

MaterialReaderShell owns course-facing state and metadata. PdfMaterialViewer owns PDF.js loading, canvas pages, continuous scrolling, zoom, page visibility, navigation settlement, and load errors. The source PDF remains authoritative presentation content.

## 2. PDF.js Integration

`pdfjs-dist` renders every source page to canvas. The worker is imported with Vite's `?url` mechanism and assigned to `GlobalWorkerOptions.workerSrc`, so development, preview, and deployed builds use a hashed same-origin asset rather than a CDN or development-only path.

## 3. Reader Shell

The stable page retains three independent areas: Material Outline, original PDF, and Knowledge/Assignment context. MaterialRenderer switches between PDF and Document/Article renderers without introducing Course logic into PdfMaterialViewer.

`courseId + materialId` and the server-owned `storage_path` are the stable Material identity. A signed URL is only a short-lived transport credential: Course Runtime must not contain it, and the reader requests a current URL when loading, refreshes it once after a recoverable fatal load error, and requests another current URL when the learner chooses Reload. Post-load page access can still use PDF.js range requests, so the reader also performs at most one document-level refresh for a fatal page load/render error and returns to the active page. It never persists a signed URL or treats one as the durable recovery source.

## 4. activeSegmentId

`activeSegmentId` is the single live position. It drives current PDF page, Outline selection, MaterialKnowledgeCoverage projection, unique Assignment projection, query state, and debounced UserMaterialState persistence.

## 5. Initial Navigation

Initialization runs once per Material context and resolves `explicit valid URL Segment > valid recentSegmentId > first Segment`. The initial jump uses non-animated alignment after the PDF page DOM is mounted.

## 6. Programmatic Navigation

Initial/external navigation, Outline, Previous, and Next create a tokenized request. Observer changes are ignored while the request is active. The request settles when the target intersects the reading anchor, with a short safety timeout only as fallback.

## 7. Observer Navigation

IntersectionObserver tracks visible stable `data-segment-id` and `data-page-number` elements. Natural scrolling chooses the page containing or nearest the 42% vertical reading anchor, preventing a barely visible next page from becoming active early.

## 8. URL Synchronization

Reader updates clone existing URLSearchParams, replace only `segment`, and write with replace history. A remembered reader-originated value prevents that query update from being treated as external navigation. Browser or route-level Segment changes remain genuine external requests.

## 9. Page Detection and Zoom

PDF pages retain source aspect ratio and fit the center width at zoom 1. Zoom changes canvas scale without changing activeSegmentId. Pages use stable DOM attributes rather than child indexes.

## 10. Knowledge and Assignment Synchronization

The Shell projects current Segment coverage through KnowledgeRepository and Domain governance. AssignmentCoverage produces unique Assignments. PdfMaterialViewer has no access to these services.

## 11. Knowledge Pin

Current-page coverage continues to update while pinned main Knowledge detail remains stable. Only explicit unpin returns the detail to automatic page following.

## 12. Reading Progress

Only Segments that become the active target or natural reading page enter `viewedSegmentIds`. A guarded jump does not count intermediate pages. Persistence is debounced and updates `recentLessonId` through LearningProgressRepository.

## 13. Error States

Loading, PDF load failure, password/unsupported input, retry, and normal display are explicit UI states. Errors never expose internal stack traces or silently render a blank center panel.

## 14. Demo PDF Fixtures

`pnpm generate:demo-pdfs` runs `scripts/generate-demo-pdfs.py`. It embeds a CJK font and creates repository-owned original teaching fixtures:

- `public/materials/agentic-ai/lesson-04.pdf` - 32 pages.
- `public/materials/python-engineering/lesson-02.pdf` - 8 pages.
- `public/materials/python-engineering/lesson-04.pdf` - 10 pages.
- `public/materials/python-engineering/lesson-07.pdf` - 10 pages.

Files are committed static assets. Their stable same-origin URLs remain in the Demo runtime and load directly; managed private PDFs omit a runtime URL and resolve temporary access just in time. Neither the browser nor deployment runtime generates the fixtures.

## 15. Production Considerations

Course runtime validation checks page-count and Segment completeness before rendering. Static public URLs provide same-origin PDF and worker loading, while managed sources use the Material source endpoint with a non-cacheable response. Future uploaded sources may add Range optimization, lazy rendering, text layers, and large-document virtualization without changing the bounded recovery policy.

## 16. UI State Integration

`activeSegmentId` remains the upstream reading position. It projects Current Page Knowledge, whose deterministic first item becomes the Auto Mode selection. `selectedKnowledgeId` changes when a user chooses another item on that page. `pinnedKnowledgeId` is an explicit stable ID override. Knowledge Detail and Knowledge-specific Assignments resolve from the effective ID: pinned, then selected, then current-page primary.

Pin does not freeze the PDF, Outline, URL, or active Segment. It freezes the full displayed Knowledge Context, including its indicator, title, roles, description, and precisely scoped Assignment Context. The primary Current Page Coverage list is hidden while pinned so ongoing page projections cannot compete with pinned content. Unpin resolves the current active page immediately without moving the PDF. Knowledge UI state is downstream of `activeSegmentId` and never creates, settles, or restarts a Material navigation request.

## 17. Layout Contract

The Reader defines shared geometry tokens for shell margin, panel gap, left and right panel widths, Header height, content top, responsive GlobalNav width, and the Header's real left boundary. GlobalNav and Header are separate floating panels: Header background, border, and shadow start after GlobalNav plus the shared gap and never extend behind it. When GlobalNav hides its brand copy, the width token contracts and the Header boundary follows automatically.

Outline, PDF viewport, Knowledge Context, and bottom controls derive their geometry from the shared Material tokens. Layout avoids overlap by reserved space, never by placing the Material Header above GlobalNav with z-index.

## 18. Pinned Knowledge Context

PDF reading position continues to update `activeSegmentId`, page visibility, Outline, URL replacement, and progress while a Knowledge Context is pinned. The pinned context resolves fresh metadata from the stable `pinnedKnowledgeId`; no Knowledge object snapshot is stored. Explicit unpin restores the deterministic primary Knowledge for the current Segment.

## 19. Floating Panel Layout

GlobalNav, Material Header, Outline, PDF viewport, Knowledge Context, and controls are independent panel surfaces. Responsive layout changes shared tokens rather than distributing guessed offsets across selectors.
