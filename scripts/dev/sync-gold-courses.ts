import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertLocalSupabaseUrl } from "../local-supabase";

const COURSE_IDS = ["ai-agents-in-depth", "cds525-deep-learning"] as const;
const EXPECTED = {
  "ai-agents-in-depth": { chapters: 9, lessons: 9, coverages: 117, materials: 1, segments: 36, materialCoverages: 85, assignments: 127 },
  "cds525-deep-learning": { chapters: 6, lessons: 26, coverages: 90, materials: 12, segments: 790, materialCoverages: 90, assignments: 97 }
} as const;
const BOOK = {
  courseId: "ai-agents-in-depth",
  materialId: "ai-agents-in-depth-book",
  path: "shared/ai-agents-in-depth/AI-Agents-in-Depth-zh-CN.pdf",
  localPath: "docs/local/AI-Agents-in-Depth-zh-CN.pdf",
  pageCount: 307
} as const;
const FINALIZED_FINGERPRINTS:Record<string,string>={"ai-agents-in-depth":"f7ab815c3cc9f95af394d3a39e20d511dfdfc78810b1d253c7647e9160f5b524","cds525-deep-learning":"3b889d0b5ced962bba26ef5ffc68317be2f2e128da45486f93020e40712564eb"};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Row = Record<string, unknown>;
type CourseRuntime = Row & {
  course: Row & { id: string };
  chapters: Row[];
  lessons: Row[];
  curriculumCoverages: Row[];
  curriculumSequences: Row[];
  assignments: Row[];
  assignmentCoverages: Row[];
  assignmentDependencies: Row[];
  chapterOutcomes: Row[];
  assignmentOutcomeCompositions: Row[];
  finalProjects: Row[];
  finalProjectOutcomeCompositions: Row[];
  materials: Array<Row & { id: string; source?: { kind: string; pageCount: number }; segments: Row[] }>;
  materialKnowledgeCoverages: Row[];
  targetKnowledge?: Row[];
  revision: string;
  curriculum: Row;
};
type Asset = { courseId: string; materialId: string; path: string; size: number; sha256: string; pageCount: number; segmentCount: number; minPage: number; maxPage: number };
type CourseCounts = { chapters: number; lessons: number; coverages: number; materials: number; segments: number; materialCoverages: number; assignments: number };
type Manifest = {
  schemaVersion: 1;
  remoteApp: string;
  courses: Array<{ courseId: string; definitionSha256: string; counts: CourseCounts }>;
  assets: Asset[];
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(bytes: Uint8Array | string) { return createHash("sha256").update(bytes).digest("hex"); }
function requireEnv(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; }
function remoteBase() { return requireEnv("REMOTE_EDUFLOW_URL").replace(/\/$/, ""); }
async function fetchJson<T>(url: string): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      return await response.json() as T;
    } catch (error) {
      last = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw last;
}
function assertCourse(runtime: CourseRuntime) {
  const courseId = runtime.course.id as keyof typeof EXPECTED;
  const expected = EXPECTED[courseId];
  if (!expected) throw new Error(`Unexpected Course ${courseId}`);
  const counts = {
    chapters: runtime.chapters.length,
    lessons: runtime.lessons.length,
    coverages: runtime.curriculumCoverages.length,
    materials: runtime.materials.length,
    segments: runtime.materials.reduce((sum, material) => sum + material.segments.length, 0),
    materialCoverages: runtime.materialKnowledgeCoverages.length,
    assignments: runtime.assignments.length
  };
  if (stable(counts) !== stable(expected)) throw new Error(`${courseId} hosted counts changed: ${stable(counts)} expected ${stable(expected)}`);
  runtime.materials.forEach((material) => {
    if (material.source?.kind !== "pdf" || !Number.isInteger(material.source.pageCount) || material.source.pageCount < 1) throw new Error(`${courseId}/${material.id} is not a complete PDF Material`);
    const pages = material.segments.map((segment) => Number(segment.page)).sort((a, b) => a - b);
    if (pages.length !== material.source.pageCount || pages.some((page, index) => page !== index + 1)) throw new Error(`${courseId}/${material.id} page range is incomplete`);
  });
  return counts;
}
async function fetchRuntimes() {
  return Promise.all(COURSE_IDS.map(async (courseId) => {
    const payload = await fetchJson<{ course?: CourseRuntime }>(`${remoteBase()}/api/courses?id=${encodeURIComponent(courseId)}`);
    if (!payload.course) throw new Error(`Hosted Course ${courseId} is unavailable`);
    assertCourse(payload.course);
    return payload.course;
  }));
}
function pathFromSignedUrl(sourceUrl: string) {
  const marker = "/object/sign/course-materials/";
  const pathname = new URL(sourceUrl).pathname;
  const index = pathname.indexOf(marker);
  if (index < 0) throw new Error("Material source did not return a course-materials URL");
  return decodeURIComponent(pathname.slice(index + marker.length));
}
async function fetchAsset(runtime: CourseRuntime, material: CourseRuntime["materials"][number]): Promise<{ asset: Asset; bytes: Uint8Array }> {
  const query = new URLSearchParams({ courseId: runtime.course.id, materialId: material.id });
  const source = await fetchJson<{ sourceUrl: string }>(`${remoteBase()}/api/materials?${query}`);
  const response = await fetch(source.sourceUrl);
  if (!response.ok) throw new Error(`Cannot download ${runtime.course.id}/${material.id}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const pages = material.segments.map((segment) => Number(segment.page));
  const path = pathFromSignedUrl(source.sourceUrl);
  material.storagePath = path;
  return { bytes, asset: {
    courseId: runtime.course.id, materialId: material.id, path, size: bytes.length, sha256: sha256(bytes),
    pageCount: material.source!.pageCount, segmentCount: pages.length, minPage: Math.min(...pages), maxPage: Math.max(...pages)
  } };
}
async function collect(runtimes: CourseRuntime[]) {
  const remoteAssets: Array<{ asset: Asset; bytes: Uint8Array }> = [];
  for (const runtime of runtimes) for (const material of runtime.materials) remoteAssets.push(await fetchAsset(runtime, material));
  const bookBytes = new Uint8Array(await readFile(BOOK.localPath));
  const book = { asset: { courseId: BOOK.courseId, materialId: BOOK.materialId, path: BOOK.path, size: bookBytes.length, sha256: sha256(bookBytes), pageCount: BOOK.pageCount, segmentCount: BOOK.pageCount, minPage: 1, maxPage: BOOK.pageCount }, bytes: bookBytes };
  const manifest: Manifest = {
    schemaVersion: 1,
    remoteApp: remoteBase(),
    courses: runtimes.map((runtime) => ({ courseId: runtime.course.id, definitionSha256: sha256(stable(runtime)), counts: assertCourse(runtime) })),
    assets: [...remoteAssets.map((item) => item.asset), book.asset].sort((a, b) => a.path.localeCompare(b.path))
  };
  return { manifest, assets: [...remoteAssets, book] };
}
function localClient() {
  return createClient(assertLocalSupabaseUrl(requireEnv("SUPABASE_URL")), requireEnv("SUPABASE_SECRET_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}
async function rows(client: SupabaseClient, table: string, column: string, values: readonly string[]) {
  const result = await client.from(table).select("*").in(column, [...values]);
  if (result.error) throw new Error(`${table} read failed: ${result.error.message}`);
  return result.data as Row[];
}
async function ensureNoLocalLearnerData(client: SupabaseClient) {
  for (const table of ["user_course_states", "user_assignment_states", "user_material_states","learning_attempts","performance_results","learning_events","navigation_decisions"]) {
    const existing = await rows(client, table, "course_id", COURSE_IDS);
    if (existing.length) throw new Error(`${table} contains ${existing.length} target-Course learner rows; refusing definition replacement`);
  }
  const paths = await rows(client, "micro_learning_paths", "course_id", COURSE_IDS);
  if (paths.length) {
    const progress = await rows(client, "user_micro_path_progress", "path_id", paths.map((path) => String(path.id)));
    if (progress.length) throw new Error(`user_micro_path_progress contains target-Course learner rows; refusing definition replacement`);
  }
}
function sqlJson(value: unknown) {
  return `convert_from(decode('${Buffer.from(JSON.stringify(value)).toString("base64")}','base64'),'utf8')::jsonb`;
}
function sqlLiteral(value: unknown) {
  if (value == null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("Cannot write a non-finite number"); return String(value); }
  if (typeof value === "object") return sqlJson(value);
  return `'${String(value).replace(/'/g,"''")}'`;
}
function insertSql(table: string, records: Row[], conflict = "") {
  if (!records.length) return "";
  const columns = Object.keys(records[0]);
  if (records.some((record) => columns.some((column) => !(column in record)) || Object.keys(record).some((column) => !columns.includes(column)))) throw new Error(`${table} rows do not share one shape`);
  return `insert into public.${table}(${columns.map((column)=>`"${column}"`).join(",")}) values\n${records.map((record)=>`(${columns.map((column)=>sqlLiteral(record[column])).join(",")})`).join(",\n")} ${conflict};`;
}
function localDbContainer() { return `supabase_db_${process.env.LOCAL_SUPABASE_PROJECT_ID?.trim() || "EduFlow"}`; }
function runLocalSql(sql: string, label: string) {
  const result=spawnSync("docker",["exec","-i",localDbContainer(),"psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q"],{input:sql,encoding:"utf8",maxBuffer:80*1024*1024});
  if(result.status!==0)throw new Error(`${label}: ${result.stderr||result.stdout}`);
}
function runNodeScript(args: string[], label: string) {
  const result = spawnSync(process.execPath, ["--import", "tsx", ...args], { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${label}: ${result.stderr || result.stdout}`);
  if (result.stdout.trim()) console.log(result.stdout.trim());
}
function fingerprintRows(records:Row[]){return records.map((record)=>Object.fromEntries(Object.entries(record).filter(([key])=>!['created_at','updated_at'].includes(key)))).map(stable).sort();}
async function localDefinitionFingerprint(client:SupabaseClient,courseId:string){
  const courseTables=["courses","course_curricula","curriculum_chapters","curriculum_lessons","curriculum_coverages","curriculum_sequences","course_target_knowledge","course_assignments","assignment_coverages","assignment_dependencies","chapter_outcomes","assignment_outcome_compositions","final_projects","final_project_outcome_compositions","materials","material_segments","material_knowledge_coverages"];
  const grouped:Record<string,string[]>={};
  for(const table of courseTables)grouped[table]=fingerprintRows(await rows(client,table,table==="courses"?"id":"course_id",[courseId]));
  const coverage=await rows(client,"curriculum_coverages","course_id",[courseId]);const nodeIds=[...new Set(coverage.map((row)=>String(row.node_id)))];
  const nodes=nodeIds.length?await rows(client,"knowledge_nodes","id",nodeIds):[];const revisionIds=nodes.map((row)=>String(row.current_revision_id));
  grouped.knowledge_nodes=fingerprintRows(nodes);grouped.knowledge_node_revisions=fingerprintRows(revisionIds.length?await rows(client,"knowledge_node_revisions","id",revisionIds):[]);
  const edgeResult=await client.from("knowledge_edges").select("*").in("source_node_id",nodeIds).in("target_node_id",nodeIds);if(edgeResult.error)throw new Error(`knowledge_edges fingerprint failed: ${edgeResult.error.message}`);grouped.knowledge_edges=fingerprintRows(edgeResult.data as Row[]);
  const paths=await rows(client,"micro_learning_paths","course_id",[courseId]);const pathIds=paths.map((row)=>String(row.id));const units=pathIds.length?await rows(client,"micro_units","path_id",pathIds):[];const unitIds=units.map((row)=>String(row.id));
  grouped.micro_learning_paths=fingerprintRows(paths);grouped.micro_units=fingerprintRows(units);grouped.micro_steps=fingerprintRows(unitIds.length?await rows(client,"micro_steps","unit_id",unitIds):[]);
  return sha256(stable(grouped));
}
async function definitionsAreFinalized(client:SupabaseClient){
  const expected:Record<string,Record<string,number>>={
    "ai-agents-in-depth":{curriculum_chapters:9,curriculum_lessons:9,curriculum_coverages:117,materials:2,material_segments:343,material_knowledge_coverages:125,course_assignments:127},
    "cds525-deep-learning":{curriculum_chapters:6,curriculum_lessons:26,curriculum_coverages:90,materials:12,material_segments:790,material_knowledge_coverages:90,course_assignments:97}
  };
  const courses=await rows(client,"courses","id",COURSE_IDS);if(courses.length!==2)return false;
  for(const courseId of COURSE_IDS)for(const [table,wanted] of Object.entries(expected[courseId])){
    const result=await client.from(table).select("*",{count:"exact",head:true}).eq("course_id",courseId);if(result.error)throw new Error(`${table} count failed: ${result.error.message}`);if(result.count!==wanted)return false;
  }
  const native=await rows(client,"micro_learning_paths","id",["aiad-rt01-agent-loop","cds525-k012-learning-rate","cds525-k021-cooccurrence-matrix"]);
  if(native.length!==3)return false;
  for(const courseId of COURSE_IDS)if(await localDefinitionFingerprint(client,courseId)!==FINALIZED_FINGERPRINTS[courseId])return false;
  return true;
}
async function replaceDefinitionsAtomically(client:SupabaseClient,runtimes:CourseRuntime[]){
  await ensureNoLocalLearnerData(client);
  const [knowledge,micro]=await Promise.all([
    fetchJson<{graph:{nodes:Row[];revisions:Row[];edges:Row[]}}>(`${remoteBase()}/api/knowledge`),
    fetchJson<{paths:Array<Row&{id:string;courseId?:string;units:Array<Row&{id:string;steps:Row[]}>}>}>(`${remoteBase()}/api/micro`)
  ]);
  const courseNodeIds=new Set(runtimes.flatMap((runtime)=>[...runtime.curriculumCoverages,...runtime.assignmentCoverages,...runtime.materialKnowledgeCoverages].map((item)=>String(item.nodeId))));
  const nodes=knowledge.graph.nodes.filter((node)=>courseNodeIds.has(String(node.id)));
  if(nodes.length!==courseNodeIds.size)throw new Error(`Hosted Knowledge API returned ${nodes.length}/${courseNodeIds.size} required nodes`);
  const visibleRevisions=knowledge.graph.revisions.filter((revision)=>courseNodeIds.has(String(revision.nodeId)));const revisionById=new Map(visibleRevisions.map((revision)=>[String(revision.id),revision]));
  const nodeRows=nodes.map((node)=>({id:node.id,title:node.title,description:node.description,node_type:node.type,mastery_criteria:node.masteryCriteria,scope:node.scope,owner_id:node.ownerId??null,provenance:node.provenance,current_revision_id:node.currentRevisionId,status:node.status,superseded_by:node.supersededBy??null,split_from:node.splitFrom??null,merged_from:node.mergedFrom??null,tags:node.tags??null,metadata:node.metadata??null,created_at:node.createdAt,updated_at:node.updatedAt}));
  const revisionRows=nodes.map((node)=>revisionById.get(String(node.currentRevisionId))??({id:node.currentRevisionId,nodeId:node.id,version:Number(String(node.currentRevisionId).match(/-r(\d+)$/)?.[1]??1),title:node.title,description:node.description,type:node.type,masteryCriteria:node.masteryCriteria,createdAt:node.updatedAt})).map((revision)=>({id:revision.id,node_id:revision.nodeId,version:revision.version,title:revision.title,description:revision.description,node_type:revision.type,mastery_criteria:revision.masteryCriteria,created_by:revision.createdBy??null,created_at:revision.createdAt,previous_revision_id:revision.previousRevisionId??null,change_reason:revision.changeReason??null}));
  const edgeRows=knowledge.graph.edges.filter((edge)=>courseNodeIds.has(String(edge.source))&&courseNodeIds.has(String(edge.target))).map((edge)=>({id:edge.id,source_node_id:edge.source,target_node_id:edge.target,relation:edge.relation,reason:edge.reason,prerequisite_strength:edge.relation==="prerequisite"?edge.strength:null,associative_strength:edge.relation==="prerequisite"?null:edge.strength,provenance:edge.provenance,lifecycle_status:"active"}));
  const courseRows=runtimes.map((runtime)=>({id:runtime.course.id,title:runtime.course.title,subtitle:runtime.course.subtitle??null,description:runtime.course.description,accent_color:runtime.course.accentColor??null,revision:runtime.revision,created_at:runtime.course.createdAt,updated_at:runtime.course.updatedAt,generation_status:runtime.course.generationStatus,target_outcome:runtime.course.targetOutcome??null,lifecycle:runtime.course.lifecycle,course_type:runtime.course.courseType??"standard",owner_user_id:null,source_course_id:runtime.course.sourceCourseId??null,creator_metadata:runtime.course.creatorMetadata??null}));
  const curricula=runtimes.map((runtime)=>({course_id:runtime.course.id,id:runtime.curriculum.id,generation_mode:runtime.curriculum.generationMode,requested_chapter_count:runtime.curriculum.requestedChapterCount??null,source_structure_id:runtime.curriculum.sourceStructureId??null}));
  const chapters=runtimes.flatMap((runtime)=>runtime.chapters.map((item)=>({course_id:runtime.course.id,id:item.id,title:item.title,description:item.description,display_order:item.order,color:item.color,outcome:item.outcome})));
  const lessons=runtimes.flatMap((runtime)=>runtime.lessons.map((item)=>({course_id:runtime.course.id,id:item.id,chapter_id:item.chapterId,title:item.title,display_order:item.order})));
  const coverages=runtimes.flatMap((runtime)=>runtime.curriculumCoverages.map((item)=>({course_id:runtime.course.id,id:item.id,lesson_id:item.lessonId,node_id:item.nodeId,role:item.role,display_order:item.order})));
  const sequences=runtimes.flatMap((runtime)=>runtime.curriculumSequences.map((item)=>({course_id:runtime.course.id,id:item.id,source_lesson_id:item.sourceLessonId,target_lesson_id:item.targetLessonId})));
  const assignments=runtimes.flatMap((runtime)=>runtime.assignments.map((item)=>({course_id:runtime.course.id,id:item.id,display_order:item.order,title:item.title,description:item.description,requirements:item.requirements,expected_output:item.expectedOutput,acceptance_criteria:item.acceptanceCriteria,mode:item.mode,workflow_template_id:item.workflowTemplateId??null,estimated_minutes:item.estimatedMinutes??null,project_contribution:item.projectContribution??null,experience:item.experience??null,inherited_outputs:item.inheritedOutputs??[],dependency_rationale:item.dependencyRationale??null})));
  const assignmentCoverages=runtimes.flatMap((runtime)=>runtime.assignmentCoverages.map((item)=>({course_id:runtime.course.id,id:item.id,assignment_id:item.assignmentId,node_id:item.nodeId,role:item.role,required:item.required??false})));
  const dependencies=runtimes.flatMap((runtime)=>runtime.assignmentDependencies.map((item)=>({course_id:runtime.course.id,id:item.id,source_assignment_id:item.sourceAssignmentId,target_assignment_id:item.targetAssignmentId,strength:item.strength})));
  const outcomes=runtimes.flatMap((runtime)=>runtime.chapterOutcomes.map((item)=>({course_id:runtime.course.id,id:item.id,chapter_id:item.chapterId,title:item.title})));
  const assignmentOutcomes=runtimes.flatMap((runtime)=>runtime.assignmentOutcomeCompositions.map((item)=>({course_id:runtime.course.id,id:item.id,assignment_id:item.assignmentId,outcome_id:item.outcomeId})));
  const finalProjects=runtimes.flatMap((runtime)=>runtime.finalProjects.map((item)=>({course_id:runtime.course.id,id:item.id,title:item.title,description:item.description})));
  const finalOutcomes=runtimes.flatMap((runtime)=>runtime.finalProjectOutcomeCompositions.map((item)=>({course_id:runtime.course.id,id:item.id,final_project_id:item.finalProjectId,outcome_id:item.outcomeId})));
  const materialRows=runtimes.flatMap((runtime)=>{const lessonOrder=new Map(runtime.lessons.map((lesson)=>[String(lesson.id),Number(lesson.order)]));return [...runtime.materials].sort((left,right)=>(lessonOrder.get(String(left.lessonId))??Number.MAX_SAFE_INTEGER)-(lessonOrder.get(String(right.lessonId))??Number.MAX_SAFE_INTEGER)||Number(left.order)-Number(right.order)||left.id.localeCompare(right.id)).map((item,order)=>({course_id:runtime.course.id,id:item.id,display_order:order,title:item.title,description:item.description??null,material_type:item.type,storage_path:item.storagePath??null,page_count:item.source?.pageCount??null,duration:item.duration??null}));});
  const segments=runtimes.flatMap((runtime)=>runtime.materials.flatMap((material)=>material.segments.map((item)=>({course_id:runtime.course.id,material_id:material.id,id:item.id,display_order:item.order,page:item.page??null,title:item.title??null,section:item.section??null,content:item.content??null}))));
  const materialCoverages=runtimes.flatMap((runtime)=>runtime.materialKnowledgeCoverages.map((item)=>({course_id:runtime.course.id,id:item.id,material_id:item.materialId,segment_id:item.segmentId,node_id:item.nodeId,role:item.role})));
  const targets=runtimes.flatMap((runtime)=>(runtime.targetKnowledge??[]).map((item)=>({course_id:runtime.course.id,knowledge_id:item.nodeId,required:item.required})));
  const paths=micro.paths.filter((path)=>COURSE_IDS.includes(path.courseId as typeof COURSE_IDS[number]));
  const microPaths=paths.map((path)=>({id:path.id,knowledge_id:path.knowledgeId,course_id:path.courseId,scope:path.scope,title:path.title,description:path.description??null,mode:path.mode,estimated_minutes:path.estimatedMinutes,required:path.required,status:path.status}));
  const units=paths.flatMap((path)=>path.units.map((unit)=>({id:unit.id,path_id:path.id,title:unit.title,description:unit.description??null,position:unit.position,estimated_minutes:unit.estimatedMinutes,required:unit.required})));
  const steps=paths.flatMap((path)=>path.units.flatMap((unit)=>unit.steps.map((step,position)=>({id:step.id,unit_id:unit.id,position,kind:step.kind,title:step.title,content:step.body,interaction:step.interaction??null,success_feedback:step.successFeedback??null,retry_feedback:step.retryFeedback??null,transition:step.transition??null}))));
  const statements=[
    "begin;","set constraints all deferred;",`delete from public.courses where id in (${COURSE_IDS.map(sqlLiteral).join(",")});`,
    insertSql("knowledge_nodes",nodeRows,"on conflict(id) do update set title=excluded.title,description=excluded.description,node_type=excluded.node_type,mastery_criteria=excluded.mastery_criteria,scope=excluded.scope,owner_id=excluded.owner_id,provenance=excluded.provenance,current_revision_id=excluded.current_revision_id,status=excluded.status,superseded_by=excluded.superseded_by,split_from=excluded.split_from,merged_from=excluded.merged_from,tags=excluded.tags,metadata=excluded.metadata,updated_at=excluded.updated_at"),
    insertSql("knowledge_node_revisions",revisionRows,"on conflict(id) do update set node_id=excluded.node_id,version=excluded.version,title=excluded.title,description=excluded.description,node_type=excluded.node_type,mastery_criteria=excluded.mastery_criteria,created_by=excluded.created_by,created_at=excluded.created_at,previous_revision_id=excluded.previous_revision_id,change_reason=excluded.change_reason"),
    insertSql("knowledge_edges",edgeRows,"on conflict(id) do update set source_node_id=excluded.source_node_id,target_node_id=excluded.target_node_id,relation=excluded.relation,reason=excluded.reason,prerequisite_strength=excluded.prerequisite_strength,associative_strength=excluded.associative_strength,provenance=excluded.provenance,lifecycle_status=excluded.lifecycle_status"),
    insertSql("courses",courseRows),insertSql("course_curricula",curricula),insertSql("curriculum_chapters",chapters),insertSql("curriculum_lessons",lessons),insertSql("curriculum_coverages",coverages),insertSql("curriculum_sequences",sequences),insertSql("course_assignments",assignments),insertSql("assignment_coverages",assignmentCoverages),insertSql("assignment_dependencies",dependencies),insertSql("chapter_outcomes",outcomes),insertSql("assignment_outcome_compositions",assignmentOutcomes),insertSql("final_projects",finalProjects),insertSql("final_project_outcome_compositions",finalOutcomes),insertSql("materials",materialRows),insertSql("material_segments",segments),insertSql("material_knowledge_coverages",materialCoverages),insertSql("course_target_knowledge",targets),insertSql("micro_learning_paths",microPaths),insertSql("micro_units",units),insertSql("micro_steps",steps),"commit;"
  ].filter(Boolean).join("\n");
  runLocalSql(statements,"Atomic Course definition replacement");
}
async function finalizeGoldContent(){
  // Migrations run before seed.sql on a clean reset. Replay guarded, idempotent
  // content migrations after the Course fixtures exist so local reset + sync
  // produces the same Golden H5P regression content as an upgraded database.
  for(const file of ["supabase/migrations/20260820151000_sync_golden_micro_interactive.sql","supabase/migrations/20260905020000_agent_book_primary_material.sql","supabase/migrations/20260905030000_native_micro_primitives.sql","supabase/migrations/20260905083836_micro_learning_v2.sql","supabase/migrations/20260905092253_cds_h5p_geometry_v2.sql","supabase/migrations/20260905162819_micro_v2_teaching_content.sql"]){runLocalSql(await readFile(file,"utf8"),`Finalize ${file}`);}
  runLocalSql("update public.course_assignments set experience=jsonb_build_object('type','trace','knowledgeNodeId','R10','faultyStepId','skip-observation','traceSteps',jsonb_build_array(jsonb_build_object('id','observe','label','Observe user goal','status','ok'),jsonb_build_object('id','act','label','Call search tool','status','ok'),jsonb_build_object('id','skip-observation','label','Generate final answer before reading tool result','status','error'),jsonb_build_object('id','verify','label','Verify evidence','status','warning'))) where course_id='ai-agents-in-depth' and id='book-v1-node-r10';","Finalize Agent Assignment evaluator");
}
async function ensureH5PFixtures(client: SupabaseClient) {
  const cdsId="cds525-h5p-k001-rule-vs-learning";
  const cds=await client.from("h5p_contents").select("status,package_sha256").eq("id",cdsId).maybeSingle();
  if(cds.error)throw new Error(`CDS H5P metadata: ${cds.error.message}`);
  if(cds.data?.status!=="published"||!cds.data.package_sha256){
    const output=await mkdtemp(join(tmpdir(),"eduflow-cds-h5p-"));
    try { runNodeScript(["scripts/build-cds525-h5p.ts",output],"Build CDS H5P package"); runNodeScript(["scripts/import-h5p.ts","--content-id",cdsId,"--package",join(output,`${cdsId}.h5p`)],"Import CDS H5P package"); }
    finally { await rm(output,{recursive:true,force:true}); }
  }
  const ids = ["golden-h5p-agent-drag-words", "golden-h5p-agent-fill-blanks", "golden-h5p-workflow-drag-drop", "golden-h5p-recovery-question-set"];
  const result = await client.from("h5p_contents").select("id,status,package_sha256").in("id", ids);
  if (result.error) throw new Error(`Golden H5P metadata read failed: ${result.error.message}`);
  if (result.data?.length === ids.length && result.data.every((row) => row.status === "published" && row.package_sha256)) {
    console.log("SKIP Golden H5P packages already published");
    return;
  }
  const output = await mkdtemp(join(tmpdir(), "eduflow-golden-h5p-"));
  try {
    runNodeScript(["scripts/build-golden-h5p.ts", output], "Build Golden H5P packages");
    for (const id of ids) runNodeScript(["scripts/import-h5p.ts", "--content-id", id, "--package", join(output, `${id}.h5p`)], `Import ${id}`);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}
async function syncAssets(client: SupabaseClient, assets: Array<{ asset: Asset; bytes: Uint8Array }>) {
  for (const { asset, bytes } of assets) {
    const existing = await client.storage.from("course-materials").download(asset.path);
    if (!existing.error && existing.data) {
      const current = new Uint8Array(await existing.data.arrayBuffer());
      if (sha256(current) !== asset.sha256) throw new Error(`${asset.path} exists locally with a different SHA-256`);
      console.log(`SKIP ${asset.path} ${asset.sha256}`);
      continue;
    }
    const upload = await client.storage.from("course-materials").upload(asset.path, bytes, { contentType: "application/pdf", upsert: false });
    if (upload.error) throw new Error(`Upload ${asset.path}: ${upload.error.message}`);
    console.log(`UPLOAD ${asset.path} ${asset.sha256}`);
  }
}
async function main() {
  const mode = process.argv[2];
  if (!['inspect', 'apply','fingerprint'].includes(mode)) throw new Error("Usage: sync-gold-courses.ts inspect|apply|fingerprint");
  if(mode==='fingerprint'){const client=localClient();console.log(JSON.stringify(Object.fromEntries(await Promise.all(COURSE_IDS.map(async(courseId)=>[courseId,await localDefinitionFingerprint(client,courseId)]))),null,2));return;}
  const runtimes = await fetchRuntimes();
  const collected = await collect(runtimes);
  if (mode === "inspect") { console.log(JSON.stringify(collected.manifest, null, 2)); return; }
  const expected = JSON.parse(await readFile("scripts/dev/gold-course-sync.manifest.json", "utf8")) as Manifest;
  if (stable(expected) !== stable(collected.manifest)) throw new Error("Hosted definitions/assets do not match the reviewed sync manifest");
  const client = localClient();
  if(await definitionsAreFinalized(client))console.log("SKIP target Course definitions already finalized");
  else await replaceDefinitionsAtomically(client, runtimes);
  await syncAssets(client, collected.assets);
  await finalizeGoldContent();
  await ensureH5PFixtures(client);
  console.log(JSON.stringify({ status: "PASS", courses: COURSE_IDS, assets: collected.assets.length }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
