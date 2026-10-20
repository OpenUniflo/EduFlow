import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
const learnerHandler = vi.hoisted(() => vi.fn((_request: VercelRequest, response: VercelResponse) => response.status(200).json({ plan: { valid: false, route: null, conflicts: [] } })));
vi.mock("../api/learner", () => ({ default: learnerHandler }));
import { consolidatedResourceForPath, localApiPlugin } from "./local-api-vite-plugin";

describe("local consolidated API adapter", () => {
  it("injects the same resource as each hosted public rewrite", () => {
    expect(consolidatedResourceForPath).toEqual({
      "/api/evidence": "evidence",
      "/api/edge-actions": "edge-actions",
      "/api/courses": "courses",
      "/api/course-authoring": "authoring",
      "/api/learning": "learning",
      "/api/micro": "micro",
      "/api/progress": "progress",
      "/api/navigation": "navigation"
    });
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    for (const [path, resource] of Object.entries(consolidatedResourceForPath)) {
      expect(vercel).toContain(`\"source\": \"${path}\"`);
      expect(vercel).toContain(`resource=${resource}`);
    }
  });

  it("dispatches the normal learner route-plan URL to its existing API handler without replacing the resource", async () => {
    type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<void>;
    let middleware: Middleware | undefined;
    const server = { middlewares: { use: (handler: Middleware) => { middleware = handler; } } };
    const configure = localApiPlugin().configureServer;
    if (typeof configure !== "function") throw new Error("Missing local middleware hook");
    configure.call({} as never, server as unknown as ViteDevServer);
    const request = { url: "/api/learner?resource=route-plan&courseId=course-test", method: "GET", headers: {} } as IncomingMessage;
    const response = { statusCode: 0, hasHeader: () => false, setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
    const next = vi.fn();
    await middleware!(request, response, next);
    expect(learnerHandler).toHaveBeenCalledOnce();
    expect(learnerHandler.mock.calls[0][0].query).toEqual({ resource: "route-plan", courseId: "course-test" });
    expect(response.statusCode).toBe(200);
    expect(response.end).toHaveBeenCalledWith(JSON.stringify({ plan: { valid: false, route: null, conflicts: [] } }));
    expect(next).not.toHaveBeenCalled();
  });
});
