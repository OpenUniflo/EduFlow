/** Read-only audit of a Hosted SQL export; never initializes or adopts a route. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {planCourseRoute,type CapabilityRelation,type CourseKnowledgeOrder,type RoutePrerequisite} from '../../src/shared/learning/routePlanning';
import {routeRelations} from '../../src/shared/learning/routePresentation';
type Route={id:string;version:number;includeNodeIds:string[];excludeNodeIds:string[];currentNodeIds:string[]};
type Input={nodes:string[];edges:CapabilityRelation[];courses:{id:string;order:CourseKnowledgeOrder[];routes:Route[]}[]};
const raw=readFileSync(process.argv[2],'utf8');
const input=JSON.parse(raw) as Input;
const facts=new Map(input.edges.map(edge=>[edge.id,edge]));
const courses=input.courses.map(course=>{
 const scenarios=[{id:'default-unacquired',version:null,includeNodeIds:[],excludeNodeIds:[],currentNodeIds:[]},...course.routes];
 return {courseId:course.id,coverageCount:course.order.length,scenarios:scenarios.map(scenario=>{
  const plan=planCourseRoute({nodeIds:input.nodes,prerequisiteEdges:input.edges.filter(edge=>edge.relation==='prerequisite') as RoutePrerequisite[],enablesEdges:input.edges.filter(edge=>edge.relation==='enables'),currentNodeIds:scenario.currentNodeIds,courseOrder:course.order},scenario);
  if(!plan.valid)return {id:scenario.id,version:scenario.version,valid:false,conflicts:plan.conflicts,renderedEdges:0};
  const edges=routeRelations(plan.route,input.edges);
  for(const edge of edges){const fact=facts.get(edge.id);assert.ok(fact,`Missing ${edge.id}`);assert.deepEqual({source:edge.source,target:edge.target,relation:edge.relation,strength:edge.strength},{source:fact.source,target:fact.target,relation:fact.relation,strength:fact.strength});assert.ok(plan.route.selectedNodeIds.includes(edge.source)&&plan.route.selectedNodeIds.includes(edge.target));}
  assert.equal(new Set(edges.map(edge=>edge.id)).size,edges.length);
  const expectedEnables=input.edges.filter(edge=>edge.relation==='enables'&&plan.route.selectedNodeIds.includes(edge.source)&&plan.route.selectedNodeIds.includes(edge.target)).map(edge=>edge.id).sort();
  assert.deepEqual(edges.filter(edge=>edge.relation==='enables').map(edge=>edge.id).sort(),expectedEnables);
  return {id:scenario.id,version:scenario.version,valid:true,nodes:plan.route.selectedNodeIds.length,prerequisite:edges.filter(edge=>edge.relation==='prerequisite').length,enables:expectedEnables.length,edgeIds:edges.map(edge=>edge.id),mismatches:0};
 })};
});
const report={implementationCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),inputSha256:createHash('sha256').update(raw).digest('hex'),checkedAt:new Date().toISOString(),project:'uyljtdbvlivxniililay',method:'Current pure planCourseRoute + production routeRelations over Hosted active facts; all published courses and every existing active route constraint/state. No route writes. This audits factual topology, not user visibility permissions.',courseCount:courses.length,activeRouteCount:input.courses.reduce((n,c)=>n+c.routes.length,0),factCount:facts.size,courses};
writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({courseCount:report.courseCount,activeRouteCount:report.activeRouteCount,validScenarios:courses.flatMap(c=>c.scenarios).filter(s=>s.valid).length,conflictScenarios:courses.flatMap(c=>c.scenarios).filter(s=>!s.valid).length,mismatches:0}));
