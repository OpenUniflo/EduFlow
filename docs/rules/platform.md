# 后端、部署与访问控制

> 由 AGENTS.md 拆出。修改本领域代码前必须阅读本文件；与 AGENTS.md 冲突时以 AGENTS.md 为准。

## Backend and Data Runtime

- Committed files under `supabase/migrations` are the authoritative business-schema history. Hosted schema changes MUST use those same locally verified migrations and MUST NOT be recreated manually in Dashboard.
- Local destructive database commands MUST explicitly target Local Supabase. Hosted Supabase MUST NOT be reset by the normal development workflow.
- Local acceptance users MUST never be seeded into Hosted Supabase. Any bootstrap command that creates or updates them MUST reject non-Local Supabase URLs before reading privileged credentials or mutating Auth or database state.
- Browser code may use only the Supabase URL and publishable key. `SUPABASE_SECRET_KEY` MUST remain server-only, MUST NOT use a `VITE_` prefix, and MUST NOT enter client source, build output, logs, health responses, or error responses.
- Feature Core, Domain logic, and repository contracts MUST NOT import Supabase SDK or environment variables. React Features MUST NOT perform direct Supabase table access; `src/app` selects concrete API repositories and may bind Supabase Auth at the application boundary.
- Production and Preview Knowledge, Domain, Course, Material, Learning Progress, and Workflow persistence MUST flow through Repository contracts to `/api` and Supabase. Concrete Demo data is seed/test input, never production runtime authority.
- Shared catalog data uses authenticated read and no browser write. User-owned rows MUST enforce `auth.uid()` ownership through RLS even when trusted server clients also exist.
- `auth.users.id` is the stable user ownership identity. Profiles MUST NOT copy passwords or auth tokens, and email MUST NOT be used as row ownership identity.
- `course-materials` remains private. Browser uploads MUST use a short-lived authorized direct-to-Storage mechanism; large binaries MUST NOT be proxied through Vercel Functions. Trusted metadata writes MUST validate the Course, Lesson, object, type, and PDF Segment completeness.
- Normalized database tables are the persistence source. `CourseRuntimeData` MUST be reconstructed by API mapping and MUST NOT be persisted as one JSONB blob. JSONB is reserved for genuinely document-shaped or structural values.
- Assignment completion remains separate from Knowledge mastery in database writes. Workflow Runs preserve explicit launch-time `courseId`, `assignmentId`, and `workflowTemplateId`; independent Runs MUST NOT infer Course provenance.
- Backend persistence adapters MUST recover serial write sequencing after a rejected request. A failed write remains caller-visible through `flush()`, but MUST NOT permanently prevent later queued writes from executing.
- Workflow Run History is bounded to the newest 20 Runs per `(owner_user_id, workflow_id)` in both application state and backend persistence. The API MUST physically prune obsolete rows without affecting another Workflow or user.
- Workflow V2 Live execution uses the server-side Python LangGraph Worker. Legacy simulation is retired; Live failure MUST NOT fall back to fabricated success. Backend persistence MUST NOT introduce Course or Assignment dependencies into the Workflow Runtime contract. Live success MUST NOT automatically complete an Assignment or grant Knowledge mastery.

## Hosted Deployment Discipline

- A READY frontend deployment does not imply that its target Hosted Supabase schema matches repository migrations.
- Before Hosted Preview acceptance, identify the environment's Supabase project, compare migration history, apply pending migrations incrementally, synchronize only hosted-safe required fixtures, and smoke authenticated APIs before browser validation.
- Shared Hosted databases MUST NOT be reset or migrated automatically by every Preview build.
- Runtime Micro content authority is the database; Demo providers are fixtures/adapters only.
- The current deployment target is Vercel Hobby, with at most 12 Serverless Functions per deployment. This is a deployment constraint, not a Course or other domain-model rule.
- Every top-level deployable file under `api/` consumes Function budget. Tests MUST NOT live where Vercel discovers them as production Function entrypoints; shared libraries, handlers, and tests belong in non-entrypoint locations.
- Before adding a Function, inspect the generated Vercel output and remaining budget. Keep capacity available for the roadmap's #19 Assistant boundary; do not wait for a quota-failed Preview to discover exhaustion.
- Prefer an existing semantically clear multiplexer/handler boundary over another thin wrapper. Do not create unbounded wrapper Functions, but also do not force unrelated domains into one oversized handler merely to reduce the count.
- Rewrites change routing only; they MUST NOT be treated as proof that the underlying Function count decreased. Preview acceptance requires a real Vercel deployment and generated Function-count evidence.

## Anonymous Viewing and Progressive Auth

- Anonymous users MAY browse published/public learning definitions (active Global Knowledge and factual edges, published Courses and their curriculum graph, public Materials, published Micro paths, public Assignments) and learner state that a learner has shared through a share link.
- Public catalog hydration and authenticated learner-state hydration MUST remain separate. Anonymous browsing MUST NOT invent a guest user, placeholder learner state, progress, membership, evidence, submission, or score.
- Guest Micro and Assignment interactions MAY keep ephemeral state in the current browser page and return immediate deterministic feedback, but MUST NOT create durable learner records. Durable progress, My Courses, personal views, messages, settings, admin, and authoring require authentication and preserve an explicit `returnTo` destination.
- Share links: a learner MAY create a revocable link exposing an explicit subset of their own state (progress summary, route; works optional). Anyone with the link, including anonymous viewers, MAY read exactly that subset through a dedicated server endpoint resolving the link token; `anon` RLS on learner tables stays closed. Scores, failed attempts, conversations, drafts and unsubmitted work are never shareable. Links are revocable immediately, expire by default after 30 days and are served `noindex`.
- The Global Assistant is authenticated-only. Anonymous pages render a locked explanation and sign-in action without mounting a conversation or starting an Assistant session; every unauthenticated Assistant API request MUST return `401`.
- Public database access MUST be expressed through narrow `anon` RLS policies and the publishable client. Service-role bypass MUST NOT be used as the public catalog read path, and private governance, drafts, profiles, learner state, and Assistant data remain inaccessible to `anon`.
