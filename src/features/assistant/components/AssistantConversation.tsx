import { ArrowUpRight, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { snapshotAssistantContext, type AssistantContext } from "../assistantContext";
import { useAssistantRuntime } from "../AssistantRuntimeContext";

export function AssistantConversation({ context, compact = true }: { context: AssistantContext; compact?: boolean }) {
  const navigate = useNavigate();
  const runtime = useAssistantRuntime();
  const [input, setInput] = useState("");
  const visible = compact ? runtime.messages.slice(-8) : runtime.messages;
  async function submit() {
    const value = input.trim();
    if (!value || runtime.sending) return;
    setInput("");
    await runtime.send(value, snapshotAssistantContext(context));
  }
  return <div className={`assistant-conversation ${compact ? "compact" : "full"}`}>
    <div className="assistant-conversation-messages" aria-live="polite">
      {runtime.loading ? <p className="assistant-empty"><Loader2 size={14} className="spin"/>正在加载对话…</p> : visible.length ? visible.map((message) => <article key={message.id} className={`assistant-chat-message ${message.role}`}><small>{message.role === "user" ? "你" : "EduFlow"}</small><p>{message.content || (runtime.sending ? "正在思考…" : "")}</p></article>) : <p className="assistant-empty">可以询问当前页面中的 Knowledge、Course、Material 或你的学习状态。</p>}
    </div>
    {runtime.error ? <p className="assistant-error" role="alert">{runtime.error}</p> : null}
    <div className="course-design-assistant-input"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="询问 EduFlow…"/><button disabled={runtime.sending || !input.trim()} onClick={() => void submit()} aria-label="发送给 EduFlow Assistant">{runtime.sending ? <Loader2 size={15} className="spin"/> : <Send size={15}/>}</button></div>
    {compact ? <button className="assistant-open-full" onClick={() => navigate("/messages")}>进入完整对话<ArrowUpRight size={13}/></button> : null}
  </div>;
}
