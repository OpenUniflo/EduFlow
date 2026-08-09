import { demoDomainGovernanceSeed } from "../../demo/domains/demoDomainGovernance.seed";
import type { DomainGovernanceRepository, DomainGovernanceState } from "./DomainGovernanceRepository";

export const DOMAIN_GOVERNANCE_STORAGE_KEY = "eduflow:v2:domain-governance";

export class LocalStorageDomainGovernanceRepository implements DomainGovernanceRepository {
  load(): DomainGovernanceState {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(DOMAIN_GOVERNANCE_STORAGE_KEY);
        if (raw) return JSON.parse(raw) as DomainGovernanceState;
      } catch {
        // Invalid demo persistence falls back to the registered governance seed.
      }
    }
    return demoDomainGovernanceSeed();
  }

  save(state: DomainGovernanceState) {
    if (typeof window !== "undefined") window.localStorage.setItem(DOMAIN_GOVERNANCE_STORAGE_KEY, JSON.stringify(state));
  }
}
