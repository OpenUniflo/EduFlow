import { ApiRequestError } from "@/shared/api/apiClient";
import { useEffect, useState, type ReactNode } from "react";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import type { WorkflowDocumentV2, WorkflowLaunchContext } from "../domain/v2/types";
import { WorkflowCreateDialog } from "./WorkflowCreateDialog";
import { LiveWorkflowEditor } from "../editor/v2/LiveWorkflowEditor";
import "../editor/v2/workflowV2.css";

export function WorkflowV2Route({ workflowId, ownerId, navigation, onBack, onOpen, launchContext }: { workflowId: string; ownerId: string; navigation: ReactNode; onBack: () => void; onOpen: (id: string) => void; launchContext?: WorkflowLaunchContext }) {
  const [document, setDocument] = useState<WorkflowDocumentV2 | null>(null);
  const [template, setTemplate] = useState<{workflowId:string;name:string;description:string}|null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setDocument(null); setError("");
    void workflowApiV2.get(workflowId).then(data => { if (active) setDocument(data); }).catch(async reason => { if (!active) return; if(reason instanceof ApiRequestError && reason.status===404){try{const source=(await workflowApiV2.templates()).items.find(item=>item.workflowId===workflowId);if(active&&source){setTemplate(source);return;}}catch{/* Show the original load error. */}}if(active)setError(workflowErrorMessage(reason)); });
    return () => { active = false; };
  }, [workflowId, ownerId, retry]);
  if(template)return <main className="wf-v2-loading">{navigation}<WorkflowCreateDialog initialTemplate={template} courseLaunch onClose={onBack} onCreated={id=>{setTemplate(null);if(id===workflowId)setRetry(value=>value+1);else onOpen(id);}}/></main>;
  if (document) return <LiveWorkflowEditor key={`${ownerId}:${document.definition.workflowId}`} ownerId={ownerId} initial={document} navigation={navigation} launchContext={launchContext} onBack={onBack} onOpen={onOpen} />;
  return <main className="wf-v2-loading">{navigation}<section>{error ? <><h1>工作流暂时无法打开</h1><p role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)}>重新加载</button><button onClick={onBack}>返回工作流库</button></> : <p role="status">正在加载工作流…</p>}</section></main>;
}
