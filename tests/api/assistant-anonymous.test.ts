import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it, vi } from "vitest";
import handler from "../../api/assistant";

function responseRecorder() {
  let statusCode = 0; let body: unknown;
  const response = { status(code: number) { statusCode = code; return response; }, json(value: unknown) { body = value; return response; }, setHeader: vi.fn() } as unknown as VercelResponse;
  return { response, statusCode: () => statusCode, body: () => body };
}

describe("anonymous /api/assistant", () => {
  for (const method of ["GET", "POST"] as const) it(`returns 401 for ${method} without creating a session`, async () => {
    const recorder = responseRecorder();
    await handler({ method, headers: {}, query: {}, body: method === "POST" ? { message: "hello", context: {} } : undefined } as VercelRequest, recorder.response);
    expect(recorder.statusCode()).toBe(401);
    expect(recorder.body()).toMatchObject({ error: { code: "unauthorized" } });
  });
});
