import { FileText, X } from "lucide-react";
import type { AssistantMessage, CourseCreationBrief } from "@/features/assistant/assistantContract";
import { PanelActions } from "./PanelActions";

function briefOf(messages: readonly AssistantMessage[], messageId: string): CourseCreationBrief | null {
  const message = messages.find((item) => item.id === messageId);
  const content = message?.structuredContent;
  return content?.type === "course_creation_brief" ? content : null;
}

/** Course creation brief: one panel before the explicit creator page entry. */
export function CourseBriefPanel({ messageId, messages, onClose }: {
  messageId: string;
  messages: readonly AssistantMessage[];
  onClose(): void;
}) {
  const brief = briefOf(messages, messageId);
  return <aside className="ef-object-panel" aria-label="课程简介面板">
    <header className="ef-object-panel-head">
      <span className="ef-object-panel-icon" aria-hidden="true"><FileText size={16} /></span>
      <div><span>课程创建简报</span><h2>{brief?.goal ?? "课程简介"}</h2></div>
      <button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭课程简介面板"><X size={15} /></button>
    </header>
    <div className="ef-object-panel-body">
      {brief ? <>
        <dl className="ef-object-definition">
          <div><dt>目标知识点</dt><dd>{brief.targetKnowledge.length} 个</dd></div>
          <div><dt>参考资料</dt><dd>{brief.referenceMaterialIntent === "upload_in_creator" ? "进入创建页后补充" : "不需要"}</dd></div>
          {brief.sourceCourseId ? <div><dt>参考课程</dt><dd>{brief.sourceCourseId}</dd></div> : null}
          {brief.requestedAdjustments ? <div><dt>你的调整</dt><dd>{brief.requestedAdjustments}</dd></div> : null}
        </dl>
        {brief.targetKnowledge.length ? <ul className="ef-object-brief-list">
          {brief.targetKnowledge.map((item) => <li key={item.id}><strong>{item.title}</strong>{item.description ? <small>{item.description}</small> : null}</li>)}
        </ul> : <p className="ef-object-empty">这份简报还没有确定的目标知识点；进入创建页可以继续调整。</p>}
        <p className="ef-object-note">简报是课程创建的输入，不是已创建的课程。进入创建页检查后再创建。</p>
      </> : <p className="ef-object-empty">这份课程简介暂时无法读取，或来自更早的对话。进入课程创建页仍可检查它。</p>}
    </div>
    <footer className="ef-object-panel-foot"><span>未创建课程</span><PanelActions expand={{ kind: "page", href: `/courses/create?briefId=${encodeURIComponent(messageId)}` }} /></footer>
  </aside>;
}
