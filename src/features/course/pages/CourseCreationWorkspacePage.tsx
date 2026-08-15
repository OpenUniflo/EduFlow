import { Check, FileText, Sparkles } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import type { MockSession } from "@/features/auth/types";
import type { CourseCreationScenario, CourseCreationScenarioResolver } from "@/features/course/creation/demoScenario";

export function CourseCreationWorkspacePage({ session, onLogout, resolver }: { session: MockSession; onLogout(): void; resolver: CourseCreationScenarioResolver }) {
  const navigate = useNavigate();
  const location = useLocation();
  const initialFiles = ((location.state as { files?: File[] } | null)?.files ?? []);
  const [files, setFiles] = useState(initialFiles);
  const [scenario, setScenario] = useState<CourseCreationScenario | null>(null);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { let alive = true; void resolver.resolve(files).then((result) => { if (!alive) return; if (!result) setFallback(true); else { setScenario(result); setStep(0); } }); return () => { alive = false; }; }, [files, resolver]);
  useEffect(() => { if (!scenario || step < 0 || step >= scenario.stages.length) return; const timer = window.setTimeout(() => { if (step === scenario.stages.length - 1) { setDone(true); localStorage.setItem(`eduflow:course-created:${scenario.courseId}`, "draft"); } else setStep((value) => value + 1); }, 650); return () => window.clearTimeout(timer); }, [scenario, step]);
  return <main className="atlas-page-shell golden-creation-page"><GlobalNav active="course-create" session={session} onLogout={onLogout} /><div className="golden-creation-shell">
    <header><span className="atlas-kicker">AI COURSE CREATION</span><h1>AI 建课工作台</h1><p>{scenario?.sourceLabel ?? (files[0]?.name || "等待教材")}</p></header>
    {(!files.length || fallback) ? <section className="golden-fallback glass-v2"><FileText /><h2>{files.length ? "该教材尚无稳定 Demo Scenario" : "上传教材开始创建课程"}</h2><p>当前 Prototype 不会假装对任意 PDF 生成高质量课程。指定 Golden 教材会进入稳定、可重放的教学重构流程。</p><label className="atlas-primary">选择 PDF<input hidden type="file" accept=".pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) { setFallback(false); setFiles([file]); } }} /></label><button className="atlas-secondary" onClick={() => navigate("/courses")}>返回课程中心</button></section> : null}
    {scenario ? <div className="golden-creation-grid"><section className="golden-generation glass-v2"><div className="golden-agent-title"><Sparkles /><div><strong>EduFlow 教学设计 Agent</strong><span>正在把教材重构为可学习、可实践的课程</span></div></div>{scenario.stages.map((stage, index) => <article key={stage.id} className={index < step || done ? "done" : index === step ? "active" : ""}><i>{index < step || done ? <Check size={14} /> : index + 1}</i><div><strong>{stage.label}</strong><span>{stage.detail}</span></div></article>)}<small>{scenario.prototypeLabel}</small></section>
    <section className="golden-draft glass-v2"><span className="atlas-kicker">LIVE COURSE DRAFT</span><h2>{scenario.title}</h2><div className="golden-insights">{scenario.insights.map((item) => <p key={item}>{item}</p>)}</div><h3>原教材 → 新课程</h3>{scenario.reconstruction.map((item) => <div className="golden-reconstruction" key={item.source}><span>{item.source}</span><b>→</b><strong>{item.target}</strong></div>)}<div className="golden-stats">{scenario.summary.map((item) => <div key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}</div><button className="atlas-primary" disabled={!done} onClick={() => navigate(`/courses/${scenario.courseId}?created=1`)}>{done ? "进入课程" : "课程草稿形成中…"}</button></section></div> : null}
  </div></main>;
}
