# Backend and Data Architecture

## Runtime flow

The production and Preview application use one data path:

```text
React Feature
  -> Feature Repository contract
  -> Api*Repository selected by src/app/services/applicationServices.ts
  -> Vercel Function under /api
  -> Supabase PostgreSQL / Auth / private Storage
```

Feature Core and pure Domain code do not import Supabase. The browser owns only the Supabase Auth session and calls application APIs with its bearer token. Table reads and writes remain behind Repository contracts and Vercel Functions. `applicationServices` is the concrete composition root.

## Environments

Local development uses Local Supabase only:

```text
pnpm db:start
pnpm db:reset
pnpm auth:bootstrap-local
pnpm dev
Browser -> Vite local API middleware -> Local Supabase
```

`pnpm dev` is the local equivalent of Vercel Functions and serves both the Vite application and `/api/*`. `pnpm verify:backend:local` creates disposable local Auth users, verifies API and RLS behavior, and removes its test data.

`pnpm auth:bootstrap-local` independently creates or corrects the fixed `local-admin@eduflow.local` and `local-student@eduflow.local` acceptance identities through the Auth Admin API. It also restores their profiles, verifies password login and the existing API authorization paths, and gives Local Admin a small Personal Atlas state using active Agentic AI and Python Engineering KnowledgeNodes. Passwords remain only in ignored `.env.local`; `.env.example` contains placeholders. The command accepts only `http://127.0.0.1:54321` or `http://localhost:54321` and fails before privileged configuration is used when the target is not Local Supabase.

`.env.local` contains the URL, publishable key, and secret key emitted by `supabase start`; it is ignored by Git. `.env.example` contains placeholders only. Local destructive commands always use `--local`. Remote reset is not part of this workflow.

Preview uses the existing Vercel `edu-flow` project and Hosted Supabase `KnowledgeAtlas`:

```text
Vercel Preview -> Vercel Functions -> Hosted Supabase
```

`vercel.json` pins Functions to Vercel `sin1`, matching the Hosted Supabase `ap-southeast-1` region so API/database traffic does not cross continents.

Hosted schema changes use the same committed files under `supabase/migrations`. Reviewed migrations may be applied to Hosted only after `pnpm db:reset` and local verification succeed. Hosted Supabase must never be reset as part of ordinary development.

## Environment boundary

The browser bundle may contain only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server Functions additionally require:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

The server-only embedding boundary additionally requires:

- `EMBEDDING_PROVIDER=dmxapi`
- `EMBEDDING_BASE_URL=https://www.dmxapi.cn/v1`
- `EMBEDDING_API_KEY`
- `EMBEDDING_MODEL=text-embedding-3-small`
- `EMBEDDING_DIMENSIONS=1024`

The server-only Phase 4.2 generation boundary additionally requires:

- `LLM_PROVIDER=deepseek`
- `LLM_BASE_URL=https://api.deepseek.com`
- `LLM_API_KEY`
- `LLM_MODEL`

The browser never receives these values. `/api/knowledge-generation` authorizes an authenticated Global Admin, consumes a completed private `CourseMaterial` artifact, runs bounded structured generation and domain validation, and commits Knowledge, relation provenance, Curriculum, and run status in one database transaction. Completed Phase 4.2 courses use the intermediate `curriculum-generated` status; Assignment generation remains a later phase.

`api/_lib/env.ts` validates these values when the embedding boundary is used; unrelated API routes do not require an embedding credential. The provider identity is DMXAPI, the wire protocol is the OpenAI-compatible Embeddings API, and the underlying model is `text-embedding-3-small`. There is no client-prefixed embedding key, and `VITE_EMBEDDING_API_KEY` is forbidden. `pnpm audit:client-secrets` checks client source and build output for server-secret leakage. Health and error responses never return credentials.

## Phase 4 embedding preflight

The Phase 4 preflight uses a minimal server-side `EmbeddingService` implemented by `OpenAICompatibleEmbeddingService` with native `fetch`. It calls the configured DMXAPI base URL with an OpenAI-compatible request for `text-embedding-3-small`, explicitly sends `dimensions: 1024`, and rejects malformed, non-finite, empty, or wrong-sized results. DMXAPI's published example omits `dimensions` and shows the model's default 1536-dimensional output, so 1024-dimensional compatibility is established by the live verification rather than inferred from protocol compatibility. The preflight verified on 2026-08-13 that DMXAPI returned exactly 1024 finite values when the request explicitly supplied `dimensions: 1024`.

The committed Supabase migration enables `vector` in the `extensions` schema. `pnpm verify:embedding` performs the opt-in live DMXAPI smoke test. Only if that returns exactly 1024 dimensions does `pnpm verify:embedding:local` continue to generate real vectors, store them in a session-local `extensions.vector(1024)` table, verify PostgreSQL dimension enforcement, and run cosine similarity ranking. The temporary table is destroyed with the database session. The same preflight run stored all five real sample vectors and ranked Function Calling, Tool Calling, and 工具调用 above Database Index for the query Agent Function Calling.

No permanent Knowledge embedding table is introduced by this preflight. The existing Phase 4 architecture does not yet freeze revision binding, version coexistence, or replacement semantics for that table; making those decisions here would prematurely change the Knowledge persistence contract.

## API surface

