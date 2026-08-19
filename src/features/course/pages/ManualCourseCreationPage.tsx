import { ArrowLeft, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { GlobalNav } from "@/app/components/GlobalNav";
import type { MockSession } from "@/features/auth/types";
import { apiRequest } from "@/shared/api/apiClient";

/** The non-AI course entrypoint. Content is added afterwards in Design Mode. */
export function ManualCourseCreationPage({ session, onLogout }: { session: MockSession; onLogout(): void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetOutcome, setTargetOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setSaving(true);
    try {
      const created = await apiRequest<{ courseId: string }>("/api/courses", { method: "POST", body: JSON.stringify({ title, description, targetOutcome }) });
      window.location.assign(`/courses/${created.courseId}?experience=design`);
    } catch { setError("课程未创建。请检查必填项、权限或网络后重试。"); setSaving(false); }
  }
  return <main className="atlas-page-shell course-management-page"><GlobalNav active="teaching" session={session} onLogout={onLogout} /><div className="atlas-content-wrap"><section className="atlas-course-title"><button className="atlas-secondary" onClick={() => navigate("/teaching")}><ArrowLeft size={15} />返回教学管理</button><span className="atlas-kicker">MANUAL COURSE AUTHORING</span><h1>创建课程</h1><p>先定义学习目标；章节、Knowledge、课件、微学习和实训都在下一步的设计模式中编辑。</p></section><form className="golden-fallback glass-v2" onSubmit={submit}><label className="course-authoring-field"><span>课程名称</span><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：产品需求分析基础" /></label><label className="course-authoring-field"><span>课程说明（可选）</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="这门课程面向谁，以及会解决什么问题。" /></label><label className="course-authoring-field"><span>目标成果</span><textarea required value={targetOutcome} onChange={(event) => setTargetOutcome(event.target.value)} placeholder="完成后，学习者能够独立完成什么可验证的成果？" /></label>{error ? <p className="course-publish-issues fatal">{error}</p> : null}<div className="course-authoring-inline-actions"><button type="button" className="atlas-secondary" onClick={() => navigate("/teaching")}>取消</button><button type="submit" className="atlas-primary" disabled={saving}><Plus size={15} />{saving ? "正在创建…" : "创建草稿课程"}</button></div></form></div></main>;
}
