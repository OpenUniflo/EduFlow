import { describe, expect, it } from 'vitest';
import scenario from './fixtures/enterprise-project-v1.json';
import { buildCapabilityModel, planCourseRoute, routeStructure, type RoutePlanningInput } from '../../src/shared/learning/routePlanning';
import { computeNavigationPlan } from '../../api/_lib/navigationEngine';
const id=(key:string)=>scenario.nodes.find(n=>n.key===key)!.id;
const input=(actor:'A'|'B',t1=false):RoutePlanningInput=>({
 nodeIds:scenario.nodes.map(n=>n.id),currentNodeIds:[...scenario.states[actor],...(t1?['exposure']:[])].map(id),
 courseOrder:scenario.targets.map((key,coverageOrder)=>({nodeId:id(key),lessonOrder:0,coverageOrder})),
 prerequisiteEdges:scenario.relations.filter(r=>r[2]==='hard').map(([s,t])=>({id:`knowledge-prerequisite-${id(s)}-${id(t)}`,source:id(s),target:id(t),strength:'hard'})),
 enablesEdges:scenario.relations.filter(r=>r[2]==='enables').map(([s,t])=>({id:`knowledge-enables-${id(s)}-${id(t)}`,source:id(s),target:id(t),relation:'enables',strength:0.85})),
});
const plan=(data:RoutePlanningInput)=>{const p=planCourseRoute(data);if(!p.valid)throw new Error(JSON.stringify(p.conflicts));return p.route;};
const gray=(data:RoutePlanningInput)=>buildCapabilityModel(data).bridgeKnowledgeIds.filter(n=>!data.currentNodeIds.includes(n));
const nav=(data:RoutePlanningInput)=>{const route=plan(data);return computeNavigationPlan({courseId:scenario.courseId,nodes:route.orderedNodeIds.map((key,order)=>({id:key,title:key,lessonOrder:0,coverageOrder:order})),prerequisiteEdges:route.prerequisiteEdges,knowledgeStatuses:Object.fromEntries(data.currentNodeIds.map(n=>[n,'learned'])),targetNodeIds:route.effectiveTargetNodeIds,personalRoute:route,microPaths:[],completedMicroPathIds:[],assignments:[],assignmentOutcomes:{},materials:[]});};
describe('reviewed enterprise shared-graph acceptance',()=>{
 it('same four targets and empty constraints yield different A/B current gaps and necessary routes',()=>{
  const a=input('A'),b=input('B');const am=buildCapabilityModel(a),bm=buildCapabilityModel(b);
  expect(am.courseKnowledgeIds).toEqual(bm.courseKnowledgeIds);expect(am.courseKnowledgeIds).toHaveLength(4);
  expect(am.currentKnowledgeIds).toHaveLength(6);expect(bm.currentKnowledgeIds).toHaveLength(7);
  expect(gray(a)).toHaveLength(8);expect(gray(b)).toHaveLength(5);expect(plan(a).selectedNodeIds).not.toEqual(plan(b).selectedNodeIds);
  expect(nav(a).nextAction.nodeId).not.toEqual(nav(b).nextAction.nodeId);
  expect(am.disconnectedCourseKnowledgeIds).toEqual([]);expect(bm.disconnectedCourseKnowledgeIds).toEqual([]);
 });
 it('every gray is non-target, unacquired, factually root/acquired-supported and reaches an unfinished target',()=>{
  for(const data of [input('A'),input('B'),input('A',true)]){
   const model=buildCapabilityModel(data);const factual=[...data.prerequisiteEdges,...(data.enablesEdges??[])];
   const reachable=(roots:readonly string[])=>{const visited=new Set(roots),queue=[...roots];for(let i=0;i<queue.length;i++)for(const e of factual)if(e.source===queue[i]&&!visited.has(e.target)){visited.add(e.target);queue.push(e.target);}return visited;};
   const supported=reachable([...data.currentNodeIds,...data.nodeIds.filter(id=>!factual.some(edge=>edge.target===id))]);
   for(const node of gray(data)){expect(model.courseKnowledgeIds).not.toContain(node);expect(data.currentNodeIds).not.toContain(node);expect(supported.has(node)).toBe(true);expect(model.courseKnowledgeIds.some(t=>!data.currentNodeIds.includes(t)&&reachable([node]).has(t))).toBe(true);}
   expect(model.orderedNodeIds.every(n=>data.nodeIds.includes(n))).toBe(true);
   expect(model.supportEdges.every(e=>factual.some(f=>f.id===e.id))).toBe(true);
  }
 });
 it('A acquired exposure prunes historical net boundary and recomputes route/navigation without changing structure',()=>{
  const a=input('A'),next=input('A',true),b=input('B');const saved=JSON.stringify(plan(a)),beforeB=JSON.stringify(plan(b));
  expect(gray(a)).toContain(id('exposure'));expect(gray(next)).not.toContain(id('exposure'));expect(buildCapabilityModel(next).currentKnowledgeIds).toContain(id('exposure'));
  expect(buildCapabilityModel(next).orderedNodeIds).not.toContain(id('net'));expect(plan(a).selectedNodeIds).toHaveLength(13);expect(plan(next).selectedNodeIds).toHaveLength(12);
  expect(nav(a).path).not.toEqual(nav(next).path);expect(routeStructure(a,{includeNodeIds:[],excludeNodeIds:[]})).toEqual(routeStructure(next,{includeNodeIds:[],excludeNodeIds:[]}));
  expect(JSON.stringify(plan(a))).toEqual(saved);expect(JSON.stringify(plan(b))).toEqual(beforeB);
 });
 it('enables are support rather than hard gates; Include is explicit and invalid hard exclusions explain conflicts',()=>{
  const a=input('A');expect(gray(a)).toContain(id('corrective'));expect(plan(a).selectedNodeIds).not.toContain(id('corrective'));
  const included=planCourseRoute(a,{includeNodeIds:[id('corrective')],excludeNodeIds:[]});expect(included.valid).toBe(true);if(included.valid)expect(included.route.selectedNodeIds).toEqual(expect.arrayContaining([id('corrective'),id('defect')]));
  expect(planCourseRoute(a,{includeNodeIds:[],excludeNodeIds:[id('qualification')]}).valid).toBe(false);
  expect(planCourseRoute(a,{includeNodeIds:[],excludeNodeIds:[id('risk')]}).valid).toBe(true);
 });
});
