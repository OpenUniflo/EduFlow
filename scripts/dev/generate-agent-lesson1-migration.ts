import { readFile, writeFile } from "node:fs/promises";
import type { MicroLearningPath } from "../../src/features/learning/micro/microLearning";
import { validateNativeMicroInteraction } from "../../src/shared/learning/nativeMicroInteraction";

// Offline content tooling only. The application reads the generated data through /api/micro.
const source = "data/gold-courses/ai-agents-in-depth-lesson1.json";
const target = process.argv[2];
if (!target || !process.argv.includes("--content-only")) throw new Error("Supply a CLI-created migration path and --content-only.");
type AuthoredPath = MicroLearningPath & { primarySourceSegment: string; supportingSourceSegments: string[] };
const paths = JSON.parse(await readFile(source, "utf8")) as AuthoredPath[];
const literal = (value: unknown): string => value == null ? "null" : typeof value === "number" || typeof value === "boolean" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
const json = (value: unknown) => value == null ? "null" : `${literal(JSON.stringify(value, null, 2))}::jsonb`;
const course = "ai-agents-in-depth", material = "ai-agents-in-depth-book";
const ids = paths.map((path) => path.knowledgeId);
if (ids.length !== 10 || new Set(ids).size !== 10 || paths.some((path) => path.courseId !== course || path.scope !== "course" || path.status !== "published" || path.mode !== "learn")) throw new Error("Expected the ten reviewed Lesson 1 Course Learn paths.");
const sql = ["-- Generated Lesson 1 teaching content. No schema, Knowledge, curriculum order, Assignment or learner-state changes.", "begin;", "do $$ begin", `if not exists(select 1 from courses where id=${literal(course)}) then return; end if;`,
  `if (select array_agg(node_id order by display_order) from curriculum_coverages where course_id=${literal(course)} and lesson_id='aiad-lesson-01') is distinct from array[${ids.map(literal).join(",")}]::text[] then raise exception 'Lesson 1 identity/order changed; re-audit before rollout'; end if;`];
