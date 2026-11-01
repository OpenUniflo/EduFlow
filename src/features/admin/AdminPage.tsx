import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Network } from "lucide-react";
import type { MockSession } from "@/features/auth/types";
import { useDomainGovernance } from "@/features/knowledge/domain/domainStore";
import type { AdminPreviewUser } from "./users/adminUsersPreview";
import { UserRolesPreviewPage } from "./users/UserRolesPreviewPage";
import { DomainManagementPage } from "./domains/DomainManagementPage";
import { Button } from "@/shared/ui";
import "./adminPage.css";

type AdminTab = "users" | "domains";

export function AdminPage({ session, previewUsers }: { session: MockSession; previewUsers: readonly AdminPreviewUser[] }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const governance = useDomainGovernance();
  const tab: AdminTab = params.get("tab") === "domains" ? "domains" : "users";
  const activeDomainCount = useMemo(() => governance.domains.filter((domain) => domain.status === "active").length, [governance.domains]);

  useEffect(() => {
    if (tab === "users") document.body.dataset.page = "admin-users";
    else delete document.body.dataset.page;
    return () => { if (document.body.dataset.page === "admin-users") delete document.body.dataset.page; };
  }, [tab]);

  function selectTab(next: AdminTab) {
    const query = new URLSearchParams(params);
    if (next === "users") query.delete("tab"); else query.set("tab", "domains");
    setParams(query, { replace: true });
  }

  return (
    <main className="ef-admin-page">
      <header className="ef-admin-head">
        <div className="ef-admin-head-copy">
          <nav className="ef-admin-crumb" aria-label="面包屑">
            <button type="button" onClick={() => navigate("/")}>首页</button>
            <span aria-hidden="true">/</span>
            <b>管理</b>
            <span aria-hidden="true">/</span>
            <span>{tab === "users" ? "用户与角色" : "知识领域"}</span>
          </nav>
          <h1>{tab === "users" ? "用户与角色" : "知识领域"}</h1>
          {tab === "domains" ? <p>领域负责语义分类与颜色治理，不参与知识图布局。</p> : null}
        </div>
        {tab === "domains" ? (
          <Button variant="secondary" icon={<Network size={16} aria-hidden />} onClick={() => navigate("/archive")}>在全局图中查看</Button>
        ) : null}
      </header>

      <div className="ef-admin-tabs" role="tablist" aria-label="管理">
        <button
          type="button"
          role="tab"
          id="ef-admin-tab-users"
          aria-selected={tab === "users"}
          aria-controls="ef-admin-panel-users"
          className={tab === "users" ? "is-on" : ""}
          onClick={() => selectTab("users")}
        >
          用户与角色 <b>{previewUsers.length}</b>
        </button>
        <button
          type="button"
          role="tab"
          id="ef-admin-tab-domains"
          aria-selected={tab === "domains"}
          aria-controls="ef-admin-panel-domains"
          className={tab === "domains" ? "is-on" : ""}
          onClick={() => selectTab("domains")}
        >
          知识领域 <b>{activeDomainCount}</b>
        </button>
      </div>

      {tab === "users" ? (
        <div id="ef-admin-panel-users" role="tabpanel" aria-labelledby="ef-admin-tab-users" className="ef-admin-panel">
          <UserRolesPreviewPage users={previewUsers} />
        </div>
      ) : (
        <div id="ef-admin-panel-domains" role="tabpanel" aria-labelledby="ef-admin-tab-domains" className="ef-admin-panel">
          <DomainManagementPage session={session} />
        </div>
      )}
    </main>
  );
}
