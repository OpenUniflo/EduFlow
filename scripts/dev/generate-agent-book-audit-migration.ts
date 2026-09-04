import { readFile, writeFile } from "node:fs/promises";

const AUDIT_PATH = "data/gold-courses/ai-agents-in-depth-book-audit.tsv";
const MIGRATION_PATH = "supabase/migrations/20260905020000_agent_book_primary_material.sql";
const COURSE_ID = "ai-agents-in-depth";
const MATERIAL_ID = "ai-agents-in-depth-book";
const STORAGE_PATH = "shared/ai-agents-in-depth/AI-Agents-in-Depth-zh-CN.pdf";
const PAGE_COUNT = 307;

type Decision = {
  knowledgeId: string;
  classification: "DIRECT" | "CROSS_SECTION" | "EDUFLOW_ADDED" | "UNSUPPORTED";
  printedRanges: Array<[number, number]>;
  pdfRanges: Array<[number, number]>;
  deepLinkPdfPage?: number;
  evidence: string;
};

function quoted(value: string) { return `'${value.replace(/'/g, "''")}'`; }
function parseRanges(value: string, maximum: number, label: string): Array<[number, number]> {
  if (!value.trim()) return [];
  return value.split(";").map((raw) => {
    const match = /^(\d+)(?:-(\d+))?$/.exec(raw.trim());
    if (!match) throw new Error(`Invalid ${label} range: ${raw}`);
    const start = Number(match[1]); const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > maximum) throw new Error(`Out-of-bounds ${label} range: ${raw}`);
    return [start, end];
  });
}

const lines = (await readFile(AUDIT_PATH, "utf8")).trim().split("\n");
const decisions: Decision[] = lines.slice(1).map((line, index) => {
  const [knowledgeId, classification, printedText, pdfText, page, evidence = ""] = line.split("\t");
  if (!knowledgeId || !["DIRECT", "CROSS_SECTION", "EDUFLOW_ADDED", "UNSUPPORTED"].includes(classification)) throw new Error(`Invalid audit row ${index + 2}`);
  const deepLinkPdfPage = page ? Number(page) : undefined;
  const printedRanges = parseRanges(printedText, PAGE_COUNT - 8, `${knowledgeId} printed`);
  const pdfRanges = parseRanges(pdfText, PAGE_COUNT, `${knowledgeId} PDF`);
  if (deepLinkPdfPage !== undefined && (!Number.isInteger(deepLinkPdfPage) || deepLinkPdfPage < 1 || deepLinkPdfPage > PAGE_COUNT)) throw new Error(`Invalid PDF page for ${knowledgeId}`);
  const supported = ["DIRECT", "CROSS_SECTION"].includes(classification);
  if (!evidence.trim() || supported !== Boolean(deepLinkPdfPage) || (supported && (!printedRanges.length || printedRanges.length !== pdfRanges.length))) throw new Error(`Evidence mismatch for ${knowledgeId}`);
  if (!supported && (printedRanges.length || pdfRanges.length)) throw new Error(`Unsupported row must not claim page evidence for ${knowledgeId}`);
  pdfRanges.forEach(([start, end], rangeIndex) => {
    const [printedStart, printedEnd] = printedRanges[rangeIndex];
    if (start !== printedStart + 8 || end !== printedEnd + 8) throw new Error(`Printed/PDF offset mismatch for ${knowledgeId}`);
  });
  if (supported && !pdfRanges.some(([start, end]) => deepLinkPdfPage! >= start && deepLinkPdfPage! <= end)) throw new Error(`Deep link is outside evidence for ${knowledgeId}`);
  return { knowledgeId, classification: classification as Decision["classification"], printedRanges, pdfRanges, deepLinkPdfPage, evidence };
});
if (decisions.length !== 117 || new Set(decisions.map((item) => item.knowledgeId)).size !== 117) throw new Error("Audit must contain exactly 117 unique Knowledge identities");

