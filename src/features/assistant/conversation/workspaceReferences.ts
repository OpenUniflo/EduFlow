import type {AssistantMessage,WorkspaceTimelineContent} from '../assistantContract';
export type RecoveryReference=WorkspaceTimelineContent&{recordedAt?:string};
/** Local IDs are recovery hints only; callers must resolve them through owned APIs. */
export function orderedWorkspaceReferences(messages:AssistantMessage[],hints:RecoveryReference[]):RecoveryReference[]{
 const key=(ref:WorkspaceTimelineContent)=>`${ref.event}:${ref.referenceId}`;
 const references=new Map<string,RecoveryReference>();
 for(const message of messages)if(message.structuredContent?.type==='workspace_event')references.set(key(message.structuredContent),{...message.structuredContent,recordedAt:message.createdAt});
 for(const hint of hints)if(!references.has(key(hint)))references.set(key(hint),hint);
 return [...references.values()].sort((a,b)=>(a.recordedAt??'').localeCompare(b.recordedAt??'')||key(a).localeCompare(key(b)));
}
