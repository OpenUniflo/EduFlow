import { describe, expect, it } from "vitest";
import { decodeSessionCursor, encodeSessionCursor, escapeLikePattern, normalizeSessionId, normalizeSessionTitle, sessionListLimit } from "./assistantSessions";

describe("assistant session pagination cursor", () => {
  it("round-trips updated_at with id as the tie-break", () => {
    const cursor = { updatedAt: "2026-11-07T10:20:30.123+00:00", id: "8f8a2b1c-1111-4222-8333-944455556666" };
    expect(decodeSessionCursor(encodeSessionCursor(cursor))).toEqual(cursor);
  });

  it("rejects missing, malformed and unsafe cursors", () => {
    expect(decodeSessionCursor(undefined)).toBeNull();
    expect(decodeSessionCursor("not-base64")).toBeNull();
    expect(decodeSessionCursor(Buffer.from(JSON.stringify({ updatedAt: "nope", id: "x" })).toString("base64url"))).toBeNull();
  });

  it("bounds the page size to 1..50 and defaults to 25", () => {
    expect(sessionListLimit(undefined)).toBe(25);
    expect(sessionListLimit("10")).toBe(10);
    expect(sessionListLimit("0")).toBe(1);
    expect(sessionListLimit("500")).toBe(50);
  });
});

describe("assistant session title search escaping", () => {
  it("matches literal %, _ and backslash instead of SQL wildcards", () => {
    expect(escapeLikePattern("100% done")).toBe("100\\% done");
    expect(escapeLikePattern("snake_case")).toBe("snake\\_case");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
    expect(escapeLikePattern("%_%")).toBe("\\%\\_\\%");
  });
});

describe("assistant session identity validation", () => {
  it("accepts a UUID and rejects malformed identities before SQL", () => {
    expect(normalizeSessionId(" 8f8a2b1c-1111-4222-8333-944455556666 ")).toBe("8f8a2b1c-1111-4222-8333-944455556666");
    expect(() => normalizeSessionId("not-a-uuid")).toThrowError(/valid conversation/);
    expect(() => normalizeSessionId(undefined)).toThrowError(/valid conversation/);
  });
});

describe("assistant session rename validation", () => {
  it("trims, collapses whitespace and keeps Chinese titles", () => {
    expect(normalizeSessionTitle("  我的   对话  ")).toBe("我的 对话");
  });

  it("rejects empty and over-80-character titles", () => {
    expect(() => normalizeSessionTitle("   ")).toThrowError(/required/);
    expect(() => normalizeSessionTitle("x".repeat(81))).toThrowError(/80/);
    expect(normalizeSessionTitle("x".repeat(80))).toHaveLength(80);
  });
});
