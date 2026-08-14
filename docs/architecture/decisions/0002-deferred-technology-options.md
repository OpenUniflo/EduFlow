# ADR-0002: Deferred Technology Options and Revisit Triggers

- Status: Accepted — Deferred options
- Date: 2026-08-13

## Decision rule

The technologies below are options, not commitments. Do not create implementation backlog items merely because a technology may be useful later.

When a revisit trigger is observed:

1. create an **evaluation** Issue describing the measured problem;
2. benchmark the current architecture;
3. run a focused PoC for the candidate technology;
4. compare cost, complexity, operations, migration, and product value;
5. write/update an ADR before implementation.

Do not open an Issue titled `Migrate to X` before evaluation has selected X.

---

## Docling Serve

### Current status
Deferred.

### Why not now
Docling parsing quality is available through the Python library. A separate HTTP service adds deployment, networking, authentication, retry, and version-coordination complexity without improving parsing accuracy.

### Current solution
Docling in a lightweight Python parser worker.

### Revisit triggers
Evaluate Docling Serve when one or more are true:

- multiple backend/services need a shared parser;
- non-Python services need parser access;
- parser scaling must be independent from other workers;
- parsing materially interferes with the main backend process;
- multiple parser workers need one stable HTTP contract;
- shared GPU parsing becomes useful;
- parser release/deployment cadence should be independent.

---

## Docling Jobkit

### Current status
Deferred.

### Why not now
Current product behavior is course-oriented upload, not large distributed corpus conversion. Distributed batch infrastructure would solve a scale problem not yet observed.

### Current solution
Normal parser job + worker lifecycle.

### Revisit triggers
Evaluate Jobkit when:

- institutional onboarding imports hundreds of courses or many thousands of files at once;
- parse jobs remain queued for unacceptable periods;
- horizontal worker orchestration becomes a recurring operational problem;
- bulk reprocessing of the full corpus becomes common.

---

## Neo4j

### Current status
Deferred.

### Why not now
Supabase PostgreSQL already owns product data and is sufficient for the current node/edge/DAG workload. Adding Neo4j creates a second database, identity mapping, synchronization, backup, deployment, authorization, and consistency responsibilities.

### Current solution
PostgreSQL relation tables and graph algorithms in the EduFlow domain/application layer.

### Revisit triggers
Evaluate Neo4j when complex graph traversal becomes a frequent core product workload, for example:

- repeated 3–5+ hop traversal across courses;
- shortest-path / path enumeration becomes a major user-facing feature;
- complex graph-pattern matching dominates application code;
- PostgreSQL recursive queries become demonstrably difficult to maintain or fail measured latency/throughput requirements;
- Personal Knowledge connection analysis evolves into a graph-query-heavy subsystem.

Node count alone is not a trigger.

---

## Neo4j GraphRAG

### Current status
Deferred.

### Why not now
Generic entity/relation extraction and GraphRAG do not directly produce teaching-semantic prerequisite DAGs. It would also introduce Neo4j before a graph database is required.

### Current solution
Structured LLM extraction + EduFlow prerequisite inference and validation.

### Revisit triggers
Evaluate when EduFlow needs a large cross-document or cross-discipline graph-backed retrieval system, such as:

- institution-wide document knowledge graphs;
- research-paper knowledge networks;
- multi-hop graph retrieval for question answering;
- cross-disciplinary concept exploration where vector retrieval alone is insufficient.

---

## Microsoft GraphRAG

### Current status
Deferred.

### Why not now
The current problem is course construction and teaching prerequisites, not corpus-level graph-enhanced RAG. GraphRAG indexing also introduces additional model calls, indexing cost, and operational complexity.

### Current solution
Course-specific extraction pipeline + pgvector candidate retrieval + EduFlow graph logic.

### Revisit triggers
Evaluate when all of the following start to matter:

- very large private course/document corpora;
- cross-corpus question answering is a primary product capability;
- community/global summaries or multi-hop graph retrieval are clearly needed;
- conventional vector retrieval has been measured and shown insufficient.

---

## Separate Vector Database (Qdrant / Milvus / Weaviate / similar)

### Current status
Deferred.

### Why not now
Supabase PostgreSQL already supports pgvector, keeping vectors beside relational Knowledge metadata and avoiding a second persistence system.

### Current solution
pgvector, beginning with simple similarity search and adding HNSW when measured scale/latency warrants it.

### Revisit triggers
Evaluate a dedicated vector database only after pgvector is correctly indexed/tuned and one of these remains true:

- vector workload materially harms primary PostgreSQL OLTP performance;
- required vector throughput/latency cannot be met;
- vector data requires an independently scaled lifecycle and operational plane;
- corpus scale and query patterns are clearly better served by specialized vector infrastructure.

Do not migrate solely because the vector count reaches an arbitrary threshold.

---

## Supabase Vector Buckets

### Current status
Deferred.

### Why not now
Knowledge embeddings benefit from direct relational association and SQL joins. Phase 4 does not need a separate object-storage-style vector plane.

### Current solution
pgvector for Knowledge and alignment vectors.

### Revisit triggers
Evaluate when chunk embeddings grow to a very large corpus, have a lifecycle independent from relational product data, and no longer need frequent SQL joins. KnowledgeNode embeddings may still remain in pgvector even if bulk chunk vectors move elsewhere.

---

## Temporal

### Current status
Deferred.

### Why not now
Phase 4 needs Agent/Workflow execution, which LangGraph can cover behind EduFlow's runtime abstraction. Introducing Temporal simultaneously would create two orchestration systems before a cross-service durable business-workflow requirement exists.

### Current solution
LangGraph for Agent Workflow runtime; product state remains in EduFlow PostgreSQL.

