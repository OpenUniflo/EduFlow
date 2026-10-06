# Project Capability Model / Personal Route V3

Current contract: [Capability, Route and Action](architecture/CAPABILITY_ROUTE_ACTION_CONTRACT.md). V2 design and acceptance records remain historical.

Targets continue to use every active CurriculumCoverage Knowledge ID, as in V2; course_target_knowledge retains its existing destination semantics.

The shared Knowledge Graph owns facts. Project Capability Model is the current union of legitimate candidate paths to Course targets, bounded by formal acquired UKS, including unacquired roots, multiple branches and merges. Personal Route is the explicitly adopted execution subset. Presentation and Action resources do not determine model membership.

Node and factual Edge scopes share Micro/Practice, ActionRun, Result and Evidence. Only actual completion grants route execution reachability; acquired state satisfies without fake Runs. Formal UKS changes only through Evidence → Diagnosis → Proposal → explicit Confirm. An established Route changes only through Preview → Adopt (or explicit revalidated restore).

## Phase 0 baseline

- Initial chat checkout: detached a0fc93e, clean. Target branch fetched at 799af9406dd74e94a26ccba989dc49bc1bf0124d. Existing target checkout retained untouched. Implementation uses codex/project-capability-model-v3 from fetched target.
- pnpm frozen install succeeded; no dependency changes. Baseline: 132 test files, 993 tests PASS.
- Hosted latest migration at baseline: 20261006122937_dependency_driven_route_frontier.sql. Local baseline was 20261005154706 and received the two preceding pending migrations without reset.
- Baseline Feature Preview READY: dpl_2HmBYJEHKxFJm3j4Y123JVErkmM5, SHA 799af94.
- Confirmed defects: acquired-only model entry, Normal/Editing range split, Include expands model and can adopt floating nodes, Edge-only Action scope. Existing independent frontier, Evidence authority and immutable history retained.

## Acceptance conditions

Each phase begins with failing regression tests. Model tests cover unacquired roots, multi-root/branch/merge, unselected candidates, isolated exclusion, UKS boundaries, resources independence, hard AND, optional soft/enables/cycles and permutation determinism. Presentation tests cover identical modes and topology stability. Execution tests cover Node reachability, acquired satisfaction, independent roots, resource gaps, floating nodes and legacy Edge Steps. Forward SQL and API tests cover XOR/immutable scope, RLS, bindings, frontier, repeat, history and UKS immutability. Final Gate requires full tests, typecheck/lint/build/audits, local/rollback SQL, Hosted migration/advisor verification, both read-only reviewers and scenarios A–F on READY Feature Preview matching final HEAD.

## Implementation gates

- Forward migrations: 20261006160207_capability_action_node_scope; 20261006161720_capability_action_visibility_and_freshness. Existing tables, FK lineage and saved snapshots remain intact. Both were applied and verified on Local and Hosted; historical files were not edited.
- Local transactional SQL verifies actual Node Micro and Practice submissions, independent roots, same-scope ordering, completion reachability, explicit Repeat, constraint/binding integrity, private caller visibility, RLS, missing order, stale UKS, immutable history and byte-equivalent UKS/facts. Existing Edge ordered RPC regression also passes; all fixture mutations roll back.
- Current automated gate: 135 files / 1,016 tests PASS; TypeScript, lint, production build, knowledge relation audit and client secret audit PASS.
- Reviewer 1 independently passed the two SQL transactions and inspected actual function privileges/freshness. Reviewer 2 passed 11 files / 146 tests after Node detail, retained catalog, Repeat and reorder fixes. Hosted/final-SHA Gate remains pending.

- Explicit `enterprise-node-action-v5` TEST resources were inserted on Hosted for five existing real roots: five Micro Paths and five business artifact Assignments, ten exact Node-scope Actions. No Knowledge facts, legacy resources or user state were changed. Generator is idempotent and lives only under acceptance tooling.

- Hosted rollback: both scoped executor pipelines, Repeat, local order, freshness and RLS passed actual assertions. Fourteen core tables had identical before/after hashes; fixture residue zero. Security advisors retain exactly the baseline debt. Acquired-root optional-execution wording was corrected following real browser review.
