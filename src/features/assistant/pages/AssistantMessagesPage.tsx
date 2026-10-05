import { MessageSquarePlus } from "lucide-react";
import type { MockSession } from "@/features/auth/types";
import { GlobalNav } from "@/app/components/GlobalNav";
import { AssistantConversation } from "../components/AssistantConversation";
import { useAssistantRuntime } from "../AssistantRuntimeContext";

function sessionTitle(title?:string|null){return title?.startsWith('workspace:practice:')?'实践工作记录':title?.startsWith('workspace:capability-update:')?'能力更新记录':title??'EduFlow 对话';}

export function AssistantMessagesPage({ session, onLogout }: { session: MockSession; onLogout(): void }) {
  const runtime = useAssistantRuntime();
  const context = { workspace: "messages" as const, experienceMode: "learn" as const, userRole: session.role, capabilities: session.capabilities };
  return <main className="assistant-messages-page"><GlobalNav active="learning" session={session} onLogout={onLogout}/><aside className="assistant-session-list glass-v2"><header><span><small>GLOBAL ASSISTANT</small><strong>对话</strong></span><button onClick={() => void runtime.selectSession(null)} aria-label="新建对话"><MessageSquarePlus size={17}/></button></header>{runtime.sessions.map((item) => <button key={item.id} className={runtime.activeSessionId === item.id ? "active" : ""} onClick={() => void runtime.selectSession(item.id)}><strong>{sessionTitle(item.title)}</strong><small>{new Date(item.updatedAt).toLocaleString("zh-CN")}</small></button>)}</aside><section className="assistant-full-chat glass-v2"><header><div><small>EDUFLOW ASSISTANT</small><h1>{sessionTitle(runtime.sessions.find((item) => item.id === runtime.activeSessionId)?.title)}</h1></div><p>Contextual Assistant 与这里共享同一会话；页面切换只改变新消息的 Context。</p></header><AssistantConversation context={context} compact={false}/></section></main>;
}
