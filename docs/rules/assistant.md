# EduFlow 助手

> 由 AGENTS.md 拆出。修改本领域代码前必须阅读本文件；与 AGENTS.md 冲突时以 AGENTS.md 为准。

## Global EduFlow Assistant

- Learner-facing Assistant/chat surfaces MUST use the one Global Assistant runtime. Pages provide explicit `AssistantContext` identities and MUST NOT introduce page-specific learner LLM runtimes.
- Contextual Assistant and Full Chat share the authenticated session/message model, server execution boundary, tool registry, model adapter, and policy. Each historical message persists only a small identity snapshot; the browser MUST NOT send complete product entities as authoritative context.
- Assistant entity and learner-state access MUST be revalidated server-side through authenticated product data. Browser-supplied user IDs, roles, capabilities, or context payloads are never authority.
- The deterministic Navigation Engine is the only Next Action authority. The Assistant MUST read the server decision through a read-only tool (`getNavigationDecision`) and only restate its `nextAction` and reason; the LLM MUST NOT manufacture, rerank, replace, or override it. A navigation read MAY lazily materialize the existing V1 route. CurriculumSequence, AssignmentDependency, KnowledgeEdge, Course progress, and Learner Knowledge state MUST retain their distinct meanings in Assistant tool output and answers.
- Specialized authoring, mutation, generation, and evaluation providers MAY remain separate, but Learn-mode explanation and retrieval use the Global Assistant runtime.

## Answer cards and protocol safety (2026-11-07)

- The Assistant streams AI SDK UI message parts. An answer is an ordered sequence of text and read-only display-card parts; the model never writes card content. It nominates a card type and existing object IDs through one display tool (`displayCard`), and the server revalidates visibility, existence and the learner's state before building title, duration, progress and status from real data.
- Every answer has at most 3 cards, enforced server-side. An invalid or unavailable nomination is skipped and the answer continues. The prose MUST remain complete without the cards, MUST NOT repeat their numbers, and MUST NOT be used to advertise a Course during small talk or a plain question. Card placement is decided by the model from tool results; there is no intent classifier, keyword table or regex mapping.
- Button actions (start, complete, submit) write a `message_kind = 'action'` record and a server template reply with cards, without calling the model. An evaluation Result writes its own idempotent server-side reply (keyed by Attempt + Result), so it appears even after the learner leaves the practice panel.
- Protocol text is guarded while streaming: a suspicious trailing prefix is held, released when confirmed safe, and a complete marker aborts that generation. The server retries once; failure shows the existing retry state. Protocol text MUST NOT reach the UI or the database.
- Persisted card parts store object references only. The model history receives compact card labels, not card payloads, and `action` rows remain excluded from model history.

## Unified EduFlow Assistant

- The product has one user-visible EduFlow Assistant identity and shell language. Workspace, experience mode, active context, role, and capabilities determine available actions; Feature-specific providers may remain behind adapters.
- Assistant mutation requires both Design Mode and the existing capability checks. Proposal preview, deterministic validation, Apply, and Undo MUST NOT be bypassed by the unified shell.
- Learn and Explore Assistant actions may explain, recommend, focus, or start supported experiences, but MUST NOT expose curriculum, material, publication, or Domain mutation without the corresponding authority and validation path.

## Surfaces (2026-10-30)

- The Home conversation workbench is the full-chat surface; the standalone Assistant Messages page is retired and redirects to Home.