// Forward revisions update existing definitions only. Never replay initial publication to revise a live Path.
if (process.argv.includes("--revise-existing")) {
  const selected = process.argv.find((arg) => arg.startsWith("--knowledge="))?.slice(12).split(",") ?? [];
  const revision = Number(process.argv.find((arg) => arg.startsWith("--revision="))?.slice(11));
  if (!Number.isInteger(revision) || revision < 2 || !selected.length || new Set(selected).size !== selected.length || selected.some((id) => !ids.includes(id))) throw new Error("Provide unique existing --knowledge= IDs and a forward --revision= integer.");
  for (const path of paths.filter((item) => selected.includes(item.knowledgeId))) {
    sql.push(`if not exists(select 1 from micro_learning_paths where id=${literal(path.id)} and course_id=${literal(course)} and knowledge_id=${literal(path.knowledgeId)} and revision in (${revision - 1},${revision})) then raise exception 'Path identity/revision mismatch; re-audit before rollout'; end if;`);
    for (const unit of path.units) for (const [position, step] of unit.steps.entries()) {
      if (step.interaction && (step.interaction.type === "h5p" || validateNativeMicroInteraction(step.interaction).length)) throw new Error(`Invalid revised Step ${step.id}`);
      sql.push(`update micro_steps set kind=${literal(step.kind)},title=${literal(step.title)},content=${literal(step.body)},interaction=${json(step.interaction)},success_feedback=${literal(step.successFeedback)},retry_feedback=${literal(step.retryFeedback)} where id=${literal(step.id)} and unit_id=${literal(unit.id)} and position=${position} and exists(select 1 from micro_units where id=${literal(unit.id)} and path_id=${literal(path.id)} and position=${unit.position});`);
      sql.push("if not found then raise exception 'Step identity/ownership/order mismatch'; end if;");
    }
    sql.push(`update micro_learning_paths set revision=${revision} where id=${literal(path.id)} and revision=${revision - 1};`);
  }
  sql.push("end $$;", "commit;");
  await writeFile(target, sql.join("\n\n") + "\n");
  console.log(`Generated existing-Path revision ${revision} for ${selected.length} Paths.`);
  process.exit(0);
}
for (const path of paths) {
  if (process.argv.includes("--navigation-only")) {
    for (const unit of path.units) for (const step of unit.steps.filter((item) => item.kind === "summary")) {
      sql.push(`update micro_steps set content=${literal(step.body)} where id=${literal(step.id)} and unit_id=${literal(unit.id)} and exists(select 1 from micro_units u join micro_learning_paths p on p.id=u.path_id where u.id=${literal(unit.id)} and p.id=${literal(path.id)} and p.course_id=${literal(course)} and p.knowledge_id=${literal(path.knowledgeId)});`);
      sql.push("if not found then raise exception 'Reviewed Summary identity missing; re-audit before rollout'; end if;");
    }
    continue;
  }
  sql.push(`if not exists(select 1 from knowledge_nodes where id=${literal(path.knowledgeId)} and status='active') then raise exception 'Inactive reviewed Knowledge'; end if;`);
  sql.push(`if exists(select 1 from micro_learning_paths where id=${literal(path.id)} and (course_id is distinct from ${literal(course)} or knowledge_id<>${literal(path.knowledgeId)})) then raise exception 'Micro Path identity conflict'; end if;`);
  sql.push(`insert into micro_learning_paths(id,knowledge_id,course_id,scope,title,description,mode,estimated_minutes,required,status,revision) values(${[path.id,path.knowledgeId,course,path.scope,path.title,path.description,path.mode,path.estimatedMinutes,path.required,path.status,1].map(literal).join(",")}) on conflict(id) do update set title=excluded.title,description=excluded.description,estimated_minutes=excluded.estimated_minutes,status=excluded.status;`);
  for (const unit of path.units) {
    sql.push(`if exists(select 1 from micro_units where id=${literal(unit.id)} and (path_id<>${literal(path.id)} or position<>${unit.position})) then raise exception 'Micro Unit identity/order conflict'; end if;`);
    sql.push(`insert into micro_units(id,path_id,title,position,estimated_minutes,required) values(${[unit.id,path.id,unit.title,unit.position,unit.estimatedMinutes,unit.required].map(literal).join(",")}) on conflict(id) do update set title=excluded.title,estimated_minutes=excluded.estimated_minutes;`);
    for (const [position, step] of unit.steps.entries()) {
      if (step.interaction && (step.interaction.type === "h5p" || validateNativeMicroInteraction(step.interaction).length)) throw new Error(`Invalid Lesson 1 interaction ${step.id}`);
      sql.push(`if exists(select 1 from micro_steps where id=${literal(step.id)} and (unit_id<>${literal(unit.id)} or position<>${position})) then raise exception 'Micro Step identity/order conflict'; end if;`);
      sql.push(`insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values(${[step.id,unit.id,position,step.kind,step.title,step.body].map(literal).join(",")},${json(step.interaction)},${literal(step.successFeedback)},${literal(step.retryFeedback)}) on conflict(id) do update set kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;`);
    }
  }
  for (const segment of [path.primarySourceSegment, ...path.supportingSourceSegments]) {
    const mappingId = `book-audit-${path.knowledgeId}-${segment.replace("page-", "")}`;
    const role = segment === path.primarySourceSegment ? "introduce" : "explain";
    sql.push(`if exists(select 1 from material_knowledge_coverages where course_id=${literal(course)} and id=${literal(mappingId)} and (material_id<>${literal(material)} or segment_id<>${literal(segment)} or node_id<>${literal(path.knowledgeId)})) then raise exception 'Source mapping identity conflict'; end if;`);
    sql.push(`insert into material_knowledge_coverages(course_id,id,material_id,segment_id,node_id,role) values(${[course,mappingId,material,segment,path.knowledgeId,role].map(literal).join(",")}) on conflict(course_id,id) do update set role=excluded.role;`);
  }
}
sql.push("end $$;", "commit;");
await writeFile(target, sql.join("\n\n") + "\n");
console.log(`Generated ${paths.length} content-only Lesson 1 Paths with existing native validators.`);
