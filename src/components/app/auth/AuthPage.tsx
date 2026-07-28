import { useState, type CSSProperties, type FormEvent } from "react";
import { ArrowRight, BookOpen, Network, Sparkles, Workflow } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const { completeAuth } = useAuth();
  const [name, setName] = useState("林同学");
  const [email, setEmail] = useState("student@knowledge-atlas.local");
  const isRegister = mode === "register";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    completeAuth({
      name: name.trim() || (isRegister ? "新同学" : "林同学"),
      email: email.trim() || "student@knowledge-atlas.local",
      role: "student",
      createdAt: new Date().toISOString()
    });
  }

  return (
    <main className="atlas-auth-page">
      <div className="atlas-auth-orbit" aria-hidden="true">
        {Array.from({ length: 34 }).map((_, index) => <i key={index} style={{ "--i": index } as CSSProperties} />)}
      </div>
      <section className="atlas-auth-story">
        <div className="atlas-brand-lockup">
          <span className="atlas-brand-mark"><Network size={20} /></span>
          <span><strong>知序 Knowledge Atlas</strong><small>探索知识，生成课程</small></span>
        </div>
        <span className="atlas-kicker">KNOWLEDGE → COURSE → PRACTICE</span>
        <h1>让知识结构、课程学习与 Agent 实践自然连接</h1>
        <p>从全局知识星图发现主题，在课程技能树中理解依赖，再进入 LangGraph 画布完成实训与验收。</p>
        <div className="atlas-auth-features">
          <div><Network size={18} /><span><strong>知识星图</strong><small>发现完整知识体系</small></span></div>
          <div><BookOpen size={18} /><span><strong>课程中心</strong><small>组织学习与课件</small></span></div>
          <div><Workflow size={18} /><span><strong>工作流画布</strong><small>实践并验证能力</small></span></div>
        </div>
      </section>

      <section className="atlas-auth-panel glass-v2">
        <div className="atlas-pill"><Sparkles size={13} />本地演示账号</div>
        <h2>{isRegister ? "创建学习账号" : "欢迎回来"}</h2>
        <p>{isRegister ? "创建一个本地会话，开始探索 Agentic AI 课程。" : "登录后进入知识星图首页，继续你的课程与实训。"}</p>
        <form onSubmit={submit}>
          <label><span>姓名</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
          <label><span>邮箱</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <button className="atlas-primary" type="submit">{isRegister ? "注册并进入" : "登录并进入"}<ArrowRight size={16} /></button>
        </form>
        <button className="atlas-auth-switch" onClick={() => navigate(isRegister ? "/login" : "/register")}>
          {isRegister ? "已有账号，去登录" : "没有账号，创建一个"}
        </button>
      </section>
    </main>
  );
}
