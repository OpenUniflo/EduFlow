import { ArrowRight, CheckCircle2, Grid2X2, List, Plus, Sparkles, Trash2 } from "lucide-react";
import type { MockSession, Template, WorkflowViewMode } from "../../app/model";
import { WorkflowPreview } from "../../components/app/workflows/WorkflowPages";
import { courseAssignments } from "../data";
import { useLearningProgress } from "../progress";
import { GlobalNav } from "../components/GlobalNav";

export function WorkflowLibraryPage({
  session,
  onLogout,
  viewMode,
  workflows,
  activeTemplateId,
  onViewMode,
  onOpenWorkflow,
  onCreateWorkflow,
  onDeleteWorkflow
}: {
  session: MockSession;
  onLogout: () => void;
  viewMode: WorkflowViewMode;
  workflows: Template[];
  activeTemplateId: string;
  onViewMode: (value: WorkflowViewMode) => void;
  onOpenWorkflow: (templateId: string) => void;
  onCreateWorkflow: () => void;
  onDeleteWorkflow: (templateId: string) => void;
}) {
  const progress = useLearningProgress();
  const workflowAssignments = courseAssignments.filter((item) => item.mode === "workflow" && item.workflowTemplateId);
  const lessonIds = new Set(workflowAssignments.map((item) => item.workflowTemplateId!));
  const lessonWorkflows = workflows.filter((item) => lessonIds.has(item.id));
  const otherWorkflows = workflows.filter((item) => !lessonIds.has(item.id));

  function workflowCard(template: Template) {
    const assignment = workflowAssignments.find((item) => item.workflowTemplateId === template.id);
    const complete = assignment ? progress.completedAssignmentIds.includes(assignment.id) : false;
    return (
      <article key={template.id} className={`atlas-workflow-card glass-v2 ${activeTemplateId === template.id ? "active" : ""}`}>
        <button className="atlas-workflow-open" onClick={() => onOpenWorkflow(template.id)}>
          <WorkflowPreview template={template} />
          <div className="atlas-workflow-copy">
            <div className="atlas-workflow-card-head">
              <span>{assignment ? `课程实训 · ${assignment.title}` : "通用模板"}</span>
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
      <GlobalNav active="workflows" session={session} onLogout={onLogout} />
      <header className="atlas-workspace-head">
        <div className="atlas-breadcrumb glass-v2"><strong>工作流画布</strong></div>
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
              <button className={viewMode === "gallery" ? "active" : ""} onClick={() => onViewMode("gallery")}><Grid2X2 size={15} />画廊</button>
              <button className={viewMode === "list" ? "active" : ""} onClick={() => onViewMode("list")}><List size={15} />列表</button>
            </div>
          </div>
        </section>

        <section className="atlas-workflow-section">
          <div className="atlas-section-row">
            <div><span className="atlas-kicker">LESSON 04 LAB</span><h2>推理范式比较实训</h2></div>
            <span>{progress.completedAssignmentIds.length}/{workflowAssignments.length} 个课程工作流已完成</span>
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
