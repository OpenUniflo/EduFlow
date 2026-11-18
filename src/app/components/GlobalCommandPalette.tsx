import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronRight,
  CircleDot,
  CornerDownLeft,
  GraduationCap,
  History,
  Home,
  LayoutGrid,
  Network,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import type { MockSession } from "@/features/auth/types";
import { applicationServices } from "@/app/services/applicationServices";
import { userKnowledgeAccess, globalKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { archiveHref } from "@/features/archive/model/atlasParams";
import { COMMAND_PALETTE_OPEN_EVENT, type CommandPaletteOpenDetail } from "@/shared/ui/commandPaletteEvents";
import {
  buildGlobalSearchData,
  filterGlobalSearch,
  visibleSearchRuntimes,
  type ActionSearchItem,
  type CourseSearchItem,
  type GlobalSearchActionId,
  type GlobalSearchPageId,
  type KnowledgeSearchItem,
  type PageSearchItem
} from "../search/globalSearch";
import "./globalCommandPalette.css";

type Entry = {
  key: string;
  group: "pages" | "courses" | "knowledge" | "actions";
  title: string;
  meta: string;
  icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>;
  onSelect: () => void;
};

const PAGE_ICONS: Record<GlobalSearchPageId, ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>> = {
  home: Home,
  archive: Network,
  works: LayoutGrid,
  records: History,
  settings: Settings2,
  teaching: GraduationCap,
  admin: ShieldCheck
};

const GROUP_LABELS = {
  pages: "页面",
  courses: "课程",
  knowledge: "知识点",
  actions: "操作"
} as const;

function isCurrentPage(path: string, pathname: string) {
  return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
}

export function GlobalCommandPalette({ session }: { session: MockSession | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setQuery("");
      setOpen((value) => !value);
    }
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<CommandPaletteOpenDetail>).detail;
      setQuery(detail?.query ?? "");
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        const target = returnFocusRef.current;
        if (target?.isConnected) target.focus();
      });
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  const data = useMemo(() => {
    if (!open) return null;
    const runtimes = visibleSearchRuntimes(applicationServices.courseRepository.listCourseRuntimes(), session);
    const graph = session
      ? applicationServices.knowledgeRepository.getVisibleGraph(userKnowledgeAccess(session.userId))
      : applicationServices.knowledgeRepository.getVisibleGraph(globalKnowledgeAccess);
    const records = session ? applicationServices.userKnowledgeRepository.getUserKnowledge(session.userId) : [];
    const courseStates = session
      ? new Map(runtimes.map((runtime) => [runtime.course.id, applicationServices.learningProgressRepository.getCourseState(session.userId, runtime.course.id)]))
      : new Map();
    try {
      return buildGlobalSearchData({
        session,
        graph,
        governance: applicationServices.domainGovernanceRepository.load(),
        runtimes,
        records,
        courseStates
      });
    } catch {
      return buildGlobalSearchData({
        session,
        graph: { nodes: [], revisions: [], edges: [] },
        governance: { domains: [], assignments: [], candidates: [], proposals: [], revision: 0 },
        runtimes: [],
        records: [],
        courseStates: new Map()
      });
    }
  }, [open, session]);

  const results = useMemo(() => data ? filterGlobalSearch(data, query) : null, [data, query]);

  const runAction = useCallback((action: ActionSearchItem) => {
    if (action.id === "new-workflow") {
      navigate("/works?create=1");
      return;
    }
    if (action.id === "continue-course" && action.courseId) {
      navigate(`/courses/${encodeURIComponent(action.courseId)}`);
      return;
    }
    if (action.id === "open-records") {
      navigate("/records");
      return;
    }
    if (action.id === "open-settings") {
      navigate("/settings");
      return;
    }
    if (action.id === "open-assistant") {
      const trigger = document.querySelector<HTMLButtonElement>(".course-design-assistant-trigger");
      if (trigger && !trigger.disabled) {
        trigger.click();
        return;
      }
      navigate("/");
      window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(".ef-home-composer textarea, .ef-home-composer input")?.focus(), 160);
    }
  }, [navigate]);

  const entries = useMemo<Entry[]>(() => {
    if (!results) return [];
    const pages: Entry[] = results.pages.items.map((item: PageSearchItem) => ({
      key: `page:${item.id}`,
      group: "pages",
      title: item.title,
      meta: isCurrentPage(item.path, location.pathname) ? "当前" : "",
      icon: PAGE_ICONS[item.id],
      onSelect: () => navigate(item.path)
    }));
    const courses: Entry[] = results.courses.items.map((item: CourseSearchItem) => ({
      key: `course:${item.id}`,
      group: "courses",
      title: item.title,
      meta: item.meta,
      icon: BookOpen,
      onSelect: () => navigate(`/courses/${encodeURIComponent(item.id)}`)
    }));
    const knowledge: Entry[] = results.knowledge.items.map((item: KnowledgeSearchItem) => ({
      key: `knowledge:${item.id}`,
      group: "knowledge",
      title: item.title,
      meta: item.meta,
      icon: CircleDot,
      onSelect: () => navigate(archiveHref({ panel: "search", search: item.title, focus: `knowledge:${item.id}` }))
    }));
    const actions: Entry[] = results.actions.items.map((item: ActionSearchItem) => ({
      key: `action:${item.id}`,
      group: "actions",
      title: item.title,
      meta: item.meta,
      icon: actionIcon(item.id),
      onSelect: () => runAction(item)
    }));
    // Keyboard order is the visual group order, not a fixed type list.
    const byGroup: Record<(typeof results.groupOrder)[number], Entry[]> = { pages, courses, knowledge, actions };
    return results.groupOrder.flatMap((group) => byGroup[group]);
  }, [location.pathname, navigate, results, runAction]);

  const groups = useMemo(() => (results?.groupOrder ?? []).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    entries: entries.filter((entry) => entry.group === key)
  })).filter((group) => group.entries.length > 0), [entries, results]);

  useEffect(() => {
    if (!open || !entries.length) return;
    const active = dialogRef.current?.querySelector<HTMLElement>(`[data-cmdk-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, entries.length, open, query]);

  function activate(entry: Entry) {
    close();
    entry.onSelect();
  }

  function onDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!entries.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + step + entries.length) % entries.length);
      return;
    }
    if (event.key === "Home" && entries.length) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && entries.length) {
      event.preventDefault();
      setActiveIndex(entries.length - 1);
      return;
    }
    if (event.key === "Enter" && entries[activeIndex]) {
      event.preventDefault();
      activate(entries[activeIndex]);
      return;
    }
    if (event.key === "Tab") {
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("input, button:not([disabled])") ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  if (!open || !results || !data) return null;

  let entryIndex = 0;
  const activeEntry = entries[activeIndex];
  const activeOptionId = activeEntry ? `${dialogId}-option-${activeIndex}` : undefined;

  return createPortal(
    <div className="ef-cmdk-layer" data-cmdk-layer>
      <div className="ef-cmdk-scrim" aria-hidden="true" />
      <section
        ref={dialogRef}
        className="ef-cmdk ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-24"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
        onKeyDown={onDialogKeyDown}
        data-cmdk
      >
        <h2 id={`${dialogId}-title`} className="ef-sr">全局搜索</h2>
        <div className="ef-cmdk-search">
          <Search size={20} aria-hidden="true" />
          <label className="ef-sr" htmlFor={`${dialogId}-input`}>搜索课程、知识点、页面或操作</label>
          <input
            ref={inputRef}
            id={`${dialogId}-input`}
            className="ef-cmdk-input"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={`${dialogId}-results`}
            aria-activedescendant={activeOptionId}
            autoComplete="off"
            spellCheck={false}
            placeholder="搜索课程、知识点、页面或操作"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>⌘K</kbd>
        </div>

        <div className="ef-cmdk-body" id={`${dialogId}-results`} role="listbox" aria-labelledby={`${dialogId}-title`}>
          {results.empty ? (
            <div className="ef-cmdk-empty" role="status">
              <span className="ef-cmdk-empty-icon"><Search size={20} aria-hidden="true" /></span>
              <b>没有找到「{results.query}」</b>
              <p>试试更短的关键词，或者搜索页面、课程与知识。</p>
            </div>
          ) : groups.map((group) => (
            <div className="ef-cmdk-group" role="group" aria-labelledby={`${dialogId}-${group.key}`} key={group.key}>
              <b id={`${dialogId}-${group.key}`}>{group.label}</b>
              {group.entries.map((entry) => {
                const index = entryIndex++;
                const Icon = entry.icon;
                return (
                  <button
                    type="button"
                    role="option"
                    id={`${dialogId}-option-${index}`}
                    data-cmdk-index={index}
                    data-cmdk-option={entry.key}
                    aria-selected={index === activeIndex}
                    className={`ef-cmdk-row${index === activeIndex ? " is-on" : ""}`}
                    key={entry.key}
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    onClick={() => activate(entry)}
                  >
                    <span className="ef-cmdk-icon"><Icon size={14} aria-hidden /></span>
                    <span className="ef-cmdk-copy"><b title={entry.title}>{entry.title}</b></span>
                    {entry.meta ? <span className="ef-cmdk-meta">{entry.meta}</span> : null}
                    <ChevronRight size={14} aria-hidden="true" className="ef-cmdk-arrow" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <footer className="ef-cmdk-foot">
          <span className="ef-cmdk-key"><kbd><ArrowUp size={12} aria-hidden="true" /></kbd><kbd><ArrowDown size={12} aria-hidden="true" /></kbd>选择</span>
          <span className="ef-cmdk-key"><kbd><CornerDownLeft size={12} aria-hidden="true" /></kbd>打开</span>
          <span className="ef-cmdk-key"><kbd>esc</kbd>关闭</span>
          <span className="ef-cmdk-stats" aria-live="polite">
            {results.pages.items.length} 个页面 · {results.courses.items.length} 门课程 · {results.knowledge.items.length} 个知识点 · {results.actions.items.length} 个操作
          </span>
        </footer>
      </section>
    </div>,
    document.body
  );
}

function actionIcon(id: GlobalSearchActionId) {
  if (id === "new-workflow") return Plus;
  if (id === "continue-course") return BookOpen;
  if (id === "open-records") return History;
  if (id === "open-settings") return Settings2;
  return Sparkles;
}

