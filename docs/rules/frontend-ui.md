# 前端界面与外壳

> 由 AGENTS.md 拆出。修改本领域代码前必须阅读本文件；与 AGENTS.md 冲突时以 AGENTS.md 为准。

## Product Chrome

- The primary chrome is a left vertical navigation rail: 首页 / 档案 / 作品 / 记录 (+ 教学 / 管理 by role) with the account avatar at the bottom. It is the single primary chrome. A page title, contextual control, or workspace tool MUST NOT introduce a second full-width fixed header.
- Content and management pages use headings in normal document flow; graph, canvas, and reader pages use only lightweight contextual overlays so their primary workspace remains dominant.
- Micro Learning is interaction-first. Assistant help may be contextual, but product chrome and Assistant actions MUST NOT visually or behaviorally dominate the assessment.

## New UI Shell (2026-10-30)

- Single design source: `docs/design/new-ui/system/tokens.css` (six type sizes 12/13/14/16/20/28, semantic colors, radii, spacing, three shadows, two glass materials `lg-regular`/`lg-clear`, motion tokens). New styles use tokens only; legacy styles are removed page by page as pages migrate.
- Glass MUST degrade to blur-only on Safari and to opaque surfaces under `prefers-reduced-transparency`.
- Motion: durations 160/240/400/600 ms and three easings; 600 ms only for scene transitions (Archive → course immersive, 3D → 2D flatten). Every transition is reversible and has a `prefers-reduced-motion` alternative.
- The avatar opens the account menu (first row: 打开我的面板). The 我的 panel opens from the Home top-right toggle and pushes, not covers, the conversation.
- Objects open through one Object Shell with four sizes (card S, card L, side panel, immersive). Expanding never slides a new drawer in from the screen edge; entering a course zooms in place and morphs existing overlays.
- Conversation cards: event rows span the conversation column; S cards are 480 wide and centered on the column; L cards span the column.
- Retired surfaces: Course Center, Explore page and Assistant Messages page; their routes redirect to Archive / Home.

## Feature Preview

- A feature whose backend is not available MAY ship as a Feature Preview: the real UI and interactions fed by a fixed sample dataset, so users see the intended product.
- Sample datasets live under `src/demo` and are injected by `src/app` through the same contracts as real repositories.
- Preview regions MUST carry a visible "预览 · 示例数据" marker, use obviously sample identities, never mix with real user data and never write durable state. Replacing a preview with the real backend only swaps the injected source.
