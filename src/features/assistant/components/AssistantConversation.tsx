import { useState } from "react";
import { Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAssistantRuntime } from "../AssistantRuntimeContext";
import { snapshotAssistantContext, type AssistantContext } from "../assistantContext";
import type { AssistantCardActions } from "../cards/AssistantCardView";
import { AssistantTimelineMessage } from "./AssistantTimeline";
import { ConversationWorkspace } from "../conversation/ConversationWorkspace";

/**
 * Floating Assistant surface. It shares the Home timeline renderer and the
 * same Global Assistant runtime; it never owns a second message format.
 */
export function AssistantConversation({ context }: { context: AssistantContext }) {
  const runtime = useAssistantRuntime();
  const navigate = useNavigate();
  const [goalMode, setGoalMode] = useState(false);
  const visible = runtime.chatMessages.slice(-8);
  const contextSnapshot = snapshotAssistantContext(context);
  const actions: AssistantCardActions = {
    openCourse: (courseId) => navigate(`/courses/${encodeURIComponent(courseId)}`),
    openPractice: (courseId, assignmentId) => navigate(`/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}`, { state: { returnTo: "/" } }),
    openBrief: (messageId) => navigate(`/courses/create?briefId=${encodeURIComponent(messageId)}`),
    openMaterial: (courseId, materialId, segmentId) => navigate(`/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}${segmentId ? `?segment=${encodeURIComponent(segmentId)}` : ""}`),
    recordMicroCompleted: (input) => { void runtime.recordAction({ kind: "micro-completed", ...input }, contextSnapshot); },
    useCourse: (planningMessageId, courseId, context) => runtime.useExistingCourse(planningMessageId, courseId, context),
    refineGoal: (planningMessageId, refinement, context) => runtime.refineGoal(planningMessageId, refinement, context),
    prepareBrief: (planningMessageId, input, context) => runtime.prepareCourseBrief({ planningMessageId, ...input }, context)
  };
  return <div className="assistant-conversation compact">
    <ConversationWorkspace
      mode="assistant"
      loading={runtime.loading}
      sending={runtime.sending}
      replying={runtime.replying}
      onStop={runtime.stop}
      error={runtime.error}
      messages={visible.map((message) => ({
        id: message.id,
        role: message.role === "user" ? "user" : "assistant",
        content: <AssistantTimelineMessage message={message} session={runtime.session} actions={actions} streaming={runtime.sending && message.id === visible[visible.length - 1]?.id} />
      }))}
      placeholder={goalMode ? "用自己的话描述你想做到什么…" : "询问 EduFlow…"}
      onSend={async (value) => { if (goalMode) return runtime.planGoal(value, contextSnapshot); return runtime.send(value, contextSnapshot); }}
      composerActions={<button type="button" className={goalMode ? "active" : ""} aria-pressed={goalMode} onClick={() => setGoalMode((value) => !value)}><Target size={13} />{goalMode ? "目标规划模式" : "规划学习目标"}</button>}
    />
  </div>;
}
