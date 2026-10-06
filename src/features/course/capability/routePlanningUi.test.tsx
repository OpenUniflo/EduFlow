import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { HistoricalRoute, RouteConflicts, RoutePlanningPanel } from './RoutePlanningPanel';
import type { RouteVersion } from '@/shared/learning/routeVersion';
import type { useRoutePlanning } from './useRoutePlanning';
const version: RouteVersion = { id: 'v1', routeId: 'r', userId: 'u', courseId: 'c', versionNumber: 1, source: 'initial', parentVersionId: null, restoredFromVersionId: null, createdAt: '2026-10-02T00:00:00Z', structureFingerprint: 's', constraints: { includeNodeIds: [], excludeNodeIds: [] }, snapshot: { valid: true, conflicts: [], titles: { A: '当时的能力标题' }, selectedNodeIds: ['A'], orderedNodeIds: ['A'], prerequisiteEdges: [], effectiveTargetNodeIds: ['A'], currentKnowledgeIds: [], bridgeKnowledgeIds: [] } };
it('acquired root explains optional execution instead of requiring a fabricated Node Run',()=>{
 const c={view:{activeVersion:version},editing:true,actionChoices:[],draft:{includeNodeIds:[],excludeNodeIds:[]}} as unknown as ReturnType<typeof useRoutePlanning>;
 const html=renderToStaticMarkup(<RoutePlanningPanel control={c} title={id=>id} node={{id:'A',title:'已具备的根',description:'事实根',state:'已具备',role:'中间能力',root:true}}/>);
 expect(html).toContain('能力已满足，可跳过或选择补充执行');
 expect(html).not.toContain('至少选择一个行动，才可采用可执行路线');
});
describe('V2 route UI authority and historical meaning', () => {
  it('history renders saved titles and distinguishes viewing from restore-as-new', () => {
    const html = renderToStaticMarkup(<HistoricalRoute version={version} disabled={false} restore={vi.fn()}/>);
    expect(html).toContain('当时的能力标题'); expect(html).toContain('查看 V1'); expect(html).toContain('查看完整路线与行动');expect(html).toContain('技术信息');
  });
  it('invalid initial history is not displayed as an empty completed route', () => {
    const html = renderToStaticMarkup(<HistoricalRoute version={{ ...version, snapshot: { ...version.snapshot, valid: false, orderedNodeIds: [], selectedNodeIds: [], conflicts: [{ kind: 'unavailable_hard_prerequisite', nodeId: 'M', rootNodeId: 'A', rootKind: 'target', constraint: 'knowledge_graph' }] } }} disabled={false} restore={vi.fn()}/>);
    expect(html).toContain('当时默认约束不可满足'); expect(html).toContain('是必须前置，但当前不可用');
  });
  it('renders structured backend root and excluded support without frontend inference', () => {
    const html = renderToStaticMarkup(<RouteConflicts title={id => `知识${id}`} conflicts={[{ kind: 'excluded_hard_prerequisite', rootNodeId: 'T', rootKind: 'target', nodeId: 'A', constraint: 'exclude' }]}/>);
    expect(html).toContain('目标当前不可达：知识T'); expect(html).toContain('知识A 是必须前置，但被当前路线排除');
  });
  it('ordinary view hides Include/Exclude editor even when constraints are persisted', () => {
    const c = { view: { activeVersion: { ...version, constraints: { includeNodeIds: ['A'], excludeNodeIds: ['B'] } }, plan: { valid: true, route: version.snapshot } }, busy: false, editing: false, preview: null, history: null } as unknown as ReturnType<typeof useRoutePlanning>;
    const html = renderToStaticMarkup(<RoutePlanningPanel control={c} title={id => id}/>);
    expect(html).not.toContain('当前路线 V1'); expect(html).toContain('调整学习路线'); expect(html).toContain('版本历史'); expect(html).not.toContain('重新载入'); expect(html).not.toContain('选择加入'); expect(html).not.toContain('选择排除');
  });
  it('route editing exposes history, constraints and Preview/diff while invalid current routes remain explicit', () => {
    const c = { view: { activeVersion: version, plan: { valid: false, conflicts: [{ kind: 'include_outside_model', rootNodeId: 'old', rootKind: 'include', nodeId: 'old', constraint: 'include' }] } }, busy: false, editing: true, tool: 'include', draft: { includeNodeIds: ['A'], excludeNodeIds: [] }, preview: { valid: true, route: version.snapshot }, history: [] } as unknown as ReturnType<typeof useRoutePlanning>;
    const html = renderToStaticMarkup(<RoutePlanningPanel control={c} title={id => id}/>);
    for (const text of ['当前 V1', '历史版本', '重新载入', '点能力或关系查看', '退出路线调整', '能力 ＋', '采用新路线']) expect(html).toContain(text);
    const ordinary = renderToStaticMarkup(<RoutePlanningPanel control={{ ...c, editing: false }} title={id => id}/>);
    expect(ordinary).toContain('当前正式路线需要调整');
    expect(ordinary).not.toContain('路线 Preview'); expect(ordinary).toContain('版本历史');
  });
  it('same structural graph does not depend on draft, preview or route version, and no role rings remain', () => {
    const scene = readFileSync('src/features/knowledge/components/KnowledgeAtlasScene.tsx', 'utf8');
    expect(scene).not.toContain('roleRings');
    expect(scene).toContain('atlasStructureKey(nodes, edges, variant)');
    expect(scene).toContain('variant !== "project"');
  });
  it('explains an acquired-boundary enables choice from structural facts instead of candidate scope',()=>{
    const step={edgeId:'real-enables',actionId:'chosen',sourceNodeId:'A',targetNodeId:'B',order:0};
    const c={view:{activeVersion:{...version,snapshot:{...version.snapshot,executionSteps:[step]}},model:{supportEdges:[]},plan:{valid:true,route:version.snapshot},execution:{options:[{edgeId:step.edgeId,actionId:step.actionId,title:'已选行动',type:'micro_learning',estimatedMinutes:8,planningAvailable:true,availableNow:true,reasons:[]}]}},editing:true,draft:{includeNodeIds:[],excludeNodeIds:[]},actionChoices:[step],selectedEdgeIds:[step.edgeId],busy:false} as unknown as ReturnType<typeof useRoutePlanning>;
    const html=renderToStaticMarkup(<RoutePlanningPanel control={c} edgeId={step.edgeId} title={id=>`能力${id}`} relations={[{id:step.edgeId,source:'A',target:'B',relation:'enables',strength:.5,reason:'真实支撑'}]}/>);
    expect(html).toContain('能力A → 能力B');expect(html).toContain('已选行动');
  });

});

