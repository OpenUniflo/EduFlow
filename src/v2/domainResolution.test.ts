import { describe, expect, it } from "vitest";
import type { DomainGovernanceState } from "./knowledge/domain/DomainGovernanceRepository";
import { resolveNodeDomain } from "./knowledge/domain/domainResolution";

describe("Pure Domain resolution", () => {
  it("resolves assigned and Unclassified nodes from explicit governance state", () => {
    const state: DomainGovernanceState = {
      domains: [
        { id: "domain-a", name: "Domain A", canonicalColor: "#112233", status: "active", createdBy: "test", createdAt: "now", updatedBy: "test", updatedAt: "now" },
        { id: "domain-b", name: "Domain B", canonicalColor: "#445566", status: "active", createdBy: "test", createdAt: "now", updatedBy: "test", updatedAt: "now" }
      ],
      assignments: [{ nodeId: "node-a", domainId: "domain-b", source: "admin", pinned: true, assignedBy: "test", assignedAt: "now" }],
      candidates: [],
      proposals: [],
      revision: 0
    };

    expect(resolveNodeDomain("node-a", state)).toEqual({
      assignment: state.assignments[0],
      domain: state.domains[1]
    });
    expect(resolveNodeDomain("unclassified", state)).toEqual({ assignment: undefined, domain: undefined });
  });
});
