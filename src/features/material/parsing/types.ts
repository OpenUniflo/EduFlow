export type MaterialSourceType = "pdf" | "pptx" | "docx";
export type MaterialContentBlockKind = "title" | "heading" | "paragraph" | "list-item" | "table" | "picture" | "code";

export type SourceLocation = {
  sourceMaterialId: string;
  sourceType: MaterialSourceType;
  rawBlockId: string;
  ordinal: number;
  sectionPath: string[];
  page?: number;
  slide?: number;
};

export type StructuredMaterialSection = {
  id: string;
  title: string;
  order: number;
  level?: number;
  parentId?: string;
  source: SourceLocation;
};

export type StructuredMaterialBlock = {
  id: string;
  kind: MaterialContentBlockKind;
  text: string;
  table?: string[][];
  source: SourceLocation;
};

export type StructuredMaterialChunk = {
  id: string;
  order: number;
  text: string;
  blockIds: string[];
  sources: SourceLocation[];
  sectionPath: string[];
};

/** Versioned, vendor-neutral parsed content attached to an existing Material. */
export type CourseMaterial = {
  schemaVersion: "course-material-v1";
  sourceMaterialId: string;
  sourceType: MaterialSourceType;
  title: string;
  sections: StructuredMaterialSection[];
  blocks: StructuredMaterialBlock[];
  chunks: StructuredMaterialChunk[];
  metadata: Record<string, unknown>;
};

export type MaterialParsingStatus = "pending" | "running" | "completed" | "failed";
export type MaterialParsingJob = {
  id: string;
  courseId: string;
  materialId: string;
  status: MaterialParsingStatus;
  attempt: number;
  parserVersion: string;
  adapterVersion: string;
  rawArtifactPath?: string;
  normalizedArtifactPath?: string;
  errorCode?: string;
  errorMessage?: string;
};
