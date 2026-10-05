# Conversation Evidence acceptance · 2026-10-05

Status: implementation in progress; no final PASS claimed.

Baseline: existing feature/project-capability-model, d97875847373e406d33e9c85ec6d84e8d7d036d9; clean checkout /Users/fanyuhang/Documents/OpenUniflo/EduFlow. Remote SHA matches. Latest baseline READY Preview: https://edu-flow-fujxv3sk5-july-nanas-projects.vercel.app. Hosted project uyljtdbvlivxniililay has 61 migrations matching the repository.

Security baseline: five no-client-policy INFO tables; existing can_read_course anon/authenticated execution warnings; existing leaked-password-protection warning. No new security findings after the additive migrations.

Review findings: P1 legacy Assignment mastery write conflicts with explicit confirmation; P1 filename-only submission; P1 global Assistant session mixing; P2 bad-card history failure; P2 Evidence explanation lacks read context. These require fixes and independent revalidation.

All 60 success criteria from the goal are pending, including two-account reset, browser flows, failure controls, narrow/reduced motion, full engineering validation and latest Preview runtime. Screenshots and per-criterion evidence will be recorded here after actual checks.

## Current verification checkpoint (not final acceptance)

- Shared timeline/composer owns only interaction. Trace/Answer/File submissions keep existing Attempt/Result authority; files preserve private original bytes, ready source identity and provenance. Capability analysis creates new immutable Runs; Confirm uses explicit Run identity and does not adopt a Route.
- Hosted migrations: `20261005013550_conversation_assignment_authority.sql`, `20261005023013_conversation_submission_actor_boundary.sql` (63 total). No columns removed and legacy entrypoints preserved. The first Fresh Trace exposed 42501 from an invoker reading auth.users; the second migration removes that query, relies on existing user foreign keys plus authenticated service caller, and grants no auth-schema access.
- Full tests: 122 files / 890 tests. TypeScript and lint pass. Local service-role transaction verification passes; actual Supabase API Action/Assignment/Route transaction verification passes 53 checks and removes labelled local fixtures. Client secret boundary and Knowledge relation audits pass.
- Reset baseline: original 2 Routes / 8 Versions / 4 ActionRuns / 15 scoped UKS / 3 sources / 16 total owned diagnoses. Original full rows equal the captured baseline. Scope includes course-bound Global Micro progress. Empty sessions use the course binding hash; mixed-source runs, outside-course confirmed capabilities and unrelated shared progress abort. Storage cleanup preserves pending paths and rejects still-referenced files. Hosted mixed-source rollback probe passes: zero probe rows and all 8 original Versions retained.
- Temporary UI Preview: https://edu-flow-1bnh50i59-july-nanas-projects.vercel.app (READY; final commit deployment remains pending). Independent fourth Reviewer observed desktop and 390×844 Overview: default collapsed, centered, 23 real relations / 52 Actions, no horizontal overflow; list opens the exact real Edge.
- Existing V4 current Step is Micro. Fresh acceptance explicitly changes selected Action via UI Preview/Adopt for Trace/Text/File and records those test versions. Confirm/Impact comparisons use the latest explicitly adopted test version; reset restores original V4. No direct DB Route replacement.
- Important fixed review findings: stale Confirm retry after selection changes (P1); old missing event hint overriding a newer Run (P1); session-not-ready formal actions without restoration (P1); supplement retry stopping at upload (P1); cross-workspace streaming (P2); old Attempt text becoming new attachments (P2); duplicate uploads on parse retry (P2); non-Action exact saved retry after archival (P2).

Final dual-account Practice/Capability/negative/refresh/failure/narrow/reduced-motion acceptance and two resets with real new records remain pending. No overall PASS.
