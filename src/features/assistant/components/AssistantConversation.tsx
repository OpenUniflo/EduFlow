import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAssistantRuntime } from "../AssistantRuntimeContext";
import { snapshotAssistantContext, type AssistantContext } from "../assistantContext";
import type { AssistantSurfaceCapability } from "../assistantContract";
import type { AssistantCardActions } from "../cards/AssistantCardView";
import type { AssistantObjectTarget } from "../objectTarget";
import { AssistantTimelineMessage } from "./AssistantTimeline";
import { ConversationWorkspace } from "../conversation/ConversationWorkspace";

/**
 * Floating Assistant surface. It shares the Home timeline renderer and the
 * same Global Assistant runtime; it never owns a second message format.
 */
export function AssistantConversation({ context, open = true, ownedCapabilities = [] }: { context: AssistantContext; open?: boolean; ownedCapabilities?: readonly AssistantSurfaceCapability[] }) {
  const runtime = useAssistantRuntime();
  const location = useLocation();
  const [goalMode, setGoalMode] = useState(false);
  const [suggestionInsertion, setSuggestionInsertion] = useState<{ id: string; text: string } | null>(null);
  const ownsGoalPlanning = ownedCapabilities.includes("goal-planning");
  const visible = runtime.chatMessages.slice(-8);
  const contextSnapshot = snapshotAssistantContext(context);

  // Goal mode belongs to one opening and one page, never to the next surface.
  useEffect(() => { setGoalMode(false); }, [location.pathname, open, ownsGoalPlanning]);

  const actions: AssistantCardActions = {
    // The page-owned Object Shell host is the only panel owner. A card never
    // navigates; it announces the object it describes and stays on this page.
    openObject: (target: AssistantObjectTarget) => {
      // The object panel owns the screen while it is open; collapse the
      // floating surface instead of stacking a second right-hand column.
      window.dispatchEvent(new Event("eduflow:assistant-close"));
      window.dispatchEvent(new CustomEvent("eduflow:open-object", { detail: target }));
    },
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
      insertText={suggestionInsertion?.text}
      insertKey={suggestionInsertion?.id}
      error={runtime.error}
      messages={visible.map((message) => ({
        id: message.id,
        role: message.role === "user" ? "user" : "assistant",
        content: <AssistantTimelineMessage message={message} session={runtime.session} actions={actions} streaming={runtime.sending && message.id === visible[visible.length - 1]?.id} onSuggestion={(text) => setSuggestionInsertion({ id: crypto.randomUUID(), text })} />
      }))}
      placeholder={goalMode ? "用自己的话描述你想做到什么…" : "询问 EduFlow…"}
      onSend={async (value) => {
        if (goalMode) return (await runtime.planGoal(value, contextSnapshot)).ok;
        return runtime.send(value, contextSnapshot);
      }}
      composerActions={ownsGoalPlanning ? undefined : <button type="button" className={goalMode ? "active" : undefined} aria-pressed={goalMode} onClick={() => setGoalMode((value) => !value)}><Target size={13} />{goalMode ? "目标规划模式" : "规划学习目标"}</button>}
    />
  </div>;
}
