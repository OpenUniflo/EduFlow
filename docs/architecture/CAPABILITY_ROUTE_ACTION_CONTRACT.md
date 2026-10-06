# Capability, Route and Action contract

Current V3 contract, 2026-10-06. Supersedes the V2 acquired-only candidate entry, expanded Editing range and Edge-only Action rules.

## Authorities

The shared Knowledge Graph is the only factual capability graph. Global project planning uses its Global projection; this does not remove visible Tenant/User knowledge from existing curriculum contracts. KnowledgeEdge records facts. Project Capability Model is the current candidate capability space over real Knowledge facts, Course targets and formal UKS, independent of selected Route and resources. Personal Route is the user's formally adopted subset: legitimate roots, factual Edge membership and 1..N ordered selected Actions per Node/Edge scope. Course Route executes that adopted result. ActionDefinition describes an alternative on exactly one Node or factual Edge scope. ActionRun records one actual execution, Evidence records its results, and UserKnowledgeState alone records formal personal capability.

Only prerequisite and enables participate in execution presentation. A hard prerequisite is necessary and may require route membership or block execution. A soft prerequisite is factual but is not a hard gate. Enables supports a target, can carry Actions, and never forces source membership by itself. Related is excluded by default.

## Route projection

orderedNodeIds supplies deterministic knowledge reading/layout order only. Never infer KnowledgeEdges from adjacent IDs. Every Project relationship preserves real identity, endpoints, relation and strength. Current prerequisite relations come from the formal route snapshot/current plan. Enables candidates have both endpoints in the model; formal execution uses explicitly selected factual Edges only. They never enter prerequisiteEdges.

Immutable Route Version snapshots store executionSteps containing only stable Node/Edge scope and Action references, factual Edge endpoints and explicit order, never copied Action content. Preview contains the complete proposed Edge membership, Action choices and execution order. Changing only an Action is a Route adjustment; explicit Adopt alone creates a new Version. Repeating/retrying an ActionRun does not rewrite Route selection. Historic snapshots without executionSteps remain readable and require explicit planning before new Course Route execution; no read-side automatic choice is persisted. Unavailable adopted Actions remain selected and demand adjustment, never silent replacement.

Course Route reuses the earlier vertical sequential path styling and presents completed, in-progress, available, blocked and capability-satisfied adopted Actions. Its Step-to-Step line represents stable reading order, is not a KnowledgeEdge and never enters graph data. Course Route and Navigator do not compare alternatives; a secondary Adjust Route entry opens Project Capability. Server execution gates use formal capability plus derived Route execution reachability. Every available frontier Action can start; a recommended Step is presentation only. Completed Steps may repeat without blocking progression.

Include requires the Personal Route to pass through a capability already in the current model; it never admits an ancestor outside that model. Intermediate selected nodes must lie on selected factual execution paths. Legitimate roots need no incoming Edge and can execute Node Actions. Exclude changes route constraints only.

Route preview is presentation-only until explicit adoption. Preview cannot create a route version. Current, kept, added and removed overlays do not change structural node/edge identity, coordinates, force lifecycle or camera. Project detail defaults to project supportEdges; extra Global facts require a separately labelled disclosure.

## Execution

One Edge can expose multiple Actions. Supported execution types are micro_learning and practice_task. Each Action binding explicitly references one published Micro Path or one course-owned Assignment. Micro execution never chooses arbitrary content by target. Practice uses the existing Assignment attempt, submission, result, evaluation, review, retry and evidence lifecycle; no second upload-based practice lifecycle is introduced.

Outside formal Route execution, an unacquired source remains unavailable. Inside an adopted Route, completed Node or Edge groups provide derived execution reachability; this never masquerades as UKS. Exploration remains possible. Candidate Action recommendations sort available first, then ascending weight, then stable Action ID; recommendation is not selection. Adoption that removes an active Scope/Action, invalidates its facts/executor, or inserts an unfinished Action before it on the same scope is blocked until explicitly handled. Independent cross-scope display reordering is allowed. Repetition creates a new Run and preserves history. Runs remain discoverable after route changes.

Completion is not acquisition or mastery. Results enter the existing Evidence/candidate/confirmation pipeline. Micro and Assignment completion preserve progress and Evidence; only explicit Evidence Diagnosis Proposal confirmation changes UKS. ActionRun adds no capability mutation authority.

