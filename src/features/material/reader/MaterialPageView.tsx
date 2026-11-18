import type { Material, MaterialSegment } from "@/features/course/types";
import { MaterialRenderer } from "./MaterialRenderer";

/**
 * One segment/page rendered by the same reader component the full reader uses.
 *
 * The panel and its expanded view both mount this component. It does not know
 * about material types: PDF pages, article slides and any future reader
 * surface go through `MaterialRenderer`, so the panel cannot drift into a
 * second, partial renderer again.
 */
export function MaterialPageView({ material, segment, zoom = 1, className }: {
  material: Material;
  segment: MaterialSegment;
  zoom?: number;
  className?: string;
}) {
  const pageMaterial: Material = { ...material, segments: [segment] };
  return <div className={`ef-material-page-view material-reader-current${className ? ` ${className}` : ""}`} data-material-page-view data-segment-id={segment.id}>
    <MaterialRenderer
      material={pageMaterial}
      activeSegmentId={segment.id}
      zoom={zoom}
      navigationRequest={null}
      onVisibleSegmentChange={() => undefined}
      onNavigationSettled={() => undefined}
    />
  </div>;
}
