import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../_lib/http.js";
import { parseDisplayName } from "./profile";

const createUserSupabase = vi.hoisted(() => vi.fn());
const createServerSupabase = vi.hoisted(() => vi.fn());

vi.mock("../_lib/supabase.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../_lib/supabase.js")>(),
  createUserSupabase,
  createServerSupabase
}));

import handler from "./profile.js";

type Row = Record<string, unknown>;

function fakeClient(rows: Row[]) {
  const updates: Array<{ id: string; values: Row }> = [];
  function from(table: string) {
    expect(table).toBe("profiles");
    let selected = rows;
    let patch: Row | null = null;
    const builder = {
      update(values: Row) { patch = values; return builder; },
      eq(column: string, value: unknown) { selected = selected.filter((row) => row[column] === value); return builder; },
      select() { return builder; },
      single() {
        const row = selected[0];
        if (!row) return Promise.resolve({ data: null, error: null });
        if (patch) {
          Object.assign(row, patch);
          updates.push({ id: String(row.id), values: { ...patch } });
        }
        return Promise.resolve({ data: { display_name: row.display_name }, error: null });
      }
    };
    return builder;
  }
  return { client: { from } as unknown as SupabaseClient, rows, updates };
}

function responseRecorder() {
  let statusCode = 0;
  let body: unknown;
  const response = {
    status(code: number) { statusCode = code; return response; },
    json(value: unknown) { body = value; return response; },
    setHeader: vi.fn()
  } as unknown as VercelResponse;
  return { response, statusCode: () => statusCode, body: () => body };
}

function expectBadRequest(run: () => unknown, code: string, message: string) {
  try {
    run();
    throw new Error("Expected an ApiError");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.code).toBe(code);
    expect(apiError.message).toBe(message);
  }
}

describe("learner profile display name", () => {
  beforeEach(() => {
    createUserSupabase.mockReset();
    createServerSupabase.mockReset();
  });

  it("rejects an empty or whitespace-only display name in Chinese", () => {
    expectBadRequest(() => parseDisplayName({ displayName: "   " }), "display_name_required", "显示名称不能为空");
    expectBadRequest(() => parseDisplayName({ displayName: 42 }), "display_name_required", "显示名称不能为空");
    expectBadRequest(() => parseDisplayName(null), "display_name_required", "显示名称不能为空");
  });

  it("rejects a display name longer than 40 characters in Chinese", () => {
    expectBadRequest(() => parseDisplayName({ displayName: "名".repeat(41) }), "display_name_too_long", "显示名称不能超过 40 个字符");
  });

  it("updates only the token owner's profile and ignores a body-supplied user id", async () => {
    const fake = fakeClient([
      { id: "token-user", display_name: "旧名" },
      { id: "other-user", display_name: "别人" }
    ]);
    createUserSupabase.mockResolvedValue({ client: fake.client, user: { id: "token-user" }, token: "token" });
    createServerSupabase.mockReturnValue(fake.client);
    const recorder = responseRecorder();

    await handler({
      method: "PATCH",
      headers: { authorization: "Bearer token" },
      body: { userId: "other-user", displayName: "  新名字  " },
      query: { resource: "profile" }
    } as unknown as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(200);
    expect(recorder.body()).toEqual({ displayName: "新名字" });
    expect(fake.rows).toEqual([
      { id: "token-user", display_name: "新名字" },
      { id: "other-user", display_name: "别人" }
    ]);
    expect(fake.updates).toEqual([{ id: "token-user", values: { display_name: "新名字" } }]);
  });

  it("returns 401 without a verified session and performs no write", async () => {
    const actual = await vi.importActual<typeof import("../_lib/supabase.js")>("../_lib/supabase.js");
    createUserSupabase.mockImplementation(actual.createUserSupabase);
    const recorder = responseRecorder();

    await handler({
      method: "PATCH",
      headers: {},
      body: { displayName: "新名字" },
      query: { resource: "profile" }
    } as unknown as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(401);
    expect(recorder.body()).toMatchObject({ error: { code: "unauthorized" } });
    expect(createServerSupabase).not.toHaveBeenCalled();
  });
});
