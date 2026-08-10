import type { DomainAssignment } from "../../knowledge/domain/domainTypes";

export const DEMO_DOMAIN_ASSIGNMENT_TIME = "2026-08-08T00:00:00.000Z";

const AGENTIC_AI_AUTO_NODE_IDS = "AG01 H02 H03 P01 P02 P03 P05 A01 A02 R01 R10 R04 R11 R06 R07 R08 R09 W01 W02 C01 C02 C03 C04 I01 I02 I05 I04 T11 T12 T03 T14 T15 T06 T07 T08 T09 T10 K01 K12 K13 K14 K15 K16 K04 K05 RT01 RT02 RT03 RT14 RT15 RT06 W13 W04 WF03 WF05 MA02 MA12 MA03 MA04 MA15 MA06 MA07 E12 E13 E14 E05 E06 E07 S01 S02 S03 S14 S15 S06 S07 S08".split(" ");
const PYTHON_ENGINEERING_AUTO_NODE_IDS = "PY02 PY03 PY04 PY05 PY06 PY07 PY08 PY09 PY18 PY19 PY27 PY34 PY37 PY45 PY46 PY49 PY50 PY51 PY99 PY54 PY55 PY56 PY57 PY58 PY100 PY63 PY62 PY64 PY67 PY71 PY72 PY76 PY78 PY101 PY80 PY102 PY83 PY82 PY85 PY86 PY89 PY90 PY91 PY94 PY95 PY97 PY98".split(" ");

function autoMembership(domainId: string, nodeIds: string[], confidence = 0.92): DomainAssignment[] {
  return nodeIds.map((nodeId) => ({
    nodeId,
    domainId,
    source: "auto",
    confidence,
    pinned: false,
    assignedAt: DEMO_DOMAIN_ASSIGNMENT_TIME
  }));
}

function adminPinnedMembership(nodeId: string, domainId: string): DomainAssignment {
  return {
    nodeId,
    domainId,
    source: "admin",
    pinned: true,
    assignedBy: "global-admin-demo",
    assignedAt: DEMO_DOMAIN_ASSIGNMENT_TIME
  };
}

/** Explicit demo relation facts. Fixture file location has no membership meaning. */
export const demoDomainAssignments: DomainAssignment[] = [
  ...autoMembership("agentic-ai", AGENTIC_AI_AUTO_NODE_IDS),
  adminPinnedMembership("R03", "agentic-ai"),
  ...autoMembership("python-engineering", PYTHON_ENGINEERING_AUTO_NODE_IDS),
  adminPinnedMembership("PY01", "python-engineering"),
  ...autoMembership("agentic-ai", ["U-DEMO-01"])
];
