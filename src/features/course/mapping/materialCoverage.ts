import type { CourseRuntimeData } from "../runtime/courseRuntime";
import type { KnowledgeNode } from "@/features/knowledge/types";
import type { MaterialKnowledgeCoverage } from "@/features/course/types";
import { deterministicMappingId } from "./deterministicId";
import type { ResolvedMaterialCoverage } from "./types";

function normalizedSection(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

/** Resolves persisted Phase 4.2 provenance only; it never performs semantic search. */
export function resolveMaterialCoverage(runtime: CourseRuntimeData, nodes: readonly KnowledgeNode[]): ResolvedMaterialCoverage {
  const courseNodeIds = new Set(runtime.curriculumCoverages.map((coverage) => coverage.nodeId));
  const materialById = new Map(runtime.materials.map((material) => [material.id, material]));
  const coverages: MaterialKnowledgeCoverage[] = [];
  const unresolved: ResolvedMaterialCoverage["unresolved"] = [];
  const relations = new Set<string>();

  nodes.filter((node) => node.status === "active" && courseNodeIds.has(node.id)).forEach((node) => {
    const provenance = node.provenance.filter((item) => item.sourceType === "material" && item.materialId && item.sourceLocations?.length);
    if (!provenance.length) {
      unresolved.push({ nodeId: node.id, reason: "missing-material-provenance" });
      return;
    }
    provenance.forEach((item) => {
      const material = materialById.get(item.materialId as string);
      if (!material) {
        unresolved.push({ nodeId: node.id, materialId: item.materialId, reason: "material-not-in-course" });
        return;
      }
      item.sourceLocations?.forEach((location) => {
        let segments = material.type === "pdf" && location.page !== undefined
          ? material.segments.filter((segment) => segment.page === location.page)
          : material.segments.filter((segment) => segment.section && location.sectionPath.length > 0
            && normalizedSection(segment.section) === normalizedSection(location.sectionPath.join(" / ")));
        segments = [...segments].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
        if (segments.length !== 1) {
          unresolved.push({ nodeId: node.id, materialId: material.id, reason: segments.length ? "ambiguous-source-location" : "source-location-has-no-segment" });
          return;
        }
        const segment = segments[0];
        const role = "explain" as const;
        const relation = `${material.id}:${segment.id}:${node.id}:${role}`;
        if (relations.has(relation)) return;
        relations.add(relation);
        coverages.push({ id: deterministicMappingId("mkc", runtime.course.id, material.id, segment.id, node.id, role), materialId: material.id, segmentId: segment.id, nodeId: node.id, role });
      });
    });
  });
  return { coverages: coverages.sort((left, right) => left.nodeId.localeCompare(right.nodeId) || left.materialId.localeCompare(right.materialId) || left.segmentId.localeCompare(right.segmentId)), unresolved };
}
