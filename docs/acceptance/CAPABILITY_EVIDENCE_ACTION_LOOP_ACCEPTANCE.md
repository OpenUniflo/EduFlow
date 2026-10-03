# Capability Evidence Action Loop

Status: **IN PROGRESS — no Phase gate has passed.**

## Baseline audit — 2026-10-03

- Initial chat checkout: clean detached `a0fc93ece3f76b441cbfd8bae9e26fe1117262e9`. The requested branch is checked out in `/Users/fanyuhang/Documents/OpenUniflo/EduFlow`, also clean. Fetched GitHub and aligned this isolated checkout (detached) to `origin/feature/project-capability-model`, `9933d984931f282c64f061985ca918e5cae992c7`. Original checkout untouched. Delivery must fast-forward the requested remote branch without overwriting concurrent work.
- Diff from accepted application `840ffbd15c45254164f7621efb8d01ea0c84ab90` contains only acceptance documentation/artifacts (15 files), no application changes.
- Latest feature Preview: https://edu-flow-pw5rilhj8-july-nanas-projects.vercel.app/, deployment `dpl_9m8wYd2weh1jVftF4V97ufFF1THc`, exact SHA `9933d98`, **READY**. Production is a separate deployment and must not be promoted or reconfigured.
- Hosted KnowledgeAtlas `uyljtdbvlivxniililay`: **ACTIVE_HEALTHY**, PostgreSQL `17.6.1.155`, pgvector `0.8.2`. 55 migrations through `20261002061940_personal_course_route_versions_v2`, matching the repository version list/count.
- Live counts: 320 active nodes; 475 active edges; 27 user knowledge states; 14 formal evidence records; 6 routes; 38 immutable route versions. Edge lifecycle column is `lifecycle_status`, not `status`; the first audit query failed and was corrected after schema inspection.
- Formal state constraint: `explore`, `learning`, `learned`, `practicing`, `mastered`. Authenticated/anonymous direct state/evidence writes are revoked. Existing service-only mastery recomputation requires required Micro paths and accepted Assignments; it is not an external-evidence confirmation API.
- Private buckets: `course-materials`, `material-parser-artifacts`. No personal evidence bucket. No persistent Knowledge revision embedding table. No Action model.
- Existing embedding adapter: DMXAPI / `text-embedding-3-small` / 1024 dimensions. Local credential smoke test returned **401**. Vercel configuration lists embedding/LLM variables as **Sensitive**, so an env pull yields empty values and cannot establish Hosted provider health. This is an explicit verification gap, not evidence that Hosted is missing configuration. Verify inside Preview before evidence acceptance; do not silently substitute lexical matching or synthetic embeddings.
- Parser is Docling's existing Python single-job worker, currently coupled to course jobs and private course storage. Its conversion/normalization logic is reusable, but no Hosted worker scheduling is established by that code. Do not claim PDF parsing availability without an executed worker path.
- Assistant runtime provider is already shared, but visual surfaces are page-owned. `CourseGraphPage` explicitly hides it for capability presentation. Preserve page context/design controls while centralizing the logged-in surface.
- Latest Preview error/fatal/warning and 5xx log queries for the preceding 24 hours returned no matching entries. This is a bounded log observation, not browser acceptance. Initial desktop browser opening timed out; browser verification remains pending.
- Clean baseline checks: frozen pnpm installation; **101 files / 710 tests passed**; typecheck, lint, build, knowledge audit, client-secret audit passed. Existing H5P CSS/chunk warnings remain.
- Local Supabase stack is available. Do not reset shared local data; replay/check migrations without destroying unrelated records.

## Decisions, risks and success criteria

Only the implementation lead edits application code. Data/Security and Evidence/AI reviewers are read-only after Phase A; Data/Security and Graph/UX after B; all three after C. A separate fresh reviewer starts last with only URL, login and realistic task. Reviews must preserve failures. Four concurrent slots require sequential reviewer scheduling where necessary.

**Phase A:** user-owned source/units/diagnosis/proposals, private uploads, evidence-first bounded discovery and revision-correct Top-K, explicit server transaction for confirmation, one global Assistant and a non-fullscreen workspace, My Evidence and project impact preview. Success means **all A-GATE-01..20**, including real ≥3 units / ≥2 matches, no pre-confirmation state writes, concurrent/idempotent confirmation, ordinary-user isolation, relevant/unrelated project recompute and unchanged route-version count. No B work until A passes.

**Phase B:** factual edge-owned templates (only micro_learning/practice_task), course resource bindings, deterministic explainable weight, presentation-only alternatives on the stable renderer. Success means **all B-GATE-01..14**, two alternatives on one real edge, different contextual costs, unchanged graph objects/coordinates/force/camera, distinguishable action states and existing laser semantics. No C work until B passes.

**Phase C:** existing Micro integration and minimal execution records, actual practice file upload into the same A pipeline. Success means **all C-GATE-01..16**, result provenance, no automatic target acquisition from completion, explicit confirmation then projection/route recompute without implicit route versions.

Final success additionally requires full regression/security/migration replay, exact commit READY feature Preview, browser/runtime checks and independent fresh cognitive acceptance. None can be replaced by tests with mocked AI or service-role-only permission evidence.

Tradeoffs: explicit user-confirmed external evidence must use the existing state enum and unique state table without weakening the Micro/Assignment mastery policy. Keep candidate sufficiency separate from similarity. Persist embeddings at revision/model boundaries; stale revisions must not match. Source archive preserves provenance. Preview and Production may share Hosted data: only backward-compatible additive migrations and scoped acceptance records are permitted; no destructive resets or Production configuration/deployment changes.

Unresolved operational checks: Hosted provider invocation, executable parser integration, real-browser baseline. These are recorded risks with concrete verification steps; they remain blocking for the corresponding gate, not grounds to claim PASS.
