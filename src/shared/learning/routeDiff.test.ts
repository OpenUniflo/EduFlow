import { expect,it } from 'vitest';
import { routeDiff } from './routeDiff';
it('separates capability membership, real Edge membership and Action replacement',()=>{
 const step=(edgeId:string,actionId:string)=>({edgeId,actionId,sourceNodeId:'A',targetNodeId:'B',order:0});
 const old={selectedNodeIds:['A','B'],executionSteps:[step('one','old'),step('removed','r')]};
 const next={selectedNodeIds:['B','C'],executionSteps:[step('one','new'),step('added','a')]};
 expect(routeDiff(old,next)).toEqual({addedNodeIds:['C'],removedNodeIds:['A'],addedEdgeIds:['added'],removedEdgeIds:['removed'],changedActions:[step('one','new')]});
 expect(routeDiff(next,next).changedActions).toEqual([]);
});
