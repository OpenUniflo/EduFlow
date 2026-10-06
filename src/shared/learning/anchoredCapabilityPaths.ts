/** Union of simple directed path witnesses. The acyclic condensation is linear;
 * only cyclic components require local entry/exit search, never global path enumeration. */
export function anchoredCapabilityPaths<E extends {id:string;source:string;target:string}>(ids:ReadonlySet<string>, edges:readonly E[], acquired:ReadonlySet<string>, targets:ReadonlySet<string>) {
  const outgoing=new Map([...ids].map(id=>[id,[] as E[]]));
  const incoming=new Map([...ids].map(id=>[id,[] as E[]]));
  for(const edge of edges)if(ids.has(edge.source)&&ids.has(edge.target)){outgoing.get(edge.source)!.push(edge);incoming.get(edge.target)!.push(edge);}
  const seen=new Set<string>(),order:string[]=[];
  for(const start of ids)if(!seen.has(start)) {
    seen.add(start);const stack=[{id:start,index:0}];
    while(stack.length){const frame=stack[stack.length-1],next=outgoing.get(frame.id)!;
      if(frame.index===next.length){order.push(frame.id);stack.pop();continue;}
      const target=next[frame.index++].target;if(!seen.has(target)){seen.add(target);stack.push({id:target,index:0});}
    }
  }
  const component=new Map<string,number>(),groups:string[][]=[];
  for(const start of order.reverse())if(!component.has(start)) {
    const group:string[]=[],queue=[start],index=groups.length;component.set(start,index);
    for(let i=0;i<queue.length;i++){const id=queue[i];group.push(id);for(const edge of incoming.get(id)!)if(!component.has(edge.source)){component.set(edge.source,index);queue.push(edge.source);}}
    groups.push(group);
  }
  const entries=groups.map(group=>new Set(group.filter(id=>acquired.has(id))));
  const exits=groups.map(group=>new Set(group.filter(id=>targets.has(id))));
  const retainedEdges=new Set<string>(),members=new Set<string>();
  for(const edge of edges)if(component.has(edge.source)&&component.has(edge.target)&&component.get(edge.source)!==component.get(edge.target)){
    retainedEdges.add(edge.id);members.add(edge.source);members.add(edge.target);
    exits[component.get(edge.source)!].add(edge.source);entries[component.get(edge.target)!].add(edge.target);
  }
  groups.forEach((group,index)=>{
    if(group.length===1){if(entries[index].size&&exits[index].size)members.add(group[0]);return;}
    // Each successful stack is a concrete non-repeating witness. Nodes in a
    // detour returning to the same entry/exit never obtain such a witness.
    for(const start of entries[index]) {
      const visited=new Set([start]);const stack:Array<{id:string;index:number;via?:E}>=[{id:start,index:0}];
      while(stack.length){const frame=stack[stack.length-1];
        if(frame.index===0&&exits[index].has(frame.id)){for(const part of stack){members.add(part.id);if(part.via)retainedEdges.add(part.via.id);}}
        const next=outgoing.get(frame.id)!;
        if(frame.index===next.length){visited.delete(frame.id);stack.pop();continue;}
        const edge=next[frame.index++];if(component.get(edge.target)===index&&!visited.has(edge.target)){visited.add(edge.target);stack.push({id:edge.target,index:0,via:edge});}
      }
    }
  });
  return {members,edges:edges.filter(edge=>retainedEdges.has(edge.id))};
}