### Revisit triggers
Evaluate Temporal when workflows become long-lived business processes rather than only Agent graphs, such as:

- execution spans hours/days with guaranteed resume requirements;
- flows cross multiple independent services;
- workflows wait on teachers/administrators for long periods;
- onboarding/import pipelines require durable retries across parser, AI, approval, publication, notification, or billing steps;
- non-AI business workflow orchestration becomes a platform capability.

If adopted later, Temporal should orchestrate higher-level business processes and may invoke LangGraph runs rather than replace the EduFlow Workflow domain automatically.

---

## Langfuse

### Current status
Recommended later, not a Phase 4 blocker.

### Why not now
EduFlow must first persist authoritative Run, Step, Tool Call/error/timing, PracticeAttempt, and Acceptance data itself. Observability should not become the business database.

### Current solution
EduFlow PostgreSQL runtime records and logs sufficient for the initial vertical slice.

### Revisit triggers
Add/evaluate Langfuse once real runtime debugging and model operations produce recurring questions such as:

- why did this Agent choose this Tool?;
- which prompt/model version caused regressions?;
- what changed in token/cost/latency/error behavior?;
- how do traces compare across model or prompt releases?;
- runtime debugging is consuming significant engineering time.

Langfuse remains observability/evaluation infrastructure, not the source of truth for EduFlow Run or Acceptance records.

---

## Cross-Encoder relation reranker

### Current status
Deferred. Trigger status: **ACTIVE** after the Phase 4.2 admission experiment; one live run still retrieved 243 of 820 theoretical pairs, used 51 relation batches, and did not materially reduce the approximately one-million-token run cost.

### Why not now
Phase 4.2 has only tens of candidates. In-memory embedding top-K plus provenance union already bounds the pair set, and a Cross-Encoder would add another model, dependency, latency, and deployment surface before candidate precision has been measured as a cost problem.

### Current solution
Embedding retrieval feeds bounded batched LLM pair classification. Embedding similarity never creates a relation.

### Revisit triggers
Evaluate `embedding retrieval -> Cross-Encoder rerank -> classifier` when measured retrieval precision is low enough that unrelated pairs materially dominate classifier tokens, latency, or cost while relation-pair recall remains high.

---

## EduFlow-trained relation classifier

### Current status
Deferred. The current generic LLM remains a confirmed model-quality bottleneck: retrieved pairs still produced low-precision `enables` and `related` classifications in live acceptance. One reviewed Chapter remains insufficient training data.

### Why not now
One chapter Gold dataset is an architecture regression oracle, not sufficiently large or representative training data. Training now would overfit one course and introduce an unsupported model lifecycle.

### Current solution
Structured LLM classification of retrieved unordered pairs into NONE, prerequisite hard/soft, enables, or related, followed by a conservative Phase 4.2 publishing policy and deterministic graph validation. The MVP automatic generator publishes prerequisite only; the domain model still supports all three relation types.

### Revisit triggers
Evaluate a trained classifier after enough human-reviewed, domain-diverse pair labels exist for NONE, prerequisite, enables, and related. It may classify high-confidence pairs and reserve the LLM for low-confidence cases.

---

## Production multi-LLM voting / ensemble

### Current status
Deferred. Multi-run generation is evaluation-only; the Phase 4.2 MVP gate uses one canonical live run plus one independent same-configuration sanity repeat and never votes or selects the better output.

### Why not now
Voting multiplies latency and cost and can conceal excessive generation freedom without fixing retrieval, classification contracts, or validation. Phase 4.2 needs one bounded production pipeline per ingestion.

### Current solution
One production generation run. Acceptance retains and reports every run without selecting or merging them. The existing three-run stability tool remains available for formal post-MVP evaluation.

### Revisit triggers
Evaluate voting only when measured errors are concentrated in a small set of low-confidence, high-cost pairs and the avoided error cost justifies added latency and model spend.

---

## Broader multi-course Knowledge Gold

### Current status
Deferred.

### Why not now
The reviewed Chapter 1 baseline is sufficient for Phase 4.2 regression and MVP usability diagnosis, but not for generalized multi-domain quality claims or classifier training.

### Revisit triggers
Expand reviewed Gold across courses and domains before training an EduFlow-specific classifier or claiming generalized admission/relation quality.

---

## Formal multi-run model stability

### Current status
Post-MVP. The repository retains the three-run stability tool, but three-or-more-run statistical stability is not a Phase 4.2 MVP merge blocker.

### Current solution
MVP acceptance requires two independent complete generations with the same configuration and reports both results. Provider/network failures may be rerun after infrastructure repair; semantically weak completed outputs remain real results.

### Revisit triggers
Run three or more repetitions across multiple reviewed courses when model-quality decisions need variance estimates rather than a usability sanity check.

---

## Knowledge-generation cost optimization

### Current status
Post-MVP. Current live generation remains expensive enough for internal acceptance and demos but is not suitable evidence of optimized production economics.

### Current solution
Keep bounded batches, run-local embedding retrieval, and execution token diagnostics. Do not add a provider hierarchy, voting, or caching platform solely to close Phase 4.2.

### Revisit triggers
Prioritize cost/latency work when real usage volume is known; evaluate retrieval reranking, safe caching, and provider routing from measured traces.

---

## Relation recall and associative-relation enrichment

### Current status
Post-MVP. Missing edges are acceptable for the precision-first Course Skill Tree; automatic `enables` and `related` publication is suppressed while live precision is unreliable.

### Current solution
Publish conservative prerequisite facts only, allow disconnected nodes/islands, and continue reporting per-type relation diagnostics without forcing connectivity or quotas.

### Revisit triggers
Re-enable or enrich relation types only after broader reviewed data demonstrates useful precision, with the trained classifier and Cross-Encoder options above reconsidered as evidence warrants.