## Shared detail and navigation

Skill Tree and Personal Route share KnowledgeNodeDetail core. Core Knowledge information is required; chapter, lesson, coverage and material context are optional. Bridge nodes open detail and never switch presentation automatically. Skill Tree retains complete course content. Course Route emphasizes adopted Action Steps and their details. Navigator uses Personal Route as its sole execution authority and continues any legal Run or starts any available selected Action; no legacy navigation or pending Practice queue is rendered; alternatives and changes live in Project planning.

Assistant context follows the foreground presentation and its selection, including Route node/edge, Project node/edge, Evidence and explicit Assignment/Action context. Hidden selections cannot supply foreground context.

## Evidence

Evidence Library is a long-lived asset library with summary loading and source detail on demand. Diagnosis is an explicit conversational workspace: sources, analysis, run-scoped candidates and explicit confirmation form one continuous timeline. Only proposals from the explicitly selected Diagnosis Run are shown/confirmed together. Before confirmation, formal capability and route stay unchanged.

## Compatibility and acceptance

All environments are test-stage. Applied migrations remain immutable; new migrations may remove superseded semantics without destructive reset. Feature Preview suffices; no Production promotion. Local committed migrations are authoritative. Preserve RLS, evidence lineage, formal route versions and existing execution authority.

Each phase requires relevant automatic tests, independent review, and actual browser validation. Final acceptance follows the multi-action criteria, full tests, typecheck, lint, build, audits, migration/advisor checks, READY Preview and fresh desktop/390×844 screenshots. Both authorized test accounts need distinct states and complete formal Routes, with meaningful Micro content and real business Practice on every plannable enterprise Edge. This is fixture content quality, never a catalog cardinality constraint. Fixtures extend Actions/resources only and never invent Knowledge facts. Once the current embedding configuration has a real successful call, intermittent external timeouts are a known reliability limitation rather than a blocker for this frontend/Route/Action goal. Judgment standards and retrieval remain unchanged.

## Project visual encoding

Ordinary Project KnowledgeEdges share one quiet solid-line visual. Hard/soft/enables remain factual data and textual detail, not different dash patterns. Dashed branches mean unselected Action candidates. Current Route has a continuous directional source→target pulse overlay; Preview uses a distinct coordinated directional pulse, retains a subdued Current baseline, and distinguishes kept/added/removed facts. Reduced motion replaces loops with static highlight and direction arrows. Default Project Route node rings are removed; temporary hover/selection halo remains. Other Atlas learning/mastery rings retain their existing semantics. Every presentation overlay preserves topology, frozen coordinates, engine and camera lifecycle.

## Stable Project renderer range

Normal, Editing, Preview, Search, counts, Inspector and SVG overlays use one Project Capability Model. Its union of legitimate target paths supports multiple roots, branches and merges. Reverse traversal stops at formal acquired boundaries; unacquired no-incoming roots are legitimate entries. Hard prerequisite AND is preserved, soft/enables are support and related is excluded. Resource availability is not model membership. Deterministic cycle-safe algorithms must not enumerate all paths or fabricate facts.

Presentation state never changes model topology, coordinates, force lifecycle or camera. Formal UKS confirmation may change the model's structural set and permit structural layout recomputation, but never automatically creates a Personal Route Version. Existing adopted snapshots remain immutable and may refer to capabilities outside today's model; history inspection revalidates their factual references without rewriting them.

Bridge 的课程上下文 Practice 仍使用既有 CourseAssignment / AssignmentCoverage。其目标可以是沿真实 active、可见 prerequisite / enables 上游关系支撑本课程的 Knowledge；它无需成为 CurriculumCoverage。Course integrity 必须拒绝无关、仅 related、不可见或非 active 目标。Course Skill Tree 和课程目标仍只由 CurriculumCoverage / CourseTargetKnowledge 定义。

## Conversation extension · 2026-10-05

Practice and capability update share ConversationWorkspace UI and existing Assistant persistence. Ordinary chat never becomes Evidence. Explicit Practice submission uses the existing Assignment backend; real attachments use private Evidence sources. Conversation Practice completion does not update capability. See [Conversation and Evidence contract](CONVERSATION_EVIDENCE_CONTRACT.md). Formal Route remains unchanged after capability confirmation; Project Preview and explicit Adopt remain the only adjustment path.

