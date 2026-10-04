import type { ReactNode } from 'react';
import type { MockSession } from '@/features/auth/types';
import { GlobalAssistantSurface } from '@/features/assistant/AssistantSurfaceContext';
import { EvidenceWorkspaceProvider, useEvidenceWorkspace } from '@/features/evidence/EvidenceWorkspace';
import type { EvidenceProposal } from '@/features/evidence/evidenceClient';
import { buildProjectCapabilityModel } from '@/features/course/capability/projectCapability';
import { userKnowledgeAccess } from '@/features/knowledge/repository/KnowledgeRepository';
import { applicationServices, refreshLearnerState } from '@/app/services/applicationServices';

function EvidenceAssistant({session,children}:{session:MockSession;children:ReactNode}) {
 const evidence=useEvidenceWorkspace()!;
 return <GlobalAssistantSurface surfaceHost={evidence.surfaceHost} foreground={evidence.foreground?{contextLabel:"更新我的能力",context:{workspace:"learning",experienceMode:"learn",presentation:"evidence-workspace",userRole:session.role,capabilities:session.capabilities,courseId:evidence.foreground.courseId,evidenceSourceId:evidence.foreground.sourceId,diagnosisRunId:evidence.foreground.runId}}:undefined} session={session} onUpdateCapabilities={evidence.open}>{children}</GlobalAssistantSurface>;
}
export function CapabilityEvidenceBoundary({session,children}:{session:MockSession;children:ReactNode}) {
 const graph=()=>applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId));
 const nodeTitle=(id:string)=>graph().nodes.find(node=>node.id===id)?.title??id;
 function preview(courseId:string,proposals:EvidenceProposal[]) {
  const runtime=applicationServices.courseRepository.getCourse(courseId);
  if(!runtime)return '当前课程不可用；个人证据仍可独立更新。';
  const knowledge=applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId);
  const candidates=new Map(knowledge.map(record=>[record.nodeId,record]));
  for(const proposal of proposals) if(proposal.node_id&&proposal.proposed_status){
   const current=candidates.get(proposal.node_id);
   if(!current||current.status==='explore'||current.status==='learning')candidates.set(proposal.node_id,{nodeId:proposal.node_id,status:proposal.proposed_status});
  }
  const before=buildProjectCapabilityModel(graph(),runtime,knowledge);const after=buildProjectCapabilityModel(graph(),runtime,[...candidates.values()]);
  const affected=[...new Set(proposals.flatMap(p=>p.node_id&&p.proposed_status&&after.orderedNodeIds.includes(p.node_id)?[p.node_id]:[]))];
  return `${runtime.course.title}：项目内已具备能力 ${before.currentKnowledgeIds.length} → ${after.currentKnowledgeIds.length}；相关候选：${affected.map(nodeTitle).join('、')||'无'}。无真实关联的能力只保留在个人状态。确认后重新计算缺口与现有路线，不自动建立路线版本。`;
 }
 return <EvidenceWorkspaceProvider onConfirmed={()=>refreshLearnerState(session.userId)} nodeTitle={nodeTitle} preview={preview}><EvidenceAssistant session={session}>{children}</EvidenceAssistant></EvidenceWorkspaceProvider>;
}
