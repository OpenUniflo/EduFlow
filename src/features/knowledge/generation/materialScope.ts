import type { CourseMaterial, SourceLocation } from "@/features/material/parsing/types";
import type { CourseMaterialScope } from "./types";

function sourceInScope(source: SourceLocation, scope: CourseMaterialScope) {
  if (!scope.pdfPages) return true;
  return source.page !== undefined && source.page >= scope.pdfPages.start && source.page <= scope.pdfPages.end;
}

export function selectCourseMaterialScope(material: CourseMaterial, scope: CourseMaterialScope = {}): CourseMaterial {
  if (scope.pdfPages && (material.sourceType !== "pdf" || !Number.isInteger(scope.pdfPages.start) || !Number.isInteger(scope.pdfPages.end) || scope.pdfPages.start < 1 || scope.pdfPages.end < scope.pdfPages.start)) {
    throw new Error("A valid PDF page scope requires a PDF CourseMaterial");
  }
  const blocks = material.blocks.filter((block) => sourceInScope(block.source, scope));
  const blockIds = new Set(blocks.map((block) => block.id));
  const chunks = material.chunks.flatMap((chunk) => {
    const selectedBlockIds = chunk.blockIds.filter((id) => blockIds.has(id));
    const selectedSources = chunk.sources.filter((source) => sourceInScope(source, scope));
    if (!selectedBlockIds.length || !selectedSources.length) return [];
    const selectedTexts = selectedBlockIds.map((id) => blocks.find((block) => block.id === id)?.text).filter((value): value is string => Boolean(value));
    return [{ ...chunk, text: selectedTexts.join("\n\n"), blockIds: selectedBlockIds, sources: selectedSources }];
  });
  if (!chunks.length) throw new Error("CourseMaterial scope contains no addressable content");
  return {
    ...material,
    sections: material.sections.filter((section) => sourceInScope(section.source, scope)),
    blocks,
    chunks
  };
}
