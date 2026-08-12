import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createUserSupabase, ensureProfile } from "./_lib/supabase";
import { handleApi, json, methodNotAllowed } from "./_lib/http";
import { dataOrThrow } from "./_lib/query";

type KnowledgeNodeRow = {
  id: string; title: string; description: string; node_type: string; mastery_criteria: string[]; scope: string;
  owner_id: string | null; provenance: unknown[]; current_revision_id: string; status: string;
  superseded_by: string[] | null; split_from: string | null; merged_from: string[] | null;
  created_at: string; updated_at: string; tags: string[] | null; metadata: Record<string, unknown> | null;
};
type RevisionRow = { id: string; node_id: string; version: number; title: string; description: string; node_type: string; mastery_criteria: string[]; created_by: string | null; created_at: string; previous_revision_id: string | null; change_reason: string | null };
type EdgeRow = { id: string; source_node_id: string; target_node_id: string; relation: string; reason: string; prerequisite_strength: string | null; associative_strength: number | null };
type DomainRow = { id: string; name: string; description: string | null; canonical_color: string; status: string; created_by: string; created_at: string; updated_by: string; updated_at: string };
type AssignmentRow = { node_id: string; domain_id: string; source: string; confidence: number | null; pinned: boolean; assigned_by: string | null; assigned_at: string };
type CandidateRow = { node_id: string; domain_id: string; score: number; semantic_score: number; structural_score: number; algorithm_version: string; generated_at: string };
type ProposalRow = { id: string; suggested_name: string; suggested_description: string | null; suggested_color: string; suggested_node_ids: string[]; confidence: number; status: string; algorithm_version: string; generated_at: string };

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const { client, user } = await createUserSupabase(request);
  await ensureProfile(user);
  const [nodesResult, revisionsResult, edgesResult, domainsResult, assignmentsResult, candidatesResult, proposalsResult, metadataResult, profileResult] = await Promise.all([
    client.from("knowledge_nodes").select("*").order("id"),
    client.from("knowledge_node_revisions").select("*").order("node_id").order("version"),
    client.from("knowledge_edges").select("*").order("id"),
    client.from("knowledge_domains").select("*").order("id"),
    client.from("domain_assignments").select("*").order("node_id"),
    client.from("domain_assignment_candidates").select("*").order("node_id"),
    client.from("domain_proposals").select("*").order("id"),
    client.from("domain_governance_metadata").select("revision").eq("singleton", true).maybeSingle(),
    client.from("profiles").select("display_name, role, capabilities").eq("id", user.id).single()
  ]);
  const nodes = dataOrThrow(nodesResult.data as KnowledgeNodeRow[] | null, nodesResult.error, "KnowledgeNode query").map((row) => ({
    id: row.id, title: row.title, description: row.description, type: row.node_type, masteryCriteria: row.mastery_criteria,
    scope: row.scope, ownerId: row.owner_id ?? undefined, provenance: row.provenance, currentRevisionId: row.current_revision_id,
    status: row.status, supersededBy: row.superseded_by ?? undefined, splitFrom: row.split_from ?? undefined,
    mergedFrom: row.merged_from ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at,
    tags: row.tags ?? undefined, metadata: row.metadata ?? undefined
  }));
  const revisions = dataOrThrow(revisionsResult.data as RevisionRow[] | null, revisionsResult.error, "Knowledge revision query").map((row) => ({
    id: row.id, nodeId: row.node_id, version: row.version, title: row.title, description: row.description,
    type: row.node_type, masteryCriteria: row.mastery_criteria, createdBy: row.created_by ?? undefined,
    createdAt: row.created_at, previousRevisionId: row.previous_revision_id ?? undefined, changeReason: row.change_reason ?? undefined
  }));
  const edges = dataOrThrow(edgesResult.data as EdgeRow[] | null, edgesResult.error, "KnowledgeEdge query").map((row) => ({
    id: row.id, source: row.source_node_id, target: row.target_node_id, relation: row.relation, reason: row.reason,
    strength: row.relation === "prerequisite" ? row.prerequisite_strength : row.associative_strength
  }));
  const domains = dataOrThrow(domainsResult.data as DomainRow[] | null, domainsResult.error, "KnowledgeDomain query").map((row) => ({
    id: row.id, name: row.name, description: row.description ?? undefined, canonicalColor: row.canonical_color, status: row.status,
    createdBy: row.created_by, createdAt: row.created_at, updatedBy: row.updated_by, updatedAt: row.updated_at
  }));
  const assignments = dataOrThrow(assignmentsResult.data as AssignmentRow[] | null, assignmentsResult.error, "DomainAssignment query").map((row) => ({
    nodeId: row.node_id, domainId: row.domain_id, source: row.source, confidence: row.confidence ?? undefined,
    pinned: row.pinned, assignedBy: row.assigned_by ?? undefined, assignedAt: row.assigned_at
  }));
  const candidates = dataOrThrow(candidatesResult.data as CandidateRow[] | null, candidatesResult.error, "Domain candidate query").map((row) => ({ nodeId: row.node_id, domainId: row.domain_id, score: row.score, semanticScore: row.semantic_score, structuralScore: row.structural_score, algorithmVersion: row.algorithm_version, generatedAt: row.generated_at }));
  const proposals = dataOrThrow(proposalsResult.data as ProposalRow[] | null, proposalsResult.error, "Domain proposal query").map((row) => ({ id: row.id, suggestedName: row.suggested_name, suggestedDescription: row.suggested_description ?? undefined, suggestedColor: row.suggested_color, suggestedNodeIds: row.suggested_node_ids, confidence: row.confidence, status: row.status, algorithmVersion: row.algorithm_version, generatedAt: row.generated_at }));
  const metadata = dataOrThrow(metadataResult.data as { revision: number } | null, metadataResult.error, "Domain governance metadata query");
  const profile = dataOrThrow(profileResult.data as { display_name: string; role: string; capabilities: string[] } | null, profileResult.error, "Profile query");
  json(response, 200, { graph: { nodes, revisions, edges }, governance: { domains, assignments, candidates, proposals, revision: metadata?.revision ?? 0 }, profile: { displayName: profile.display_name, role: profile.role, capabilities: profile.capabilities } });
});
