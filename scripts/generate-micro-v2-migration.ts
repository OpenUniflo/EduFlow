import { readFile, writeFile } from "node:fs/promises";
import { microV2References } from "../src/demo/learning/microV2References";
import { validateNativeMicroInteraction } from "../src/shared/learning/nativeMicroInteraction";
const target = process.argv[2];
if (!target) throw new Error("Supply the CLI-created migration path.");
const literal = (value: unknown) => value == null ? "null" : typeof value === "number" || typeof value === "boolean" ? String(value) : `'${String(value).replace(/'/g,"''")}'`;
const json = (value: unknown) => value == null ? "null" : `${literal(JSON.stringify(value,null,2))}::jsonb`;
const prior = await readFile("supabase/migrations/20260905030000_native_micro_primitives.sql", "utf8");
const legacy = prior.slice(0, prior.indexOf("$$;") + 3).replace("public.validate_micro_interaction(candidate", "public.validate_micro_interaction_v1(candidate");
const validator = await readFile("scripts/micro-v2-validator.sql", "utf8");
const statements = [legacy, validator, "do $$ begin", "if not exists(select 1 from courses where id='ai-agents-in-depth') or not exists(select 1 from courses where id='cds525-deep-learning') then return; end if;"];
for (const path of microV2References) {
  statements.push(`insert into micro_learning_paths(id,knowledge_id,course_id,scope,title,description,mode,estimated_minutes,required,status,revision) values(${[path.id,path.knowledgeId,path.courseId,path.scope,path.title,path.description,path.mode,path.estimatedMinutes,path.required,path.status,2].map(literal).join(",")}) on conflict(id) do update set title=excluded.title,description=excluded.description,estimated_minutes=excluded.estimated_minutes,revision=excluded.revision;`);
  for (const unit of path.units) {
    statements.push(`insert into micro_units(id,path_id,title,position,estimated_minutes,required) values(${[unit.id,path.id,unit.title,unit.position,unit.estimatedMinutes,unit.required].map(literal).join(",")}) on conflict(id) do update set title=excluded.title,estimated_minutes=excluded.estimated_minutes;`);
    statements.push(`update micro_steps set position=position+1000 where unit_id=${literal(unit.id)} and id in (${unit.steps.map((step)=>literal(step.id)).join(",")});`);
    for (const [position, step] of unit.steps.entries()) {
      if (step.interaction && step.interaction.type !== "h5p" && validateNativeMicroInteraction(step.interaction).length) throw new Error(`Invalid reference ${step.id}`);
      statements.push(`insert into micro_steps(id,unit_id,position,kind,title,content,interaction,success_feedback,retry_feedback) values(${[step.id,unit.id,position,step.kind,step.title,step.body].map(literal).join(",")},${json(step.interaction)},${literal(step.successFeedback)},${literal(step.retryFeedback)}) on conflict(id) do update set position=excluded.position,kind=excluded.kind,title=excluded.title,content=excluded.content,interaction=excluded.interaction,success_feedback=excluded.success_feedback,retry_feedback=excluded.retry_feedback;`);
    }
  }
}
statements.push(`update micro_steps set title='规则还是学习：动手分类',content='把卡片拖到明确规则或从数据学习区域，完成后检查。',interaction='{"type":"h5p","contentRef":"cds525-h5p-k001-rule-vs-learning","adapter":"h5p-standalone","completionPolicy":"passed"}'::jsonb where id='cds525-k001-rule-vs-learning-step-h5p';`);
statements.push("end $$;");
await writeFile(target, statements.join("\n\n") + "\n");
console.log(`Generated ${microV2References.length} reference paths in ${target}.`);
