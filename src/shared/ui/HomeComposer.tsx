import { FileText, Link2, Paperclip, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { apiRequest } from "@/shared/api/apiClient";
import { ATTACHMENT_LIMIT } from "@/shared/assistant/attachments";
import { GlassSurface } from "./GlassSurface";
import { ContextPill } from "./Pill";
import { ComposerActionButton, composerHint, onComposerKeyDown } from "./ComposerAction";
import "./ui.css";

export type ComposerContext = { id: string; label: string };
export type ComposerAttachment = { id: string; name: string; uploading?: boolean };
export type ComposerMention = { id: string; kind: "task" | "course" | "knowledge" | "material"; label: string; value: string };
export type ComposerExtras = { mentions: ComposerMention[]; links: string[] };
type MentionCandidate = { id: string; kind: ComposerMention["kind"]; label: string; meta?: string; value: string };
type MentionPage = { items: MentionCandidate[]; total: number; hasMore: boolean; nextCursor: string | null };
type SlashCommand = { id: string; label: string; detail: string; prompt: string };
type Menu = { kind: "at" | "slash"; query: string; start: number } | null;

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "progress", label: "看我学到哪了", detail: "读真实学习进度", prompt: "我学到哪了？给我看看真实的学习进度。" },
  { id: "route", label: "看当前路线", detail: "读当前课程路线和下一步", prompt: "给我看看当前课程的路线和下一步。" },
  { id: "draft", label: "帮我看看草稿", detail: "只给反馈，不提交", prompt: "帮我看看我现在打开的动手任务草稿，先给反馈，不要提交。" },
  { id: "requirements", label: "打开任务要求", detail: "打开右侧任务面板", prompt: "打开当前动手任务的要求。" }
];

export type HomeComposerProps = {
  contexts?: ComposerContext[];
  onRemoveContext?: (id: string) => void;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string, extras: ComposerExtras) => void;
  onStop?: () => void;
  placeholder?: string;
  hint?: ReactNode;
  submitLabel?: string;
  disabled?: boolean;
  /** A reply is active: the field stays editable, the send control becomes stop. */
  replying?: boolean;
  className?: string;
  attachments?: ComposerAttachment[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  attachmentError?: string;
  uploadingAttachments?: boolean;
  /** Fill the composer instead of sending; used by every follow-up suggestion. */
  insertText?: string;
  insertKey?: string;
};

