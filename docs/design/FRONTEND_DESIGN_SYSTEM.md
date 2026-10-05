# Frontend design system

Frozen for execution unification, 2026-10-04.

The product is clear, precise, quiet and alive through meaningful state changes. Information hierarchy precedes decoration. Reuse existing CSS variables, surfaces, button primitives and motion/react; do not introduce an animation framework.

## Identity and hierarchy

In project capability/route views, blue means acquired/current capability, green means an unacquired project target, gray means unacquired intermediate capability. This encoding is local to capability presentation: Atlas Domain hue remains governed by KnowledgeDomain.canonicalColor. Never replace Domain hue with mastery colors.

The same object retains its identity and behavior across presentations. Node detail unfolds from the node with an optional course context. Default emphasis is current state, next step and recommended Action. Relations, history and alternatives use progressive disclosure. One region has one visually dominant primary action. Disabled, loading, hover, focus, selection, error and success states must be readable and operable.

Typography, spacing, borders, radii, surfaces and shadows use shared tokens. Avoid decorative gradients, broad glow, excessive glass and competing CTAs. Keep context secondary to useful actions. Responsive readability and accessibility are part of the design, not a later patch. Every hover affordance has a click/touch/keyboard path.

## Motion tokens

- Micro interaction: 100–160 ms.
- Component expansion: 160–240 ms.
- Drawer, modal and Assistant: 220–320 ms.
- Relationship transition: 280–420 ms.

Prefer opacity and transform. Avoid bounce, overshoot and ordinary interactions over 500 ms. Current Project Route continuously communicates source→target execution direction with a restrained pulse on real Edges. Preview uses a distinct coordinated color and directional pulse; Current remains visible but subdued, with kept/added/removed facts understandable. Ordinary Project relationship lines use one solid style; relation types remain in text details. Unselected Action branches may be dashed. Remove default Project Route node rings; temporary interaction halo and Atlas learning/mastery rings retain their meanings. Overlays and branches never change topology, positions, camera or force lifecycle.

Course Route restores the existing vertical sequential path style. Adopted Action Steps show completed/current/next status, title, duration and one Start/Continue operation. The connecting line expresses execution order only. Users change nodes, relations or Action alternatives in Project Capability → Adjust Route, inspect the complete Preview, then Adopt. There is no Action choice menu in Course Route.

Project shows the complete active, visible factual ancestor structure; personal state changes recommendation and route highlights, not structural visibility. Narrow screens can collapse the goal copy and planning panel while keeping the draft and graph position. Evidence footer actions reserve space for the Assistant trigger; closing its modal returns keyboard focus to the opener and preserves the Assistant draft.

Assistant opens from its bottom-right trigger toward the upper left and reverses on close. Its header contains title, secondary context and close/pin controls; its body has a compact primary action and secondary shortcuts; composer and full-chat link sit below. Workspaces use the same surface language, with a clear header, staged primary action and two-column desktop/single-column mobile layout.

## Evidence workspace

Show four steps: 选择资料 → 分析资料 → 查看能力候选 → 确认更新. Always state: 确认前，你的能力和项目路线不会改变。 Use 证据片段 or 资料分析结果 in user-facing copy. Evidence Library defaults to source name, time, parse status, judgment use, linked capability count and provenance. Upload is primary; capability update is secondary. Source details and diagnosis are distinct views.

## Reduced motion and verification

prefers-reduced-motion: reduce removes looping flows, pulses and large movement while preserving static Route highlights and source→target arrows, colors, borders, icons and all operations. Keyboard focus is visible; dialogs have names and usable closing/focus behavior. Verify desktop and 390×844 with screenshots, and actual directional pulse motion; DOM assertions alone cannot establish visual success.

## Conversation and Project Overview · 2026-10-05

This supersedes the earlier four-step Evidence wizard presentation. Assistant, Practice and capability update share a continuous timeline, composer, real attachment entry, status, retry and structured cards. Formal actions remain explicit controls. Historical analysis cards identify their Run and cannot confirm another Run. Supporting text and evidence use progressive disclosure. Full workspaces remain legible at 390×844, support keyboard and IME, avoid focus stealing and respect reduced motion.

Project goal, current Route and relations/actions live in one centered, default-collapsed Project Overview. Its nested list navigates factual Edges. Planning summary describes Current/Preview changes without drawing another route. Disclosure never changes topology, force, coordinates or camera.

## Unified Conversation Workbench · Acceptance A/B closeout

Practice and capability update use the presentation-only `ConversationWorkbenchShell`: one Header (mode, title, short explanation, context, return/close), Context Rail and Conversation Column. It owns no session or business authority. Desktop workbench fills the available viewport, hides outer overflow and gives every flex/grid ancestor `min-height:0`. Context scrolls independently; Timeline is `flex:1`, `min-height:0`, `overflow-y:auto`, with no vh maximum. Composer Dock is `flex:none` at the column bottom. Dialog itself is not a scroll container. Timeline autoscroll changes only its own scroll offset. Formal Practice submission remains in the Dock and uses the existing explicit response authority.

At 1366×768 and 1440×900, browser zoom must be **100%**. Composer, upload, send and formal submission remain visible without scrolling the page. At 390×844, Context defaults to a folded summary, Timeline fills the remaining space and Composer remains directly accessible. Compact Global Assistant retains its separately scoped 220px timeline and is not rendered in the full Shell.

Guidance, Trace, files, source selection, analysis, Proposal, Result, Confirm, Error and Route Impact use one quiet card language: 14px outer / 12px nested radii, subtle neutral borders, white/soft-neutral surfaces, 12–16px padding, 16px timeline rhythm and restrained 15px titles. One card has one dominant primary action. When the Dock contains a formal action, conversational Send is secondary. Source picker and historical/technical analysis details default folded. Run UUID appears only in technical details. An immutable failed Run shows one failure card, unchanged-state explanation and one Re-analyze action; only running analysis offers Refresh Status.

Use existing motion/react: Shell 240ms fade with at most8px translation, cards180ms with at most4px translation, disclosure180ms opacity. No bounce or ornamental loops. Reduced Motion removes displacement, disclosure animation and spinners while preserving state, focus and all controls.

Project Top Control Band uses one `--project-top-control-band` token for the left course identity, centered collapsed Overview and right Course Route / Course Graph / Project Capability controls. On narrow screens the same band wraps into stacked rows. Overview remains native absolute-positioned disclosure: expansion covers graph downward and never pushes its container, changes structural inputs, restarts force or resets camera. The actual pre-closeout left/right controls started at80px while Overview was148px; alignment therefore moves Overview more than the rough24–36px estimate. Real Preview visual acceptance determines the final spacing.
