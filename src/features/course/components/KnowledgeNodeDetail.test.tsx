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
  expect(html).toContain('pathId=explicit-path'); expect(html).toContain('起点学习内容');
});
