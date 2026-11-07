import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createUserSupabase = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/supabase.js", () => ({ createUserSupabase }));

import handler from "../../api/assistant";

type SessionRow = { id: string; user_id: string; title: string; created_at: string; updated_at: string };
type MessageRow = { id: string; session_id: string };

const LEARNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function database() {
  const sessions: SessionRow[] = [
    { id: id(1), user_id: LEARNER, title: "100% 完成", created_at: "2026-11-07T08:00:00+00:00", updated_at: "2026-11-07T10:00:00+00:00" },
    { id: id(2), user_id: LEARNER, title: "snake_case 命名", created_at: "2026-11-07T08:00:00+00:00", updated_at: "2026-11-07T09:00:00+00:00" },
    { id: id(3), user_id: LEARNER, title: "第三条", created_at: "2026-11-07T08:00:00+00:00", updated_at: "2026-11-07T08:00:00+00:00" },
    { id: id(4), user_id: OTHER, title: "别人的对话", created_at: "2026-11-07T08:00:00+00:00", updated_at: "2026-11-07T07:00:00+00:00" }
  ];
  const messages: MessageRow[] = [
    { id: id(101), session_id: id(3) },
    { id: id(102), session_id: id(1) }
  ];
  const courses = [{ id: id(201), owner_user_id: LEARNER, creation_brief_message_id: id(102) }];

  function likeMatcher(pattern: string) {
    let source = "^";
    for (let index = 0; index < pattern.length; index += 1) {
      const char = pattern[index];
      if (char === "\\" && index + 1 < pattern.length) { source += pattern[index + 1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); index += 1; }
      else if (char === "%") source += ".*";
      else if (char === "_") source += ".";
      else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`${source}$`, "i");
  }

  function read(table: string) {
    let operation: "select" | "update" | "delete" = "select";
    let updateValue: Record<string, unknown> | null = null;
    const filters: Array<[string, unknown]> = [];
    const inFilters: Array<[string, unknown[]]> = [];
    let ilike: [string, string] | null = null;
    let cursor: string | null = null;
    let maximum = Number.POSITIVE_INFINITY;
    let ordering: Array<[string, { ascending: boolean }]> = [];

    function rows(): Record<string, unknown>[] {
      return table === "assistant_sessions" ? sessions as unknown as Record<string, unknown>[]
        : table === "assistant_messages" ? messages as unknown as Record<string, unknown>[]
          : courses as unknown as Record<string, unknown>[];
    }

    function matches(row: Record<string, unknown>) {
      if (!filters.every(([key, value]) => row[key] === value)) return false;
      if (!inFilters.every(([key, values]) => values.includes(row[key]))) return false;
      if (ilike && !likeMatcher(ilike[1]).test(String(row[ilike[0]] ?? ""))) return false;
      if (cursor) {
        const match = /^updated_at\.lt\.(.+),and\(updated_at\.eq\.(.+),id\.lt\.(.+)\)$/.exec(cursor);
        if (match) {
          const [, before, equal, beforeId] = match;
          const updated = String(row.updated_at);
          if (!(updated < before || (updated === equal && String(row.id) < beforeId))) return false;
        }
      }
      return true;
    }

    function execute(): { data: unknown; error: { code: string } | null } {
      const matching = rows().filter(matches);
      if (operation === "update") {
        for (const row of matching) Object.assign(row, updateValue);
        return { data: matching, error: null };
      }
      if (operation === "delete") {
        if (table === "assistant_sessions") {
          const target = matching[0];
          if (!target) return { data: null, error: null };
          const sessionMessages = messages.filter((message) => message.session_id === target.id);
          if (sessionMessages.some((message) => courses.some((course) => course.creation_brief_message_id === message.id))) {
            return { data: null, error: { code: "23503" } };
          }
          for (const message of sessionMessages) messages.splice(messages.indexOf(message), 1);
          sessions.splice(sessions.indexOf(target as unknown as SessionRow), 1);
          return { data: [{ id: target.id }], error: null };
        }
        return { data: null, error: null };
      }
      const sorted = [...matching];
      for (const [key, options] of [...ordering].reverse()) {
        sorted.sort((left, right) => {
          const a = String(left[key] ?? ""); const b = String(right[key] ?? "");
          return (a < b ? -1 : a > b ? 1 : 0) * (options.ascending ? 1 : -1);
        });
      }
      return { data: sorted.slice(0, maximum), error: null };
    }

    const builder: Record<string, unknown> = {
      select: () => builder,
      update: (value: Record<string, unknown>) => { operation = "update"; updateValue = value; return builder; },
      delete: () => { operation = "delete"; return builder; },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
      in: (key: string, values: unknown[]) => { inFilters.push([key, values]); return builder; },
      ilike: (key: string, value: string) => { ilike = [key, value]; return builder; },
      not: () => builder,
      or: (value: string) => { cursor = value; return builder; },
      order: (key: string, options: { ascending: boolean }) => { ordering.push([key, options]); return builder; },
      limit: (value: number) => { maximum = value; return builder; },
      maybeSingle: async () => { const result = execute(); const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data; return { data, error: result.error }; },
      single: async () => { const result = execute(); const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data; return { data, error: result.error }; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve)
    };
    return builder;
  }

  return {
    sessions, messages, courses,
    from(table: string) { return read(table); }
  };
}

