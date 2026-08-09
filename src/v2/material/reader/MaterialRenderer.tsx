import type { Material } from "../../types";
import { DocumentMaterialViewer } from "./DocumentMaterialViewer";
import { PdfMaterialViewer } from "./PdfMaterialViewer";
import type { MaterialNavigationRequest } from "./materialReaderState";

export function MaterialRenderer({ material, activeSegmentId, zoom, navigationRequest, onVisibleSegmentChange, onNavigationSettled }: {
  material: Material;
  activeSegmentId: string;
  zoom: number;
  navigationRequest: MaterialNavigationRequest | null;
  onVisibleSegmentChange(segmentId: string): void;
  onNavigationSettled(token: number): void;
}) {
  if (material.type === "pdf" && material.source?.kind === "pdf") {
    const segmentByPage = new Map(material.segments.map((segment) => [segment.page ?? segment.order, segment.id]));
    const activeSegment = material.segments.find((segment) => segment.id === activeSegmentId);
    return <PdfMaterialViewer sourceUrl={material.source.url} sourcePageCount={material.source.pageCount} segments={material.segments} activePage={activeSegment?.page ?? activeSegment?.order ?? 1} zoom={zoom} navigationRequest={navigationRequest} onVisiblePageChange={(page) => {
      const segmentId = segmentByPage.get(page);
      if (segmentId) onVisibleSegmentChange(segmentId);
    }} onNavigationSettled={onNavigationSettled} />;
  }
  return <DocumentMaterialViewer material={material} activeSegmentId={activeSegmentId} zoom={zoom} navigationRequest={navigationRequest} onVisibleSegmentChange={onVisibleSegmentChange} onNavigationSettled={onNavigationSettled} />;
}
