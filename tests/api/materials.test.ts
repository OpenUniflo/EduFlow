import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/_lib/http";

const createOptionalUserSupabase = vi.hoisted(() => vi.fn());
const createUserSupabase = vi.hoisted(() => vi.fn());
const createServerSupabase = vi.hoisted(() => vi.fn());
const requireCapability = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/supabase.js", () => ({ createOptionalUserSupabase, createUserSupabase, createServerSupabase, requireCapability }));

import handler from "../../api/materials";

function materialQuery(row: Record<string, unknown> | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: row, error: null })
  };
  return builder;
}

function responseRecorder() {
  let statusCode = 0;
  let body: unknown;
  const response = {
    status(code: number) { statusCode = code; return response; },
    json(value: unknown) { body = value; return response; },
    setHeader: vi.fn()
  } as unknown as VercelResponse;
  return { response, statusCode: () => statusCode, body: () => body, setHeader: response.setHeader as unknown as ReturnType<typeof vi.fn> };
}

describe("/api/materials", () => {
  const createSignedUrl = vi.fn();

  beforeEach(() => {
    createOptionalUserSupabase.mockReset();
    createUserSupabase.mockReset();
    createServerSupabase.mockReset();
    requireCapability.mockReset();
    createSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: "fresh-source-url" }, error: null });
  });

  it("returns a current signed URL for a readable PDF Material", async () => {
    createOptionalUserSupabase.mockResolvedValue({
      client: {
        from: () => materialQuery({ storage_path: "shared/course/material.pdf", material_type: "pdf" }),
        storage: { from: () => ({ createSignedUrl }) }
      },
      user: { id: "learner" }
    });
    const recorder = responseRecorder();

    await handler({ method: "GET", query: { courseId: "course", materialId: "material" }, headers: {} } as unknown as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(200);
    expect(recorder.body()).toEqual({ sourceUrl: "fresh-source-url", expiresIn: 3600 });
    expect(createSignedUrl).toHaveBeenCalledWith("shared/course/material.pdf", 3600);
    expect(recorder.setHeader).toHaveBeenCalledWith("Cache-Control", expect.stringContaining("no-store"));
    expect(requireCapability).not.toHaveBeenCalled();
  });

  it("returns 404 when the Material does not exist", async () => {
    createOptionalUserSupabase.mockResolvedValue({
      client: { from: () => materialQuery(null), storage: { from: () => ({ createSignedUrl }) } },
      user: { id: "learner" }
    });
    const recorder = responseRecorder();

    await handler({ method: "GET", query: { courseId: "course", materialId: "missing" }, headers: {} } as unknown as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(404);
    expect(recorder.body()).toMatchObject({ error: { code: "material_source_not_found" } });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("does not reveal a Material hidden by Course read authorization", async () => {
    createOptionalUserSupabase.mockResolvedValue({
      client: { from: () => materialQuery(null), storage: { from: () => ({ createSignedUrl }) } },
      user: { id: "other-learner" }
    });
    const recorder = responseRecorder();

    await handler({ method: "GET", query: { courseId: "owner-private-course", materialId: "private-material" }, headers: {} } as unknown as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it.each(["POST", "PUT"])("keeps %s behind the existing write capability", async (method) => {
    const user = { id: "learner" };
    createUserSupabase.mockResolvedValue({ client: {}, user });
    requireCapability.mockRejectedValue(new ApiError(403, "forbidden", "global-domain-admin capability is required"));
    const recorder = responseRecorder();

    await handler({ method, query: {}, headers: {}, body: {} } as unknown as VercelRequest, recorder.response);

    expect(recorder.statusCode()).toBe(403);
    expect(requireCapability).toHaveBeenCalledWith(user, "global-domain-admin");
  });
});
