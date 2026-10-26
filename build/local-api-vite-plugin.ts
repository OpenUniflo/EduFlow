import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import healthHandler from "../api/_handlers/health";
import coursesHandler from "../api/_handlers/courses";
import courseAuthoringHandler from "../api/_handlers/course-authoring";
import knowledgeHandler from "../api/knowledge";
import learnerHandler from "../api/learner";
import workflowsHandler from "../api/workflows";
import materialsHandler from "../api/materials";
import domainsHandler from "../api/domains";
import knowledgeGenerationHandler from "../api/knowledge-generation";
import assistantHandler from "../api/assistant";

const handlers = new Map([
  ["/api/health", healthHandler],
  ["/api/knowledge", knowledgeHandler],
  ["/api/courses", coursesHandler],
  ["/api/course-authoring", courseAuthoringHandler],
  ["/api/learner", learnerHandler],
  ["/api/evidence", learnerHandler],
  ["/api/edge-actions", learnerHandler],
  ["/api/learning", learnerHandler],
  ["/api/micro", learnerHandler],
  ["/api/progress", learnerHandler],
  ["/api/navigation", learnerHandler],
  ["/api/workflows", workflowsHandler],
  ["/api/materials", materialsHandler],
  ["/api/domains", domainsHandler],
  ["/api/knowledge-generation", knowledgeGenerationHandler],
  ["/api/assistant", assistantHandler]
]);

/** Loaded on demand so feature code with the `@/` alias never enters the Vite config bundle. */
const lazyCoursePaths = new Set(["/api/course-intent", "/api/course-mapping"]);

/** Public client paths must match the resource injected by the Vercel rewrite. */
export const consolidatedResourceForPath: Record<string, "courses" | "authoring" | "intent" | "mapping" | "learning" | "micro" | "progress" | "navigation" | "evidence" | "edge-actions"> = {
  "/api/evidence": "evidence", "/api/edge-actions": "edge-actions",
  "/api/courses": "courses", "/api/course-authoring": "authoring",
  "/api/course-intent": "intent", "/api/course-mapping": "mapping",
  "/api/learning": "learning", "/api/micro": "micro", "/api/progress": "progress", "/api/navigation": "navigation"
};

async function readBody(request: IncomingMessage) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return undefined;
  const text = Buffer.concat(chunks).toString("utf8");
  if (request.headers["content-type"]?.includes("application/json")) return JSON.parse(text);
  return text;
}

function createResponse(response: ServerResponse) {
  const vercelResponse = Object.assign(response, {
    status(code: number) { response.statusCode = code; return vercelResponse; },
    json(value: unknown) {
      if (!response.hasHeader("Content-Type")) response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify(value));
      return vercelResponse;
    }
  });
  return vercelResponse as unknown as VercelResponse;
}

export function localApiPlugin(): Plugin {
  return {
    name: "eduflow-local-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const handler = handlers.get(url.pathname);
        const lazy = lazyCoursePaths.has(url.pathname);
        if (!handler && !lazy) return next();
        const query = Object.fromEntries(url.searchParams.entries());
        // Mirror Vercel's rewrite contract while retaining the public client URL.
        const resource = consolidatedResourceForPath[url.pathname];
        if (resource) query.resource = resource;
        const vercelRequest = Object.assign(request, { body: await readBody(request), query }) as unknown as VercelRequest;
        const vercelResponse = createResponse(response);
        if (lazy) {
          const module = await server.ssrLoadModule("/api/course.ts");
          await (module.default as (req: VercelRequest, res: VercelResponse) => Promise<void>)(vercelRequest, vercelResponse);
          return;
        }
        await handler!(vercelRequest, vercelResponse);
      });
    }
  };
}