/** Home conversation composer: context pills, attachments, @ mentions, / commands, one send/stop action. */
export function HomeComposer({
  contexts = [],
  onRemoveContext,
  value,
  defaultValue = "",
  onChange,
  onSubmit,
  onStop,
  placeholder = "问知识点、看路线、读资料，或拖入文件交任务",
  hint,
  submitLabel = "发送",
  disabled = false,
  replying = false,
  className = "",
  attachments = [],
  onAddFiles,
  onRemoveAttachment,
  attachmentError,
  uploadingAttachments = false,
  insertText,
  insertKey
}: HomeComposerProps) {
  const [draft, setDraft] = useState(defaultValue);
  const [mentions, setMentions] = useState<ComposerMention[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [menu, setMenu] = useState<Menu>(null);
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [mentionTotal, setMentionTotal] = useState(0);
  const [mentionHasMore, setMentionHasMore] = useState(false);
  const [mentionCursor, setMentionCursor] = useState<string | null>(null);
  const [mentionLoadingMore, setMentionLoadingMore] = useState(false);
  const mentionEpoch = useRef(0);
  const [addOpen, setAddOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [localError, setLocalError] = useState("");
  const [dragging, setDragging] = useState(false);
  const lastInsertKey = useRef<string | null>(null);
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = value ?? draft;
  const readyAttachments = attachments.filter((attachment) => !attachment.uploading);
  const canSend = !disabled && !replying && !uploadingAttachments && (current.trim().length > 0 || readyAttachments.length > 0 || links.length > 0);

  useEffect(() => {
    if (menu?.kind !== "at") return;
    const epoch = ++mentionEpoch.current;
    setCandidates([]);
    setMentionTotal(0);
    setMentionHasMore(false);
    setMentionCursor(null);
    setMentionLoadingMore(false);
    const timer = window.setTimeout(() => {
      setMenuLoading(true);
      void apiRequest<MentionPage>(`/api/assistant?resource=mentions&q=${encodeURIComponent(menu.query)}&limit=20`)
        .then((result) => {
          if (epoch !== mentionEpoch.current) return;
          setCandidates(result.items ?? []);
          setMentionTotal(result.total ?? 0);
          setMentionHasMore(Boolean(result.hasMore));
          setMentionCursor(result.nextCursor ?? null);
        })
        .catch(() => {
          if (epoch !== mentionEpoch.current) return;
          setCandidates([]);
          setMentionTotal(0);
          setMentionHasMore(false);
          setMentionCursor(null);
        })
        .finally(() => { if (epoch === mentionEpoch.current) setMenuLoading(false); });
    }, 140);
    return () => { window.clearTimeout(timer); };
  }, [menu?.kind, menu?.query]);

  async function loadMoreMentions() {
    if (menu?.kind !== "at" || !mentionHasMore || mentionLoadingMore) return;
    const epoch = mentionEpoch.current;
    setMentionLoadingMore(true);
    try {
      const query = menu.query;
      const result = await apiRequest<MentionPage>(`/api/assistant?resource=mentions&q=${encodeURIComponent(query)}&limit=20${mentionCursor ? `&cursor=${encodeURIComponent(mentionCursor)}` : ""}`);
      if (epoch !== mentionEpoch.current) return;
      setCandidates((current) => {
        const seen = new Set(current.map((item) => item.value));
        return [...current, ...(result.items ?? []).filter((item) => !seen.has(item.value))];
      });
      setMentionTotal(result.total ?? 0);
      setMentionHasMore(Boolean(result.hasMore));
      setMentionCursor(result.nextCursor ?? null);
    } catch {
      /* the menu keeps what is already loaded */
    } finally {
      if (epoch === mentionEpoch.current) setMentionLoadingMore(false);
    }
  }

  function update(next: string, caret = next.length) {
    if (value === undefined) setDraft(next);
    onChange?.(next);
    const before = next.slice(0, caret);
    const token = before.match(/(^|\s)([@/])([^\s@/]*)$/);
    if (!token) { setMenu(null); return; }
    const kind = token[2] === "@" ? "at" : "slash";
    const query = token[3];
    setMenu({ kind, query, start: next.length - query.length - 1 });
    if (kind === "slash") setCandidates([]);
  }

  function closeMenus() {
    setMenu(null);
    setAddOpen(false);
    setLinkDraft(null);
  }

  function selectMention(candidate: MentionCandidate) {
    if (!menu) return;
    const next = current.slice(0, menu.start) + current.slice(menu.start + menu.query.length + 1);
    update(next, menu.start);
    if (value === undefined) setDraft(next);
    setMentions((items) => items.some((item) => item.value === candidate.value) ? items : [...items, { id: candidate.value, kind: candidate.kind, label: candidate.label, value: candidate.value }]);
    setMenu(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function runCommand(command: SlashCommand) {
    if (value === undefined) setDraft("");
    onChange?.("");
    setMenu(null);
    onSubmit?.(command.prompt, { mentions, links });
  }

  function addLink() {
    const url = (linkDraft ?? "").trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url)) { setLocalError("链接需要以 http:// 或 https:// 开头。"); return; }
    setLinks((items) => items.includes(url) ? items : [...items, url].slice(0, 3));
    setLinkDraft(null);
    setAddOpen(false);
    setLocalError("");
  }

  function addFiles(files: FileList | File[] | null | undefined) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setLocalError("");
    onAddFiles?.(list);
  }

  function sendDraft() {
    if (!canSend) return;
    const text = current.trim();
    onSubmit?.(text, { mentions, links });
    if (value === undefined) setDraft("");
    setMentions([]);
    setLinks([]);
    setMenu(null);
    setAddOpen(false);
    setLinkDraft(null);
    setLocalError("");
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (replying) { onStop?.(); return; }
    sendDraft();
  }

  useEffect(() => {
    if (!insertText || !insertKey || lastInsertKey.current === insertKey) return;
    lastInsertKey.current = insertKey;
    const currentValue = value ?? inputRef.current?.value ?? "";
    const next = currentValue.trim() ? `${currentValue.trimEnd()}\n${insertText}` : insertText;
    if (value === undefined) setDraft(next);
    onChange?.(next);
    setMenu(null);
    setAddOpen(false);
    setLinkDraft(null);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.length, next.length);
    });
  }, [insertKey, insertText, onChange, value]);

  useLayoutEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 32), 160)}px`;
  }, [current]);

  const slashResults = menu?.kind === "slash"
    ? SLASH_COMMANDS.filter((command) => !menu.query || command.label.includes(menu.query) || command.id.includes(menu.query))
    : [];
  const showMenu = Boolean(menu && (menu.kind === "at" ? (candidates.length > 0 || menuLoading) : slashResults.length > 0));
  const error = localError || attachmentError;

  return (
    <form
      className={`ef-ui-composer-wrap ${className}`.trim()}
      onSubmit={submit}
      aria-label="向助手发送消息"
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); event.stopPropagation(); setDragging(false); addFiles(event.dataTransfer.files); }}
      data-dragging={dragging ? "true" : undefined}
    >
      <GlassSurface tone="regular" radius={24} className="ef-ui-composer">
        {contexts.length || mentions.length || links.length ? (
          <div className="ef-ui-composer-contexts" aria-label="对话上下文">
            {contexts.map((context) => (
              <ContextPill key={context.id} label={context.label} onRemove={onRemoveContext ? () => onRemoveContext(context.id) : undefined} />
            ))}
            {mentions.map((mention) => <span key={mention.id} className="ef-ui-composer-chip" data-kind={mention.kind}>
              <span aria-hidden="true">@</span>{mention.label}
              <button type="button" aria-label={`移除 ${mention.label}`} onClick={() => setMentions((items) => items.filter((item) => item.id !== mention.id))}><X size={11} /></button>
            </span>)}
            {links.map((link) => <span key={link} className="ef-ui-composer-chip" data-kind="link">
              <Link2 size={12} aria-hidden="true" />{hostOf(link)}
              <button type="button" aria-label={`移除链接 ${link}`} onClick={() => setLinks((items) => items.filter((item) => item !== link))}><X size={11} /></button>
            </span>)}
          </div>
        ) : null}
        {attachments.length ? <div className="ef-ui-composer-files" aria-label="待发送附件">
          {attachments.map((attachment) => <span key={attachment.id} className={`ef-ui-composer-file${attachment.uploading ? " is-uploading" : ""}`}>
            <Paperclip size={13} aria-hidden="true" />
            <span title={attachment.name}>{attachment.name}</span>
            {attachment.uploading ? <small>上传中…</small> : onRemoveAttachment ? <button type="button" aria-label={`移除 ${attachment.name}`} onClick={() => onRemoveAttachment(attachment.id)}><X size={11} /></button> : null}
          </span>)}
        </div> : null}
        {showMenu ? <div className="ef-ui-composer-menu" role="listbox" aria-label={menu?.kind === "at" ? "提及对象" : "常用功能"}>
          {menu?.kind === "at" ? (candidates.length ? <>
            {candidates.map((candidate) => <button key={candidate.value} type="button" role="option" aria-selected={false} onClick={() => selectMention(candidate)}>
              <span className="ef-ui-composer-menu-icon" aria-hidden="true">{candidate.kind === "task" ? <FileText size={13} /> : <Search size={13} />}</span>
              <span><strong>{candidate.label}</strong><small>{candidate.meta ?? kindLabel(candidate.kind)}</small></span>
            </button>)}
            <div className="ef-ui-composer-menu-foot">
              <span>共 {mentionTotal} 项 · 已显示 {candidates.length} 项</span>
              {mentionHasMore ? <button type="button" onClick={() => void loadMoreMentions()} disabled={mentionLoadingMore}>{mentionLoadingMore ? "正在加载…" : "加载更多"}</button> : null}
            </div>
          </> : <p role="status">{menuLoading ? "正在查找…" : "没有匹配的对象"}</p>)
            : slashResults.map((command) => <button key={command.id} type="button" role="option" aria-selected={false} onClick={() => runCommand(command)}>
              <span className="ef-ui-composer-menu-icon" aria-hidden="true">/</span>
              <span><strong>{command.label}</strong><small>{command.detail}</small></span>
            </button>)}
        </div> : null}
        {addOpen ? <div className="ef-ui-composer-menu ef-ui-composer-add-menu" role="menu" aria-label="添加内容">
          <button type="button" role="menuitem" onClick={() => { setAddOpen(false); fileRef.current?.click(); }}><Paperclip size={13} aria-hidden="true" /><span><strong>上传文件</strong><small>支持 .txt、.md、.csv，最多 {ATTACHMENT_LIMIT} 份</small></span></button>
          <button type="button" role="menuitem" onClick={() => { setLinkDraft(""); setAddOpen(false); }}><Link2 size={13} aria-hidden="true" /><span><strong>添加链接</strong><small>仓库、演示或运行记录</small></span></button>
        </div> : null}
        {linkDraft != null ? <div className="ef-ui-composer-link-row">
          <input aria-label="链接地址" autoFocus placeholder="https://…" value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } if (event.key === "Escape") setLinkDraft(null); }} />
          <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={addLink}>添加</button>
          <button type="button" className="ef-ui-btn ef-ui-btn--ghost ef-ui-btn--32" onClick={() => setLinkDraft(null)}>取消</button>
        </div> : null}
        <div className="ef-ui-composer-bar">
          <button type="button" className={`ef-ui-composer-add${addOpen ? " is-open" : ""}`} aria-label="添加文件或链接" aria-expanded={addOpen} onClick={() => setAddOpen((open) => !open)}><Plus size={16} /></button>
          <div className="ef-ui-field-wrap">
            <div className="ef-ui-field">
              <textarea
                ref={inputRef}
                id={inputId}
                className="ef-ui-textarea ef-ui-composer-input"
                aria-label="给助手发消息"
                placeholder={placeholder}
                value={current}
                rows={1}
                disabled={disabled}
                onChange={(event) => update(event.target.value, event.target.selectionStart ?? event.target.value.length)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && (menu || addOpen || linkDraft != null)) { event.preventDefault(); closeMenus(); return; }
                  if (event.key === "Enter" && !event.shiftKey && menu) {
                    const first = menu.kind === "at" ? candidates[0] : slashResults[0];
                    if (first) {
                      event.preventDefault();
                      if (menu.kind === "at") selectMention(first as MentionCandidate);
                      else runCommand(first as SlashCommand);
                      return;
                    }
                  }
                  onComposerKeyDown(event, replying, sendDraft);
                }}
                onPaste={(event) => { const files = event.clipboardData?.files; if (files?.length) { event.preventDefault(); addFiles(files); } }}
                autoComplete="off"
              />
            </div>
          </div>
          <ComposerActionButton replying={replying} canSend={canSend} onSend={sendDraft} onStop={onStop} idleLabel={submitLabel} />
        </div>
        <input ref={fileRef} type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" multiple hidden aria-label="选择要附加的文本文件" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
        {error ? <p className="ef-ui-composer-error" role="alert">{error}</p> : null}
        {hint || replying ? <p className="ef-ui-composer-hint">{replying ? composerHint(true) : hint}</p> : null}
      </GlassSurface>
    </form>
  );
}

function kindLabel(kind: ComposerMention["kind"]) {
  return kind === "task" ? "动手任务" : kind === "course" ? "课程" : kind === "knowledge" ? "知识点" : "资料";
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./i, ""); } catch { return url; }
}
