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
pnpm dev
Browser -> Vite local API middleware -> Local Supabase
```

`pnpm dev` is the local equivalent of Vercel Functions and serves both the Vite application and `/api/*`. `pnpm verify:backend:local` creates disposable local Auth users, verifies API and RLS behavior, and removes its test data.

`.env.local` contains the URL, publishable key, and secret key emitted by `supabase start`; it is ignored by Git. `.env.example` contains placeholders only. Local destructive commands always use `--local`. Remote reset is not part of this workflow.

Preview uses the existing Vercel `edu-flow` project and Hosted Supabase `KnowledgeAtlas`:

```text
Vercel Preview -> Vercel Functions -> Hosted Supabase
```

Hosted schema changes use the same committed files under `supabase/migrations`. Reviewed migrations may be applied to Hosted only after `pnpm db:reset` and local verification succeed. Hosted Supabase must never be reset as part of ordinary development.

## Environment boundary

The browser bundle may contain only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server Functions additionally require:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

There is no client-prefixed secret key. `pnpm audit:client-secrets` checks source and build output for server-secret leakage. Health and error responses never return credentials.

## API surface

- `GET /api/health`: validates server configuration and a lightweight database query.
- `GET /api/knowledge`: returns the visible Knowledge Graph, Domain governance state, and current profile.
- `GET /api/courses`: reconstructs normalized Course runtimes and signs private Material URLs.
- `GET|PUT /api/progress`: reads and persists current-user Knowledge, Course, Assignment, and Material state.
- `GET|PUT /api/workflows`: reads templates and persists current-user Workflow definitions, editor state, and Run History.
- `POST|PUT /api/materials`: authorizes direct-to-Storage upload and commits trusted Material metadata.
- `PUT /api/domains`: persists Global Domain governance after capability and active-node validation.

The API is intentionally a small mapping layer rather than a second Domain model or a backend framework.

## Relational model

Stable existing string IDs are preserved for Knowledge and curriculum entities. Supabase `auth.users.id` UUID is the user identity. Course-owned IDs are scoped by composite `(course_id, id)` keys.

The database normalizes:

- profiles and capabilities;
- Knowledge nodes, revisions, factual edges, Domains, assignments, candidates, and proposals;
- Courses, curricula, Chapters, Lessons, Coverage, and Sequence;
- Assignments and AssignmentCoverage;
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

## Demo and seed boundary

Concrete Agentic AI, Python Engineering, Knowledge, Domain, and Workflow template fixtures remain under `src/demo` as deterministic seed/test sources. `scripts/generate-supabase-seed.ts` converts them to normalized `supabase/seed.sql`. They are not imported by production repositories or used as Course/Knowledge runtime authority.

`createDemoApplicationServices` wires Demo adapters explicitly for tests. `DemoWorkflowRuntime`, Demo workflow templates, settings, code presentation, and description selection remain the permitted prototype runtime adapter. Workflow persistence and user Run History are backend-owned even though execution is still simulated.

No automatic migration of old LocalStorage sessions, progress, or Workflow payloads is performed. Compatibility adapters remain for tests/demo use; the API is the new application source of truth.

## Deliberate non-goals

This backend does not parse uploaded documents, create a Course with AI, extract or resolve Knowledge, run LangGraph/Python/tools, evaluate evidence, infer mastery, stream execution, or provide tenant governance. Course creation reports that the capability belongs to the next round rather than manufacturing Demo data.
