import { ArrowRight, CheckCircle2, Grid2X2, List, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Template } from "@/features/workflow/domain/types";
import type { WorkflowViewMode } from "@/features/workflow/editor/types";
import { WorkflowPreview } from "@/features/workflow/editor/WorkflowPreview";
import { useEffect, useState, type ReactNode } from "react";
import { sortAssignments } from "@/features/material/materialOrdering";
import type { CourseRepository } from "@/features/course/repository/CourseRepository";
import type { LearningProgressRepository } from "@/features/learning/progress/LearningProgressRepository";

export function WorkflowLibraryPage({
  navigation,
  userId,
  courseRepository,
  learningProgressRepository,
  workflows,
  activeTemplateId,
  onOpenWorkflow,
  onCreateWorkflow,
  onDeleteWorkflow
}: {
  navigation: ReactNode;
  userId: string;
  courseRepository: CourseRepository;
  learningProgressRepository: LearningProgressRepository;
  workflows: Template[];
  activeTemplateId: string;
  onOpenWorkflow: (templateId: string) => void;
  onCreateWorkflow: () => void;
  onDeleteWorkflow: (templateId: string) => void;
}) {
  const [viewMode, setViewMode] = useState<WorkflowViewMode>("gallery");
  const [, setProgressRevision] = useState(0);
  useEffect(() => learningProgressRepository.subscribe(() => setProgressRevision((value) => value + 1)), []);
  const runtimes = courseRepository.listCourseRuntimes();
  const workflowAssignments = runtimes.flatMap((runtime) => sortAssignments(runtime.assignments).filter((item) => item.mode === "workflow" && item.workflowTemplateId));
  const courseTemplateIds = new Set(workflowAssignments.map((item) => item.workflowTemplateId!));
  const lessonWorkflows = workflows.filter((item) => courseTemplateIds.has(item.id));
  const otherWorkflows = workflows.filter((item) => !courseTemplateIds.has(item.id));

  function workflowCard(template: Template) {
    const assignments = workflowAssignments.filter((item) => item.workflowTemplateId === template.id);
    const assignment = assignments[0];
    const complete = assignments.length > 0 && assignments.every((item) => learningProgressRepository.getCourseState(userId, item.courseId).assignmentStates[item.id]?.status === "completed");
    return (
      <article key={template.id} className={`atlas-workflow-card glass-v2 ${activeTemplateId === template.id ? "active" : ""}`}>
        <button className="atlas-workflow-open" onClick={() => onOpenWorkflow(template.id)}>
          <WorkflowPreview template={template} />
          <div className="atlas-workflow-copy">
            <div className="atlas-workflow-card-head">
              <span>{assignments.length > 1 ? `${assignments.length} 项课程实训共用模板` : assignment ? `课程实训 · ${assignment.title}` : "通用模板"}</span>
              {complete ? <small><CheckCircle2 size={13} />已完成</small> : null}
            </div>
            <h3>{template.name}</h3>
            <p>{template.description}</p>
            <div><span>{template.nodes.filter((item) => item.kind !== "system").length} 节点</span><span>{template.edges.length} 条边</span>{assignment?.estimatedMinutes ? <span>{assignment.estimatedMinutes} 分钟</span> : null}</div>
          </div>
          <ArrowRight size={18} />
        </button>
        {template.id.startsWith("blank-") ? (
          <button className="atlas-workflow-delete" onClick={() => onDeleteWorkflow(template.id)} aria-label={`删除${template.name}`}><Trash2 size={16} /></button>
        ) : null}
      </article>
    );
  }

  return (
    <main className="atlas-page-shell atlas-workflows-page">
      {navigation}
      <header className="atlas-workspace-head">
        <div className="atlas-breadcrumb glass-v2"><strong>画布</strong></div>
      </header>
      <div className="atlas-content-wrap">
        <section className="atlas-workflow-hero">
          <div>
            <span className="atlas-kicker">LANGGRAPH WORKSPACE</span>
            <h1>从课程实训进入，也可以自由搭建</h1>
            <p>画布只表达真实的 Node、Edge、State、Reducer、循环和条件路由；课程知识通过实训目标和验收结果关联。</p>
          </div>
          <div className="atlas-workflow-actions">
            <button className="atlas-primary" onClick={onCreateWorkflow}><Plus size={16} />创建空白画布</button>
            <div className="atlas-view-switch glass-v2">
              <button className={viewMode === "gallery" ? "active" : ""} onClick={() => setViewMode("gallery")}><Grid2X2 size={15} />画廊</button>
              <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}><List size={15} />列表</button>
            </div>
          </div>
        </section>

        <section className="atlas-workflow-section">
          <div className="atlas-section-row">
            <div><span className="atlas-kicker">COURSE LABS</span><h2>课程工作流实训</h2></div>
            <span>{workflowAssignments.filter((item) => learningProgressRepository.getCourseState(userId, item.courseId).assignmentStates[item.id]?.status === "completed").length}/{workflowAssignments.length} 个课程实训已完成</span>
          </div>
          <div className={`atlas-workflow-library ${viewMode}`}>{lessonWorkflows.map(workflowCard)}</div>
        </section>

        <section className="atlas-workflow-section">
          <div className="atlas-section-row">
            <div><span className="atlas-kicker">GENERAL WORKFLOWS</span><h2>通用与自定义工作流</h2></div>
            <span>保留原型中的完整编辑能力</span>
          </div>
          <div className={`atlas-workflow-library ${viewMode}`}>{otherWorkflows.map(workflowCard)}</div>
        </section>

        <aside className="atlas-workflow-note glass-v2">
          <Sparkles size={18} />
          <div><strong>统一实验条件</strong><span>五种范式使用相同模型、资料、工具、输出要求和验收标准。</span></div>
        </aside>
      </div>
    </main>
  );
}
