# Global EduFlow Assistant Architecture

## Product boundary

EduFlow has one learner-facing Assistant runtime. Learning, Explore, Personal Atlas, Course Graph, Material, Micro, Assignment, and full chat provide different explicit `AssistantContext` identities; they do not own different LLM runtimes.

```text
page
  -> AssistantContext identity snapshot
  -> EduFlowAssistant / Full Chat
  -> /api/assistant
  -> AI SDK Core + OpenAI-compatible provider adapter
  -> EduFlow read tools
  -> authenticated Supabase product data
```

The browser states which stable entity page is active. The server authenticates the user, validates the context shape, and re-reads every entity through user-scoped product data. Browser-supplied user IDs, roles, capabilities, entity payloads, or graph payloads are never authority.

## Runtime and provider

AI SDK Core owns generic streaming, reasoning parts, tool-call message protocol, schema validation, finish reasons, provider errors, and the bounded multi-step loop. `@ai-sdk/openai-compatible` is a thin adapter over the configured `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`. The existing `StructuredGenerationClient` remains separate and continues to own JSON generation pipelines.

The compatibility spike in `scripts/spikes/assistant-ai-sdk.ts` must pass against the actually configured DMXAPI/DeepSeek endpoint before a provider/model change is accepted. It verifies text streaming, reasoning streaming, thinking-to-tool-to-final flow, and two sequential tool rounds. Automated tests do not depend on a live model.

The tool loop is limited to four model steps and has total, per-step, and stalled-chunk timeouts. Tool input uses Zod schemas. Tool failures are returned as bounded structured errors so the model can explain failure without crashing the page. The server independently consumes the SDK stream so page navigation or client disconnect cannot prevent a completed response from reaching persistence.

## Product tools

The runtime exposes only read tools in V1A:

- Knowledge search/read/factual neighbors;
- Course search and Course/curriculum context;
- Material/Segment context and deterministic scoped content search;
- Assignment and Micro context;
- authenticated learner Knowledge and Course state;
- one current-context resolver composed from the same tools.

KnowledgeEdges are the only Knowledge relation facts. CurriculumSequence and AssignmentDependency remain explicitly labeled teaching/execution relations. Course progress, Material progress, Assignment state, and Learner Knowledge state remain distinct.

The LLM is not navigation authority. Until the Navigation Engine exists, the Assistant must refuse to manufacture a formal personalized Next Action. It may describe persisted curriculum order or available resources only when labeled non-personalized.

## Sessions, messages, and context snapshots

`assistant_sessions` is owned by `auth.users.id`. `assistant_messages` belongs to a session and stores role, text, timestamp, and a small context identity snapshot. Message-level snapshots are required because one session may move from Explore to Material while historical meaning remains page-specific.

RLS permits only the owning authenticated user to read or write sessions and their messages. The server derives identity from the bearer session and never accepts a browser user ID as authority. The active session pointer in local storage is presentation state only; all conversation content remains database authority. The pointer is recorded as soon as streaming response headers provide the server-created session ID, so navigating during a first response still resumes the same conversation.

The floating Assistant and `/messages` use the same client state, session IDs, endpoint, persistence, tools, model, and policy. Refresh reloads the active session from the server.

## Specialized AI boundary

Course and Material Design mutation providers, Course creation scenarios, and Workflow evaluation/configuration adapters are specialized authoring/evaluation capabilities. They may retain separate provider contracts, capability checks, Preview/Validation/Apply/Undo, and demo isolation. Learn-mode explanation and retrieval must use the Global Assistant runtime.

## Infrastructure principle

Generic infrastructure should use a mature, maintained component or official SDK when it is compatible and materially reduces self-maintained protocol code. EduFlow owns product context, permissions, tools, policy, and learning semantics. Dependencies remain behind thin adapters and must earn their deployment, lockfile, and architectural cost; avoiding a small wheel is not a reason to import a heavy framework.