function recorder() {
  let status = 0; let body: unknown;
  const response = {
    status(code: number) { status = code; return response; },
    json(value: unknown) { body = value; return response; },
    setHeader: vi.fn()
  } as unknown as VercelResponse;
  return { response, status: () => status, body: (): any => body };
}

async function get(db: ReturnType<typeof database>, query: Record<string, string>) {
  createUserSupabase.mockResolvedValue({ client: db, user: { id: LEARNER } });
  const result = recorder();
  await handler({ method: "GET", headers: {}, query, body: undefined } as unknown as VercelRequest, result.response);
  return result;
}

async function post(db: ReturnType<typeof database>, body: Record<string, unknown>) {
  createUserSupabase.mockResolvedValue({ client: db, user: { id: LEARNER } });
  const result = recorder();
  await handler({ method: "POST", headers: {}, query: {}, body } as unknown as VercelRequest, result.response);
  return result;
}

beforeEach(() => vi.clearAllMocks());

describe("Assistant conversation history API", () => {
  it("pages by updated_at with id as the tie-break and reports the next cursor", async () => {
    const db = database();
    const first = await get(db, { limit: "2" });
    expect(first.status()).toBe(200);
    expect(first.body().sessions).toHaveLength(2);
    expect(first.body().sessions.map((session: { title: string }) => session.title)).toEqual(["100% 完成", "snake_case 命名"]);
    expect(first.body().hasMore).toBe(true);
    const second = await get(db, { limit: "2", cursor: first.body().nextCursor });
    expect(second.status()).toBe(200);
    expect(second.body().sessions.map((session: { title: string }) => session.title)).toEqual(["第三条"]);
    expect(second.body().hasMore).toBe(false);
  });

  it("uses the id tie-break when updated_at is identical", async () => {
    const db = database();
    const same = "2026-11-07T06:00:00+00:00";
    db.sessions.push(
      { id: id(7), user_id: LEARNER, title: "tie A", created_at: same, updated_at: same },
      { id: id(8), user_id: LEARNER, title: "tie B", created_at: same, updated_at: same }
    );
    const first = await get(db, { q: "tie", limit: "1" });
    expect(first.body().sessions.map((session: { title: string }) => session.title)).toEqual(["tie B"]);
    const second = await get(db, { q: "tie", limit: "1", cursor: first.body().nextCursor });
    expect(second.body().sessions.map((session: { title: string }) => session.title)).toEqual(["tie A"]);
  });

  it("searches titles on the server with literal % and _", async () => {
    const db = database();
    const percent = await get(db, { q: "100%" });
    expect(percent.body().sessions.map((session: { title: string }) => session.title)).toEqual(["100% 完成"]);
    const underscore = await get(db, { q: "snake_case" });
    expect(underscore.body().sessions.map((session: { title: string }) => session.title)).toEqual(["snake_case 命名"]);
    expect((await get(db, { q: "100X" })).body().sessions).toEqual([]);
  });

  it("marks a conversation that created a course so the menu can explain the block", async () => {
    const result = await get(database(), {});
    const session = result.body().sessions.find((item: { title: string }) => item.title === "100% 完成");
    expect(session.hasCourse).toBe(true);
  });

  it("renames only the learner's own conversation", async () => {
    const db = database();
    const owned = await post(db, { action: "rename-session", sessionId: id(1), title: "新标题" });
    expect(owned.status()).toBe(200);
    expect(db.sessions.find((session) => session.id === id(1))?.title).toBe("新标题");

    const foreign = await post(db, { action: "rename-session", sessionId: id(4), title: "劫持" });
    expect(foreign.status()).toBe(404);
    expect(db.sessions.find((session) => session.id === id(4))?.title).toBe("别人的对话");
  });

  it("rejects empty and overlong titles before writing", async () => {
    const db = database();
    expect((await post(db, { action: "rename-session", sessionId: id(1), title: "  " })).status()).toBe(400);
    expect((await post(db, { action: "rename-session", sessionId: id(1), title: "x".repeat(81) })).status()).toBe(400);
    expect(db.sessions.find((session) => session.id === id(1))?.title).toBe("100% 完成");
  });

  it("deletes the learner's own conversation and cascades its messages", async () => {
    const db = database();
    const result = await post(db, { action: "delete-session", sessionId: id(2) });
    expect(result.status()).toBe(200);
    expect(db.sessions.some((session) => session.id === id(2))).toBe(false);
  });

  it("never touches another learner's conversation", async () => {
    const db = database();
    const result = await post(db, { action: "delete-session", sessionId: id(4) });
    expect(result.status()).toBe(404);
    expect(db.sessions.some((session) => session.id === id(4))).toBe(true);
  });

  it("refuses a conversation referenced by a personal Course", async () => {
    const db = database();
    const result = await post(db, { action: "delete-session", sessionId: id(1) });
    expect(result.status()).toBe(409);
    expect(result.body().error.code).toBe("assistant_session_has_course");
    expect(db.sessions.some((session) => session.id === id(1))).toBe(true);
    expect(db.courses).toHaveLength(1);
  });
});
