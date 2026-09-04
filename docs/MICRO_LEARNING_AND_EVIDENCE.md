# Micro Learning and Evidence

EduFlow's learner loop is persisted and data driven:

`Knowledge -> MicroLearningPath -> MicroUnit -> MicroStep -> Evidence -> UserKnowledgeState`

`MicroLearningPath` is a reusable or course-specific learning experience for one Knowledge. It is not a personal learning plan. Required Units determine path completion; progress stores the current Unit and Step so reopening resumes from the database.

After a Path is complete, “重新复习” starts at the first Step of the first required Unit and advances through the required review sequence in the current page. Review answers use the same deterministic native/H5P result semantics, but the review branch never calls start/complete progress APIs, refreshes learner state, or emits another completion Evidence record. The durable completed Path, timestamps, Evidence, and monotonic Knowledge state therefore remain unchanged; anonymous review remains page-local and disposable.

Native `choice`, `multiple-choice`, `fill-blank`, `categorize`, `ordering`, `trace`, `mini-workflow`, `structure-builder`, `parameter-lab`, and `matrix-tensor` interactions carry their content and deterministic evaluation data in the Step contract. Shared renderers own interaction state, feedback, retry, disabled, focus, and completion behavior; course content does not embed arbitrary renderer-specific HTML. Ordering uses pointer drag with keyboard movement controls; Mini Workflow is a small React Flow projection of a linear expected structure and does not create a second Workflow domain.

`structure-builder`, `parameter-lab`, and `matrix-tensor` explicitly support `explore` and `challenge`. Explore accepts a valid manipulation to teach mechanism without claiming a unique answer. Challenge validates the published target edges, numeric range, or target tensor. Real published Agent content exercises Trace and Structure Builder; real CDS 525 content exercises Categorize, Parameter Lab, and Matrix/Tensor. H5P remains a compatible adapter rather than the default authoring dependency.

H5P is an external `MicroStep` adapter. EduFlow uses the MIT-licensed `h5p-standalone` player because it can load validated, extracted H5P packages from object storage without adding a server-side H5P platform or a new Vercel entrypoint. `h5p_contents` owns stable metadata and `micro-h5p/{contentId}/{revision}/...` owns extracted assets. The public-read bucket is required for relative library assets; it has no learner or authenticated write policy. A controlled service-role importer validates package size, paths, the supported main-library allowlist, executable HTML/SVG patterns, external asset URLs, metadata/version agreement, and an immutable package checksum before publishing metadata.

`EduFlowH5PAdapter` maps xAPI `answered`, `completed`, `passed`, and `failed` statements to `{ completed, success, score, maxScore }`. `/api/micro` then revalidates the Published Path → Unit → Step relationship, exact `contentRef`, published content metadata, result shape, score range, and explicit `completed` or `passed` policy before normal progress writes. Opening content never completes a Step. Duplicate events are harmless because Step completion, progress upserts, and Evidence uniqueness are idempotent.

This boundary is intentionally learning-grade, not an exam anti-cheat system: a trusted browser runtime reports the H5P result, while the server prevents unrelated Step completion and malformed or mismatched payloads. A full H5P server/editor and signed assessment statements are outside the current prototype.

Knowledge state transitions are monotonic: starting learning reaches `learning`, completing a required Learn Path reaches `learned`, starting a related Assignment reaches `practicing`, and the mastery policy may reach `mastered`.

The MVP mastery policy is intentionally conservative. Every required Learn Path must be completed and every explicitly required Assignment must be `accepted`. If no Assignment is explicitly required, path completion remains `learned`. `submitted` is never acceptance or mastery.

Evidence is owned by EduFlow and idempotent by `(user, knowledge, event type, source entity)`. It records `micro_path_completed`, `assignment_accepted`, and `workflow_passed` with source identity, outcome, context, and timestamp. This is intentionally shaped for future xAPI export without making xAPI the canonical internal model.

Golden Agent, Workflow, and Failure Recovery paths are seeded/imported into canonical tables and are always read through `/api/micro`. TypeScript Demo providers remain local fixtures only and are not consulted by the production composition root.
