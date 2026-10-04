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
