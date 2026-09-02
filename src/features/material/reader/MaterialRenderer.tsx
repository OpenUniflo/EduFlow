import type { Material } from "@/features/course/types";
import { DocumentMaterialViewer } from "./DocumentMaterialViewer";
import { PdfMaterialViewer } from "./PdfMaterialViewer";
import type { MaterialNavigationRequest } from "./materialReaderState";
import { sortMaterialSegments } from "../materialOrdering";

export function MaterialRenderer({ material, activeSegmentId, zoom, navigationRequest, onVisibleSegmentChange, onNavigationSettled }: {
  material: Material;
  activeSegmentId: string;
  zoom: number;
  navigationRequest: MaterialNavigationRequest | null;
  onVisibleSegmentChange(segmentId: string): void;
  onNavigationSettled(token: number): void;
}) {
  if (material.type === "pdf" && material.source?.kind === "pdf") {
    const segments = sortMaterialSegments(material);
    const segmentByPage = new Map(segments.map((segment) => [segment.page ?? segment.order, segment.id]));
    const activeSegment = segments.find((segment) => segment.id === activeSegmentId);
    return <PdfMaterialViewer courseId={material.courseId} materialId={material.id} staticSourceUrl={material.source.url} sourcePageCount={material.source.pageCount} segments={segments} activePage={activeSegment?.page ?? activeSegment?.order ?? 1} zoom={zoom} navigationRequest={navigationRequest} onVisiblePageChange={(page) => {
      const segmentId = segmentByPage.get(page);
      if (segmentId) onVisibleSegmentChange(segmentId);
    }} onNavigationSettled={onNavigationSettled} />;
  }
  return <DocumentMaterialViewer material={material} activeSegmentId={activeSegmentId} zoom={zoom} navigationRequest={navigationRequest} onVisibleSegmentChange={onVisibleSegmentChange} onNavigationSettled={onNavigationSettled} />;
}
