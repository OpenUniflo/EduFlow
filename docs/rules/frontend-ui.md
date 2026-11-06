# 前端界面与外壳

> 由 AGENTS.md 拆出。修改本领域代码前必须阅读本文件；与 AGENTS.md 冲突时以 AGENTS.md 为准。

## Product Chrome

- The primary chrome is a left vertical navigation rail with the account avatar at the bottom. It is the single primary chrome. A page title, contextual control, or workspace tool MUST NOT introduce a second full-width fixed header.
- The learner rail grows from real learning state: 首页 by default, then 作品 after a real task/attempt, 记录 after a learning record, and 地图 after the first segment is complete. It is derived, never a level or unlock record. Teachers and admins always receive their full set. Hidden is not locked: URL, ⌘K and the Assistant still reach every destination.
- Content and management pages use headings in normal document flow; graph, canvas, and reader pages use only lightweight contextual overlays so their primary workspace remains dominant.
- Micro Learning is interaction-first. Assistant help may be contextual, but product chrome and Assistant actions MUST NOT visually or behaviorally dominate the assessment.

## New UI Shell (2026-10-30)

- Single design source: `docs/design/new-ui/system/tokens.css` (six type sizes 12/13/14/16/20/28, semantic colors, radii, spacing, three shadows, two glass materials `lg-regular`/`lg-clear`, motion tokens). New styles use tokens only; legacy styles are removed page by page as pages migrate.
- Glass MUST degrade to blur-only on Safari and to opaque surfaces under `prefers-reduced-transparency`.
- Motion: durations 160/240/400/600 ms and three easings; 600 ms only for scene transitions (Archive → course immersive, 3D → 2D flatten). Every transition is reversible and has a `prefers-reduced-motion` alternative.
- The avatar opens the account menu (first row: 打开我的面板). The 我的 panel opens from the Home top-right toggle and pushes, not covers, the conversation.
- Objects open through one Object Shell with four sizes (card S, card L, side panel, immersive). Expanding never slides a new drawer in from the screen edge; entering a course zooms in place and morphs existing overlays.
- Conversation cards: event rows span the conversation column; S cards are 480 wide and centered on the column; L cards span the column.
- Assistant answer cards are part of the answer, not page state. Text and cards interleave in the message's `parts` order, one answer shows at most 3 cards, and a completed card collapses to one line. Page state MUST NOT append cards to the timeline tail.
- Retired surfaces: Course Center, Explore page and Assistant Messages page; their routes redirect to Archive / Home.

## Archive Chrome (2026-10-31)

- Top-left people bar: `[people icon] | [me] [followed people…] [+]`. The people icon toggles the 人与分享 panel (followed people, profile visibility, revocable share link). Clicking a person's avatar opens that person's panel and applies person focus; clicking it again, blank space or Esc clears both; Shift-click adds a person for comparison.
- Panels change only by explicit user action: they never open, close, shrink or swap content because of zoom, camera, focus or course selection. Every panel has a collapse control that leaves a small strip to reopen it. While a panel is open, scene framing (e.g. the Archive course plane) fits the remaining free area.
- Bottom-right holds only zoom out, a monotonic zoom percentage, zoom in and reset view; bottom-left shows the current map level (领域 / 主题 / 知识). There is no locate-me button and no own-subset highlight toggle.

## Conversation Mainline (2026-11-08)

- Home has three derived states: 首次 (no conversation, no learning record), 学习中 (an active conversation or an explicit Continue), and 回来 (learning records exist and the learner has not resumed this visit). The first state is one open question, the composer and database-configured examples; it MUST NOT show a half-screen Course recommendation card. Starting a conversation removes overview cards from the conversation space.
- The next step has one source: `learnerStateService.getNavigation`. The Home header, next-step strip, 我的, route panel, template completion reply and practice result all project that decision. No separate "first pending Assignment" or "first active Knowledge" next step may exist, and nothing is invented when the decision has no action.
- Before the first segment starts, a configured "带我从最简单的开始" entry is always available above the composer. It is a deterministic action reply plus a route card, never a model call. The starter Course and the fresh-state examples live in the database; without configuration the entry and examples are absent and Home still works.
- A route card shows only the first segment (Micro up to the first Assignment). Once started it collapses to one line. "查看完整路线" opens a Home side panel that reuses the shared route component and loads no 3D; the panel's 立体视图 opens the Course tree. Only the current chapter is expanded.
- Simple Micro opens in the conversation card; a task opens the right panel. Focused immersive Micro is a user action, never the automatic continuation.
- The first-segment summary is an answer card backed by object references: learned points, passed task and a mini map projected only from the learner's own `UserKnowledgeState` and real edges. Reopening the conversation re-reads current state. "打开完整星图" opens 地图 focused on a learned node.
- 我的 is a read-only overview plus conversation history: active Course, real task states, recent learning, new conversation and session switch. It MUST NOT repeat the next step or show task-only "0% 已完成" as Course progress. Course progress is shown as learned points / total points and stays distinct from mastery.
- A newly appearing rail item uses a short, non-blocking transition and respects `prefers-reduced-motion`.

## Feature Preview

- A feature whose backend is not available MAY ship as a Feature Preview: the real UI and interactions fed by a fixed sample dataset, so users see the intended product.
- Sample datasets live under `src/demo/preview/` and are injected by `src/app` through the same contracts as real repositories.
- Preview regions MUST carry a visible "预览 · 示例数据" marker, use obviously sample identities, never mix with real user data and never write durable state. Replacing a preview with the real backend only swaps the injected source.
