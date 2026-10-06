import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import * as project from './projectRoutePresentation';
import * as planning from './RoutePlanningPanel';

it('normal projection hides structural candidates; editing reveals them without changing input',()=>{
  const graph={nodes:[{id:'A'},{id:'B'},{id:'candidate'}],edges:[]} as unknown as Parameters<typeof project.projectStructuralGraph>[0];
  const route={selectedNodeIds:['A']} as Parameters<typeof project.projectVisibleNodeIds>[1];
  expect([...project.projectVisibleNodeIds(graph,route,['B'],false)]).toEqual(['A','B']);
  expect([...project.projectVisibleNodeIds(graph,route,['B'],true)]).toEqual(['A','B','candidate']);
  expect(graph.nodes).toHaveLength(3);
});
it('SVG context geometry excludes hidden endpoints as well as hidden nodes',()=>{
  const source=readFileSync('src/features/knowledge/components/KnowledgeAtlasScene.tsx','utf8');
  const context=source.slice(source.indexOf('const screenNode'),source.indexOf('const positionedBranches'));
  expect(context).toContain('isVisible(id)');
  expect(context).toContain('screenNode(node.id)');
  expect(context).toContain('screenNode(endpointId(edge.source))');
  expect(context).toContain('screenNode(endpointId(edge.target))');
  expect(context).toContain('start && end');
});
it('Draft details show explicit node, Edge and Action edits before Preview',()=>{
  const html=renderToStaticMarkup(<planning.DraftRouteDetails baseConstraints={{includeNodeIds:[],excludeNodeIds:[]}} draft={{includeNodeIds:['A'],excludeNodeIds:['X']}} baseSteps={[{edgeId:'ab',actionId:'old',sourceNodeId:'A',targetNodeId:'B',order:0}]} selectedEdgeIds={['ab','bc']} choices={[{edgeId:'ab',actionId:'new'}]} title={id=>`能力${id}`} actionTitle={id=>`行动${id}`} edgeTitle={id=>`关系${id}`}/>);
  for(const text of ['明确加入：能力A','明确排除：能力X','选择关系：关系bc','新增行动：行动new','移除行动：行动old']) expect(html).toContain(text);
  expect(html).not.toContain('最终能力');
});
it('formal Course Route does not load or render a legacy Practice authority',()=>{
  const source=readFileSync('src/features/course/path/CourseNavigator.tsx','utf8');
  for(const old of ['loadNavigation','buildCourseNavigator','pendingPractices','nextPractice','实训待办','<dialog']) expect(source).not.toContain(old);
});
