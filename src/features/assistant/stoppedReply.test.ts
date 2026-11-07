import { describe, expect, it } from "vitest";
import { appendStoppedMarker, canPersistStoppedReply, hasStoppedMarker, stoppedReplyContent, type StoppedMarkerPart } from "./stoppedReply";

const card = {
  type: "tool-displayCard",
  toolCallId: "card-1",
  state: "output-available",
  input: { cardType: "micro", pathId: "p1" },
  output: { card: { cardType: "micro", pathId: "p1" } }
};

describe("stopped reply persistence", () => {
  it("marks a partial text reply with an existing parts data marker", () => {
    const parts = appendStoppedMarker([{ type: "text", text: "已经生成的内容" }]);
    expect(hasStoppedMarker(parts)).toBe(true);
    expect(parts).toContainEqual({ type: "data-stopped", data: { reason: "learner" } });
    expect(stoppedReplyContent("已经生成的内容", parts)).toBe("已经生成的内容");
  });

  it("does not add the marker twice", () => {
    const once = appendStoppedMarker([{ type: "text", text: "内容" }]);
    const twice = appendStoppedMarker(once as StoppedMarkerPart[]);
    expect(twice.filter((part) => (part as { type?: string }).type === "data-stopped")).toHaveLength(1);
  });

  it("persists a completed card even when no text was generated", () => {
    const parts = appendStoppedMarker([card]);
    expect(canPersistStoppedReply("", parts)).toBe(true);
    expect(stoppedReplyContent("", parts)).toBe("已停止回复");
  });

  it("writes no assistant row when nothing was generated", () => {
    expect(canPersistStoppedReply("   ", [])).toBe(false);
    expect(stoppedReplyContent("   ", [])).toBe("");
  });
});
