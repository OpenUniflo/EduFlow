import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { microV2References } from "../src/demo/learning/microV2References";
import { validateNativeMicroInteraction } from "../src/shared/learning/nativeMicroInteraction";
import { assertLocalSupabaseUrl } from "./local-supabase";
assertLocalSupabaseUrl(process.env.SUPABASE_URL ?? "");
const sql=(query:string)=>{const result=spawnSync("docker",["exec","-i","supabase_db_EduFlow","psql","-U","postgres","-d","postgres","-tA","-v","ON_ERROR_STOP=1"],{input:query,encoding:"utf8",maxBuffer:10*1024*1024});if(result.status!==0)throw new Error(result.stderr);return result.stdout.trim();};
const encode=(value:unknown)=>`'${JSON.stringify(value).replace(/'/g,"''")}'::jsonb`;
const valid=microV2References.flatMap((path)=>path.units.flatMap((unit)=>unit.steps.flatMap((step)=>step.interaction&&step.interaction.type!=="h5p"?[step.interaction]:[])));
const flow=valid.find((item)=>item.type==="flow-execution")!;
const simulation=valid.find((item)=>item.type==="simulation")!;
const matrix=valid.find((item)=>item.type==="data-transform")!;
const cases:unknown[]=[...valid,{}, {type:"flow-execution",mode:"explore"}, {...flow,nodes:[{id:2,label:3,x:0,y:0}]}, {...flow,events:[{nodeId:"user",title:2,message:"x",explanation:"x"}]}, {...flow,nodes:flow.type==="flow-execution"?flow.nodes.map((node)=>({...node,label:"x".repeat(2001)})):[]}, {...simulation,parameter:null}, {...simulation,model:{kind:"quadratic-descent",curvature:100,optimum:0,initial:4,steps:60},parameter:{label:"eta",min:0,max:10,step:1,initial:1}}, {...matrix,window:1.5}, {...matrix,corpus:[["unknown","token"]]}];
for(const [index,item] of cases.entries()){
  const expected=validateNativeMicroInteraction(item as never).length===0;
  const actual=sql(`select coalesce(validate_micro_interaction(${encode(item)}),false);`)==="t";
  if(actual!==expected)throw new Error(`TS/SQL validation parity failed case ${index}: expected ${expected}, got ${actual}`);
}
if(sql(`select validate_micro_interaction('{"type":"simulation","mode":"explore","parameter":{"label":"eta","min":0,"max":1,"step":0.1,"initial":0.1},"model":{"kind":"quadratic-descent","curvature":2,"optimum":0,"initial":4,"steps":12},"target":{"maxLoss":1e1000,"maxGrowth":1}}');`)!=="f")throw new Error("SQL accepted a nonfinite JS number");
const ids=microV2References.map((path)=>`'${path.id}'`).join(",");
const fingerprint=()=>sql(`select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text,'')) from micro_steps s join micro_units u on u.id=s.unit_id where u.path_id in (${ids});`);
const before=fingerprint();
sql(await readFile("supabase/migrations/20260905083836_micro_learning_v2.sql","utf8"));
if(before!==fingerprint())throw new Error("Reference replay changed persisted definitions");
console.log(`Micro V2 Local verifier: ${cases.length+1} TS/SQL parity probes and idempotent four-reference replay passed.`);

const h5pFingerprint=()=>sql("select md5(to_jsonb(h)::text) from h5p_contents h where id='cds525-h5p-k001-rule-vs-learning';");
const beforeH5p=h5pFingerprint();sql(await readFile("supabase/migrations/20260905092253_cds_h5p_geometry_v2.sql","utf8"));if(beforeH5p!==h5pFingerprint())throw new Error("H5P revision replay changed imported metadata");console.log("H5P revision/checksum replay stability passed.");
