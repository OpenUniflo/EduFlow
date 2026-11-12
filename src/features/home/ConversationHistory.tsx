import { MoreHorizontal, PanelLeftClose, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import type { AssistantSession } from "@/features/assistant/assistantContract";
import { assistantSessionSourceLabel } from "@/features/assistant/assistantSessionScope";
import type { SessionActionResult } from "@/features/assistant/AssistantRuntimeContext";
import { formatConversationDay, conversationDayKey } from "@/shared/ui/conversationDates";
import { ConfirmDialog } from "@/features/workflow/editor/v2/ConfirmDialog";
import "./conversationHistory.css";

const TITLE_MAX = 80;

type ConversationHistoryProps = {
  open: boolean;
  narrow: boolean;
  sessions: AssistantSession[];
  activeSessionId: string | null;
  query: string;
  hasMore: boolean;
  loadingMore: boolean;
  loading: boolean;
  onSearch(query: string): Promise<void>;
  onLoadMore(): Promise<void>;
  onNew(): void;
  onSelect(sessionId: string): void;
  onRename(sessionId: string, title: string): Promise<SessionActionResult>;
  onDelete(sessionId: string): Promise<SessionActionResult>;
  onCollapse(): void;
};

type MenuState = { sessionId: string; top: number; left: number };
type RenameState = { sessionId: string; value: string; error: string; busy: boolean };
type ConfirmState = { session: AssistantSession; error: string; busy: boolean };

/**
 * Home's collapsible conversation history. The menu is portaled so the list's
 * scroll container can never clip it; all destructive actions go through the
 * product confirm dialog and the server remains the authority.
 */
export function ConversationHistory({
  open, narrow, sessions, activeSessionId, query, hasMore, loadingMore, loading,
  onSearch, onLoadMore, onNew, onSelect, onRename, onDelete, onCollapse
}: ConversationHistoryProps) {
  const [search, setSearch] = useState(query);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [rename, setRename] = useState<RenameState | null>(null);
  const [confirming, setConfirming] = useState<ConfirmState | null>(null);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(() => new Set());
  const searchMounted = useRef(false);
  const menuTrigger = useRef<HTMLElement | null>(null);
  const menuPanel = useRef<HTMLDivElement | null>(null);

  // Search is a server query with a 250ms debounce; `%` and `_` stay literal.
  useEffect(() => {
    if (!searchMounted.current) { searchMounted.current = true; return; }
    const timer = window.setTimeout(() => { void onSearch(search).catch(() => undefined); }, 250);
    return () => window.clearTimeout(timer);
  }, [onSearch, search]);

  useEffect(() => {
    if (!menu) return;
    const focusTimer = window.setTimeout(() => {
      menuPanel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    }, 0);
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuPanel.current?.contains(target)) return;
      if (menuTrigger.current?.contains(target)) return;
      setMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(null);
        menuTrigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  const groups = useMemo(() => {
    const now = new Date();
    const grouped = new Map<string, { key: string; label: string; items: AssistantSession[] }>();
    for (const session of sessions) {
      const key = conversationDayKey(session.updatedAt, now);
      const existing = grouped.get(key);
      if (existing) existing.items.push(session);
      else grouped.set(key, { key, label: formatConversationDay(session.updatedAt, now), items: [session] });
    }
    return [...grouped.values()];
  }, [sessions]);

  function openMenu(event: ReactMouseEvent<HTMLButtonElement>, sessionId: string) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 152;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
    const top = Math.max(8, Math.min(window.innerHeight - 156, rect.bottom + 4));
    menuTrigger.current = event.currentTarget;
    setMenu({ sessionId, top, left });
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") { setMenu(null); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(menuPanel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1);
    items[next].focus();
  }

  function startRename(session: AssistantSession) {
    setMenu(null);
    setRename({ sessionId: session.id, value: session.title?.trim() || "", error: "", busy: false });
  }

  async function commitRename() {
    if (!rename || rename.busy) return;
    const title = rename.value.trim();
    if (!title) { setRename({ ...rename, error: "标题不能为空" }); return; }
    setRename({ ...rename, busy: true, error: "" });
    const result = await onRename(rename.sessionId, title);
    if (result.ok) setRename(null);
    else setRename((current) => current ? { ...current, busy: false, error: result.message } : current);
  }

  async function confirmDelete() {
    if (!confirming || confirming.busy) return;
    setConfirming({ ...confirming, busy: true, error: "" });
    const result = await onDelete(confirming.session.id);
    if (result.ok) {
      setConfirming(null);
      return;
    }
    if (result.code === "assistant_session_has_course") {
      setBlockedIds((current) => new Set(current).add(confirming.session.id));
    }
    setConfirming((current) => current ? { ...current, busy: false, error: result.message } : current);
  }

  function chooseSession(sessionId: string) {
    setMenu(null);
    setRename(null);
    onSelect(sessionId);
    if (narrow) onCollapse();
  }

  function startNew() {
    setMenu(null);
    setRename(null);
    onNew();
    if (narrow) onCollapse();
  }

  const menuSession = menu ? sessions.find((session) => session.id === menu.sessionId) : undefined;
  const menuDeleteBlocked = Boolean(menuSession && (menuSession.hasCourse || blockedIds.has(menuSession.id)));

  return <>
    {narrow && open ? <button type="button" className="ef-history-scrim" aria-label="关闭对话记录" onClick={onCollapse} /> : null}
    <aside className={`ef-history${open ? "" : " is-closed"}${narrow ? " is-overlay" : ""}`} aria-label="对话记录" aria-hidden={open ? undefined : true} inert={open ? undefined : true}>
      <div className="ef-history-inner">
        <header className="ef-history-head">
          <h2>对话</h2>
          <button type="button" className="ef-home-icon ef-history-icon" onClick={onCollapse} aria-label="收起对话记录" title="收起对话记录"><PanelLeftClose size={16} aria-hidden="true" /></button>
        </header>
        <button type="button" className="ef-history-new" onClick={startNew}><Plus size={16} aria-hidden="true" />新对话</button>
        <label className="ef-history-search">
          <Search size={15} aria-hidden="true" />
          <input type="search" value={search} maxLength={160} onChange={(event) => setSearch(event.target.value)} placeholder="搜索对话" aria-label="搜索对话" />
        </label>
        <div className="ef-history-list">
          {loading && !sessions.length ? <p className="ef-history-muted" role="status">正在加载对话…</p> : null}
          {!loading && !sessions.length ? <p className="ef-history-empty" role="status">{query ? "没有找到相关对话" : "还没有历史对话"}</p> : null}
          {groups.map((group) => <section key={group.key} className="ef-history-group" aria-label={group.label}>
            <h3 className="ef-history-group-label">{group.label}</h3>
            {group.items.map((session) => {
              const active = session.id === activeSessionId;
              if (rename?.sessionId === session.id) {
                return <div key={session.id} className="ef-history-row is-editing">
                  <input
                    className="ef-history-rename"
                    autoFocus
                    maxLength={TITLE_MAX}
                    value={rename.value}
                    aria-label="重命名对话"
                    aria-invalid={Boolean(rename.error) || undefined}
                    onChange={(event) => setRename({ ...rename, value: event.target.value, error: "" })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); void commitRename(); }
                      if (event.key === "Escape") { event.preventDefault(); setRename(null); }
                    }}
                  />
                  {rename.error ? <small className="ef-history-rename-error" role="alert">{rename.error}</small> : null}
                  <button type="button" className="ef-history-icon ef-home-icon" onClick={() => void commitRename()} disabled={rename.busy} aria-label="保存名称">保存</button>
                </div>;
              }
              return <div key={session.id} className={`ef-history-row${active ? " is-active" : ""}`} data-session-id={session.id}>
                <button type="button" className="ef-history-pick" onClick={() => chooseSession(session.id)} aria-current={active ? "true" : undefined} title={session.title?.trim() || "未命名对话"}>
                  <span className="ef-history-title">{session.title?.trim() || "未命名对话"}</span>
                  {assistantSessionSourceLabel(session.source) ? <small className="ef-history-source">{assistantSessionSourceLabel(session.source)}</small> : null}
                </button>
                <button
                  type="button"
                  className="ef-home-icon ef-history-more"
                  aria-label={`${session.title?.trim() || "未命名对话"} 的更多操作`}
                  aria-haspopup="menu"
                  aria-expanded={menu?.sessionId === session.id}
                  onClick={(event) => openMenu(event, session.id)}
                ><MoreHorizontal size={15} aria-hidden="true" /></button>
              </div>;
            })}
          </section>)}
          {hasMore ? <button type="button" className="ef-history-more-button" disabled={loadingMore} onClick={() => void onLoadMore().catch(() => undefined)}>{loadingMore ? "正在加载…" : "加载更多"}</button> : null}
        </div>
      </div>
    </aside>

    {menu && menuSession ? createPortal(
      <div
        ref={menuPanel}
        className="ef-history-menu"
        role="menu"
        aria-label={`${menuSession.title?.trim() || "未命名对话"} 的操作`}
        style={{ top: menu.top, left: menu.left }}
        onKeyDown={onMenuKeyDown}
      >
        <button type="button" role="menuitem" onClick={() => startRename(menuSession)}><Pencil size={14} aria-hidden="true" />重命名</button>
        <button type="button" role="menuitem" disabled={menuDeleteBlocked} onClick={() => { setMenu(null); setConfirming({ session: menuSession, error: "", busy: false }); }}><Trash2 size={14} aria-hidden="true" />删除</button>
        {menuDeleteBlocked ? <p className="ef-history-menu-note">这个对话创建了一门课程，不能删除</p> : null}
      </div>,
      document.body
    ) : null}

    {confirming ? <ConfirmDialog
      title="删除这个对话？"
      confirmLabel={confirming.busy ? "正在删除…" : "删除对话"}
      danger
      busy={confirming.busy}
      error={confirming.error || undefined}
      onConfirm={() => void confirmDelete()}
      onCancel={() => { if (!confirming.busy) setConfirming(null); }}
    >
      <p>删除后不能恢复，学习记录会保留。这个对话创建了课程时不能删除。</p>
      <p className="ef-history-confirm-name">{confirming.session.title?.trim() || "未命名对话"}</p>
    </ConfirmDialog> : null}
  </>;
}
