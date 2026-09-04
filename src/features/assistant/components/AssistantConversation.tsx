import { ArrowUpRight, BookOpen, FileText, Loader2, Search, Send, Target } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AssistantContextSnapshot, AssistantMessage, CourseCreationBrief, CourseSearchTimelineContent } from "../assistantContract";
import { snapshotAssistantContext, type AssistantContext } from "../assistantContext";
import { useAssistantRuntime } from "../AssistantRuntimeContext";

function BriefComposer({ planningMessageId, sourceCourseId, initialAdjustments = "", initialReference = "none", context, onDone }: { planningMessageId: string; sourceCourseId?: string; initialAdjustments?: string; initialReference?: "none" | "upload_in_creator"; context: AssistantContextSnapshot; onDone(): void }) {
  const runtime = useAssistantRuntime();
  const [adjustments, setAdjustments] = useState(initialAdjustments);
  const [referenceMaterialIntent, setReferenceMaterialIntent] = useState<"none" | "upload_in_creator">(initialReference);
  return <div className="assistant-brief-composer">
    <label><span>{sourceCourseId ? "你希望怎样调整这门课程？" : "还有哪些学习偏好或限制？（可选）"}</span><textarea value={adjustments} onChange={(event) => setAdjustments(event.target.value)} placeholder={sourceCourseId ? "例如：缩短路线、增加实践、调整难度或增删主题" : "例如：我只有一个月，希望以项目为主"} /></label>
    <fieldset><legend>是否希望提供参考学习资料？</legend><label><input type="radio" checked={referenceMaterialIntent === "upload_in_creator"} onChange={() => setReferenceMaterialIntent("upload_in_creator")} />在课程创建页上传资料</label><label><input type="radio" checked={referenceMaterialIntent === "none"} onChange={() => setReferenceMaterialIntent("none")} />暂时没有</label></fieldset>
    <div className="assistant-goal-actions"><button disabled={runtime.sending} onClick={() => void runtime.prepareCourseBrief({ planningMessageId, sourceCourseId, requestedAdjustments: adjustments, referenceMaterialIntent }, context).then(onDone)}>生成 Course Creation Brief</button><button className="secondary" onClick={onDone}>取消</button></div>
  </div>;
}

