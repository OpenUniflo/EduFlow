import {expect,it} from 'vitest';
import {routeDiff} from './routeDiff';
const step=(edgeId:string,actionId:string,order=0)=>({edgeId,actionId,sourceNodeId:'A',targetNodeId:'B',order});
it('separates Node/Edge membership from added, removed and reordered Actions',()=>{
 const old={selectedNodeIds:['A','B'],executionSteps:[step('one','a'),step('one','b'),step('removed','r')]};
 const next={selectedNodeIds:['B','C'],executionSteps:[step('one','b'),step('one','a'),step('one','c'),step('added','d'),step('added','e')]};
 expect(routeDiff(old,next)).toEqual({addedNodeIds:['C'],removedNodeIds:['A'],addedEdgeIds:['added'],removedEdgeIds:['removed'],addedActions:[step('one','c'),step('added','d'),step('added','e')],removedActions:[step('removed','r')],reorderedEdgeIds:['one']});
 expect(routeDiff(next,next).reorderedEdgeIds).toEqual([]);
});
it('removing one Action never removes its Edge',()=>{
 const old={selectedNodeIds:['A','B'],executionSteps:[step('one','a'),step('one','b')]};
 const diff=routeDiff(old,{...old,executionSteps:[step('one','b')]});
 expect(diff.removedActions).toEqual([step('one','a')]);expect(diff.removedEdgeIds).toEqual([]);expect(diff.reorderedEdgeIds).toEqual([]);
});
