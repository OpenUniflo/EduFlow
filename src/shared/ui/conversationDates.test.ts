import { describe, expect, it } from "vitest";
import { conversationDayKey, formatConversationDay, formatConversationUpdatedAt } from "./conversationDates";

const now = new Date(2026, 10, 8, 12, 0, 0);

describe("conversation date grouping", () => {
  it("names today and yesterday in local time", () => {
    expect(formatConversationDay(new Date(2026, 10, 8, 8, 30), now)).toBe("今天");
    expect(formatConversationDay(new Date(2026, 10, 7, 23, 50), now)).toBe("昨天");
  });

  it("formats older dates with Intl and adds the year only when needed", () => {
    expect(formatConversationDay(new Date(2026, 10, 5, 9, 0), now)).toBe("11月5日");
    expect(formatConversationDay(new Date(2025, 10, 5, 9, 0), now)).toBe("2025年11月5日");
  });

  it("uses a local calendar key so messages on the same day group together", () => {
    expect(conversationDayKey(new Date(2026, 10, 8, 0, 5), now)).toBe("2026-11-8");
    expect(conversationDayKey("2026-11-07T23:59:00", now)).toBe("2026-11-7");
  });

  it("formats a secondary update line for same-title conversations", () => {
    expect(formatConversationUpdatedAt(new Date(2026, 10, 8, 9, 5))).toMatch(/2026\/11\/08|2026-11-08|2026年11月8日/);
    expect(formatConversationUpdatedAt(new Date(2026, 10, 8, 9, 5))).toContain("09:05");
    expect(formatConversationUpdatedAt("not-a-date")).toBe("");
  });

  it("falls back safely for missing or invalid timestamps", () => {
    expect(formatConversationDay(undefined, now)).toBe("今天");
    expect(formatConversationDay("not-a-date", now)).toBe("今天");
  });
});