## Practice performance boundary · 2026-10-05

ActionRun selected → in_progress → completed means a formal user submission and its Attempt + PerformanceResult have committed, regardless of passed/failed/pending. A completed Run is never reopened; another practice uses a new Run and numbered Attempt. Idempotent transport retries return the original Attempt. PerformanceResult alone records quality. Failed and pending user work remain eligible Evidence. Assignment submission and teacher review never mutate UKS; Evidence → Diagnosis → Proposal → explicit Confirm owns capability changes. Confirm never adopts a Route. Preview is non-authoritative; explicit Adopt creates immutable history. Material/Micro start and Micro completion no longer write UKS. The former completion-to-learned and Assignment/Micro conjunction-to-mastered shortcuts are removed. Existing capability history is preserved.

Restoring a historical execution Route retains its owned snapshot's node scope, factual Edge references, Action choices and execution order. Current visible facts, resources and capability gates are revalidated without shrinking it to the current gap or reranking its decisions. A valid restoration creates a new Version with `restoredFromVersionId`; invalid history is rejected without a write. Historical node-only Routes continue through current planning. Neither path rewrites the historical Version.

## Artifact Practice and deterministic execution selection · 2026-10-06

Execution Route is a selected subset of the factual Knowledge Graph, not every factual relation between its nodes. All in-scope hard prerequisites are selected and cannot be removed. Replanning retains an adopted optional edge only while its actual endpoints and relation remain valid in the new route; newly admitted enables and soft prerequisites remain unselected until explicit user choice. Optional relations never expand the necessary node closure automatically. If hard facts and existing capability do not form an execution entry, return `support_edge_required` with current factual candidate IDs; the user explicitly includes any missing source and selects support. Recommendations remain deterministic and non-authoritative.

Runtime `RouteExecutionIssue.kind` is one of `action_required`, `action_unavailable`, `source_unreachable`, `required_capability_missing`, `hard_edge_required`, `target_unreachable`, `edge_not_in_route`, `support_edge_required`, `node_not_root`, `floating_node`. Optional stable IDs, required node IDs and candidate edge IDs accompany the explanation. UI dispatches by kind, never parses translated reason prose. Blockers locate the relevant Node/Edge Inspector and expose replacement, inclusion, unassignment/undo or explicit support selection; recalculating Preview refreshes the unresolved count before Adopt.

A `practice_task` may resolve only an artifact-producing Answer/Code Assignment. Quiz and Trace belong to Micro Learning understanding checks, never formal Practice Workbench. Archive superseded Actions and disable their bindings while preserving historical IDs, Assignments, results and immutable snapshots. One course-owned Assignment has one canonical Node or factual Edge execution scope; N:M AssignmentCoverage remains intact. Both binding writes and executor edits enforce the boundary, and execution rejects duplicate Assignment steps.

Exact History restore revalidates the historical immutable snapshot, current facts, resources and gates; it never replaces Action choices or shrinks scope. The currently active version cannot restore itself. Invalid/retired Action histories stay readable and expose “基于此版本重新规划”: copy structural intent/constraints and reference choices into the existing Draft, read current options, Preview and explicitly Adopt. This is not exact restore and never mutates the old version or rolls back learning.

## Ordered multi-action execution · 2026-10-06

A Node or factual Edge scope has 0..N candidate ActionDefinitions. A formally selected scope has 1..N distinct selected Actions, ordered locally by the user. Micro and Practice are peers: either alone, any combination, and any local order are valid. There is no per-type minimum or maximum. An ActionDefinition belongs to exactly one Node or factual Edge scope; underlying Resources may be shared after contextual audit.

The existing factual Route planner owns dependency order. It flattens each selected scope's ordered choices into consecutive executionSteps, assigning global order 0..N−1 on the server. A Scope/Action pair appears at most once per Version; duplicate pairs and interleaved scope groups are invalid. selectedEdgeIds is unique membership, separate from Action choices. Browser intent supplies Node-or-Edge scope and Action references only; factual endpoints and global order are reconstructed by the server. No ActionSequence, ActionGraph, execution DAG or persisted frontier entity is introduced. Global order is stable presentation/recommendation order, never cross-scope execution dependency.

