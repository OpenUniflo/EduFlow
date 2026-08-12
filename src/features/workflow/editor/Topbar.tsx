import { useEffect, useMemo, useRef, useState, type DragEvent, type FocusEvent as ReactFocusEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge as ReactFlowEdge,
  type EdgeChange,
  type Node as ReactFlowNode,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Bell,
  BookOpen,
  Bot,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  ClipboardList,
  Code2,
  Download,
  Folder,
  FolderOpen,
  GitBranch,
  Grid2X2,
  Hammer,
  Layers3,
  List,
  ListChecks,
  LogOut,
  Loader2,
  Lock,
  MessageSquare,
  MousePointer2,
  Network,
  Play,
  Plus,
  RefreshCcw,
  Route,
  Save,
  Search,
  Settings2,
  Sparkles,
  Square,
  StepForward,
  Target,
  TerminalSquare,
  Trash2,
  User,
  X,
  type LucideIcon
} from "lucide-react";
import type { CodeFile, Template } from "../domain/types";
import type { EnvironmentConfig } from "../runtime/types";
import { downloadJson, getCanvasExportTemplate, slugifyFileName } from "./editorUtilities";
import type { WorkflowCodeExporter } from "./WorkflowCodeExporter";
import { StatusLine } from "./InspectorCode";
import { getWorkflowHealth } from "./Inspector";
export function Topbar({
  template,
  codeExporter,
  workflowName,
  schemaSaved,
  isRunning,
  nodePositions,
  onBack,
  onRenameWorkflow,
  onRun,
  onStep,
  onShowCode,
  environments,
  activeEnvironmentId,
  onSelectEnvironment,
  onSaveEnvironments
}: {
  template: Template;
  codeExporter: WorkflowCodeExporter;
  workflowName: string;
  schemaSaved: boolean;
  isRunning: boolean;
  nodePositions: Record<string, { x: number; y: number }>;
  onBack: () => void;
  onRenameWorkflow: (value: string) => void;
  onRun: () => void;
  onStep: () => void;
  onShowCode: () => void;
  environments: EnvironmentConfig[];
  activeEnvironmentId: string;
  onSelectEnvironment: (environmentId: string) => void;
  onSaveEnvironments: (environments: EnvironmentConfig[], activeEnvironmentId: string) => void;
}) {
  const [draftName, setDraftName] = useState(workflowName);
  const [exportOpen, setExportOpen] = useState(false);
  const activeEnvironment = environments.find((item) => item.id === activeEnvironmentId) ?? environments[0];

  useEffect(() => {
    setDraftName(workflowName);
  }, [workflowName]);

  function commitName() {
    const nextName = draftName.trim() || "新建工作流";
    onRenameWorkflow(nextName);
  }

  function closeExportMenu() {
    window.setTimeout(() => setExportOpen(false), 0);
  }

  function handleExportCode() {
    downloadJson(`${slugifyFileName(template.name)}-code.json`, {
      type: "eduflow-code-export",
      exportedAt: new Date().toISOString(),
      workflowId: template.id,
      workflowName: template.name,
      files: codeExporter.getFiles(template)
    });
    closeExportMenu();
  }

  function handleExportCanvas() {
    downloadJson(`${slugifyFileName(template.name)}-canvas.json`, {
      type: "eduflow-canvas-export",
      exportedAt: new Date().toISOString(),
      workflow: getCanvasExportTemplate(template, nodePositions)
    });
    closeExportMenu();
  }

  function handleExportAll() {
    downloadJson(`${slugifyFileName(template.name)}-export.json`, {
      type: "eduflow-full-export",
      exportedAt: new Date().toISOString(),
      workflow: getCanvasExportTemplate(template, nodePositions),
      files: codeExporter.getFiles(template)
    });
    closeExportMenu();
  }

  return (
    <header className="topbar glass">
      <div className="brand-block">
        <button className="back-button" onClick={onBack} aria-label="返回主页">
          <ArrowLeft size={18} />
        </button>
        <div className="brand-mark">
          <Network size={20} />
        </div>
        <div>
          <div className="eyebrow">知序 · WORKFLOW</div>
          <input
            className="workflow-name-input"
            value={draftName}
            onBlur={commitName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                setDraftName(workflowName);
                event.currentTarget.blur();
              }
            }}
            aria-label="编辑工作流名称"
          />
        </div>
      </div>

      <WorkflowStatusPrompt template={template} schemaSaved={schemaSaved} activeEnvironment={activeEnvironment} />

      <nav className="toolbar-actions" aria-label="工作流操作">
        <div className={`export-menu ${exportOpen ? "open" : ""}`} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setExportOpen(false);
          }
        }}>
          <button className="tool-button" onClick={() => setExportOpen((value) => !value)} aria-expanded={exportOpen} aria-haspopup="menu">
            <Download size={16} />
            导出
            <ChevronDown size={14} />
          </button>
          {exportOpen && (
            <div className="export-menu-popover glass" role="menu">
              <button role="menuitem" onClick={handleExportCode}>
                <Code2 size={15} />
                导出代码
              </button>
              <button role="menuitem" onClick={handleExportCanvas}>
                <Grid2X2 size={15} />
                导出画布
              </button>
              <button role="menuitem" onClick={handleExportAll}>
                <Layers3 size={15} />
                一起导出
              </button>
            </div>
          )}
        </div>
        <button className="tool-button primary" onClick={onRun}>
          {isRunning ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
          运行
        </button>
        <button className="tool-button" onClick={onStep}>
          <StepForward size={16} />
          单步运行
        </button>
        <button className="tool-button" onClick={onShowCode}>
          <Code2 size={16} />
          查看代码
        </button>
        <EnvironmentMenu
          environments={environments}
          activeEnvironmentId={activeEnvironmentId}
          onSelectEnvironment={onSelectEnvironment}
          onSaveEnvironments={onSaveEnvironments}
        />
        <button className={`tool-button ${schemaSaved ? "saved" : ""}`}>
          {schemaSaved ? <Check size={16} /> : <Save size={16} />}
          保存
        </button>
      </nav>
    </header>
  );
}

