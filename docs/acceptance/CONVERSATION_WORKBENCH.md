# Acceptance A/B conversation workbench closeout

This records the new closeout separately from historical admin/QQ acceptance. Status: **in progress; Preview and Fresh UX not yet accepted**.

Writable test accounts: Acceptance A (`project-capability-a@eduflow.test`) and Acceptance B (`project-capability-b@eduflow.test`). Old admin/QQ and other users are read-only protected. No Production promotion; no new business migration.

## Phase 0

Real initial branch/remote HEAD104db1c, clean; READY Preview `edu-flow-p4s65ugqp-july-nanas-projects.vercel.app`. A V7 had13 nodes/0 steps; B V7 had12 nodes/14 steps and5 sources/9 diagnoses/4 Runs. Original A/B history archived separately before cleanup. Only exact5 B test-source IDs allowed one-time cleanup; B's unlabelled admission state removed,14 controlled UKS retained across A/B. Prior14 Route Versions unchanged.

A's old node constraints did not form a complete executable Preview, and forcing A's full scope onto B was rejected because B lacks those source capabilities. Existing planner semantics were retained. Formal fixture API Preview→explicit selected Action→Adopt yields A V8 with18 nodes/23 steps, B V8 with14 nodes/17 steps. Both select an immediately eligible existing Practice and retain seven UKS with different capability memberships. Each has zero Evidence/Diagnosis/ActionRun. No direct snapshot SQL.

New manifest: `.acceptance/conversation-workbench/acceptance-ab-baseline.json`; original manifests are untouched. Capture→Plan→Reset→Verify→Reset→Verify passed with identical tables and outsideHash. See `.verify-1.json` and `.verify-2.json`. Reset script: `scripts/acceptance/reset-conversation-evidence.ts`; adoption: `scripts/acceptance/adopt-workbench-baseline.ts`; read-only fixture verification: `scripts/acceptance/verify-workbench-reset.ts`.

Independent Reviewer1 captured26 protected table hashes before/after cleanup, plus protected messages and private objects. These prove old accounts, other users, Global graph, Actions and curriculum unchanged so far. Current Hosted migration history63; original Security Advisor5 INFO/3 WARN; final checks pending.

## UX protocol

Use only A/B with Reset before each fresh flow. Run Course Route→Practice (chat, Trace/Text/real private file, explicit submit)→Capability Update (upload, analyze, Proposal, Confirm)→Route Impact Preview without Adopt. Verify1366×768 and1440×900 at100% browser zoom;390×844 and Reduced Motion. Context and Timeline scroll independently, Composer/upload/send/formal submission stay accessible, no page/dialog/timeline scroll competition. Source/history/technical disclosures start folded. Failed Run appears once with one Re-analyze entry and no Refresh. Ordinary UI hides Run UUID. Overview toggles preserve graph/camera; Current/Preview pulses preserve existing semantics. Screenshot names use acceptance-a/acceptance-b. All66 objective criteria require final itemized evidence before completion.

## First READY Preview finding

67af2b8 Preview revealed a real interaction defect: the transparent full-width Course header intercepted the newly aligned Overview summary. Native click and elementFromPoint confirmed interception. Header blank space now passes pointers through; actual left/right/middle controls retain pointer events. This changes presentation hit-testing only. Overview must pass a fresh native click and stability check on the corrected Preview. No JS click bypass counts as acceptance.

Independent Reviewer2 also found narrow-screen Search/Adjust controls still at176px, colliding with Overview's new172px row. Their absolute overlay row now starts below Overview with8px separation. Graph dimensions/camera remain untouched. Fresh narrow click validation required.

Native open/close on the repaired Preview passed at1366/1440/390: all23 route endpoints, canvas bounds and screen camera presentation stayed identical. Expanded narrow Overview still exposed the underlying toolbar over its body; a native `[open]` CSS rule now hides that toolbar while narrow Overview is expanded and restores it when folded. No React presentation state or graph lifecycle was added. Final visual recheck is pending.