Execution progress is derived from immutable executionSteps, owned user/course/Scope/Action completed Runs and formal UKS. Historical completion compatibility is retained. Each scope contributes only its first genuinely unfinished Action to the frontier, subject to reachable source, Action-required capabilities, resources, executor and valid route/factual references. All same-scope earlier Actions must be genuinely completed, including optional satisfied branches. Different scopes can be available and have active Runs simultaneously; one scope still has at most one selected/in-progress Run. Recommendations choose the earliest available required Step by order and never restrict execution.

Formal acquired targets satisfy progression without fabricating completed Runs, Evidence or UKS. Such Steps remain historical references. Acquired Node scopes do not enter the ordinary frontier; satisfied Edge Steps retain optional execution under the same local order and conditions. Repeat applies only to genuinely completed Actions and creates a new Run/Attempt without rolling back progression or changing the Version/UKS.

Reachability is a cycle-safe fixed point seeded by current formal acquired IDs, not the global completed prefix. A selected Edge group is performed only when all selected Actions are completed. A target with selected hard prerequisite incoming Edges is reachable only when all those groups are performed and their factual sources reachable. Without selected hard incoming Edges, one performed selected incoming Edge with reachable source suffices. Enables and optional Edges do not become hard gates. Parallel incoming hard Edge Actions can execute independently from their reachable sources; the target conjunction gates downstream progression, not each incoming Action's start. Route goals satisfied and all Actions actually performed are distinct UI claims. No progress derivation writes state.

Formal committed submission completes a Practice Run even when PerformanceResult is failed or pending. Practice means doing real work: background, context, specific action, execution guidance, expected output and acceptance criteria. Text, private attachments or both are valid artifacts. Answer/Code are executor transports, not the Practice domain definition; unjudgeable artifacts may remain pending. Evidence → Diagnosis → Proposal → explicit Confirm alone changes UKS.

Preview only recommends one deterministic valid Action where no explicit choice exists; recommendations never create a Version. Drafts support multi-select and local up/down ordering. Diff independently reports Node/Edge additions/removals and Action additions/removals/reordering. Immutable single-action histories are groups of length one and need no JSON rewrite. Unavailable histories stay readable and exact restore never substitutes Actions.


Draft details expose explicit Include/Exclude, Edge selection/removal, Node/Edge Action addition/removal and same-scope order edits before Preview. Preview adds server-derived final differences and conflicts; client intent never masquerades as final impact. Personal Route detail shows only formally selected relations/Actions. Curriculum coverage is secondary and its absence is not a warning in Route or Project detail.


## Node / Edge execution scope V3

CapabilityActionScope is Node or Edge, with exactly one stable scope identity. Node actions use the existing Micro or CourseAssignment executor, ActionRun, Result and Evidence lifecycle; no parallel tables or third Action type. Node scopes are permitted only for legitimate route roots, not as shortcuts around factual incoming prerequisites. Node Micro targets the scope Node; Node Practice AssignmentCoverage covers that Node. Governance remains Global admin for templates and existing Course binding authority; RLS is not relaxed.

Node Steps persist `{scope: 'node', nodeId, actionId, order}`. Edge Steps persist `{scope: 'edge', edgeId, sourceNodeId, targetNodeId, actionId, order}`. Missing scope denotes a legacy Edge Step. Snapshots remain reference-only and immutable; existing table/RPC names may stay for compatibility. Scope identity is immutable, XOR Node/Edge scope is validated, and active-run conflicts are enforced within each scope.

All selected Actions in a Node scope must actually complete before that root becomes execution reachable. Formal acquired Nodes instead satisfy progression without fabricated completed Runs. Edge scopes retain reachable-source and hard incoming conjunction semantics. Same-scope local order is mandatory; different scopes are independent of global display order. Reachability is a pure derived fixed point and never writes UKS. Completion is not mastery.

Preview represents selected capabilities, factual Edges, Node Actions, Edge Actions and local order separately. A floating intermediate is invalid; missing resources make execution incomplete without deleting the Project model. Adopt requires valid plan, complete execution and fresh Preview, revalidated server-side. Capability confirmation invalidates stale Preview but does not adopt a Route. Node Actions never draw virtual Edges; pulses follow real selected Edges only.

Adopt serializes with capability confirmation and Micro writes, and checks the API-read visible Knowledge states inside its transaction. Private facts from another user do not affect caller-visible root eligibility. Repeat eligibility is separate from the ordinary frontier and requires a genuinely completed owned Run.