function CourseSearchCard({ message, content, context }: { message: AssistantMessage; content: CourseSearchTimelineContent; context: AssistantContextSnapshot }) {
  const runtime = useAssistantRuntime();
  const [expandedCourseId, setExpandedCourseId] = useState<string>();
  const [composerCourseId, setComposerCourseId] = useState<string | null>();
  const [refining, setRefining] = useState(false);
  const [refinement, setRefinement] = useState("");
  const [showUnmatched, setShowUnmatched] = useState(false);
  const ready = content.plan.resolution.status === "ready";
  const meaningfulMatches = content.plan.matches.filter((match) => match.targetCoverage > 0 || match.requiredCoverage > 0);
  const unmatched = content.plan.matches.filter((match) => match.targetCoverage === 0 && match.requiredCoverage === 0);
  const visibleMatches = showUnmatched ? [...meaningfulMatches, ...unmatched] : meaningfulMatches;
  async function useCourse(courseId: string) {
    try { const selected = await runtime.useExistingCourse(message.id, courseId, context); window.location.assign(`/courses/${encodeURIComponent(selected)}`); } catch { /* Runtime renders the product error. */ }
  }
  return <section className="assistant-goal-plan assistant-timeline-card" aria-label="课程搜索结果">
    <div className="assistant-goal-plan-heading"><Target size={15} /><strong>课程匹配</strong><span>{content.refinement ? "继续寻找结果" : "学习目标规划"}</span></div>
    <p>{content.intentSummary}</p>{content.refinement ? <small>本轮调整：{content.refinement}</small> : null}
    {ready ? <>
      <div className="assistant-goal-knowledge"><small>核心目标</small>{content.plan.resolution.targetKnowledge.map((item) => <span key={item.id}>{item.title}</span>)}</div>
      <div className="assistant-goal-knowledge prerequisites"><small>必要基础</small>{content.plan.prerequisiteKnowledge.length ? content.plan.prerequisiteKnowledge.map((item) => <span key={item.id}>{item.title}</span>) : <em>无额外必要基础</em>}</div>
      <div className="assistant-course-results">{visibleMatches.map((match) => <article key={match.courseId} className={`assistant-course-match ${match.level}`}>
        <div><strong>{match.courseTitle}</strong><span>{match.level === "high" ? "高度匹配" : match.level === "medium" ? "部分匹配" : "匹配较少"} · {match.courseType === "personal" ? "个人课程" : "标准课程"}</span></div><p>目标覆盖 {Math.round(match.targetCoverage * 100)}% · 必要范围覆盖 {Math.round(match.requiredCoverage * 100)}% · 额外范围 {match.extraKnowledgeIds.length} 项</p>
        {match.extraKnowledgeIds.length ? <small>这门课覆盖你的部分或全部目标，但还包含额外内容；可以使用整门课程，也可以基于它创建精简版本。</small> : null}
        {expandedCourseId === match.courseId ? <div className="assistant-match-gaps"><small>缺少目标：{match.missingTargetKnowledgeIds.join("、") || "无"}</small><small>缺少前置：{match.missingPrerequisiteKnowledgeIds.join("、") || "无"}</small><small>额外范围：{match.extraKnowledgeIds.length} 项</small></div> : null}
        <div className="assistant-goal-actions"><button disabled={runtime.sending} onClick={() => void useCourse(match.courseId)}>使用这门课程</button><button disabled={runtime.sending} onClick={() => setComposerCourseId(match.courseId)}>基于这门课程创建</button><button className="secondary" onClick={() => setExpandedCourseId((value) => value === match.courseId ? undefined : match.courseId)}>查看差异</button></div>
        {composerCourseId === match.courseId ? <BriefComposer planningMessageId={message.id} sourceCourseId={match.courseId} context={context} onDone={() => setComposerCourseId(null)} /> : null}
      </article>)}</div>
      {!meaningfulMatches.length ? <p>当前没有与目标存在有效覆盖的课程，但仍可基于已有学习内容准备个性化课程。</p> : null}
      {unmatched.length ? <button className="secondary" onClick={() => setShowUnmatched((value) => !value)}>{showUnmatched ? "收起低相关课程" : `查看 ${unmatched.length} 门无覆盖课程`}</button> : null}
      <div className="assistant-search-footer"><button disabled={runtime.sending} onClick={() => setRefining(true)}><Search size={13} />继续寻找</button><button disabled={runtime.sending} onClick={() => setComposerCourseId("")}><BookOpen size={13} />创建个性化学习路线</button></div>
      {refining ? <div className="assistant-refinement"><label><span>这些结果哪里不符合你的预期？</span><textarea value={refinement} onChange={(event) => setRefinement(event.target.value)} placeholder="例如：太理论了，我希望一个月内做出项目" /></label><div className="assistant-goal-actions"><button disabled={!refinement.trim() || runtime.sending} onClick={() => void runtime.refineGoal(message.id, refinement, context).then(() => { setRefinement(""); setRefining(false); })}>重新搜索</button><button className="secondary" onClick={() => setRefining(false)}>取消</button></div></div> : null}
      {composerCourseId === "" ? <BriefComposer planningMessageId={message.id} context={context} onDone={() => setComposerCourseId(null)} /> : null}
    </> : <div className="assistant-goal-unresolved"><strong>{content.plan.resolution.status === "needs_clarification" ? "还需要补充目标" : "目标已理解，但当前内容覆盖不足"}</strong><p>{content.plan.resolution.reason}</p><small>{content.plan.resolution.status === "no_match" ? "你可以修改目标后重试，或返回课程中心查看现有学习内容。" : "补充你希望完成的具体成果后可以继续。"}</small></div>}
  </section>;
}

