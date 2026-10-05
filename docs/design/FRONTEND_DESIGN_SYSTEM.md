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

Guidance, files, source selection, analysis, Proposal, Result, Confirm, Error and Route Impact use one quiet card language: 14px outer / 12px nested radii, subtle neutral borders, white/soft-neutral surfaces, 12–16px padding, 16px timeline rhythm and restrained 15px titles. One card has one dominant primary action. When the Dock contains a formal action, conversational Send is secondary. Source picker and historical/technical analysis details default folded. Run UUID appears only in technical details. An immutable failed Run shows one failure card, unchanged-state explanation and one Re-analyze action; only running analysis offers Refresh Status.

Use existing motion/react: Shell 240ms fade with at most8px translation, cards180ms with at most4px translation, disclosure180ms opacity. No bounce or ornamental loops. Reduced Motion removes displacement, disclosure animation and spinners while preserving state, focus and all controls.

Project Top Control Band uses one `--project-top-control-band` token for the left course identity, centered collapsed Overview and right Course Route / Course Graph / Project Capability controls. On narrow screens the same band wraps into stacked rows. Overview remains native absolute-positioned disclosure: expansion covers graph downward and never pushes its container, changes structural inputs, restarts force or resets camera. The actual pre-closeout left/right controls started at80px while Overview was148px; alignment therefore moves Overview more than the rough24–36px estimate. Real Preview visual acceptance determines the final spacing.

## Practice and graph planning · 2026-10-05

成果实践使用既有 Conversation Workbench：任务场景与真实输入直接进入初始 Timeline，预期成果/验收标准可展开，Context 保留完整任务条件。Composer 始终与讨论分离，明确的「正式提交本次实践」保存本人文字、真实私有附件或两者；Practice Workbench 不承载 Quiz / Trace / 单选 / 多选任务；理解检查属于 Micro Learning。Result 明确区分通过/未达到标准/待审核；AI 实践反馈基于本人正式成果、文件、场景、标准与正式评价，只提供教学建议。再次实践进入新的 Run/Attempt，会话按执行身份隔离，旧成果仍可打开。

项目能力图在 Planning Mode 保持相同事实拓扑、冻结坐标与相机。固定 Header 显示当前版本→草稿/预览、×退出、历史、重新载入；Node 点击只选择并打开 Node Inspector，以明确加入/排除/撤销按钮修改 Draft；Edge 点击只选择并打开当前关系的行动 Inspector。Inspector 展示类型、时长、可用条件和推荐成本，独立滚动，不列全部关系。固定 Bottom Bar 展示草稿修改数或 Preview 的增/减/行动变化；未完成关系提供明确定位按钮。进入、退出、Preview 和 Adopt 都不重新布局或 fit；定位是用户驱动的相机操作。

路线未采用修改受到统一放弃确认保护，包括×、取消、重新载入、历史、课程视图切换、导航与浏览器返回；reload/关闭浏览器使用原生离开提示。Dialog 初始聚焦安全动作、Tab 保留在弹窗、Escape 返回编辑。历史在主从 Dialog 中读取不可变快照；列表和详情独立滚动，点击立即更新详情，默认先显示与当前版本的能力/关系/Action差异。恢复 Footer 固定可达，当前版本不可恢复自身，失效版本提供基于结构重新规划；恢复与 Adopt 都生成新版本。过期 Preview 显示重新计算，正式采用须通过服务端 relevant state 与 Preview 决策指纹验证。

我的课程为零时，空状态占据完整内容宽度，使用一个浏览全部课程入口；隐藏搜索与顶部重复入口。搜索无结果与未开始课程使用不同文案。课程 membership、个人路线历史与正式能力互不替代。

Inspector 和空状态使用短时淡入/轻微位移动画，不移动图或 Composer；Reduced Motion 禁用这些装饰动画，保留所有操作与静态方向表达。窄屏 Header 可换行、Inspector 为局部底部面板，Bottom Bar 保持可达。

## Planning selection and History · 2026-10-06

Selection has its own neutral outline/highlight, separate from blue/green/gray capability state and Current/Preview colors. Draft includes/excludes use +/− badges; Preview added/removed/kept is another overlay. None participates in structural inputs, force, coordinates or camera. Only explicit user Fit/Focus/issue location changes the camera.

Node Inspector displays description, capability state, project role, formal membership, Draft constraints, Preview membership, factual prerequisites/support and explicit Include/Exclude/Undo. Edge Inspector distinguishes “正式行动” and “调整后”, then offers current legal choices; choosing an Action updates Draft only. Bottom Bar owns whole-route Preview and Adopt, separates capability +/−, relation +/−, Action replacement and unresolved issues, and states why adoption is unavailable. “定位下一项” dispatches typed issues to their Node/Edge and repair controls.

Desktop History is list/detail with independent scrolling and a stable Footer. The selected/current row is visible and version detail updates immediately without scrolling to the end. Diff is primary; complete route/constraints/technical UUID details are folded. At 390×844, selecting a version shows a detail page with a back-to-list control; Footer remains reachable. Current restore is disabled. Invalid exact restore offers historical replan into the existing Planner. Selection uses 140ms, Inspector 220ms, History 200ms opacity; reduced motion removes nonessential transition/displacement and keeps all static focus/difference information.
