# EduFlow Architecture Decisions

This directory keeps current contracts, durable design decisions, deployment operations and revisit conditions. Completed implementation plans and round-by-round acceptance records live in optional local archives, not in the current architecture index.

## Current contracts and operations

- [Workflow runtime contract](WORKFLOW_STATEGRAPH_RUNTIME_CONTRACT.md): execution identity, parallel/subgraph/interrupt semantics, policies, State and history boundaries.
- [Workflow V2 design](WORKFLOW_V2_DESIGN.md): Definition, node, State, Compiler and authenticated API contracts. Historical roadmap sections do not override the current runtime contract.
- [Unified Workflow Workspace](WORKFLOW_UNIFIED_WORKSPACE.md): sole V2 editor, variables, node tests and editing/observation boundaries.
- [Hosted runbook](WORKFLOW_HOSTED_RUNBOOK.md): explicit configuration, readiness, controlled release and recovery procedures.
- [Current delivery scope and limitations](../acceptance/DELIVERY_STATUS.md); [current manual acceptance](../acceptance/WORKFLOW_MANUAL_ACCEPTANCE_GUIDE.md).
- [Capability/Route/Action contract](CAPABILITY_ROUTE_ACTION_CONTRACT.md).
- [Conversation Evidence contract](CONVERSATION_EVIDENCE_CONTRACT.md).

## Durable decisions

- [0001 Technology stack](decisions/0001-fourth-round-technology-stack.md).
- [0002 Deferred technology options](decisions/0002-deferred-technology-options.md).
- [0003 Workflow V2 runtime](decisions/0003-workflow-v2-runtime-and-contracts.md).
- [0004 Function execution and isolation](decisions/0004-workflow-p4-local-execution.md).
- [0005 Streaming, Store and history](decisions/0005-workflow-p5-stream-memory-history.md).
- [0006 Hosted deployment](decisions/0006-workflow-p6-hosted.md).
- [Fourth-round architecture decisions](FOURTH_ROUND_ARCHITECTURE.md): retained technology/domain decisions; historical round labels do not make old plans current.

An ADR records status, context, decisions, consequences, alternatives and revisit triggers. Deferred options are not automatic backlog commitments; create executable work when a recorded revisit trigger is actually observed.

Related domain documentation: [Backend](../BACKEND_ARCHITECTURE.md), [Workflow](../WORKFLOW_ARCHITECTURE.md), [Materials](../MATERIAL_SYSTEM.md), [Knowledge](../KNOWLEDGE_ARCHITECTURE_V1.md).