- `GET /api/health`: validates server configuration and a lightweight database query.
- `GET /api/knowledge`: returns the visible Knowledge Graph, Domain governance state, and current profile.
- `GET /api/courses`: reconstructs normalized Course runtimes and signs private Material URLs.
- `GET|PUT /api/progress`: reads and persists current-user Knowledge, Course, Assignment, and Material state.
- `GET|PUT /api/workflows`: reads templates and persists current-user Workflow definitions, editor state, and Run History.
- `POST|PUT /api/materials`: authorizes direct-to-Storage upload and commits trusted Material metadata.
- `PUT /api/domains`: persists Global Domain governance after capability and active-node validation.
- `POST /api/knowledge-generation`: generates and atomically persists User Knowledge and Curriculum from a completed Phase 4.1 parsing job.
- `POST /api/course-mapping`: consumes an owning completed Phase 4.2 Course, resolves provenance coverage, generates stable-ID-bound Assignments and direct dependencies, and atomically persists Phase 4.3 composition data.

The API is intentionally a small mapping layer rather than a second Domain model or a backend framework.

Progress and Workflow API adapters serialize browser writes. A rejected request is retained for the next `flush()` call while the internal queue recovers, so later writes still execute in order. Workflow Run History is bounded to the newest 20 rows per user and Workflow; `PUT /api/workflows` enforces the same cap as the application layer and deletes older persisted rows.

## Relational model

Stable existing string IDs are preserved for Knowledge and curriculum entities. Supabase `auth.users.id` UUID is the user identity. Course-owned IDs are scoped by composite `(course_id, id)` keys.

The database normalizes:

- profiles and capabilities;
- Knowledge nodes, revisions, factual edges, Domains, assignments, candidates, and proposals;
- Courses, curricula, Chapters, Lessons, Coverage, and Sequence;
- Assignments and AssignmentCoverage;
- direct Assignment dependencies, ChapterOutcomes, FinalProjects, and their explicit composition relations;
- Materials, Segments, and MaterialKnowledgeCoverage;
- user Knowledge, Course, Assignment, and Material state;
- Workflow templates, user Workflow definitions/state, and Workflow Runs.

Course runtimes are reconstructed by `/api/courses`; they are not stored as a JSONB blob. JSONB is limited to document-shaped values such as node provenance/metadata, Workflow graph definitions, editor maps, Run snapshots, Material content blocks, and list-valued criteria.

Knowledge relations remain only `prerequisite`, `enables`, and `related`. Curriculum, Assignment, Material, and Domain mappings remain separate relation tables. Assignment completion and Material reading never write Knowledge mastery.

## RLS and authority

All public business tables have RLS enabled.

- Shared Knowledge, Domain, curriculum, Assignment, Material metadata, and Workflow templates use authenticated read. Anonymous access is denied. This keeps the current application private without inventing public catalog semantics.
- User-owned rows require `auth.uid() = user_id` or `owner_user_id` for every operation.
- Private `course-materials` objects under `shared/` are readable by authenticated users through short-lived signed URLs.
- Shared Material upload and Domain mutation require the existing `global-domain-admin` capability. The server verifies capability and the target Course/Lesson/Material before issuing a course-scoped signed upload URL or writing metadata.
- Server secret operations are trusted application operations, but they do not replace RLS for browser access.

Tenant Knowledge rows are not exposed in the current runtime because no tenant membership model exists. This is a minimal safe visibility choice, not a partial Tenant Domain implementation.

## Auth and profile

Supabase Email + Password implements sign-up, sign-in, sign-out, and session restore. `profiles` stores only EduFlow display name, role, and server-managed capabilities; it never stores passwords or tokens. The application uses `auth.users.id`, not email, as stable ownership identity.

If hosted Email Confirmation or Password Reset is enabled later, Supabase Dashboard redirect allowlists must include the actual local callback and the selected Vercel Preview pattern. A Production canonical URL is intentionally not guessed here.

## Storage and Materials

`course-materials` is private and reproducible through migration/config plus `supabase/course-materials`. The browser uploads directly with a short-lived signed upload token; the binary does not pass through a Vercel Function. A trusted Function validates size, MIME type, Course/Lesson identity, object existence, and complete PDF `1..pageCount` Segment metadata before committing a new Material record.

PDF, PPTX, and DOCX are accepted by the storage/metadata boundary. The current reader renders original PDF pages and existing Article/Document content. PPTX/DOCX conversion or native binary rendering is not implemented.

Phase 4.1 parsing runs outside the 30-second Vercel Function boundary as a single-job Python 3.12/uv worker. The API creates and retries material-owned job records; service-role-only RPCs atomically claim an attempt and mark it completed or failed. Operational job rows and the private parser artifact bucket have no authenticated-client access. The worker downloads the existing private source, runs Docling, persists raw JSON before normalization, uploads normalized JSON only after the adapter succeeds, and then completes the job. This is an invocation boundary, not a scheduler: production worker hosting remains replaceable and no queue, polling framework, Docling Serve, or distributed job platform is introduced.

## Demo and seed boundary

Concrete Agentic AI, Python Engineering, Knowledge, Domain, and Workflow template fixtures remain under `src/demo` as deterministic seed/test sources. `scripts/generate-supabase-seed.ts` converts them to normalized `supabase/seed.sql`. They are not imported by production repositories or used as Course/Knowledge runtime authority.

`createDemoApplicationServices` wires Demo adapters explicitly for tests. `DemoWorkflowRuntime`, Demo workflow templates, settings, code presentation, and description selection remain the permitted prototype runtime adapter. Workflow persistence and user Run History are backend-owned even though execution is still simulated.

No automatic migration of old LocalStorage sessions, progress, or Workflow payloads is performed. Compatibility adapters remain for tests/demo use; the API is the new application source of truth.

## Deliberate non-goals

This backend does not run Docling inside Vercel Functions, automatically schedule parser workers, create a Course with AI, extract or resolve Knowledge, run LangGraph/tools, evaluate evidence, infer mastery, stream execution, or provide tenant governance. Course creation reports that the capability belongs to the next round rather than manufacturing Demo data.