it('current inspector contains only the selected factual Edge alternatives',()=>{
 const option=(edgeId:string,title:string)=>({edgeId,actionId:title,title,type:'practice_task',estimatedMinutes:20,weight:20,planningAvailable:true,availableNow:true,reasons:[]});
 const c={view:{activeVersion:version,plan:{valid:true,route:version.snapshot},execution:{options:[option('ab','本关系成果'),option('bc','其他关系成果')]}},editing:true,actionChoices:[],draft:{includeNodeIds:[],excludeNodeIds:[]}} as unknown as ReturnType<typeof useRoutePlanning>;
 const facts=[{id:'ab',source:'A',target:'B',relation:'enables' as const,strength:.5,reason:'真实关系'}];
 const html=renderToStaticMarkup(<RoutePlanningPanel control={c} relations={facts} edgeId="ab" title={id=>id}/>);
 expect(html).toContain('本关系成果');expect(html).not.toContain('其他关系成果');expect(html).toContain('路线调整操作区');expect(html).toContain('退出路线调整');
 const empty=renderToStaticMarkup(<RoutePlanningPanel control={c} relations={facts} title={id=>id}/>);expect(empty).not.toContain('本关系成果');expect(empty).toContain('点击能力查看详情');
});

it('renders multiple checked Actions with ordered controls before Preview and keeps out-of-scope hard facts optional',()=>{
 const steps=['a','b'].map((actionId,order)=>({edgeId:'ab',actionId,sourceNodeId:'A',targetNodeId:'B',order}));
 const catalog=steps.map(step=>({...step,title:step.actionId,type:'micro_learning' as const,estimatedMinutes:8,weight:8,planningAvailable:true,availableNow:false,reasons:[]}));
 const c={view:{activeVersion:version,plan:{valid:true,route:version.snapshot}},editing:true,actionChoices:steps,selectedEdgeIds:['ab'],catalog,draft:{includeNodeIds:[],excludeNodeIds:[]}} as unknown as ReturnType<typeof useRoutePlanning>;
 const html=renderToStaticMarkup(<RoutePlanningPanel control={c} edgeId="ab" title={id=>id} relations={[{id:'ab',source:'A',target:'B',relation:'prerequisite',strength:'hard',reason:'fact'}]}/>);
 expect(html).not.toContain('type="radio"');expect(html).toContain('已选执行顺序');expect(html).toContain('上移行动 2');expect(html).toContain('下移行动 1');
 expect(html).not.toContain('必须保留');expect(html).toContain('纳入执行路线');expect(html).toContain('查看详情');
});
it('History renders every same-Edge Action and separates addition/removal/reorder',()=>{
 const steps=['a','b'].map((actionId,order)=>({edgeId:'ab',actionId,sourceNodeId:'A',targetNodeId:'B',order}));
 const current={...version,snapshot:{...version.snapshot,executionSteps:steps}};
 const next={...version,id:'v2',snapshot:{...version.snapshot,executionSteps:[steps[1],steps[0],{...steps[0],actionId:'c',order:2}]}};
 const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
 const html=renderToStaticMarkup(<HistoricalRoute version={next} current={current} actionTitles={{a:'甲行动',b:'乙行动',c:'新增成果'}}/>);
 expect(html).toContain('＋ Action：新增成果');expect(html).toContain('行动顺序变化');expect(spy).not.toHaveBeenCalled();spy.mockRestore();
});

