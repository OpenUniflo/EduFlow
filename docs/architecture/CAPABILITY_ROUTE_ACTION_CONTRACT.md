# Capability, Route and Action contract

Frozen for the frontend execution unification, 2026-10-04.

## Authorities

The shared Knowledge Graph is the only factual capability graph. Global project planning uses its Global projection; this does not remove visible Tenant/User knowledge from existing curriculum contracts. KnowledgeEdge records facts. Personal Route records where the learner intends to go. Action describes how to advance along one factual Edge. ActionRun records the selected execution, Evidence records its results, and UserKnowledgeState alone records formal personal capability.

Only prerequisite and enables participate in execution presentation. A hard prerequisite is necessary and may require route membership or block execution. A soft prerequisite is factual but is not a hard gate. Enables supports a target, can carry Actions, and never forces source membership by itself. Related is excluded by default.

## Route projection

orderedNodeIds supplies deterministic reading/layout order only. Never connect adjacent IDs. Every rendered relationship must preserve the identity, endpoints, relation and strength of a real KnowledgeEdge. Current prerequisite relations come from the formal route snapshot/current plan. Enables are factual support edges with both endpoints in selectedNodeIds; they never enter prerequisiteEdges.

An explicitly included acquired ancestor remains eligible when target acquisition prunes it from the candidate view, provided active factual prerequisite/enables relations still connect it to a Course target. This does not automatically include ancestors or admit unrelated acquired nodes; Exclude and hard-closure checks still apply. Revalidation never mutates an immutable route version.

Route preview is presentation-only until explicit adoption. Preview cannot create a route version. Current, kept, added and removed overlays do not change structural node/edge identity, coordinates, force lifecycle or camera. Project detail defaults to project supportEdges; extra Global facts require a separately labelled disclosure.

## Execution

One Edge can expose multiple Actions. Supported execution types are micro_learning and practice_task. Each Action binding explicitly references one published Micro Path or one course-owned Assignment. Micro execution never chooses arbitrary content by target. Practice uses the existing Assignment attempt, submission, result, evaluation, review, retry and evidence lifecycle; no second upload-based practice lifecycle is introduced.

An unacquired source makes an Action unavailable with the explanation that the source capability must first be formed. Exploration remains possible. Recommendations sort available first, then ascending weight, then stable Action ID; recommendation is not selection. Changing an in-progress Action requires explicit confirmation. Repetition creates a new Run and preserves history. Runs remain discoverable after route changes.

Completion is not acquisition or mastery. Results enter the existing Evidence/candidate/confirmation pipeline. Existing Micro and Assignment evidence authority remains intact; ActionRun adds no capability mutation authority.

## Shared detail and navigation

Skill Tree and Personal Route share KnowledgeNodeDetail core. Core Knowledge information is required; chapter, lesson, coverage and material context are optional. Bridge nodes open detail and never switch presentation automatically. Skill Tree retains complete course content. Personal Route emphasizes outgoing factual route relationships and their Actions. Navigator recommends from those same Actions and Runs, prioritizing active work; it does not create a second Action authority.

Assistant context follows the foreground presentation and its selection, including Route node/edge, Project node/edge, Evidence and explicit Assignment/Action context. Hidden selections cannot supply foreground context.

## Evidence

Evidence Library is a long-lived asset library with summary loading and source detail on demand. Diagnosis is an explicit workspace: choose sources, analyze, review candidates, confirm. Only proposals from the explicitly selected Diagnosis Run are shown/confirmed together. Before confirmation, formal capability and route stay unchanged.

## Compatibility and acceptance

Hosted Preview shares Production Supabase. Changes must be additive and compatible, with no destructive migrations, table/column removal or Production promotion. Local committed migrations are authoritative. Preserve RLS, evidence lineage, formal route versions and existing execution authority.

Each phase requires relevant automatic tests, independent review, and actual browser validation. Final acceptance includes all 33 user criteria, full tests, typecheck, lint, build, audits, migration/advisor checks, READY Preview and fresh desktop/narrow screenshots. A missing check is not a PASS.