const values = decisions.map((item) => `  (${quoted(item.knowledgeId)}, ${quoted(item.classification)}, ${quoted(item.printedRanges.map(([start,end]) => start === end ? `${start}` : `${start}-${end}`).join(";"))}, ${quoted(item.pdfRanges.map(([start,end]) => start === end ? `${start}` : `${start}-${end}`).join(";"))}, ${item.deepLinkPdfPage ?? "null"}, ${quoted(item.evidence)})`).join(",\n");
const evidenceValues = decisions.flatMap((item) => item.pdfRanges.map(([start, end], rangeIndex) => `  (${quoted(item.knowledgeId)}, ${rangeIndex}, ${start}, ${end})`)).join(",\n");
const sql = `-- Generated from ${AUDIT_PATH}. Do not edit the mapping rows by hand.
begin;

create temporary table agent_book_audit (
  knowledge_id text primary key,
  classification text not null check (classification in ('DIRECT','CROSS_SECTION','EDUFLOW_ADDED','UNSUPPORTED')),
  printed_ranges text not null,
  pdf_ranges text not null,
  deep_link_pdf_page integer,
  evidence text not null
) on commit drop;

insert into agent_book_audit(knowledge_id, classification, printed_ranges, pdf_ranges, deep_link_pdf_page, evidence) values
${values};

create temporary table agent_book_evidence_ranges (
  knowledge_id text not null,
  range_index integer not null,
  pdf_start integer not null,
  pdf_end integer not null,
  primary key (knowledge_id, range_index)
) on commit drop;

insert into agent_book_evidence_ranges(knowledge_id, range_index, pdf_start, pdf_end) values
${evidenceValues};

do $$
begin
  if (select count(*) from agent_book_audit) <> 117 then raise exception 'agent_book_audit_count_mismatch'; end if;
  if exists (select 1 from courses where id = '${COURSE_ID}') and (exists (
    select 1 from agent_book_audit a
    left join curriculum_coverages c on c.course_id = '${COURSE_ID}' and c.node_id = a.knowledge_id
    where c.node_id is null
  ) or exists (
    select 1 from curriculum_coverages c
    left join agent_book_audit a on a.knowledge_id = c.node_id
    where c.course_id = '${COURSE_ID}' and a.knowledge_id is null
  )) then raise exception 'agent_book_audit_identity_mismatch'; end if;
  if exists (select 1 from courses where id = '${COURSE_ID}') and not exists (select 1 from storage.objects where bucket_id = 'course-materials' and name = '${STORAGE_PATH}') then
    raise exception 'agent_book_storage_object_missing';
  end if;
end $$;

update materials set display_order = 1
where course_id = '${COURSE_ID}' and id = 'M03-memory-rag';

insert into materials(course_id,id,display_order,title,description,material_type,storage_path,page_count,duration)
select '${COURSE_ID}','${MATERIAL_ID}',0,'深入理解 AI Agent（完整原书）','课程主要原始资料；Knowledge 深链使用真实 PDF page。','pdf','${STORAGE_PATH}',${PAGE_COUNT},'自定进度'
where exists (select 1 from courses where id = '${COURSE_ID}')
  and exists (select 1 from storage.objects where bucket_id = 'course-materials' and name = '${STORAGE_PATH}')
on conflict (course_id,id) do update set display_order=excluded.display_order,title=excluded.title,description=excluded.description,material_type=excluded.material_type,storage_path=excluded.storage_path,page_count=excluded.page_count,duration=excluded.duration;

insert into material_segments(course_id,material_id,id,display_order,page,title,section)
select '${COURSE_ID}','${MATERIAL_ID}','page-' || page,(page - 1),page,'PDF 第 ' || page || ' 页','完整原书'
from generate_series(1,${PAGE_COUNT}) page
where exists (select 1 from materials where course_id = '${COURSE_ID}' and id = '${MATERIAL_ID}')
on conflict (course_id,material_id,id) do update set display_order=excluded.display_order,page=excluded.page,title=excluded.title,section=excluded.section;

-- M03 remains available as a legacy Course asset, but no longer competes in the
-- Knowledge learning path. The full book is the only mapped primary source.
delete from material_knowledge_coverages
where course_id = '${COURSE_ID}' and material_id in ('M03-memory-rag','${MATERIAL_ID}');

insert into material_knowledge_coverages(course_id,id,material_id,segment_id,node_id,role)
select '${COURSE_ID}', 'book-audit-' || a.knowledge_id || '-' || r.pdf_start,
  '${MATERIAL_ID}', 'page-' || r.pdf_start, a.knowledge_id, 'explain'
from agent_book_audit a
join agent_book_evidence_ranges r on r.knowledge_id = a.knowledge_id
join materials m on m.course_id = '${COURSE_ID}' and m.id = '${MATERIAL_ID}'
where a.classification in ('DIRECT','CROSS_SECTION')
order by a.knowledge_id, r.range_index;

commit;
`;

await writeFile(MIGRATION_PATH, sql);
console.log(`Generated ${MIGRATION_PATH} from ${decisions.length} reviewed decisions.`);
