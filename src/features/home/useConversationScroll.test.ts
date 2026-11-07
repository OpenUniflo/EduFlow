import { describe, expect, it } from "vitest";
import type { AssistantUIMessage } from "@/features/assistant/AssistantRuntimeContext";
import { completionReplyFor } from "./useConversationScroll";

function message(id: string, role: "user" | "assistant", dedupeKey: string, messageKind: "utterance" | "action" = "action"): AssistantUIMessage {
  return { id, role, parts: [{ type: "text", text: "x" }], metadata: { dedupeKey, messageKind } } as AssistantUIMessage;
}

describe("completion follow trigger", () => {
  it("follows every server-owned completion reply family", () => {
    const messages = [
      message("u1", "user", "micro-completed:s1:p1:user"),
      message("m1", "assistant", "micro-completed:s1:p1:assistant"),
      message("p1", "assistant", "practice-submitted:attempt-1:assistant"),
      message("e1", "assistant", "practice-evaluated:attempt-1:result-1"),
      message("s1", "assistant", "segment-cleared:s1:course:assignment")
    ];
    const newIds = new Set(messages.map((item) => item.id));
    expect(completionReplyFor(messages, newIds)).toBe("s1");
    expect(completionReplyFor(messages.slice(0, 2), new Set(["m1"]))).toBe("m1");
    expect(completionReplyFor([messages[2]], new Set(["p1"]))).toBe("p1");
    expect(completionReplyFor([messages[3]], new Set(["e1"]))).toBe("e1");
  });

  it("ignores actions, typed messages and already-seen replies", () => {
    const typed = message("t1", "assistant", "", "utterance");
    const action = message("a1", "assistant", "micro-opened:s1:p1");
    const completion = message("c1", "assistant", "micro-completed:s1:p1:assistant");
    expect(completionReplyFor([typed, action], new Set(["t1", "a1"]))).toBeNull();
    expect(completionReplyFor([completion], new Set())).toBeNull();
  });
});
