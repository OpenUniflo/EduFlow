import { createServer } from "vite";

const server = await createServer({ appType: "custom", server: { middlewareMode: true }, logLevel: "error" });

try {
  const [{ globalKnowledgeGraph }, { demoDomainGovernanceSeed }, { auditDomainRelations, validateKnowledgeRelations }] = await Promise.all([
    server.ssrLoadModule("/src/v2/knowledge/graph.ts"),
    server.ssrLoadModule("/src/v2/demo/domains/demoDomainGovernance.seed.ts"),
    server.ssrLoadModule("/src/v2/knowledge/relationAudit.ts")
  ]);
  const governance = demoDomainGovernanceSeed();
  const titleById = new Map(globalKnowledgeGraph.nodes.map((node) => [node.id, node.title]));
  const formatNodes = (ids) => ids.length ? ids.map((id) => `- ${id} ${titleById.get(id) ?? "Unknown"}`).join("\n") : "- None";

  for (const [domainId, label] of [["agentic-ai", "Agentic AI"], ["python-engineering", "Python Engineering"]]) {
    const audit = auditDomainRelations(globalKnowledgeGraph, governance.assignments, domainId);
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
  await server.close();
}
