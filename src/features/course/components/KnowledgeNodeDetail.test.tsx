import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { KnowledgeNodeDetail } from './KnowledgeNodeDetail';
import type { KnowledgeNode } from '@/features/knowledge/types';
import type { CourseRuntimeData } from '../runtime/courseRuntime';
import type { useEdgeActions } from '@/features/actions/EdgeActionPanel';
const node: KnowledgeNode = { id:'bridge',title:'补充能力',description:'实际知识内容',type:'conceptual',scope:'global',masteryCriteria:[],provenance:[],currentRevisionId:'v1',status:'active' };
const runtime = {course:{id:'course'},materials:[{id:'unrelated',title:'不相关课件'}]} as unknown as CourseRuntimeData;
const actions = {actions:[],bindings:[],runs:[],availableActionIds:[],availableMicroActionIds:[],start:vi.fn()} as unknown as ReturnType<typeof useEdgeActions>;
it('renders Bridge core and source-oriented relations without requiring curriculum or leaking course materials', () => {
  const html = renderToStaticMarkup(<MemoryRouter><KnowledgeNodeDetail node={node} runtime={runtime} graph={{nodes:[node],edges:[],revisions:[]}} knowledge={[{nodeId:node.id,status:'learned'}]} relations={[{id:'out',source:'bridge',target:'target',relation:'enables',strength:1},{id:'in',source:'start',target:'bridge',relation:'prerequisite',strength:'hard'}]} learningPath={{id:"explicit-path",title:"起点学习内容"}} context="personal-route" actions={actions} onSelect={vi.fn()}/></MemoryRouter>);
  for (const text of ['实际知识内容','已学会','补充能力 → target','通向这里的关系','未配置本课程教学覆盖']) expect(html).toContain(text);
  expect(html).not.toContain('不相关课件');
  expect(html).not.toContain('pathId=explicit-path'); expect(html).not.toContain('起点学习内容');
});

it('formal Route detail starts its already chosen Action and does not show alternatives',()=>{
  const template={id:'chosen',edge_id:'out',type:'micro_learning',title:'正式行动',description:'明确绑定内容',estimated_minutes:8,difficulty:1,resource_requirements:[],required_capability_ids:[],expected_evidence:'本次观察',status:'active',provenance:{}};
  const control={...actions,actions:[template,{...template,id:'cheaper',title:'未采用的方案'}],availableActionIds:['chosen','cheaper'],availableMicroActionIds:['chosen','cheaper'],busy:false};
  const html=renderToStaticMarkup(<MemoryRouter><KnowledgeNodeDetail node={node} runtime={runtime} graph={{nodes:[node],edges:[],revisions:[]}} knowledge={[{nodeId:node.id,status:'learned'}]} relations={[{id:'out',source:'bridge',target:'target',relation:'enables',strength:1}]} context="personal-route" routeSteps={[{edgeId:'out',actionId:'chosen',sourceNodeId:'bridge',targetNodeId:'target',order:0}]} initialEdgeId="out" actions={control as unknown as ReturnType<typeof useEdgeActions>} onSelect={vi.fn()}/></MemoryRouter>);
  expect(html).toContain('开始已选行动');expect(html).not.toContain('选择此行动');expect(html).not.toContain('未采用的方案');
});
it('unavailable formal Action explains adjustment instead of claiming no Action was configured',()=>{
  const html=renderToStaticMarkup(<MemoryRouter><KnowledgeNodeDetail node={node} runtime={runtime} graph={{nodes:[node],edges:[],revisions:[]}} knowledge={[{nodeId:node.id,status:'learned'}]} relations={[{id:'out',source:'bridge',target:'target',relation:'enables',strength:1}]} context="personal-route" routeSteps={[{edgeId:'out',actionId:'archived',sourceNodeId:'bridge',targetNodeId:'target',order:0}]} initialEdgeId="out" actions={actions} onSelect={vi.fn()} onAdjustRoute={vi.fn()}/></MemoryRouter>);
  expect(html).toContain('当前正式路线中的行动已不可用，需要调整路线');expect(html).toContain('调整路线');expect(html).not.toContain('这条关系尚未配置行动');
});
