import { readFile, writeFile } from "node:fs/promises";
import { decodeLearningContent } from "../../src/shared/content/richText.js";
import { validateNativeMicroInteraction } from "../../src/shared/learning/nativeMicroInteraction.js";
import type { MicroInteraction } from "../../src/features/learning/micro/microLearning.js";

// Offline, reviewed content input. No application import and no database write.
const paths = JSON.parse(await readFile("data/gold-courses/ai-agents-in-depth-rich-content.json", "utf8")) as Array<{id:string;knowledgeId:string;fromRevision:number;revision:number;units:Array<{id:string;position:number;steps:Array<{id:string;position:number;kind:string;title:string;content:unknown;interaction:MicroInteraction|null;success_feedback:unknown;retry_feedback:unknown}>}>}>;
const target = process.argv[2];
if (!target?.startsWith("supabase/migrations/") || !target.endsWith(".sql")) throw Error("Supply the CLI-created migration path");
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
const content = (value: unknown) => {
  if(value == null) return "null";
  const parsed = decodeLearningContent(value);
  if (!parsed || typeof parsed === "string") throw Error("Expected reviewed Tiptap JSON");
  return quote(JSON.stringify(parsed));
};
const sql = ["-- Reviewed Agent Course content only. Stable identities; no schema or learner writes.", "begin;", "do $$ begin", "if not exists(select 1 from courses where id='ai-agents-in-depth') then return; end if;",
  `if (select count(*) from micro_learning_paths where course_id='ai-agents-in-depth' and status='published')<>${paths.length} then raise exception 'Published Path set changed; re-audit'; end if;`];
for(const path of paths) {
  if(path.revision!==path.fromRevision+1) throw Error("Expected forward revision");
  const identity=`id=${quote(path.id)} and course_id='ai-agents-in-depth' and knowledge_id=${quote(path.knowledgeId)} and status='published'`;
  sql.push(`if not exists(select 1 from micro_learning_paths where ${identity} and revision in (${path.fromRevision},${path.revision})) then raise exception 'Path revision/identity changed'; end if;`);
  sql.push(`if (select count(*) from micro_units where path_id=${quote(path.id)})<>${path.units.length} then raise exception 'Unit set changed'; end if;`);
  for(const unit of path.units) {
    sql.push(`if not exists(select 1 from micro_units where id=${quote(unit.id)} and path_id=${quote(path.id)} and position=${unit.position}) or (select count(*) from micro_steps where unit_id=${quote(unit.id)})<>${unit.steps.length} then raise exception 'Unit identity/Step set changed'; end if;`);
    for(const step of unit.steps) {
      if(step.interaction && (step.interaction.type==='h5p' || validateNativeMicroInteraction(step.interaction).length)) throw Error(`Invalid interaction ${step.id}`);
      const fields={kind:quote(step.kind),title:quote(step.title),content:content(step.content),interaction:step.interaction?`${quote(JSON.stringify(step.interaction))}::jsonb`:"null",success_feedback:content(step.success_feedback),retry_feedback:content(step.retry_feedback)};
      const where=`id=${quote(step.id)} and unit_id=${quote(unit.id)} and position=${step.position}`;
      sql.push(`if not exists(select 1 from micro_steps where ${where}) then raise exception 'Step identity/order changed'; end if;`);
      sql.push(`if exists(select 1 from micro_learning_paths where ${identity} and revision=${path.fromRevision}) then`, `update micro_steps set ${Object.entries(fields).map(([k,v])=>`${k}=${v}`).join(",")} where ${where};`, "end if;");
      sql.push(`if not exists(select 1 from micro_steps where ${where} and ${Object.entries(fields).map(([k,v])=>`${k} is not distinct from ${v}`).join(" and ")}) then raise exception 'Revised content differs; do not overwrite newer edits'; end if;`);
    }
  }
  sql.push(`update micro_learning_paths set revision=${path.revision} where ${identity} and revision=${path.fromRevision};`);
}
sql.push("end $$;", "commit;");
await writeFile(target,sql.join("\n")+"\n");
console.log(`Generated ${paths.length} Paths / ${paths.flatMap(p=>p.units.flatMap(u=>u.steps)).length} Steps; precise forward revisions.`);
