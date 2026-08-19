import { ArrowLeft, ArrowRight, Check, Clock3, FileCode2, Network, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import { applicationServices } from "@/app/services/applicationServices";
import type { MockSession } from "@/features/auth/types";
import type { AssignmentExperience } from "@/features/course/types";
import { evaluateTraceSelection } from "@/features/course/assignmentExperience";
import { workflowLaunchUrl } from "@/features/learning/progress/progressService";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";

function AnswerExperience({ prompt, onSubmit }: { prompt?: string; onSubmit: () => void }) {
  const [answer, setAnswer] = useState("");
  return <section className="assignment-experience-body"><h2>开放回答</h2><p>{prompt}</p><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="写下你的架构判断、证据与边界…" /><button className="atlas-primary" disabled={!answer.trim()} onClick={onSubmit}>提交答案</button></section>;
}

function CodeExperience({ experience, onSubmit }: { experience: AssignmentExperience; onSubmit: () => void }) {
  const [code, setCode] = useState(experience.starterCode ?? "");
  const [fileName, setFileName] = useState("");
  return <section className="assignment-experience-body"><h2>代码 / 文件提交</h2><p>{experience.prompt}</p><textarea className="assignment-code-input" value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} /><label className="assignment-file-picker"><Upload size={16} />选择本地文件<input type="file" accept={experience.acceptedFileTypes?.join(",")} onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")} /></label>{fileName ? <small>已选择：{fileName}</small> : null}<button className="atlas-primary" disabled={!code.trim() && !fileName} onClick={onSubmit}>提交成果</button></section>;
}

function TraceExperience({ experience, onSubmit }: { experience: AssignmentExperience; onSubmit: () => void }) {
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  function checkSelection() {
    setFeedback(evaluateTraceSelection(experience, selected) ? "correct" : "incorrect");
  }
  return <section className="assignment-experience-body"><h2>Trace Debug</h2><p>{experience.prompt}</p><div className="assignment-trace">{experience.traceSteps?.map((step, index) => <button key={step.id} className={selected === step.id ? "selected" : ""} onClick={() => {setSelected(step.id);setFeedback(null);}}><span>{String(index + 1).padStart(2,"0")}</span><code>{step.label}</code></button>)}</div>{feedback ? <div className={`assignment-trace-feedback ${feedback}`} role="status"><strong>{feedback === "correct" ? "✓ 定位正确" : "✕ 这里不是根因"}</strong><span>{feedback === "correct" ? "该步骤已越过允许的运行边界，应进入恢复或终止策略，而不是继续等待。" : "继续检查出现异常、超时或错误状态的步骤。"}</span></div> : null}{feedback === "correct" ? <button className="atlas-primary" onClick={onSubmit}>完成本次实训</button> : <button className="atlas-primary" disabled={!selected} onClick={checkSelection}>提交故障判断</button>}</section>;
}

export function AssignmentExperiencePage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const navigate = useNavigate();
  const { courseId = "", assignmentId = "" } = useParams();
  const runtime = applicationServices.courseRepository.getCourse(courseId);
  const assignment = runtime?.assignments.find((item) => item.id === assignmentId);
  const [submitted, setSubmitted] = useState(false);
  const knowledgeById = useMemo(() => new Map(applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId)).nodes.map((node) => [node.id, node])), [session.userId]);
  if (!runtime || !assignment) return <main className="assignment-page"><GlobalNav active="courses" session={session} onLogout={onLogout} /><section className="atlas-empty-state"><h1>实训不存在</h1><button className="atlas-primary" onClick={() => navigate(`/courses/${courseId}`)}>返回课程</button></section></main>;
  const experience = assignment.experience ?? { type: assignment.mode === "workflow" ? "workflow" : "answer", prompt: assignment.description };
  const stableAssignmentId = assignment.id;
  const coverages = runtime.assignmentCoverages.filter((coverage) => coverage.assignmentId === assignment.id);
  const dependencies = runtime.assignmentDependencies.filter((dependency) => dependency.targetAssignmentId === assignment.id).flatMap((dependency) => {
    const source = runtime.assignments.find((item) => item.id === dependency.sourceAssignmentId);
    return source ? [source] : [];
  });
  function submit() {
    applicationServices.learningProgressRepository.updateAssignmentState(session.userId, courseId, stableAssignmentId, { assignmentId: stableAssignmentId, status: "completed", progress: 100 });
    setSubmitted(true);
  }
  return <main className="assignment-page">
    <GlobalNav active="courses" session={session} onLogout={onLogout} />
    <header className="assignment-page-header glass-v2"><button onClick={() => navigate(`/courses/${courseId}`)}><ArrowLeft size={17} />返回技能树</button><div><span>COURSE ASSIGNMENT</span><h1>{assignment.title}</h1><p>{assignment.description}</p></div><aside><span><Clock3 size={14} />{assignment.estimatedMinutes ?? 25} 分钟</span><span><Network size={14} />{coverages.length} 个 Knowledge</span><span><FileCode2 size={14} />{experience.type}</span></aside></header>
    <div className="assignment-page-grid">
      <aside className="assignment-shell-sidebar glass-v2">
        <section><h3>关联 Knowledge</h3>{coverages.map((coverage) => <span key={coverage.id}>◆ {knowledgeById.get(coverage.nodeId)?.title ?? coverage.nodeId}</span>)}</section>
        <section><h3>前置实训</h3>{dependencies.length ? dependencies.map((item) => <span key={item.id}>→ {item.title}</span>) : <span>当前实训无直接前置任务</span>}</section>
        {assignment.inheritedOutputs?.length ? <section><h3>已继承成果</h3>{assignment.inheritedOutputs.map((item) => <span key={item}><Check size={13} />{item}</span>)}{assignment.dependencyRationale ? <p>{assignment.dependencyRationale}</p> : null}</section> : null}
        <section><h3>任务要求</h3>{assignment.requirements.map((item) => <span key={item}>• {item}</span>)}</section>
        <section><h3>预期输出</h3><span>{assignment.expectedOutput}</span></section>
        <section><h3>验收标准</h3>{assignment.acceptanceCriteria.map((item) => <span key={item}>✓ {item}</span>)}</section>
      </aside>
      <article className="assignment-experience-card glass-v2">
        {submitted ? <div className="assignment-submitted"><Check size={34} /><h2>本次提交已记录</h2><p>Assignment 完成状态已更新；Knowledge mastery 仍只由独立证据决定。</p></div> : experience.type === "answer" ? <AnswerExperience prompt={experience.prompt} onSubmit={submit} /> : experience.type === "code" ? <CodeExperience experience={experience} onSubmit={submit} /> : experience.type === "trace" ? <TraceExperience experience={experience} onSubmit={submit} /> : <section className="assignment-experience-body"><h2>画布</h2><p>{experience.prompt}</p><div className="assignment-workflow-preview"><Network size={34} /><strong>继承型工作流已准备</strong><span>画布将从现有 Planner、Workers 与 Merge 结构开始。</span></div><button className="atlas-primary" onClick={() => navigate(workflowLaunchUrl({courseId,assignmentId:assignment.id,workflowTemplateId:assignment.workflowTemplateId!}))}>进入画布 <ArrowRight size={15} /></button></section>}
      </article>
    </div>
  </main>;
}
