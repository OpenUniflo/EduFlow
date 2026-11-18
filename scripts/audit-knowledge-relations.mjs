import { createClient } from "@supabase/supabase-js";
import { createServer } from "vite";

process.loadEnvFile(".env.local");
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const target = new URL(supabaseUrl);
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "54321") {
  throw new Error("Knowledge relation audit is Local-only and refuses non-Local Supabase targets.");
}

const client = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
async function rows(table) {
  const { data, error } = await client.from(table).select("*");
  if (error) throw error;
  return data ?? [];
}

const [nodeRows, edgeRows, domainRows, assignmentRows] = await Promise.all([
  rows("knowledge_nodes"),
  rows("knowledge_edges"),
  rows("knowledge_domains"),
  rows("domain_assignments")
]);

const globalKnowledgeGraph = {
  nodes: nodeRows.map((node) => ({
    id: node.id,
    title: node.title,
    description: node.description,
    type: node.node_type,
    masteryCriteria: node.mastery_criteria ?? [],
    scope: node.scope,
    ownerId: node.owner_id ?? undefined,
    provenance: node.provenance ?? [],
    currentRevisionId: node.current_revision_id,
    status: node.status,
    supersededBy: node.superseded_by ?? undefined,
    splitFrom: node.split_from ?? undefined,
    mergedFrom: node.merged_from ?? undefined,
    tags: node.tags ?? undefined,
    metadata: node.metadata ?? undefined,
    createdAt: node.created_at,
    updatedAt: node.updated_at
  })),
  revisions: [],
  edges: edgeRows.map((edge) => edge.relation === "prerequisite"
    ? { id: edge.id, source: edge.source_node_id, target: edge.target_node_id, relation: edge.relation, strength: edge.prerequisite_strength, reason: edge.reason }
    : { id: edge.id, source: edge.source_node_id, target: edge.target_node_id, relation: edge.relation, strength: edge.associative_strength, reason: edge.reason })
};
const governance = {
  domains: domainRows.map((domain) => ({
    id: domain.id,
    name: domain.name,
    description: domain.description,
    canonicalColor: domain.canonical_color,
    status: domain.status,
    createdBy: domain.created_by,
    createdAt: domain.created_at,
    updatedBy: domain.updated_by,
    updatedAt: domain.updated_at
  })),
  assignments: assignmentRows.map((assignment) => ({
    nodeId: assignment.node_id,
    domainId: assignment.domain_id,
    source: assignment.source,
    confidence: assignment.confidence ?? undefined,
    pinned: assignment.pinned,
    assignedBy: assignment.assigned_by ?? undefined,
    assignedAt: assignment.assigned_at
  })),
  candidates: [],
  proposals: [],
  revision: 0
};

const vite = await createServer({
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  logLevel: "error"
});

try {
  const { auditDomainRelations, validateKnowledgeRelations } = await vite.ssrLoadModule("/src/features/knowledge/relationAudit.ts");
  const titleById = new Map(globalKnowledgeGraph.nodes.map((node) => [node.id, node.title]));
  const formatNodes = (ids) => ids.length ? ids.map((id) => `- ${id} ${titleById.get(id) ?? "Unknown"}`).join("\n") : "- None";

  const activeNodeIds = new Set(globalKnowledgeGraph.nodes.filter((node) => node.status === "active").map((node) => node.id));
  const assignedDomainIds = new Set(governance.assignments.filter((assignment) => activeNodeIds.has(assignment.nodeId)).map((assignment) => assignment.domainId));
  const auditableDomains = governance.domains
    .filter((domain) => domain.status === "active" && assignedDomainIds.has(domain.id))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const domain of auditableDomains) {
    const audit = auditDomainRelations(globalKnowledgeGraph, governance.assignments, domain.id);
    const label = domain.name;
    console.log(`${label}\n${"-".repeat(label.length)}`);
    console.log(`Active nodes: ${audit.activeNodeCount}`);
    console.log(`Internal edges: ${audit.edgeCount}`);
    console.log(`Connected components: ${audit.componentCount}`);
    console.log(`Largest component: ${audit.largestComponentSize} (${(audit.largestComponentRatio * 100).toFixed(1)}%)`);
    console.log(`Isolated:\n${formatNodes(audit.isolatedNodeIds)}`);
    console.log(`Low-degree:\n${formatNodes(audit.lowDegreeNodeIds)}\n`);
  }

  const issues = validateKnowledgeRelations(globalKnowledgeGraph);
  console.log(`Relation validation: ${issues.length ? "FAILED" : "passed"}`);
  if (issues.length) {
    console.error(issues.map((issue) => `- ${issue}`).join("\n"));
    process.exitCode = 1;
  }
} finally {
  await vite.close();
}
