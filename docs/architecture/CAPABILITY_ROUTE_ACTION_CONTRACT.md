# Capability, Route and Action contract

Frozen for the frontend execution unification, 2026-10-04.

## Authorities

The shared Knowledge Graph is the only factual capability graph. Global project planning uses its Global projection; this does not remove visible Tenant/User knowledge from existing curriculum contracts. KnowledgeEdge records facts. Personal Route is the user's formally adopted execution plan for a Course/Project: real Edge membership, one selected Action per executable Edge and deterministic execution order. Project Capability is the Route + Action planner; Course Route executes its adopted result. ActionDefinition describes an alternative on one factual Edge. ActionRun records one actual execution, Evidence records its results, and UserKnowledgeState alone records formal personal capability.

Only prerequisite and enables participate in execution presentation. A hard prerequisite is necessary and may require route membership or block execution. A soft prerequisite is factual but is not a hard gate. Enables supports a target, can carry Actions, and never forces source membership by itself. Related is excluded by default.

## Route projection

orderedNodeIds supplies deterministic knowledge reading/layout order only. Never infer KnowledgeEdges from adjacent IDs. Every Project relationship preserves real identity, endpoints, relation and strength. Current prerequisite relations come from the formal route snapshot/current plan. Enables are factual support edges with both endpoints in selectedNodeIds; they never enter prerequisiteEdges.

Immutable Route Version snapshots store executionSteps containing only stable Edge/Action references, endpoints and explicit order, never copied Action content. Preview contains the complete proposed Edge membership, Action choices and execution order. Changing only an Action is a Route adjustment; explicit Adopt alone creates a new Version. Repeating/retrying an ActionRun does not rewrite Route selection. Historic snapshots without executionSteps remain readable and require explicit planning before new Course Route execution; no read-side automatic choice is persisted. Unavailable adopted Actions remain selected and demand adjustment, never silent replacement.

Course Route reuses the earlier vertical sequential path styling and presents completed/current/next adopted Actions. Its Step-to-Step line represents execution order, is not a KnowledgeEdge and never enters graph data. Course Route and Navigator do not compare alternatives; a secondary Adjust Route entry opens Project Capability. Source and hard-prerequisite execution gates remain intact for selected Actions, including future Steps whose sources have not yet formed.

An explicitly included active, caller-visible project ancestor remains eligible when acquisition prunes it from the personal candidate view, provided factual prerequisite/enables relations still connect it to a Course target. Acquired status is not required for planning an explicit Include; execution still requires the existing capability gates. This does not automatically include ancestors or admit unrelated nodes; Exclude and hard-closure checks still apply. Revalidation never mutates an immutable route version.

Route preview is presentation-only until explicit adoption. Preview cannot create a route version. Current, kept, added and removed overlays do not change structural node/edge identity, coordinates, force lifecycle or camera. Project detail defaults to project supportEdges; extra Global facts require a separately labelled disclosure.

## Execution

One Edge can expose multiple Actions. Supported execution types are micro_learning and practice_task. Each Action binding explicitly references one published Micro Path or one course-owned Assignment. Micro execution never chooses arbitrary content by target. Practice uses the existing Assignment attempt, submission, result, evaluation, review, retry and evidence lifecycle; no second upload-based practice lifecycle is introduced.

An unacquired source makes an Action unavailable with the explanation that the source capability must first be formed. Exploration remains possible. Recommendations sort available first, then ascending weight, then stable Action ID; recommendation is not selection. Changing an in-progress Action requires explicit confirmation. Repetition creates a new Run and preserves history. Runs remain discoverable after route changes.

Completion is not acquisition or mastery. Results enter the existing Evidence/candidate/confirmation pipeline. Micro and Assignment completion preserve progress and Evidence; only explicit Evidence Diagnosis Proposal confirmation changes UKS. ActionRun adds no capability mutation authority.

## Shared detail and navigation

Skill Tree and Personal Route share KnowledgeNodeDetail core. Core Knowledge information is required; chapter, lesson, coverage and material context are optional. Bridge nodes open detail and never switch presentation automatically. Skill Tree retains complete course content. Course Route emphasizes adopted Action Steps and their details. Navigator continues the current selected Step's in-progress Run or starts its selected Action; alternatives and changes live in Project planning.

Assistant context follows the foreground presentation and its selection, including Route node/edge, Project node/edge, Evidence and explicit Assignment/Action context. Hidden selections cannot supply foreground context.

## Evidence

