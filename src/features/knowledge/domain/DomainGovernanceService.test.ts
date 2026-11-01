import { describe, expect, it } from "vitest";
import { DomainGovernanceService } from "./DomainGovernanceService";
import type { DomainGovernanceState } from "./DomainGovernanceRepository";
import type { KnowledgeGraph } from "../types";
import { InMemoryKnowledgeRepository } from "../repository/InMemoryKnowledgeRepository";

const graph: KnowledgeGraph = { nodes: [], revisions: [], edges: [] };
const actor = { id: "admin", capabilities: ["global-domain-admin" as const] };

function serviceWith(initial: DomainGovernanceState) {
  let stored = initial;
  const service = new DomainGovernanceService(new InMemoryKnowledgeRepository(graph), { load: () => stored, save: (next) => { stored = next; } });
  return { service, state: () => stored };
}

describe("DomainGovernanceService lifecycle", () => {
  it("creates, edits and archives a Domain without removing it", () => {
    const { service, state } = serviceWith({ domains: [], assignments: [], candidates: [], proposals: [], revision: 0 });
    const created = service.createDomain({ actor, name: "Temporary", description: "Before" });
    expect(state().domains).toHaveLength(1);

    service.updateDomain({ actor, domainId: created.id, changes: { name: "Temporary edited", description: "After", canonicalColor: "#112233" } });
    expect(state().domains[0]).toMatchObject({ id: created.id, name: "Temporary edited", description: "After", canonicalColor: "#112233", status: "active" });

    service.updateDomain({ actor, domainId: created.id, changes: { status: "archived" } });
    expect(state().domains).toHaveLength(1);
    expect(state().domains[0]).toMatchObject({ id: created.id, name: "Temporary edited", status: "archived" });
  });
});