it('unavailable historical choices remain explicitly removable and recommendation follows planner cost',()=>{
 const option=(actionId:string,weight:number)=>({edgeId:'ab',actionId,title:actionId,type:'micro_learning' as const,estimatedMinutes:8,weight,planningAvailable:true,availableNow:true,reasons:[]});
 const c={view:{activeVersion:version},editing:true,actionChoices:[{edgeId:'ab',actionId:'archived'}],selectedEdgeIds:['ab'],catalog:[option('expensive',65),option('preferred',23)],draft:{includeNodeIds:[],excludeNodeIds:[]}} as unknown as ReturnType<typeof useRoutePlanning>;
 const html=renderToStaticMarkup(<RoutePlanningPanel control={c} edgeId="ab" title={id=>id} relations={[{id:'ab',source:'A',target:'B',relation:'enables',strength:.5,reason:'fact'}]}/>);
 expect(html).toContain('所选行动已失效');expect(html).toContain('aria-label="移除行动 1"');
 expect(html).toContain('preferred · 推荐');expect(html).not.toContain('expensive · 推荐');
});

it('Project branches mark all adopted Actions on the same factual Edge',async()=>{
 const {branchesForActions}=await import('@/features/actions/EdgeActionPanel');
 const alternatives=['a','b','c'].map(id=>({action:{id,edge_id:'ab',title:id},cost:{available:true,weight:1,reasons:[]}})) as unknown as Parameters<typeof branchesForActions>[0];
 expect(branchesForActions(alternatives,['b','a']).map(branch=>branch.status)).toEqual(['selected','selected','candidate']);
});

it('invalid structural Preview counts unresolved conflicts and exposes their locator',()=>{
 const c={view:{activeVersion:version},editing:true,actionChoices:[],draft:{includeNodeIds:[],excludeNodeIds:['A']},preview:{valid:false,route:null,conflicts:[{kind:'excluded_hard_prerequisite',nodeId:'A',rootNodeId:'B',rootKind:'target',constraint:'exclude'}]}} as unknown as ReturnType<typeof useRoutePlanning>;
 const html=renderToStaticMarkup(<RoutePlanningPanel control={c} title={id=>id}/>);
 expect(html).toContain('待处理 1');expect(html).toContain('定位能力');expect(html).toContain('展开详情');
});

it('Node history reorder shows exact scope, local new order and Node technical identity',()=>{
 const steps=['a','b'].map((actionId,order)=>({scope:'node' as const,nodeId:'A',actionId,order}));
 const current={...version,snapshot:{...version.snapshot,executionSteps:steps}};
 const next={...version,id:'v2',snapshot:{...version.snapshot,executionSteps:[{...steps[1],order:0},{...steps[0],order:1}]}};
 const html=renderToStaticMarkup(<HistoricalRoute version={next} current={current} actionTitles={{a:'甲行动',b:'乙行动'}}/>);
 expect(html).toContain('节点行动顺序变化：当时的能力标题');expect(html).toContain('乙行动 → 甲行动');expect(html).toContain('node:A');expect(html).not.toContain('undefined');
});