Evidence Library is a long-lived asset library with summary loading and source detail on demand. Diagnosis is an explicit conversational workspace: sources, analysis, run-scoped candidates and explicit confirmation form one continuous timeline. Only proposals from the explicitly selected Diagnosis Run are shown/confirmed together. Before confirmation, formal capability and route stay unchanged.

## Compatibility and acceptance

All environments are test-stage. Applied migrations remain immutable; new migrations may remove superseded semantics without destructive reset. Feature Preview suffices; no Production promotion. Local committed migrations are authoritative. Preserve RLS, evidence lineage, formal route versions and existing execution authority.

Each phase requires relevant automatic tests, independent review, and actual browser validation. Final acceptance follows the new 45 criteria, full tests, typecheck, lint, build, audits, migration/advisor checks, READY Preview and fresh desktop/390×844 screenshots. Both authorized test accounts need distinct states and complete formal Routes, with at least two active executable alternatives on every plannable project Edge and at least three on key Edges. Fixtures extend Actions/resources only and never invent Knowledge facts. Once the current embedding configuration has a real successful call, intermittent external timeouts are a known reliability limitation rather than a blocker for this frontend/Route/Action goal. Judgment standards and retrieval remain unchanged.

## Project visual encoding

Ordinary Project KnowledgeEdges share one quiet solid-line visual. Hard/soft/enables remain factual data and textual detail, not different dash patterns. Dashed branches mean unselected Action candidates. Current Route has a continuous directional source→target pulse overlay; Preview uses a distinct coordinated directional pulse, retains a subdued Current baseline, and distinguishes kept/added/removed facts. Reduced motion replaces loops with static highlight and direction arrows. Default Project Route node rings are removed; temporary hover/selection halo remains. Other Atlas learning/mastery rings retain their existing semantics. Every presentation overlay preserves topology, frozen coordinates, engine and camera lifecycle.

## Stable Project renderer range

Current and Preview overlays require a structural renderer range that outlives candidate pruning. Compute the active visible factual prerequisite/enables ancestor closure of all Course target IDs from structural inputs only, with cycle-safe traversal. Keep this real-node/real-edge range in the force input; user state, route versions, Preview and adoption never alter it. Display the complete structural project context, including inspectable nodes, factual relations, search results and Action alternatives behind personal acquired boundaries. Personal recommendations remain separate and can be shorter. Explicit Include may choose any active visible factual project ancestor. Action GET uses this same structural boundary; expanded reading visibility never grants execution permission. Current/Preview pulses highlight only their adopted/draft choices. Explicit Fit uses visible nodes, while presentation changes never fit automatically.

This is a renderer projection, not another graph or knowledge authority. The complete factual project structure owns stable coordinates while each personal route highlights its selected subset. It avoids a second layout system, fake facts and Preview-triggered relayout. Arbitrary ancestor-depth truncation is not permitted; measure actual Hosted range sizes before addressing performance.

Bridge 的课程上下文 Practice 仍使用既有 CourseAssignment / AssignmentCoverage。其目标可以是沿真实 active、可见 prerequisite / enables 上游关系支撑本课程的 Knowledge；它无需成为 CurriculumCoverage。Course integrity 必须拒绝无关、仅 related、不可见或非 active 目标。Course Skill Tree 和课程目标仍只由 CurriculumCoverage / CourseTargetKnowledge 定义。

## Conversation extension · 2026-10-05

Practice and capability update share ConversationWorkspace UI and existing Assistant persistence. Ordinary chat never becomes Evidence. Explicit Practice submission uses the existing Assignment backend; real attachments use private Evidence sources. Conversation Practice completion does not update capability. See [Conversation and Evidence contract](CONVERSATION_EVIDENCE_CONTRACT.md). Formal Route remains unchanged after capability confirmation; Project Preview and explicit Adopt remain the only adjustment path.

## Practice performance boundary · 2026-10-05

ActionRun selected → in_progress → completed means a formal user submission and its Attempt + PerformanceResult have committed, regardless of passed/failed/pending. A completed Run is never reopened; another practice uses a new Run and numbered Attempt. Idempotent transport retries return the original Attempt. PerformanceResult alone records quality. Failed and pending user work remain eligible Evidence. Assignment submission and teacher review never mutate UKS; Evidence → Diagnosis → Proposal → explicit Confirm owns capability changes. Confirm never adopts a Route. Preview is non-authoritative; explicit Adopt creates immutable history. Material/Micro start and Micro completion no longer write UKS. The former completion-to-learned and Assignment/Micro conjunction-to-mastered shortcuts are removed. Existing capability history is preserved.
