# Global EduFlow Assistant Architecture

## Product boundary

EduFlow has one learner-facing Assistant runtime. Learning, Explore, Personal Atlas, Course Graph, Material, Micro, Assignment, and full chat provide different explicit `AssistantContext` identities; they do not own different LLM runtimes.

```text
page
  -> AssistantContext identity snapshot
  -> EduFlowAssistant / Full Chat
  -> /api/assistant
  -> AI SDK Core + OpenAI-compatible provider adapter
  -> EduFlow read tools and confirmed structured actions
  -> authenticated Supabase product data
```

The browser states which stable entity page is active. The server authenticates the user, validates the context shape, and re-reads every entity through user-scoped product data. Browser-supplied user IDs, roles, capabilities, entity payloads, or graph payloads are never authority.

## Runtime and provider

AI SDK Core owns generic streaming, reasoning parts, tool-call message protocol, schema validation, finish reasons, provider errors, and the bounded multi-step loop. `@ai-sdk/openai-compatible` is a thin adapter over the configured `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`; its provider name is product-neutral and thinking is explicitly disabled for the Assistant tool loop. The existing `StructuredGenerationClient` remains separate and continues to own JSON generation pipelines.

The compatibility spike in `scripts/spikes/assistant-ai-sdk.ts` must pass against the actually configured DeepSeek endpoint before a provider/model change is accepted. It verifies text streaming, reasoning streaming, tool-to-final flow, two sequential tool rounds, and a no-tools final answer that receives assistant tool-call and tool-result messages. Automated tests do not depend on a live model.

The Assistant uses one bounded answer loop of at most six model steps. The same call owns product reads, the learner-facing prose and the read-only display cards; the model is not asked to write the answer twice. The loop has total, per-step and stalled-chunk timeouts inside the existing 120s `api/assistant.ts` Vercel `maxDuration`. The server converts the result with `toUIMessageStream` and `pipeUIMessageStreamToResponse`, and the browser consumes it with `@ai-sdk/react` `useChat`; the message structure is the SDK's `message.parts` (text and tool parts), never a product-invented stream format. The server consumes a tee of the UI stream independently, so navigation or a client disconnect cannot prevent a completed answer from reaching persistence.

The single-loop shape was chosen after a real-model experiment in `scripts/spikes/stage3-card-interleave.ts`. A (a bounded research loop followed by a display-tool-only final call) and B (one unified loop with research + display tools) each ran 10 times on a multi-tool question. Both had a 0/10 protocol-leak rate. A used 60 underlying requests and often placed its first card before any prose (4/10); B used 47 requests and placed every card after introductory text (10/10). B is therefore the production shape.

Protocol text is guarded while streaming, not only after the fact. A short trailing prefix that could still become a marker is held back, everything before it is released immediately, and a complete DSML, `tool_use`/`tool_call`, `invoke` or `parameter` structure aborts the generation before the marker reaches the client. The browser retries once automatically; a second failure shows the existing retry state. A fenced code example is allowed. `persistedParts` validates the final parts once more before writing, so protocol text cannot enter the database. The forward migration `20261107120000_assistant_timeline_parts.sql` plus `20261107130000_mark_tool_tag_protocol_leak.sql` classify and hide any older malformed row without rewriting its content.

## Product tools

The model runtime exposes read tools and one display tool:

- Knowledge search/read/factual neighbors;
- Course search and Course/curriculum context;
- Material/Segment context and deterministic scoped content search;
- Assignment and Micro context;
- authenticated learner Knowledge and Course state;
- one current-context resolver composed from the same tools;
- the deterministic Navigation Engine's current Next Action and reason for one server-validated published Course (`getNavigationDecision`); a navigation read may lazily materialize the existing V1 route;
- product-owned Goal planning, which resolves only visible active Knowledge and returns deterministic prerequisite closure plus Course coverage/gaps;
- `displayCard`, which only nominates a card type and existing object IDs (route, micro, practice, evaluation, course chapter, course match, knowledge, progress, material). The server revalidates course visibility, object existence and learner state, then builds the display data. It returns compact `{shown, cardType}` to the model through `toModelOutput`; full card data exists only in the UI part. At most three accepted nominations per message; invalid ones are skipped.

