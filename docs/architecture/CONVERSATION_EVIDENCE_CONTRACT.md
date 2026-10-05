# Conversation and Evidence contract

Frozen 2026-10-05. This extends CAPABILITY_ROUTE_ACTION_CONTRACT without replacing its Route/Action architecture.

## Authority

Conversation is interaction infrastructure, never a business authority. Ordinary user messages and Assistant-generated messages are not Evidence and never enter Diagnosis implicitly. Assistant tools may read and explain owned evidence, but cannot submit Assignments, confirm proposals, write UserKnowledgeState, or adopt Routes.

Practice uses the existing CourseAssignment, ActionRun, immutable numbered Assignment Attempt and versioned PerformanceResult. Only the explicit formal submission control creates a response. Trace retains the deterministic evaluator; Answer and File retain pending/manual review. Auxiliary feedback never grades. Completion and review do not confer capability in the conversation execution path.

A user-uploaded attachment is persisted in the existing private user-evidence bucket and source repository, with its immutable source identity, checksum and owned provenance. Formal submissions reference ready, unarchived sources validated server-side. A filename alone is not a file submission. Result evidence is derived only from persisted user responses and actual evaluator records, never Assistant chat. User explanations enter evidence only through an explicit supplement operation and confirmation.

Capability update follows EvidenceSource → new DiagnosisRun → run-owned Proposal → explicit user Confirm → UserKnowledgeState. Additional sources always create a new Run. Historical Run inputs, units and judgments remain intact. Only completed Run proposals are eligible; confirmation revalidates current run scope, ownership and pending status. Failed analysis/retry does not write capabilities or Routes.

Confirmation refreshes projections and may expose Route opportunities. It never creates a Personal Route Version. Viewing opportunities enters the existing Project Preview; only explicit Adopt writes a Version. Current/Preview directional pulses, graph structure, coordinates, force and camera lifecycle remain unchanged.

## Conversation persistence

Use assistant_sessions, assistant_messages, context_snapshot and schemaVersion=1 structured_content references. Workspace sessions are owned and scoped to Assignment/ActionRun or Evidence context, independently of the global Assistant active session. No practice_messages or capability_messages tables. Session-owned recovery hints contain only IDs and timestamps, merge chronologically with persisted events, and are validated through authoritative owned APIs. They never contain capability state or copies of evidence. Formal actions wait for an owned workspace session; missing/archived references remain unavailable rather than becoming evidence. Business state is restored from authoritative APIs even if an auxiliary timeline write fails. Malformed cards degrade individually to plain text. History is bounded; original evidence is loaded on demand.

## Acceptance reset

Reset is an acceptance fixture script, never a product control. It targets the two explicitly authorized test accounts and the enterprise acceptance course only. Capture a reviewed baseline manifest before mutation. Preserve existing history; remove only new test records beyond that baseline and restore exact scoped UKS/active Route snapshots. Abort on mixed-source Diagnosis, out-of-scope references or conflicting non-test lineage. Shared Knowledge/Action definitions and unrelated users/courses must remain byte-equivalent. Storage cleanup uses the Storage API with exact owned paths and can retry after the DB transaction.

## Baseline conflict and chosen compatibility

At d978758, the legacy Assignment RPC can recompute mastery after acceptance. A frontend-only change would violate the new contract. An additive service-only conversation RPC preserves Attempt/Result/Evidence writes and deterministic rules while excluding automatic capability writes. Legacy Production entrypoints remain callable; later manual review and mastery recomputation must recognize conversation-owned submissions. This requires an additive authority migration and a service-role compatibility fix, rather than restoring UKS after a write (which races concurrent evidence confirmation).

## Phase gates

0: contracts and scoped repeatable reset; 1: shared UI and owned persistence without global Assistant regressions; 2: Trace/Text/real File formal submissions; 3: inline Result→Evidence; 4: upload/supplement/new Run/proposal/explicit Confirm; 5: unchanged Route plus Preview; 6: collapsed centered Overview with factual Edge navigation; 7: independent dual-account desktop/390×844/reduced-motion acceptance. Every gate requires relevant tests, browser evidence and independent review. The existing acceptance V4 selects Micro Actions; Fresh Trace/Text/File execution explicitly previews and adopts existing Practice alternatives through the UI, preserves that history, and restores original V4 afterward. Final 60 criteria remain pending until independently verified.
