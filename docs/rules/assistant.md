# EduFlow 助手

> 由 AGENTS.md 拆出。修改本领域代码前必须阅读本文件；与 AGENTS.md 冲突时以 AGENTS.md 为准。

## Global EduFlow Assistant

- Learner-facing Assistant/chat surfaces MUST use the one Global Assistant runtime. Pages provide explicit `AssistantContext` identities and MUST NOT introduce page-specific learner LLM runtimes.
- Contextual Assistant and Full Chat share the authenticated session/message model, server execution boundary, tool registry, model adapter, and policy. Each historical message persists only a small identity snapshot; the browser MUST NOT send complete product entities as authoritative context.
- Assistant entity and learner-state access MUST be revalidated server-side through authenticated product data. Browser-supplied user IDs, roles, capabilities, or context payloads are never authority.
- The LLM is not Navigation authority and MUST NOT manufacture a formal personalized Next Action before the deterministic Navigation Engine exists. CurriculumSequence, AssignmentDependency, KnowledgeEdge, Course progress, and Learner Knowledge state MUST retain their distinct meanings in Assistant tool output and answers.
- Specialized authoring, mutation, generation, and evaluation providers MAY remain separate, but Learn-mode explanation and retrieval use the Global Assistant runtime.

## Unified EduFlow Assistant

- The product has one user-visible EduFlow Assistant identity and shell language. Workspace, experience mode, active context, role, and capabilities determine available actions; Feature-specific providers may remain behind adapters.
- Assistant mutation requires both Design Mode and the existing capability checks. Proposal preview, deterministic validation, Apply, and Undo MUST NOT be bypassed by the unified shell.
- Learn and Explore Assistant actions may explain, recommend, focus, or start supported experiences, but MUST NOT expose curriculum, material, publication, or Domain mutation without the corresponding authority and validation path.

## Surfaces (2026-10-30)

- The Home conversation workbench is the full-chat surface; the standalone Assistant Messages page is retired and redirects to Home.
