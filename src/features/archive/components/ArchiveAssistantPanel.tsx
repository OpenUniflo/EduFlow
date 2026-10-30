import { ArrowRight, BookOpen, Lock, Search, Sparkles, Target, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MockSession } from "@/features/auth/types";
import { canManageCourses } from "@/features/auth/capabilities";
import { useAssistantRuntime } from "@/features/assistant/AssistantRuntimeContext";
import type { AssistantContextSnapshot } from "@/features/assistant/assistantContract";
import type { ArchiveModel } from "../model/atlasModel";
import { deriveAssistantPresentation, type ArchiveAssistantPresentation } from "../model/assistantPresentation";

export function GuestAssistantCard({ onLogin, onRegister }: { onLogin: () => void; onRegister: () => void }) {
  return (
    <aside className="ef-archive-assistant is-locked" aria-label="EduFlow 小助手（未登录）">
      <header><span className="ef-archive-assistant-icon"><Lock size={15} aria-hidden /></span><div><b>小助手</b><span>未登录</span></div></header>
      <strong>登录后可使用助手</strong>
      <p>助手可以按你的目标寻找课程、整理课程创建简报。未登录时只浏览公开知识。</p>
      <div className="ef-archive-assistant-actions"><button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={onLogin}>登录</button><button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={onRegister}>注册</button></div>
    </aside>
  );
}

