import type { DomainGovernanceRepository, DomainGovernanceState } from "./DomainGovernanceRepository";
import { apiRequest } from "@/shared/api/apiClient";

const emptyState = (): DomainGovernanceState => ({ domains: [], assignments: [], candidates: [], proposals: [], revision: 0 });

export class ApiDomainGovernanceRepository implements DomainGovernanceRepository {
  private state = emptyState();

  hydrate(state: DomainGovernanceState) {
    this.state = structuredClone(state);
  }

  load() {
    return structuredClone(this.state);
  }

  save(state: DomainGovernanceState) {
    this.state = structuredClone(state);
    void apiRequest("/api/domains", { method: "PUT", body: JSON.stringify(state) });
  }
}
