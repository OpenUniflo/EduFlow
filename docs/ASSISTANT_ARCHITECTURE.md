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

AI SDK Core owns generic streaming, reasoning parts, tool-call message protocol, schema validation, finish reasons, provider errors, and the bounded multi-step loop. `@ai-sdk/openai-compatible` is a thin adapter over the configured `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`. The existing `StructuredGenerationClient` remains separate and continues to own JSON generation pipelines.

The compatibility spike in `scripts/spikes/assistant-ai-sdk.ts` must pass against the actually configured DMXAPI/DeepSeek endpoint before a provider/model change is accepted. It verifies text streaming, reasoning streaming, thinking-to-tool-to-final flow, and two sequential tool rounds. Automated tests do not depend on a live model.

The tool loop is limited to four model steps and has total, per-step, and stalled-chunk timeouts. Tool input uses Zod schemas. Tool failures are returned as bounded structured errors so the model can explain failure without crashing the page. The server independently consumes the SDK stream so page navigation or client disconnect cannot prevent a completed response from reaching persistence.

## Product tools

The model runtime exposes read tools:

- Knowledge search/read/factual neighbors;
- Course search and Course/curriculum context;
- Material/Segment context and deterministic scoped content search;
- Assignment and Micro context;
- authenticated learner Knowledge and Course state;
- one current-context resolver composed from the same tools.
- product-owned Goal planning, which resolves only visible active Knowledge and returns deterministic prerequisite closure plus Course coverage/gaps.

Goal planning keeps its durable write boundary outside the LLM tool loop. Explicit Goal mode makes one strict structured language-adapter call against the visible active Knowledge catalog. Its business result is `ready`, `needs_clarification`, or `no_match`; provider, parse, invalid-output, and server failures remain `error` and are not persisted as business results. `ready` means the Goal itself is sufficiently explicit and does not imply that a Course matches. `needs_clarification` is permitted only when the Goal lacks planning information. `no_match` means the Goal is understood but the visible active Knowledge catalog cannot support a validated target. The adapter may propose one primary outcome and at most six direct target identities with reasons; the product Goal Planning Service then deterministically revalidates every identity and owns factual prerequisite closure, Course coverage, gaps, and scope-overhead metrics. Invalid structured output fails closed rather than triggering another model vote. Continue Search makes no language-adapter call: it preserves the prior Goal and validated Target set while storing the refinement separately. Replacing the outcome uses a new Goal action and creates an independent planning result. A reply is treated as clarification continuation only when it carries the owning clarification message identity; unrelated session history does not imply continuation.

The same authenticated `/api/assistant` handler accepts `plan-goal`, `refine-goal`, `use-existing-course`, `prepare-course-brief`, and `course-creator-proposal` actions. Course Search, including a structured `no_match` result, and Course Creation Brief results are versioned structured content on ordinary Assistant messages. The server creates a new Assistant session only after a valid planning result exists; a failed first request therefore cannot leave an empty conversation. The client retains the original editable input after failure and clears it only after success. Each follow-up action references the owning persisted planning/Brief message, and the server reloads its snapshot and revalidates current Knowledge/Course visibility. Match levels explain and rank; they do not decide which actions are available. Continue Search appends a new result. Preparing a Brief performs no Course write. Course Creator workflow navigation is owned by Previous, Confirm, Next, Save, and Finish controls. The structured proposal adapter returns `explain | edit`; Explain and uncertain output yield no operations or Apply action, while Edit may produce a bounded product-owned operation list with explicit Target or Optional inclusion roles. Prerequisite remains factual derivation. Edit remains Proposal -> Preview/Diff -> deterministic validation -> explicit confirmation -> Apply. Provider unavailability is reported separately from invalid proposal output. Personal Course persistence and completion stay in the Course API, never the model tool loop.

KnowledgeEdges are the only Knowledge relation facts. CurriculumSequence and AssignmentDependency remain explicitly labeled teaching/execution relations. Course progress, Material progress, Assignment state, and Learner Knowledge state remain distinct.

The LLM is not navigation authority. Until the Navigation Engine exists, the Assistant must refuse to manufacture a formal personalized Next Action. It may describe persisted curriculum order or available resources only when labeled non-personalized.

## Sessions, messages, and context snapshots

`assistant_sessions` is owned by `auth.users.id`. `assistant_messages` belongs to a session and stores role, text, timestamp, `message_kind = utterance | action | goal_clarification`, a small context identity snapshot, and optional versioned `structured_content`. UI action audit prose is retained for the timeline but excluded from semantic model/Goal clarification history, so it cannot impersonate learner language. The dedicated clarification kind makes continuation identity verifiable instead of inferring it from arbitrary Assistant text. The current structured types are `course_search` and `course_creation_brief`; this is a bounded timeline contract, not a general card DSL. Message-level snapshots are required because one session may move from Explore to Material while historical meaning remains page-specific.

RLS permits only the owning authenticated user to read or write sessions and their messages. The server derives identity from the bearer session and never accepts a browser user ID as authority. The active session pointer in local storage is presentation state only; all conversation content remains database authority. The pointer is recorded as soon as streaming response headers provide the server-created session ID, so navigating during a first response still resumes the same conversation.

The floating Assistant and `/messages` use the same client state, session IDs, endpoint, persistence, tools, model, and policy. Refresh reloads text and structured cards from the server. One session may contain multiple unrelated Goals, refinements, Search cards, and Briefs; there is no singleton Goal Plan UI authority.

## Specialized AI boundary

Course and Material Design mutation providers, Course creation scenarios, and Workflow evaluation/configuration adapters are specialized authoring/evaluation capabilities. They may retain separate provider contracts, capability checks, Preview/Validation/Apply/Undo, and demo isolation. Learn-mode explanation and retrieval must use the Global Assistant runtime.

## Infrastructure principle

Generic infrastructure should use a mature, maintained component or official SDK when it is compatible and materially reduces self-maintained protocol code. EduFlow owns product context, permissions, tools, policy, and learning semantics. Dependencies remain behind thin adapters and must earn their deployment, lockfile, and architectural cost; avoiding a small wheel is not a reason to import a heavy framework.