Goal planning keeps its durable write boundary outside the LLM tool loop. The Assistant `planLearningGoal` tool and the explicit `plan-goal` action share one resolution path (`resolveGoalPlan`: `resolveGoalLanguage` then product `planLearningGoal`), so a Goal without model-supplied candidate IDs cannot collapse to a false `no_match`. Goal results persisted by the product in conversation history are authoritative data: the Assistant must not deny, contradict, or apologize for them unless a newer tool result supersedes them. Explicit Goal mode makes one strict structured language-adapter call against the visible active Knowledge catalog. Its business result is `ready`, `needs_clarification`, or `no_match`; provider, parse, invalid-output, and server failures remain `error` and are not persisted as business results. `ready` means the Goal itself is sufficiently explicit and does not imply that a Course matches. `needs_clarification` is permitted only when the Goal lacks planning information. `no_match` means the Goal is understood but the visible active Knowledge catalog cannot support a validated target. The adapter may propose one primary outcome and at most six direct target identities with reasons; the product Goal Planning Service then deterministically revalidates every identity and owns factual prerequisite closure, Course coverage, gaps, and scope-overhead metrics. Invalid structured output fails closed rather than triggering another model vote. Continue Search makes no language-adapter call: it preserves the prior Goal and validated Target set while storing the refinement separately. Replacing the outcome uses a new Goal action and creates an independent planning result. A reply is treated as clarification continuation only when it carries the owning clarification message identity; unrelated session history does not imply continuation.

The same authenticated `/api/assistant` handler accepts `plan-goal`, `refine-goal`, `use-existing-course`, `prepare-course-brief`, `course-creator-proposal` and `record-action` actions. Course Search, including a structured `no_match` result, and Course Creation Brief results are versioned references on ordinary Assistant messages; new planning displays them as answer cards, while existing rows keep their legacy `structured_content` shape. The server creates a new Assistant session only after a valid planning result exists; a failed first request therefore cannot leave an empty conversation. The client retains the original editable input after failure and clears it only after success. Each follow-up action references the owning persisted planning/Brief message, and the server reloads its snapshot and revalidates current Knowledge/Course visibility. Match levels explain and rank; they do not decide which actions are available. Continue Search appends a new result. Preparing a Brief performs no Course write. Course Creator workflow navigation is owned by Previous, Confirm, Next, Save, and Finish controls. The structured proposal adapter returns `explain | edit`; Explain and uncertain output yield no operations or Apply action, while Edit may produce a bounded product-owned operation list with explicit Target or Optional inclusion roles. Prerequisite remains factual derivation. Edit remains Proposal -> Preview/Diff -> deterministic validation -> explicit confirmation -> Apply. Provider unavailability is reported separately from invalid proposal output. Personal Course persistence and completion stay in the Course API, never the model tool loop.

KnowledgeEdges are the only Knowledge relation facts. CurriculumSequence and AssignmentDependency remain explicitly labeled teaching/execution relations. Course progress, Material progress, Assignment state, and Learner Knowledge state remain distinct.

The Navigation Engine is the only Next Action authority. The Assistant reads it through the read-only `getNavigationDecision` tool and may only restate the returned `nextAction` and reason; the LLM must not manufacture, rerank, replace, or override a personalized Next Action. Without Course context it must say so and ask which Course, or offer readable Courses. It may describe persisted curriculum order or available resources only when labeled non-personalized.

## Sessions, messages, and context snapshots