export function ArchiveAssistantPanel({ session, model, context, presentation, onOpenBrief, onActiveChange, seedGoal }: {
  session: MockSession;
  model: ArchiveModel;
  context: AssistantContextSnapshot;
  presentation: ArchiveAssistantPresentation;
  onOpenBrief: (briefMessageId: string) => void;
  onActiveChange?: (active: boolean) => void;
  seedGoal?: { key: string; goal: string } | null;
}) {
  const runtime = useAssistantRuntime();
  const navigate = useNavigate();
  const [goal, setGoal] = useState("");
  const [collapsed, setCollapsed] = useState(presentation.state === "idle");
  const [localError, setLocalError] = useState("");
  const [adjustments, setAdjustments] = useState("");
  const [showAdjustments, setShowAdjustments] = useState(false);
  const status = runtime.sending ? "searching" : presentation.state;
  const targetCount = presentation.targetIds.length;
  const prerequisiteCount = presentation.prerequisiteIds.length;
  const draftCount = presentation.draftIds.length;
  const matches = presentation.plan?.matches.filter((match) => match.targetCoverage > 0 || match.requiredCoverage > 0).slice(0, 2) ?? [];
  const brief = presentation.brief;

  const contextLabel = useMemo(() => goal.trim() || presentation.goalText || "档案 · 全局星图", [goal, presentation.goalText]);

  useEffect(() => {
    if (presentation.state !== "idle") {
      setCollapsed(false);
      onActiveChange?.(true);
    }
  }, [onActiveChange, presentation.state]);

  useEffect(() => {
    if (!seedGoal) return;
    setGoal(seedGoal.goal);
    setCollapsed(false);
  }, [seedGoal]);

  async function findRoute(valueOverride?: string) {
    const value = (valueOverride ?? goal).trim();
    if (!value || runtime.sending) { if (!value) setLocalError("先写下你想做到什么。"); return; }
    setLocalError("");
    const ok = await runtime.planGoal(value, context);
    if (!ok) setLocalError(runtime.error || "助手暂时无法规划，请稍后重试。");
  }

  async function lockBrief() {
    if (!presentation.searchMessageId || runtime.sending) return;
    setLocalError("");
    try {
      await runtime.prepareCourseBrief({ planningMessageId: presentation.searchMessageId, requestedAdjustments: adjustments.trim() || undefined, referenceMaterialIntent: "none" }, context);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "课程创建简报暂时无法生成。");
    }
  }

  function createCourse() {
    if (!presentation.briefMessageId) return;
    const base = canManageCourses(session) ? "/teaching/create" : "/courses/create";
    navigate(`${base}?briefId=${encodeURIComponent(presentation.briefMessageId)}`);
  }

  if (collapsed) {
    return <button type="button" className="ef-archive-assistant-fab" onClick={() => { setCollapsed(false); onActiveChange?.(true); }} aria-label="展开 EduFlow 小助手"><Sparkles size={22} aria-hidden /><span className="ef-archive-assistant-dot" aria-hidden /></button>;
  }

  return (
    <aside className={`ef-archive-assistant is-${status}`} aria-label="EduFlow 小助手" aria-live="polite">
      <header>
        <span className="ef-archive-assistant-icon"><Sparkles size={15} aria-hidden /></span>
        <div><b>EduFlow 小助手 · 档案</b><span>{status === "searching" ? "正在寻找" : status === "brief" ? "课程创建简报" : "只提议，不直接修改课程"}</span></div>
        <button type="button" className="ef-archive-assistant-collapse" onClick={() => { setCollapsed(true); onActiveChange?.(false); }} aria-label="收起助手"><X size={14} aria-hidden /></button>
      </header>

      {status === "idle" ? (
        <>
          <strong>想学什么？我帮你找一条路线</strong>
          <p>说出目标，我只会提议知识范围和课程；锁定后进入现有的课程创建流程，仍需预览、校验与确认。</p>
          <form className="ef-archive-assistant-form" onSubmit={(event) => { event.preventDefault(); void findRoute(); }}>
            <textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="例如：我想系统学 RAG，从检索一直做到能查资料的 Agent。" aria-label="学习目标" rows={3} />
            <div><span>{contextLabel}</span><button type="submit" disabled={runtime.sending}><Search size={13} aria-hidden />{runtime.sending ? "寻找中…" : "让助手寻找"}</button></div>
          </form>
          {localError ? <p className="ef-archive-assistant-error" role="alert">{localError}</p> : null}
        </>
      ) : null}

      {status === "searching" ? (
        <>
          <div className="ef-archive-assistant-query"><span>{contextLabel}</span></div>
          <div className="ef-archive-search-steps" role="status">
            <span className="is-done"><i aria-hidden>✓</i>理解学习目标</span>
            <span className="is-active"><i aria-hidden /><Search size={11} />匹配知识节点</span>
            <span><i aria-hidden />比对已有课程</span>
          </div>
          <p className="ef-archive-assistant-note">正在查找与目标相关的知识与课程。地图只高亮已确认的命中，不会移动节点。</p>
          {presentation.candidateIds.length ? <CandidateList model={model} ids={presentation.candidateIds} /> : null}
        </>
      ) : null}

      {status === "results" ? (
        <>
          <div className="ef-archive-assistant-query"><span>{contextLabel}</span></div>
          <p className="ef-archive-assistant-lede">{presentation.intentSummary || "我已经把目标对应到可用的知识与课程。"}</p>
          <div className="ef-archive-assistant-stats"><span><b>{targetCount}</b>目标知识</span><span><b>{prerequisiteCount}</b>必要前置</span><span><b>{presentation.matchCount}</b>门相关课程</span></div>
          {presentation.candidateIds.length ? <CandidateList model={model} ids={presentation.candidateIds} /> : null}
          {matches.length ? <div className="ef-archive-assistant-matches">
            {matches.map((match) => (
              <div key={match.courseId} className="ef-archive-assistant-match">
                <b>{match.courseTitle}</b>
                <span>{match.level === "high" ? "高度匹配" : match.level === "medium" ? "部分匹配" : "匹配较少"} · 目标覆盖 {Math.round(match.targetCoverage * 100)}%</span>
                <button type="button" onClick={() => navigate(`/courses/${encodeURIComponent(match.courseId)}`)}>使用这门课程<ArrowRight size={12} aria-hidden /></button>
              </div>
            ))}
          </div> : <p className="ef-archive-muted">当前没有覆盖目标的现有课程，但仍可整理成个人课程简报。</p>}
          <div className="ef-archive-assistant-actions">
            <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={() => setShowAdjustments((value) => !value)} disabled={runtime.sending}><Target size={13} aria-hidden />锁定成形</button>
            <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => void findRoute(presentation.goalText)} disabled={runtime.sending}>重新寻找</button>
          </div>
          {showAdjustments ? <div className="ef-archive-assistant-adjust">
            <label><span>还有哪些偏好或限制？（可选）</span><textarea value={adjustments} onChange={(event) => setAdjustments(event.target.value)} placeholder="例如：更偏实践、只有三周、不要额外资料" rows={2} /></label>
            <button type="button" onClick={() => void lockBrief()} disabled={runtime.sending}>生成课程创建简报</button>
            <small>简报只包含真实知识范围；进入创建后仍走 Proposal → Preview → 校验 → 确认。</small>
          </div> : null}
        </>
      ) : null}

      {status === "brief" && brief ? (
        <>
          <div className="ef-archive-brief-say"><span className="ef-archive-assistant-icon"><Sparkles size={14} aria-hidden /></span><p>我整理好了课程创建简报。确认范围后可以开始创建，也可以继续搜索更合适的课程。</p></div>
          <div className="ef-archive-brief-head"><span className="ef-archive-brief-icon"><BookOpen size={15} aria-hidden /></span><div><b>课程创建简报</b><span>{brief.goal}</span></div><em>草稿 · 未创建</em></div>
          <dl className="ef-archive-brief-list">
            <div><dt>目标</dt><dd>{brief.goal}</dd></div>
            <div><dt>知识范围</dt><dd>{brief.targetKnowledge.length} 个知识</dd></div>
            <div><dt>已有基础</dt><dd>{brief.targetKnowledge.filter((item) => model.mineNodeIds.has(item.id)).length} 个知识你已学过</dd></div>
            <div><dt>参考资料</dt><dd>{brief.referenceMaterialIntent === "upload_in_creator" ? "在课程创建页上传" : "暂时没有（不影响创建）"}</dd></div>
            {brief.requestedAdjustments ? <div><dt>调整需求</dt><dd>{brief.requestedAdjustments}</dd></div> : null}
          </dl>
          <div className="ef-archive-brief-knowledge" aria-label="简报知识范围">
            {brief.targetKnowledge.slice(0, 8).map((item, index) => <span key={item.id} title={item.title}><i aria-hidden>{index + 1}</i>{item.title}</span>)}
            {brief.targetKnowledge.length > 8 ? <span>+{brief.targetKnowledge.length - 8}</span> : null}
          </div>
          <div className="ef-archive-assistant-actions">
            <button type="button" className="ef-ui-btn ef-ui-btn--secondary ef-ui-btn--32" onClick={() => void findRoute(brief.goal)} disabled={runtime.sending}><Search size={13} aria-hidden />继续搜索</button>
            <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={createCourse}>开始创建<ArrowRight size={13} aria-hidden /></button>
          </div>
          <button type="button" className="ef-archive-text-btn" onClick={() => { setShowAdjustments(true); void lockBrief(); }} disabled={runtime.sending}>继续调整简报范围</button>
          <p className="ef-archive-assistant-foot"><Lock size={11} aria-hidden />助手只提议；课程创建仍需预览、校验并确认。</p>
          {draftCount ? <span className="ef-archive-sr-status">地图已标出 {draftCount} 个简报知识</span> : null}
        </>
      ) : null}

      {status !== "brief" && presentation.state === "brief" && !brief ? <p className="ef-archive-assistant-error">简报暂不可用，请重试。</p> : null}
      {runtime.error || localError ? <p className="ef-archive-assistant-error" role="alert">{runtime.error || localError}</p> : null}
      {status === "brief" ? <button type="button" className="ef-archive-assistant-open" onClick={() => onOpenBrief(presentation.briefMessageId ?? "")}>在对话中查看完整简报</button> : null}
      <button type="button" className="ef-archive-assistant-collapse-text" onClick={() => { setCollapsed(true); onActiveChange?.(false); }}>收起助手</button>
    </aside>
  );
}

function CandidateList({ model, ids }: { model: ArchiveModel; ids: readonly string[] }) {
  const nodes = ids.flatMap((id) => { const node = model.nodeById.get(id); return node ? [node] : []; });
  return <div className="ef-archive-candidate-list" aria-label="候选知识"><div className="ef-archive-result-head"><b>候选知识</b><span>{nodes.length} 个 · 按匹配度</span></div>{nodes.slice(0, 6).map((node, index) => <div key={node.id} className="ef-archive-candidate"><span className="ef-archive-result-number">{String(index + 1).padStart(2, "0")}</span><span><b>{node.title}</b><small>{node.domainTitle} · {node.isMine ? (node.status === "learning" ? "在学" : "已学") : "可探索"}</small></span><em className={node.isMine ? "is-mine" : ""}>{node.isMine ? "已找到" : "候选"}</em></div>)}</div>;
}
