import type { CourseMaterial, MaterialContentBlockKind, MaterialSourceType, SourceLocation } from "./types";

type JsonObject = Record<string, unknown>;
const SOURCE_TYPES = new Set<MaterialSourceType>(["pdf", "pptx", "docx"]);
const BLOCK_KINDS = new Set<MaterialContentBlockKind>(["title", "heading", "paragraph", "list-item", "table", "picture", "code"]);

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}
function string(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}
function integer(value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer`);
  return Number(value);
}
function stringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${label} must be a string array`);
  return value as string[];
}
function source(value: unknown, label: string): SourceLocation {
  const item = object(value, label);
  const sourceType = string(item.sourceType, `${label}.sourceType`) as MaterialSourceType;
  if (!SOURCE_TYPES.has(sourceType)) throw new Error(`${label}.sourceType is unsupported`);
  const result: SourceLocation = {
    sourceMaterialId: string(item.sourceMaterialId, `${label}.sourceMaterialId`), sourceType,
    rawBlockId: string(item.rawBlockId, `${label}.rawBlockId`), ordinal: integer(item.ordinal, `${label}.ordinal`),
    sectionPath: stringArray(item.sectionPath, `${label}.sectionPath`)
  };
  if (item.page !== undefined) result.page = integer(item.page, `${label}.page`);
  if (item.slide !== undefined) result.slide = integer(item.slide, `${label}.slide`);
  return result;
}

export function parseCourseMaterial(value: unknown): CourseMaterial {
  const root = object(value, "CourseMaterial");
  if (root.schemaVersion !== "course-material-v1") throw new Error("Unsupported CourseMaterial schemaVersion");
  const sourceType = string(root.sourceType, "CourseMaterial.sourceType") as MaterialSourceType;
  if (!SOURCE_TYPES.has(sourceType)) throw new Error("Unsupported CourseMaterial sourceType");
  if (!Array.isArray(root.sections) || !Array.isArray(root.blocks) || !Array.isArray(root.chunks)) throw new Error("CourseMaterial arrays are required");
  const sections = root.sections.map((value, index) => {
    const item = object(value, `sections[${index}]`);
    return { id: string(item.id, `sections[${index}].id`), title: string(item.title, `sections[${index}].title`), order: integer(item.order, `sections[${index}].order`),
      ...(item.level === undefined ? {} : { level: integer(item.level, `sections[${index}].level`) }), ...(item.parentId === undefined ? {} : { parentId: string(item.parentId, `sections[${index}].parentId`) }), source: source(item.source, `sections[${index}].source`) };
  });
  const blocks = root.blocks.map((value, index) => {
    const item = object(value, `blocks[${index}]`);
    const kind = string(item.kind, `blocks[${index}].kind`) as MaterialContentBlockKind;
    if (!BLOCK_KINDS.has(kind)) throw new Error(`blocks[${index}].kind is unsupported`);
    const table = item.table;
    if (table !== undefined && (!Array.isArray(table) || !table.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string")))) throw new Error(`blocks[${index}].table is invalid`);
    return { id: string(item.id, `blocks[${index}].id`), kind, text: typeof item.text === "string" ? item.text : "", ...(table === undefined ? {} : { table: table as string[][] }), source: source(item.source, `blocks[${index}].source`) };
  });
  const blockIds = new Set(blocks.map((block) => block.id));
  const chunks = root.chunks.map((value, index) => {
    const item = object(value, `chunks[${index}]`);
    const ids = stringArray(item.blockIds, `chunks[${index}].blockIds`);
    if (!ids.length || ids.some((id) => !blockIds.has(id))) throw new Error(`chunks[${index}] has invalid block references`);
    if (!Array.isArray(item.sources) || !item.sources.length) throw new Error(`chunks[${index}].sources must not be empty`);
    return { id: string(item.id, `chunks[${index}].id`), order: integer(item.order, `chunks[${index}].order`), text: string(item.text, `chunks[${index}].text`), blockIds: ids,
      sources: item.sources.map((item, sourceIndex) => source(item, `chunks[${index}].sources[${sourceIndex}]`)), sectionPath: stringArray(item.sectionPath, `chunks[${index}].sectionPath`) };
  });
  const metadata = root.metadata === undefined ? {} : object(root.metadata, "CourseMaterial.metadata");
  return { schemaVersion: "course-material-v1", sourceMaterialId: string(root.sourceMaterialId, "CourseMaterial.sourceMaterialId"), sourceType, title: string(root.title, "CourseMaterial.title"), sections, blocks, chunks, metadata };
}