`assistant_sessions` is owned by `auth.users.id`. `assistant_messages` belongs to a session and stores role, text, timestamp, `message_kind = utterance | action | goal_clarification`, a small context identity snapshot, ordered `parts` (AI SDK UI message parts), optional versioned `structured_content` for legacy cards, an optional `invalid_reason`, and a server-owned `dedupe_key` for idempotent template replies. A malformed assistant row is marked `protocol_leak` by forward migration without rewriting its content; every model-history read and timeline response filters or hides it. The list/detail API returns the fixed text "这条回复格式异常，已隐藏" and never the original protocol text. UI action audit prose is retained for the timeline but excluded from semantic model/Goal clarification history, so it cannot impersonate learner language. The dedicated clarification kind makes continuation identity verifiable instead of inferring it from arbitrary Assistant text. The legacy structured types `course_search` and `course_creation_brief` remain readable and are synthesized into the same timeline; every new card is a `tool-displayCard` part. A card part stores only the object reference (`cardType` + IDs). On the live response the server supplies display data; after refresh the client re-reads the referenced course, Micro path, practice status or evaluation Result from current product data. Display numbers are never persisted, so a card never shows stale progress. Message-level snapshots are required because one session may move from Explore to Material while historical meaning remains page-specific.

RLS permits only the owning authenticated user to read or write sessions and their messages. The server derives identity from the bearer session and never accepts a browser user ID as authority. The active session pointer in local storage is presentation state only; all conversation content remains database authority. The pointer is recorded as soon as streaming response headers provide the server-created session ID, so navigating during a first response still resumes the same conversation.

The floating Assistant and `/messages` use the same client state, session IDs, endpoint, persistence, tools, model, policy and one timeline renderer. Refresh reloads the ordered text and card parts from the server; order is preserved because the parts array is persisted. One session may contain multiple unrelated Goals, refinements, Search cards, and Briefs; there is no singleton Goal Plan UI authority.

Button actions (`micro-completed`, `practice-opened`, `practice-submitted`) call the same authenticated `/api/assistant` handler with `action: record-action`. The server validates the thread and object ownership, then writes a template reply with `message_kind = 'action'` and a `dedupe_key`; no model is called. An evaluation Result is written by `recordEvaluationTimeline` from the evaluation service itself, keyed by `Attempt + Result`, so leaving the practice panel cannot lose it and retries cannot duplicate it. The Attempt remembers its conversation in `learning_attempts.assistant_session_id`, which the server revalidates before writing.

## Specialized AI boundary

Course and Material Design mutation providers, Course creation scenarios, and Workflow evaluation/configuration adapters are specialized authoring/evaluation capabilities. They may retain separate provider contracts, capability checks, Preview/Validation/Apply/Undo, and demo isolation. Learn-mode explanation and retrieval must use the Global Assistant runtime.

## Infrastructure principle

Generic infrastructure should use a mature, maintained component or official SDK when it is compatible and materially reduces self-maintained protocol code. EduFlow owns product context, permissions, tools, policy, and learning semantics. Dependencies remain behind thin adapters and must earn their deployment, lockfile, and architectural cost; avoiding a small wheel is not a reason to import a heavy framework.

## Capability evidence workspace (Phase A implementation)

`App` owns the single authenticated `GlobalAssistantSurface`. Existing `EduFlowAssistant` page adapters register context/design children, preserving those controls without creating another surface. Unregistered pages receive a route-based context. Project Capability presentation does not hide the Assistant. `AssistantRuntimeProvider` owns one `useChat` state and the shared timeline renderer; the floating surface and Home render the same ordered parts.

The explicit **更新我的能力** UI action opens the app-owned, centered non-fullscreen `EvidenceWorkspaceProvider` dialog. This is a tested UI action, not a chat regex or a new assistant/tool runtime. My Evidence is a Learning Space view. Project impact preview invokes the existing pure project projection using candidate inputs; it never hydrates or writes official state. Confirmed transactions refresh the existing application learner repositories.

Operational acceptance remains gated separately: see `acceptance/CAPABILITY_EVIDENCE_ACTION_LOOP_ACCEPTANCE.md`.


Practice Action submission may open that same `EvidenceWorkspaceProvider` with a source ID and course preview context. The workspace resolves the original owner-visible source, filters its prior diagnostics and reuses the same diagnosis/confirmation controls. This is an explicit UI entry, not another assistant instance or agent runtime.
