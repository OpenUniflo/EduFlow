import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServerSupabase, createUserSupabase, requireCapability } from "./_lib/supabase";
import { ApiError, handleApi, json, methodNotAllowed } from "./_lib/http";
import { dataOrThrow } from "./_lib/query";

type GovernanceState = {
  domains: Array<Record<string, unknown>>;
  assignments: Array<Record<string, unknown>>;
  candidates: Array<Record<string, unknown>>;
  proposals: Array<Record<string, unknown>>;
  revision: number;
};

async function deleteMissing(server: ReturnType<typeof createServerSupabase>, table: string, idColumn: string, existingIds: string[], nextIds: string[]) {
  const keep = new Set(nextIds);
  const removed = existingIds.filter((id) => !keep.has(id));
  if (!removed.length) return;
  const result = await server.from(table).delete().in(idColumn, removed);
  dataOrThrow(result.data, result.error, `${table} delete`);
}

export default handleApi(async (request: VercelRequest, response: VercelResponse) => {
  if (request.method !== "PUT") return methodNotAllowed(response, ["PUT"]);
  const { user } = await createUserSupabase(request);
  await requireCapability(user, "global-domain-admin");
  const server = createServerSupabase();
  const state = request.body as GovernanceState;
  if (!state || !Array.isArray(state.domains) || !Array.isArray(state.assignments) || !Array.isArray(state.candidates) || !Array.isArray(state.proposals) || !Number.isInteger(state.revision)) throw new ApiError(400, "invalid_governance_state", "A complete Domain governance state is required");
  const domainById = new Map(state.domains.map((domain) => [String(domain.id), domain]));
  if (state.assignments.some((assignment) => domainById.get(String(assignment.domainId))?.status !== "active")) throw new ApiError(409, "archived_domain", "Assignments require an active Domain");
  if (state.domains.some((domain) => domain.status === "archived" && state.assignments.some((assignment) => assignment.domainId === domain.id))) throw new ApiError(409, "domain_has_members", "A Domain with active members cannot be archived");
  const targetNodeIds = Array.from(new Set([...state.assignments, ...state.candidates].map((item) => String(item.nodeId)).concat(state.proposals.flatMap((item) => Array.isArray(item.suggestedNodeIds) ? item.suggestedNodeIds.map(String) : []))));
  if (targetNodeIds.length) {
    const nodes = await server.from("knowledge_nodes").select("id, status, scope, owner_id").in("id", targetNodeIds);
    const visible = dataOrThrow(nodes.data as Array<{ id: string; status: string; scope: string; owner_id: string | null }> | null, nodes.error, "Domain mutation node validation");
    if (visible.length !== targetNodeIds.length || visible.some((node) => node.status !== "active" || (node.scope !== "global" && node.owner_id !== user.id))) throw new ApiError(409, "invalid_domain_membership", "Every Domain target must be active and visible to the actor");
  }
  if (state.domains.length) {
    const result = await server.from("knowledge_domains").upsert(state.domains.map((domain) => ({ id: domain.id, name: domain.name, description: domain.description ?? null, canonical_color: domain.canonicalColor, status: domain.status, created_by: domain.createdBy, created_at: domain.createdAt, updated_by: domain.updatedBy, updated_at: domain.updatedAt })));
    dataOrThrow(result.data, result.error, "KnowledgeDomain update");
  }
  const existingAssignments = await server.from("domain_assignments").select("node_id");
  await deleteMissing(server, "domain_assignments", "node_id", dataOrThrow(existingAssignments.data as Array<{ node_id: string }> | null, existingAssignments.error, "DomainAssignment identity query").map((row) => row.node_id), state.assignments.map((item) => String(item.nodeId)));
  if (state.assignments.length) {
    const result = await server.from("domain_assignments").upsert(state.assignments.map((item) => ({ node_id: item.nodeId, domain_id: item.domainId, source: item.source, confidence: item.confidence ?? null, pinned: item.pinned, assigned_by: item.assignedBy ?? null, assigned_at: item.assignedAt })));
    dataOrThrow(result.data, result.error, "DomainAssignment update");
  }
  const existingCandidates = await server.from("domain_assignment_candidates").select("node_id, domain_id");
  const candidateRows = dataOrThrow(existingCandidates.data as Array<{ node_id: string; domain_id: string }> | null, existingCandidates.error, "Domain candidate identity query");
  if (candidateRows.length) {
    const clear = await server.from("domain_assignment_candidates").delete().in("node_id", Array.from(new Set(candidateRows.map((row) => row.node_id))));
    dataOrThrow(clear.data, clear.error, "Domain candidate reset");
  }
  if (state.candidates.length) {
    const result = await server.from("domain_assignment_candidates").insert(state.candidates.map((item) => ({ node_id: item.nodeId, domain_id: item.domainId, score: item.score, semantic_score: item.semanticScore, structural_score: item.structuralScore, algorithm_version: item.algorithmVersion, generated_at: item.generatedAt })));
    dataOrThrow(result.data, result.error, "Domain candidate update");
  }
  const existingProposals = await server.from("domain_proposals").select("id");
  await deleteMissing(server, "domain_proposals", "id", dataOrThrow(existingProposals.data as Array<{ id: string }> | null, existingProposals.error, "Domain proposal identity query").map((row) => row.id), state.proposals.map((item) => String(item.id)));
  if (state.proposals.length) {
    const result = await server.from("domain_proposals").upsert(state.proposals.map((item) => ({ id: item.id, suggested_name: item.suggestedName, suggested_description: item.suggestedDescription ?? null, suggested_color: item.suggestedColor, suggested_node_ids: item.suggestedNodeIds, confidence: item.confidence, status: item.status, algorithm_version: item.algorithmVersion, generated_at: item.generatedAt })));
    dataOrThrow(result.data, result.error, "Domain proposal update");
  }
  const metadata = await server.from("domain_governance_metadata").upsert({ singleton: true, revision: state.revision, updated_at: new Date().toISOString() });
  dataOrThrow(metadata.data, metadata.error, "Domain governance metadata update");
  json(response, 200, { ok: true, revision: state.revision });
});
