import { BookOpen, GraduationCap, History, Home, LayoutGrid, LogIn, Network, Settings2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { MockSession } from "@/features/auth/types";
import { canManageCourses, canManageKnowledgeDomains } from "@/features/auth/capabilities";
import { authGateState } from "@/features/auth/authRedirect";
import { AccountMenu } from "@/shared/ui/AccountMenu";
import { Avatar } from "@/shared/ui/Avatar";
import { BrandMark } from "@/shared/ui/BrandMark";
import { shortDisplayName } from "@/shared/ui/displayName";

export type GlobalNavActive = "home" | "archive" | "works" | "records" | "teaching" | "admin";

export type GlobalNavItem = {
  id: GlobalNavActive;
  to: string;
  label: string;
  icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>;
};

/** Learner workspaces first; role workspaces append without changing learner IA. */
export function getPrimaryNavigationItems(session?: MockSession | null): GlobalNavItem[] {
  const items: GlobalNavItem[] = [
    { id: "home", to: "/", label: "首页", icon: Home },
    { id: "archive", to: "/archive", label: "档案", icon: Network },
    { id: "works", to: "/works", label: "作品", icon: LayoutGrid },
    { id: "records", to: "/records", label: "记录", icon: History }
  ];
  if (!session) return items.slice(0, 2);
  if (canManageCourses(session)) items.push({ id: "teaching", to: "/teaching", label: "教学", icon: GraduationCap });
  if (canManageKnowledgeDomains(session)) items.push({ id: "admin", to: "/admin", label: "管理", icon: ShieldCheck });
  return items;
}

function NavItem({ item }: { item: GlobalNavItem }) {
  const Icon = item.icon;
  return (
    <NavLink className="ef-nav-item" data-nav-id={item.id} end={item.to === "/"} to={item.to}>
      <Icon size={20} aria-hidden />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function GlobalNav({ session, onLogout }: { session?: MockSession | null; onLogout?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [lastPath, setLastPath] = useState(location.pathname);

  useEffect(() => {
    if (lastPath !== location.pathname) {
      setAccountOpen(false);
      setLastPath(location.pathname);
    }
  }, [lastPath, location.pathname]);

  const accountLabel = session ? shortDisplayName(session.name) : "";
  const accountMenu: ReactNode = accountOpen && session && typeof document !== "undefined"
    ? createPortal(
      <AccountMenu
        open
        className="ef-nav-account"
        name={session.name}
        email={session.email}
        returnFocusRef={triggerRef}
        onClose={() => setAccountOpen(false)}
        onOpenPanel={() => navigate("/")}
        items={[
          { id: "settings", label: "设置", icon: <Settings2 size={18} aria-hidden />, onSelect: () => navigate("/settings") },
          { id: "records", label: "学习记录", icon: <BookOpen size={18} aria-hidden />, onSelect: () => navigate("/records") }
        ]}
        onLogout={onLogout ? () => onLogout() : undefined}
      />,
      document.body
    )
    : null;

  return (
    <>
      <nav className="ef-nav ef-ui-glass ef-ui-glass--clear ef-ui-glass--r-24" aria-label="主导航" data-nav-role={session?.role ?? "guest"}>
        <NavLink className="ef-nav-logo" to="/" aria-label="EduFlow 首页">
          <BrandMark variant="rail" size={22} />
        </NavLink>
        <div className="ef-nav-grp">
          {getPrimaryNavigationItems(session).map((item) => <NavItem key={item.id} item={item} />)}
        </div>
        <div className="ef-nav-spacer" />
        {session ? (
          <div className="ef-nav-me-wrap">
            <button
              ref={triggerRef}
              type="button"
              className={`ef-nav-me${accountOpen ? " is-open" : ""}`}
              aria-label={`账户：${session.name}，${accountOpen ? "收起" : "打开"}账户菜单`}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              aria-controls="ef-account-menu"
              onClick={() => setAccountOpen((value) => !value)}
            >
              <Avatar name={session.name} size={32} personColor="me" decorative />
              <span className="ef-nav-me-name">{accountLabel}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="ef-nav-guest"
            aria-label="登录"
            onClick={() => navigate("/login", { state: authGateState(location) })}
          >
            <span className="ef-nav-guest-icon"><LogIn size={16} aria-hidden /></span>
            <span className="ef-nav-me-name">登录</span>
          </button>
        )}
      </nav>
      {accountMenu}
    </>
  );
}
