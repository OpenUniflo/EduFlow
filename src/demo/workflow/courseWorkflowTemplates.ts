import { agenticAiRuntime } from "../courses/agenticAiRuntime.seed";
import { pythonEngineeringRuntime } from "../courses/pythonEngineeringCourse.seed";
import { goldenAgenticAiRuntime } from "../scenarios/agenticAiBook/goldenCourse.seed";
import { createWorkflowV2 } from "@/features/workflow/domain/v2/factory";

// Course tasks keep their stable template identities, with honest editable starting routes.
// The former canned code and fake success records are intentionally absent.
const definitions = new Map<string, ReturnType<typeof createWorkflowV2>>();
for (const runtime of [agenticAiRuntime, pythonEngineeringRuntime, goldenAgenticAiRuntime]) {
  for (const assignment of runtime.assignments) {
    if (assignment.mode !== "workflow" || !assignment.workflowTemplateId || definitions.has(assignment.workflowTemplateId)) continue;
    const definition = createWorkflowV2(assignment.title);
    definition.workflowId = assignment.workflowTemplateId;
    definition.description = `实训起步草稿：${assignment.description} 请按任务要求配置节点与连接；此起步流程尚未实现实训目标。`;
    definitions.set(definition.workflowId, definition);
  }
}
export const courseWorkflowTemplates = [...definitions.values()];