export function EnvironmentMenu({
  environments,
  activeEnvironmentId,
  onSelectEnvironment,
  onSaveEnvironments
}: {
  environments: EnvironmentConfig[];
  activeEnvironmentId: string;
  onSelectEnvironment: (environmentId: string) => void;
  onSaveEnvironments: (environments: EnvironmentConfig[], activeEnvironmentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const activeEnvironment = environments.find((item) => item.id === activeEnvironmentId) ?? environments[0];

  function selectEnvironment(environmentId: string) {
    onSelectEnvironment(environmentId);
    setOpen(false);
  }

  return (
    <>
      <div className={`export-menu environment-menu ${open ? "open" : ""}`} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}>
        <button className="tool-button environment-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu">
          <Settings2 size={16} />
          <span>{activeEnvironment?.name ?? "全局环境"}</span>
          <ChevronDown size={14} />
        </button>
        {open && (
          <div className="export-menu-popover environment-menu-popover glass" role="menu">
            {environments.map((environment) => (
              <button
                role="menuitem"
                className={`environment-menu-item ${environment.id === activeEnvironmentId ? "active" : ""}`}
                key={environment.id}
                onClick={() => selectEnvironment(environment.id)}
              >
                <span>
                  <strong>{environment.name}</strong>
                  <small>{environment.model || "未配置模型"} · {environment.baseUrl || "未配置 Base URL"}</small>
                </span>
                {environment.id === activeEnvironmentId ? <Check size={15} /> : null}
              </button>
            ))}
            <button
              role="menuitem"
              className="environment-config-entry"
              onClick={() => {
                setConfigOpen(true);
                setOpen(false);
              }}
            >
              <Settings2 size={15} />
              打开配置面板
            </button>
          </div>
        )}
      </div>

      <EnvironmentConfigModal
        open={configOpen}
        environments={environments}
        activeEnvironmentId={activeEnvironmentId}
        onClose={() => setConfigOpen(false)}
        onSave={(nextEnvironments, nextActiveId) => {
          onSaveEnvironments(nextEnvironments, nextActiveId);
          setConfigOpen(false);
        }}
      />
    </>
  );
}

export function EnvironmentConfigModal({
  open,
  environments,
  activeEnvironmentId,
  onClose,
  onSave
}: {
  open: boolean;
  environments: EnvironmentConfig[];
  activeEnvironmentId: string;
  onClose: () => void;
  onSave: (environments: EnvironmentConfig[], activeEnvironmentId: string) => void;
}) {
  const [drafts, setDrafts] = useState<EnvironmentConfig[]>(environments);
  const [selectedId, setSelectedId] = useState(activeEnvironmentId);
  const selectedEnvironment = drafts.find((item) => item.id === selectedId) ?? drafts[0];

  useEffect(() => {
    if (!open) return;
    setDrafts(environments);
    setSelectedId(environments.some((item) => item.id === activeEnvironmentId) ? activeEnvironmentId : environments[0]?.id ?? "");
  }, [activeEnvironmentId, environments, open]);

  if (!open) return null;

  function closeFromBackdrop(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function updateSelected(field: keyof EnvironmentConfig, value: string) {
    setDrafts((items) => items.map((item) => (item.id === selectedEnvironment.id ? { ...item, [field]: value } : item)));
  }

  function addEnvironment() {
    const next: EnvironmentConfig = {
      id: `environment-${Date.now()}`,
      name: `Environment ${drafts.length + 1}`,
      baseUrl: "",
      apiKey: "",
      model: "gpt-4.1-mini",
      searchApiUrl: "",
      searchApiKey: "",
      databaseUrl: "",
      fileStoragePath: "",
      note: ""
    };
    setDrafts((items) => [...items, next]);
    setSelectedId(next.id);
  }

  function deleteSelected() {
    if (!selectedEnvironment || drafts.length <= 1) return;
    const nextDrafts = drafts.filter((item) => item.id !== selectedEnvironment.id);
    setDrafts(nextDrafts);
    setSelectedId(nextDrafts[0].id);
  }

  function saveDrafts() {
    const normalized = drafts.map((item, index) => ({
      ...item,
      name: item.name.trim() || `Environment ${index + 1}`,
      model: item.model.trim() || "gpt-4.1-mini"
    }));
    const nextActiveId = normalized.some((item) => item.id === selectedId) ? selectedId : normalized[0].id;
    onSave(normalized, nextActiveId);
  }

  return (
    <div className="code-modal-backdrop" onMouseDown={closeFromBackdrop}>
      <section className="code-modal environment-config-modal glass" role="dialog" aria-modal="true" aria-label="全局环境配置">
        <header className="code-modal-titlebar">
          <div className="code-modal-heading">
            <Settings2 size={20} />
            <div>
              <h2>全局环境配置</h2>
              <p>配置多套本地 mock 运行环境，仅保存在当前浏览器。</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭环境配置面板">
            <X size={20} />
          </button>
        </header>

        <div className="environment-config-body">
          <aside className="environment-list" aria-label="环境列表">
            {drafts.map((environment) => (
              <button
                className={`environment-list-item ${environment.id === selectedEnvironment?.id ? "active" : ""}`}
                key={environment.id}
                onClick={() => setSelectedId(environment.id)}
              >
                <strong>{environment.name || "未命名环境"}</strong>
                <span>{environment.model || "未配置模型"}</span>
              </button>
            ))}
            <button className="add-environment-button" onClick={addEnvironment}>
              <Plus size={15} />
              新增环境
            </button>
          </aside>

          {selectedEnvironment ? (
            <main className="environment-form">
              <div className="environment-form-grid">
                <EnvironmentField label="环境名" value={selectedEnvironment.name} onChange={(value) => updateSelected("name", value)} />
                <EnvironmentField label="默认模型" value={selectedEnvironment.model} onChange={(value) => updateSelected("model", value)} />
                <EnvironmentField label="Base URL" value={selectedEnvironment.baseUrl} onChange={(value) => updateSelected("baseUrl", value)} />
                <EnvironmentField label="API Key" type="password" value={selectedEnvironment.apiKey} onChange={(value) => updateSelected("apiKey", value)} />
                <EnvironmentField label="搜索 API URL" value={selectedEnvironment.searchApiUrl} onChange={(value) => updateSelected("searchApiUrl", value)} />
                <EnvironmentField label="搜索 API Key" type="password" value={selectedEnvironment.searchApiKey} onChange={(value) => updateSelected("searchApiKey", value)} />
                <EnvironmentField label="数据库 URL" value={selectedEnvironment.databaseUrl} onChange={(value) => updateSelected("databaseUrl", value)} />
                <EnvironmentField label="文件存储路径" value={selectedEnvironment.fileStoragePath} onChange={(value) => updateSelected("fileStoragePath", value)} />
                <label className="environment-form-field wide">
                  <span>备注</span>
                  <textarea value={selectedEnvironment.note} onChange={(event) => updateSelected("note", event.target.value)} />
                </label>
              </div>

              <div className="environment-modal-actions">
                <button className="tool-button danger" onClick={deleteSelected} disabled={drafts.length <= 1}>
                  <Trash2 size={15} />
                  删除环境
                </button>
                <div>
                  <button className="tool-button" onClick={onClose}>取消</button>
                  <button className="tool-button primary" onClick={saveDrafts}>
                    <Check size={15} />
                    保存环境配置
                  </button>
                </div>
              </div>
            </main>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function EnvironmentField({
  label,
  value,
  type = "text",
  onChange
}: {
  label: string;
  value: string;
  type?: "text" | "password";
  onChange: (value: string) => void;
}) {
  return (
    <label className="environment-form-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function WorkflowStatusPrompt({ template, schemaSaved, activeEnvironment }: { template: Template; schemaSaved: boolean; activeEnvironment?: EnvironmentConfig }) {
  const health = useMemo(() => getWorkflowHealth(template, schemaSaved, activeEnvironment), [activeEnvironment, template, schemaSaved]);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const open = pinnedOpen || hoverOpen;
  const Icon = health.status === "ready" ? Check : health.status === "warning" ? AlertTriangle : Square;

  return (
    <div
      className={`workflow-status ${health.status} ${open ? "open" : ""}`}
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
    >
      <button
        className="workflow-status-trigger"
        onClick={() => setPinnedOpen((value) => !value)}
        aria-expanded={open}
        aria-label="查看工作流状态提示"
      >
        <Icon size={16} />
        <span>{health.summary}</span>
      </button>

      {open && (
        <div className="workflow-status-popover glass">
          <div className={`workflow-status-guidance ${health.status}`}>
            <Sparkles size={16} />
            <span>{health.guidance}</span>
          </div>
          <div className="workflow-status-checks">
            {health.checks.map((item) => (
              <StatusLine key={item.label} ok={item.ok} label={item.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function CodeModal({ open, template, codeExporter, onClose }: { open: boolean; template: Template; codeExporter: WorkflowCodeExporter; onClose: () => void }) {
  const files = useMemo(() => codeExporter.getFiles(template), [codeExporter, template]);
  const [activePath, setActivePath] = useState(files[0]?.path ?? "");
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const activeFile = files.find((file) => file.path === activePath) ?? files[0];
  const fileTree = useMemo(() => {
    const items: Array<{ type: "file"; file: CodeFile } | { type: "folder"; name: string; files: CodeFile[] }> = [];
    const folderIndex = new Map<string, number>();

    files.forEach((file) => {
      const [folderName, ...restPath] = file.path.split("/");
      if (!restPath.length) {
        items.push({ type: "file", file });
        return;
      }

      if (!folderIndex.has(folderName)) {
        folderIndex.set(folderName, items.length);
        items.push({ type: "folder", name: folderName, files: [] });
      }

      const item = items[folderIndex.get(folderName) ?? -1];
      if (item?.type === "folder") {
        item.files.push(file);
      }
    });

    return items;
  }, [files]);

  useEffect(() => {
    if (open) {
      setActivePath(files[0]?.path ?? "");
      setOpenFolders(
        Object.fromEntries(
          fileTree.filter((item) => item.type === "folder").map((item) => [item.name, true])
        )
      );
    }
  }, [fileTree, files, open]);

  if (!open) return null;

  function closeFromBackdrop(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="code-modal-backdrop" onMouseDown={closeFromBackdrop}>
      <section className="code-modal glass" role="dialog" aria-modal="true" aria-label="当前工作流代码">
        <header className="code-modal-titlebar">
          <div className="code-modal-heading">
            <Code2 size={20} />
            <div>
              <h2>工作流代码</h2>
              <p>{template.name} · 只读 · 与导出代码一致</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭代码弹窗">
            <X size={20} />
          </button>
        </header>

        <div className="code-modal-body">
          <aside className="code-file-tree" aria-label="代码文件">
            <div className="file-tree-title">EXPLORER</div>
            {fileTree.map((item) => {
              if (item.type === "file") {
                return (
                  <button
                    key={item.file.path}
                    className={`code-tree-item file ${activeFile?.path === item.file.path ? "active" : ""}`}
                    onClick={() => setActivePath(item.file.path)}
                  >
                    <Code2 size={14} />
                    <span>{item.file.path}</span>
                  </button>
                );
              }

              const expanded = openFolders[item.name] ?? true;
              return (
                <div className="code-tree-folder" key={item.name}>
                  <button
                    className="code-tree-item folder"
                    onClick={() => setOpenFolders((value) => ({ ...value, [item.name]: !expanded }))}
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {expanded ? <FolderOpen size={15} /> : <Folder size={15} />}
                    <span>{item.name}</span>
                  </button>
                  {expanded ? (
                    <div className="code-tree-children">
                      {item.files.map((file) => (
                        <button
                          key={file.path}
                          className={`code-tree-item file child ${activeFile?.path === file.path ? "active" : ""}`}
                          onClick={() => setActivePath(file.path)}
                        >
                          <Code2 size={14} />
                          <span>{file.path.split("/").slice(1).join("/")}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </aside>

          <main className="code-editor-pane">
            <div className="code-tabbar">
              <span>{activeFile?.path}</span>
              <small>{activeFile?.title}</small>
            </div>
            <pre className="code-modal-code">{activeFile?.code}</pre>
          </main>
        </div>
      </section>
    </div>
  );
}