function BriefCard({ message, content, context }: { message: AssistantMessage; content: CourseCreationBrief; context: AssistantContextSnapshot }) {
  const navigate = useNavigate(); const [editing, setEditing] = useState(false);
  return <section className="assistant-goal-plan assistant-timeline-card assistant-brief-card" aria-label="Course Creation Brief">
    <div className="assistant-goal-plan-heading"><FileText size={15} /><strong>Course Creation Brief</strong></div>
    <dl><div><dt>目标</dt><dd>{content.goal}</dd></div>{content.sourceCourseId ? <div><dt>参考课程</dt><dd>{content.sourceCourseId}</dd></div> : null}<div><dt>目标 Knowledge</dt><dd>{content.targetKnowledge.map((item) => item.title).join("、")}</dd></div>{content.requestedAdjustments ? <div><dt>调整需求</dt><dd>{content.requestedAdjustments}</dd></div> : null}<div><dt>参考资料</dt><dd>{content.referenceMaterialIntent === "upload_in_creator" ? "将在课程创建页上传" : "暂时没有（不影响创建）"}</dd></div></dl>
    <div className="assistant-goal-actions"><button onClick={() => setEditing(true)}>修改需求</button><button onClick={() => navigate(`/courses/create?briefId=${encodeURIComponent(message.id)}`)}>进入课程创建</button></div>
    {editing ? <BriefComposer planningMessageId={content.planningMessageId} sourceCourseId={content.sourceCourseId} initialAdjustments={content.requestedAdjustments} initialReference={content.referenceMaterialIntent} context={context} onDone={() => setEditing(false)} /> : null}
  </section>;
}

function TimelineMessage({ message, runtimeContext }: { message: AssistantMessage; runtimeContext: AssistantContextSnapshot }) {
  const structured = message.structuredContent;
  return <article className={`assistant-chat-message ${message.role}`}><small>{message.role === "user" ? "你" : "EduFlow"}</small><p>{message.content}</p>{structured?.type === "course_search" ? <CourseSearchCard message={message} content={structured} context={runtimeContext} /> : structured?.type === "course_creation_brief" ? <BriefCard message={message} content={structured} context={runtimeContext} /> : null}</article>;
}

export function AssistantConversation({ context, compact = true }: { context: AssistantContext; compact?: boolean }) {
  const navigate = useNavigate(); const runtime = useAssistantRuntime(); const [input, setInput] = useState(""); const [goalMode, setGoalMode] = useState(false);
  const visible = compact ? runtime.messages.slice(-8) : runtime.messages; const contextSnapshot = snapshotAssistantContext(context);
  async function submit() { const value = input.trim(); if (!value || runtime.sending) return; if (goalMode) { if (await runtime.planGoal(value, contextSnapshot)) setInput(""); } else { setInput(""); await runtime.send(value, contextSnapshot); } }
  return <div className={`assistant-conversation ${compact ? "compact" : "full"}`}><div className="assistant-conversation-messages" aria-live="polite">
    {runtime.loading ? <p className="assistant-empty"><Loader2 size={14} className="spin" />正在加载对话…</p> : visible.length ? visible.map((message) => <TimelineMessage key={message.id} message={message} runtimeContext={contextSnapshot} />) : <p className="assistant-empty">可以询问当前页面中的 Knowledge、Course、Material 或你的学习状态。</p>}
  </div>{runtime.error ? <p className="assistant-error" role="alert">{runtime.error} {goalMode && input.trim() ? "你可以修改上方目标后再次提交。" : ""}</p> : null}<div className="assistant-input-mode"><button className={goalMode ? "active" : ""} onClick={() => setGoalMode((value) => !value)}><Target size={13} />{goalMode ? "目标规划模式" : "规划学习目标"}</button></div><div className="course-design-assistant-input"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder={goalMode ? "用自己的话描述你想做到什么…" : "询问 EduFlow…"} /><button disabled={runtime.sending || !input.trim()} onClick={() => void submit()} aria-label={goalMode ? "规划学习目标" : "发送给 EduFlow Assistant"}>{runtime.sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />}</button></div>{compact ? <button className="assistant-open-full" onClick={() => navigate("/messages")}>进入完整对话<ArrowUpRight size={13} /></button> : null}</div>;
}
