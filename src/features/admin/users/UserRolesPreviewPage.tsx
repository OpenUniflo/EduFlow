import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, Lock, MoreHorizontal, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { ADMIN_ROLE_LABELS, ADMIN_STATUS_LABELS, type AdminPreviewRole, type AdminPreviewStatus, type AdminPreviewUser } from "./adminUsersPreview";
import { Button, Chip, Pill, PreviewBadge, TextField } from "@/shared/ui";
import "./usersPreview.css";

type RoleFilter = "all" | AdminPreviewRole;
type StatusFilter = "all" | AdminPreviewStatus;
type Sort = "recent" | "name" | "role";

const PAGE_SIZE = 10;

const ROLE_FILTERS: Array<{ id: RoleFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "student", label: "学员" },
  { id: "teacher", label: "教师" },
  { id: "admin", label: "管理员" }
];

const STATUS_TONE: Record<AdminPreviewStatus, "ok" | "warn" | "quiet"> = {
  active: "ok",
  pending: "warn",
  disabled: "quiet"
};

function initialOf(name: string) {
  return name.replace(/^示例\s*·\s*/, "").trim().slice(0, 1) || "示";
}

function roleRank(role: AdminPreviewRole) {
  return role === "admin" ? 0 : role === "teacher" ? 1 : 2;
}

