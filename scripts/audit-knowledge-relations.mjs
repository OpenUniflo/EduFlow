import { createServer } from "vite";

const server = await createServer({ appType: "custom", server: { middlewareMode: true }, logLevel: "error" });

try {
  const [{ demoGlobalKnowledgeGraph }, { demoDomainGovernanceSeed }, { auditDomainRelations, validateKnowledgeRelations }] = await Promise.all([
    server.ssrLoadModule("/src/v2/demo/knowledge/demoGlobalKnowledgeGraph.fixture.ts"),
    server.ssrLoadModule("/src/v2/demo/domains/demoDomainGovernance.seed.ts"),
    server.ssrLoadModule("/src/v2/knowledge/relationAudit.ts")
  ]);
  const governance = demoDomainGovernanceSeed();
  const titleById = new Map(demoGlobalKnowledgeGraph.nodes.map((node) => [node.id, node.title]));
  const formatNodes = (ids) => ids.length ? ids.map((id) => `- ${id} ${titleById.get(id) ?? "Unknown"}`).join("\n") : "- None";

  const activeNodeIds = new Set(demoGlobalKnowledgeGraph.nodes.filter((node) => node.status === "active").map((node) => node.id));
  const assignedDomainIds = new Set(governance.assignments.filter((assignment) => activeNodeIds.has(assignment.nodeId)).map((assignment) => assignment.domainId));
  const auditableDomains = governance.domains
    .filter((domain) => domain.status === "active" && assignedDomainIds.has(domain.id))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const domain of auditableDomains) {
    const audit = auditDomainRelations(demoGlobalKnowledgeGraph, governance.assignments, domain.id);
    const label = domain.name;
    console.log(`${label}\n${"-".repeat(label.length)}`);
    console.log(`Active nodes: ${audit.activeNodeCount}`);
    console.log(`Internal edges: ${audit.edgeCount}`);
    console.log(`Connected components: ${audit.componentCount}`);
    console.log(`Largest component: ${audit.largestComponentSize} (${(audit.largestComponentRatio * 100).toFixed(1)}%)`);
    console.log(`Isolated:\n${formatNodes(audit.isolatedNodeIds)}`);
    console.log(`Low-degree:\n${formatNodes(audit.lowDegreeNodeIds)}\n`);
  }

  const issues = validateKnowledgeRelations(demoGlobalKnowledgeGraph);
  console.log(`Relation validation: ${issues.length ? "FAILED" : "passed"}`);
  if (issues.length) {
    console.error(issues.map((issue) => `- ${issue}`).join("\n"));
    process.exitCode = 1;
  }
} finally {
  await server.close();
}
