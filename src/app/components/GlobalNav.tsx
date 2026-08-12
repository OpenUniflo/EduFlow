import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, LogOut, Network, ShieldCheck, Workflow } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import type { MockSession } from "@/features/workflow/model";
import { canManageKnowledgeDomains } from "@/features/auth/capabilities";

export function GlobalNav({
  active,
  session,
  onLogout
}: {
  active: "atlas" | "courses" | "workflows" | "profile" | "admin";
  session?: MockSession | null;
  onLogout?: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function close(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const items = [
    {
      id: "atlas",
      to: "/",
      label: "知识星图首页",
      description: "探索全局知识体系并创建课程",
      icon: Network
    },
    {
      id: "courses",
      to: "/courses",
      label: "课程中心",
      description: "课程入口、技能树与课件阅读",
      icon: BookOpen
    },
    {
      id: "workflows",
      to: "/workflows",
      label: "工作流画布",
      description: "搭建、运行并验收实训任务",
      icon: Workflow
    },
    {
      id: "admin",
      to: "/admin/domains",
      label: "知识领域管理",
      description: "治理领域、成员与自动建议",
      icon: ShieldCheck
    }
  ].filter((item) => item.id !== "admin" || canManageKnowledgeDomains(session));

  return (
    <nav className="atlas-global-nav" aria-label="全局导航">
      <div
        className={`atlas-brand-menu ${open ? "open" : ""}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className="atlas-brand-button glass-v2">
          <button className="atlas-brand-home" onClick={() => navigate("/")} aria-label="返回知识星图首页">
            <span className="atlas-brand-mark"><Network size={18} /></span>
            <span className="atlas-brand-copy">
              <strong>知序 Knowledge Atlas</strong>
              <span>探索知识，生成课程</span>
            </span>
          </button>
          <button
            className="atlas-nav-toggle"
            type="button"
            aria-label="展开导航菜单"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <ChevronDown size={16} />
          </button>
        </div>

        <div className="atlas-nav-dropdown glass-v2">
          <div className="atlas-nav-label">主要空间</div>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                className={`atlas-nav-item ${active === item.id ? "active" : ""}`}
                to={item.to}
                onClick={() => setOpen(false)}
              >
                <span className="atlas-nav-icon"><Icon size={17} /></span>
                <span className="atlas-nav-copy">
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </span>
                {active === item.id ? <span className="atlas-current-tag">当前</span> : null}
              </NavLink>
            );
          })}
          {session && onLogout ? (
            <>
              <div className="atlas-nav-divider" />
              <div
                className={`atlas-account-row ${active === "profile" ? "active" : ""}`}
                role="link"
                tabIndex={0}
                onClick={() => { setOpen(false); navigate("/profile"); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setOpen(false);
                    navigate("/profile");
                  }
                }}
              >
                <div>
                  <strong>{session.name}</strong>
                  <span>{session.email}</span>
                </div>
                {active === "profile" ? <span className="atlas-current-tag">当前</span> : null}
                <button
                  onClick={(event) => { event.stopPropagation(); onLogout(); }}
                  aria-label="退出登录"
                ><LogOut size={16} /></button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