export function UserRolesPreviewPage({ users }: { users: readonly AdminPreviewUser[] }) {
  const [role, setRole] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

  function notify(message = "预览中不可用") {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2400);
  }

  const counts = useMemo(() => ({
    all: users.length,
    student: users.filter((user) => user.roles.includes("student")).length,
    teacher: users.filter((user) => user.roles.includes("teacher")).length,
    admin: users.filter((user) => user.roles.includes("admin")).length,
    pending: users.filter((user) => user.status === "pending").length
  }), [users]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const list = users.filter((user) => {
      if (role !== "all" && !user.roles.includes(role)) return false;
      if (status !== "all" && user.status !== status) return false;
      if (!needle) return true;
      return `${user.displayName} ${user.handle} ${user.email} ${user.organization}`.toLocaleLowerCase().includes(needle);
    });
    return list.slice().sort((left, right) => {
      if (sort === "name") return left.displayName.localeCompare(right.displayName, "zh-CN");
      if (sort === "role") return Math.min(...left.roles.map(roleRank)) - Math.min(...right.roles.map(roleRank)) || left.displayName.localeCompare(right.displayName, "zh-CN");
      return users.indexOf(left) - users.indexOf(right);
    });
  }, [query, role, sort, status, users]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageUsers = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageIds = pageUsers.map((user) => user.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  function resetPage() {
    setPage(1);
    setSelected([]);
  }

  function chooseRole(next: RoleFilter) {
    setRole(next);
    resetPage();
  }

  function chooseStatus(next: StatusFilter) {
    setStatus(next);
    resetPage();
  }

  function chooseSort(next: Sort) {
    setSort(next);
    setPage(1);
  }

  function toggleUser(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function togglePage() {
    setSelected((current) => allPageSelected
      ? current.filter((id) => !pageIds.includes(id))
      : Array.from(new Set([...current, ...pageIds])));
  }

  return (
    <section className="ef-admin-users" data-preview="sample" aria-label="用户与角色预览">
      <div className="ef-admin-users-toolbar">
        <div className="ef-admin-users-summary">
          <PreviewBadge />
          <span><b>{counts.all} 位用户</b></span>
          <span className="ef-admin-sep" aria-hidden="true" />
          <span>教师 {counts.teacher}</span>
          <span className="ef-admin-sep" aria-hidden="true" />
          <span>管理员 {counts.admin}</span>
          <span className="ef-admin-sep" aria-hidden="true" />
          <span>待激活 {counts.pending}</span>
        </div>
        <div className="ef-admin-users-actions">
          <Button size="32" variant="secondary" icon={<Download size={14} aria-hidden />} onClick={() => notify()}>导出</Button>
          <Button size="32" variant="primary" icon={<UserPlus size={14} aria-hidden />} onClick={() => notify()}>邀请用户</Button>
        </div>
      </div>

      <div className="ef-admin-users-tools">
        <div className="ef-admin-users-filters">
          <TextField
            className="ef-admin-user-search"
            icon={<Search size={16} aria-hidden />}
            value={query}
            onChange={(event) => { setQuery(event.target.value); resetPage(); }}
            placeholder="搜索姓名、邮箱或组织"
            aria-label="搜索用户"
          />
          {ROLE_FILTERS.map((filter) => (
            <Chip key={filter.id} selected={role === filter.id} onClick={() => chooseRole(filter.id)}>
              {filter.label} <b>{counts[filter.id]}</b>
            </Chip>
          ))}
        </div>
        <div className="ef-admin-users-selects">
          <label className="ef-admin-select">
            <span className="ef-sr">状态</span>
            <select value={status} onChange={(event) => chooseStatus(event.target.value as StatusFilter)}>
              <option value="all">状态：全部</option>
              <option value="active">状态：活跃</option>
              <option value="pending">状态：待激活</option>
              <option value="disabled">状态：已停用</option>
            </select>
          </label>
          <label className="ef-admin-select">
            <span className="ef-sr">排序</span>
            <select value={sort} onChange={(event) => chooseSort(event.target.value as Sort)}>
              <option value="recent">最近活跃</option>
              <option value="name">按姓名</option>
              <option value="role">按角色</option>
            </select>
          </label>
        </div>
      </div>

      {selected.length ? (
        <div className="ef-admin-batch" aria-label="批量操作">
          <span className="ef-admin-batch-count"><b>{selected.length}</b> 已选</span>
          <span className="ef-admin-batch-sep" aria-hidden="true" />
          <Button size="32" variant="secondary" icon={<Users size={14} aria-hidden />} onClick={() => notify()}>分配角色</Button>
          <Button size="32" variant="secondary" icon={<Lock size={14} aria-hidden />} onClick={() => notify()}>停用</Button>
          <Button size="32" variant="secondary" icon={<Download size={14} aria-hidden />} onClick={() => notify()}>导出</Button>
          <Button size="32" variant="ghost" onClick={() => setSelected([])}>取消选择</Button>
        </div>
      ) : null}

      <div className="ef-admin-table-card">
        <div className="ef-admin-table-wrap">
          <table className="ef-admin-table">
            <thead>
              <tr>
                <th className="ef-admin-check-col"><input type="checkbox" className="ef-admin-check" aria-label="全选本页用户" checked={allPageSelected} onChange={togglePage} /></th>
                <th>姓名</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>组织</th>
                <th>最近活跃</th>
                <th>状态</th>
                <th className="ef-admin-actions-col">操作</th>
              </tr>
            </thead>
            <tbody>
              {pageUsers.map((user) => {
                const checked = selected.includes(user.id);
                return (
                  <tr key={user.id} className={checked ? "is-selected" : ""}>
                    <td><input type="checkbox" className="ef-admin-check" aria-label={`选择用户 ${user.displayName}`} checked={checked} onChange={() => toggleUser(user.id)} /></td>
                    <td>
                      <div className="ef-admin-person">
                        <span className={`ef-admin-avatar is-${user.accent}`} aria-hidden="true">{initialOf(user.displayName)}</span>
                        <div><b>{user.displayName}</b><span>{user.handle}</span></div>
                      </div>
                    </td>
                    <td><span className="ef-admin-mail" title={user.email}>{user.email}</span></td>
                    <td><div className="ef-admin-roles">{user.roles.map((item) => <span key={item} className={`ef-admin-role is-${item}`}><i aria-hidden="true" />{ADMIN_ROLE_LABELS[item]}</span>)}</div></td>
                    <td><span className="ef-admin-org">{user.organization}</span></td>
                    <td><span className="ef-admin-active">{user.lastActive}</span></td>
                    <td><Pill tone={STATUS_TONE[user.status]} dot>{ADMIN_STATUS_LABELS[user.status]}</Pill></td>
                    <td><div className="ef-admin-row-actions"><button type="button" className="ef-admin-row-action" onClick={() => notify()}>查看</button><button type="button" className="ef-admin-row-more" aria-label={`更多操作：${user.displayName}`} onClick={() => notify()}><MoreHorizontal size={16} aria-hidden /></button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!pageUsers.length ? (
            <div className="ef-admin-empty" role="status">
              <ShieldCheck size={24} aria-hidden="true" />
              <b>没有匹配的示例用户</b>
              <p>换一个姓名、角色或状态再试。</p>
            </div>
          ) : null}
        </div>
        <footer className="ef-admin-table-foot">
          <span>共 {filtered.length} 位用户 · 每页 {PAGE_SIZE} 条 · 第 {currentPage} / {totalPages} 页</span>
          <div className="ef-admin-pages" aria-label="分页">
            <button type="button" className="ef-admin-page-btn" aria-label="上一页" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ArrowLeft size={13} aria-hidden /></button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 6).map((value) => (
              <button type="button" key={value} className="ef-admin-page-btn" aria-current={value === currentPage ? "page" : undefined} onClick={() => setPage(value)}>{value}</button>
            ))}
            {totalPages > 6 ? <span className="ef-admin-page-gap">…</span> : null}
            <button type="button" className="ef-admin-page-btn" aria-label="下一页" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ArrowRight size={13} aria-hidden /></button>
          </div>
        </footer>
      </div>

      <p className="ef-admin-preview-note"><PreviewBadge />本页所有用户、角色、状态与活动均为示例数据。筛选、勾选与批量操作只改变本页显示，不发出请求，也不会生效。</p>
      <div className={`ef-admin-toast${notice ? " is-on" : ""}`} role="status" aria-live="polite">{notice}</div>
    </section>
  );
}
