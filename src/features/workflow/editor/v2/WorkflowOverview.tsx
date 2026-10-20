import { Link } from "react-router-dom";
import type { WorkflowDefinitionV2,WorkflowLaunchContext } from "../../domain/v2/types";
export function WorkflowOverview({definition,launchContext}:{definition:WorkflowDefinitionV2;launchContext?:WorkflowLaunchContext}) {
  return <details className="wf-overview"><summary>流程说明{launchContext?" · 课程实训":""}</summary><div><strong>{definition.name}</strong><p>{definition.description||"在画布中配置节点，定义输入、处理逻辑与输出。"}</p>{launchContext?<Link to={`/courses/${encodeURIComponent(launchContext.courseId)}/assignments/${encodeURIComponent(launchContext.assignmentId)}`}>回看实训要求 →</Link>:null}<small>运行成功表示流程执行完成；实训结果仍需按任务要求检查。</small></div></details>;
}
