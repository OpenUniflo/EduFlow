import { createHash, randomUUID } from "node:crypto";
import canonicalize from "canonicalize";
import { isDeepStrictEqual } from "node:util";
import { ApiError } from "./http.js";

export type WorkflowRow = Record<string, unknown>;
/**
 * Resolves an internal compiler path against the configured base URL while preserving any
 * base path prefix (the merged Hosted deployment serves the compiler under
 * `/api/workflow-compiler`). A root base URL (`http://127.0.0.1:18110`) keeps its historic
 * shape, so the standalone Local compiler is unaffected.
 */
export function workflowCompilerUrl(base: string, path: string): URL {
  const url = new URL(base);
  const prefix = url.pathname.replace(/\/+$/, "");
  const relative = path.startsWith("/") ? path : `/${path}`;
  return new URL(`${prefix}${relative}`, url);
}
/**
 * Resolves the compiler base URL for the current deployment. A Vercel Preview always calls
 * its own `/api/workflow-compiler`, so a branch preview is never redirected to the global
 * `WORKFLOW_COMPILER_URL` host. Production and local development keep the configured URL.
 */
export function resolveWorkflowCompilerBase(env: Record<string, string | undefined>): string | undefined {
  const vercelUrl = env.VERCEL_URL?.trim();
  if (env.VERCEL_ENV === "preview" && vercelUrl) {
    const host = vercelUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (host) return `https://${host}/api/workflow-compiler`;
  }
  return env.WORKFLOW_COMPILER_URL?.trim() || undefined;
}
export async function workflowCompiler<T = WorkflowRow>(path: string, body?: unknown): Promise<T> {
  const url = resolveWorkflowCompilerBase(process.env);
  const token = process.env.WORKFLOW_INTERNAL_TOKEN;
  if (!url || !token) throw new ApiError(503, "WORKFLOW_SERVICE_UNAVAILABLE", "Workflow execution service is not configured");
  let response: Response;
  try {
    response = await fetch(workflowCompilerUrl(url, path), { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(path === "/v1/discover" ? 60000 : path === "/v1/test-node" ? 45000 : path === "/v1/p5" ? 45000 : 15000) });
  } catch { throw new ApiError(503, "WORKFLOW_SERVICE_UNAVAILABLE", "Workflow execution service is unavailable"); }
  const result = await response.json() as { error?: { code: string; message: string; category?: string } };
  if (!response.ok) throw new ApiError(result.error?.category === "auth" ? 403 : response.status === 422 ? 422 : 503, result.error?.code ?? "WORKFLOW_SERVICE_ERROR", result.error?.message ?? "Workflow service request failed");
  return result as T;
}
export async function workflowDigest(value: unknown) {
  const inspect = (item: unknown): void => {
    if (typeof item === "number" && (!Number.isFinite(item) || Number.isInteger(item) && !Number.isSafeInteger(item))) throw new ApiError(400, "INVALID_JSON_NUMBER", "Number exceeds interoperable JSON range");
    if (item && typeof item === "object") Object.values(item).forEach(inspect);
  };
  inspect(value);
  const document = canonicalize(value);
  if (document === undefined) throw new ApiError(400, "INVALID_JSON", "Serializable JSON value required");
  return createHash("sha256").update(document).digest("hex");
}
export function workflowStrictBody(body: unknown, allowed: string[], required: string[] = []): WorkflowRow {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "INVALID_REQUEST", "Object request required");
  const value = body as WorkflowRow;
  if (Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !(key in value))) throw new ApiError(400, "INVALID_REQUEST", "Unexpected or missing request fields");
  if (JSON.stringify(value).length > 2 * 1024 * 1024) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Workflow request is too large");
  return value;
}
export function workflowObject(value: unknown): WorkflowRow { return workflowStrictBody(value, value && typeof value === "object" ? Object.keys(value) : []); }
export function workflowString(value: unknown): string { if (typeof value !== "string" || !value || value.length > 256) throw new ApiError(400, "INVALID_REQUEST", "Valid identity required"); return value; }
export function workflowInteger(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new ApiError(400, "INVALID_REQUEST", "Nonnegative integer required"); return value; }

const SECRET_KEY = /(?:^authorization$|api[_-]?key$|access[_-]?token$|refresh[_-]?token$|password$|secret$|credential$|connection[_-]?string$)/i;
const privateFields = new Set((process.env.WORKFLOW_REDACT_FIELDS ?? "email,phone,address,ssn").split(",").map((key) => key.toLowerCase()));
/** Execution values stay raw server-side; this is exclusively a browser projection. */
export function workflowRedact(value: unknown, secretValues: string[] = [], redactPrivate = true): unknown {
  if (typeof value === "string") {
    const scrubbed = secretValues.filter(Boolean).reduce((text, secret) => text.split(secret).join("[REDACTED]"), value)
      .replace(/((?:api[_-]?key|password|secret|access[_-]?token)\s*[=:]\s*["']?)[^"'\s,;]+/gi, "$1[REDACTED]")
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/g, "Bearer [REDACTED]")
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@");
    if (scrubbed.startsWith("{") || scrubbed.startsWith("[")) {
      try { const parsed = JSON.parse(scrubbed); const projected = workflowRedact(parsed, secretValues, redactPrivate); return JSON.stringify(parsed) === JSON.stringify(projected) ? scrubbed : JSON.stringify(projected); }
      catch { /* ordinary text */ }
    }
    return scrubbed;
  }
  if (Array.isArray(value)) return value.map((item) => workflowRedact(item, secretValues, redactPrivate));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !secretValues.filter(Boolean).some((secret) => key.includes(secret))).map(([key, item]) => [key, (SECRET_KEY.test(key) || redactPrivate && privateFields.has(key.toLowerCase())) ? "[REDACTED]" : workflowRedact(item, secretValues, redactPrivate)]));
  return value;
}
export function serverSecretValues() { return Object.entries(process.env).filter(([key]) => /(?:KEY|TOKEN|PASSWORD|SECRET)$/i.test(key)).map(([, value]) => value ?? "").filter((value) => value.length >= 8); }
export function workflowProjection(value: unknown) { return workflowRedact(value, serverSecretValues()); }
export function workflowNewId() { return randomUUID(); }

export function validateWorkflowEditor(editor: WorkflowRow, definition: WorkflowRow, previous?: WorkflowRow) {
  const allowed = ["schemaVersion", "workflowId", "editorRevision", "definitionRevision", "nodes", "edges", "viewport", "graphs"];
  workflowStrictBody(editor, allowed, allowed.filter((key) => key !== "viewport" && key !== "graphs"));
  if (editor.schemaVersion !== 1) throw new ApiError(400, "INVALID_EDITOR", "Editor version must be 1");
  const nodeIds = new Set((definition.nodes as WorkflowRow[]).map((node) => node.id));
  const edgeIds = new Set((definition.transitions as WorkflowRow[]).map((edge) => edge.id));
  for (const [id, position] of Object.entries(workflowObject(editor.nodes))) {
    if (!nodeIds.has(id)) throw new ApiError(400, "INVALID_EDITOR", "Editor references an unknown node");
    const point = workflowStrictBody(position, ["x", "y", "width", "height", "collapsed"], ["x", "y"]);
    if ([point.x, point.y, ...(point.width === undefined ? [] : [point.width]), ...(point.height === undefined ? [] : [point.height])].some((value) => typeof value !== "number" || !Number.isFinite(value))) throw new ApiError(400, "INVALID_EDITOR", "Finite editor coordinates required");
  }
  for (const [id, handles] of Object.entries(workflowObject(editor.edges))) {
    if (!edgeIds.has(id)) throw new ApiError(400, "INVALID_EDITOR", "Editor references an unknown transition");
    const edge = workflowStrictBody(handles, ["sourceHandle", "targetHandle", "routing"]);
    for (const handle of [edge.sourceHandle, edge.targetHandle]) if (handle !== undefined && typeof handle !== "string") throw new ApiError(400, "INVALID_EDITOR", "Handle identities must be strings");
    if (edge.routing !== undefined) {
      const routing = workflowStrictBody(edge.routing, ["version", "mode", "source", "target", "points"], ["version", "mode"]);
      if (routing.version !== 1) throw new ApiError(400, "UNSUPPORTED_EDITOR_ROUTING", "Routing extension version is unsupported; preserve the original document");
      if (typeof routing.mode !== "string" || !["auto", "manual"].includes(routing.mode)) throw new ApiError(400, "INVALID_EDITOR", "Invalid routing mode");
      for (const anchor of [routing.source, routing.target]) if (anchor !== undefined) {
        const port = workflowStrictBody(anchor, ["side", "offset"], ["side", "offset"]);
        if (typeof port.side !== "string" || !["left", "right", "top", "bottom"].includes(port.side) || typeof port.offset !== "number" || !Number.isFinite(port.offset) || port.offset < 0 || port.offset > 1) throw new ApiError(400, "INVALID_EDITOR", "Invalid normalized display anchor");
      }
      if (routing.points !== undefined) {
        if (!Array.isArray(routing.points) || routing.points.length > 32) throw new ApiError(400, "INVALID_EDITOR", "At most 32 routing points allowed");
        for (const item of routing.points) {
          const point = workflowStrictBody(item, ["x", "y"], ["x", "y"]);
          if ([point.x, point.y].some((value) => typeof value !== "number" || !Number.isFinite(value))) throw new ApiError(400, "INVALID_EDITOR", "Finite graph routing coordinates required");
        }
      }
    }
  }
  if (editor.graphs !== undefined) {
    const graphs = workflowObject(editor.graphs);
    if (Object.keys(graphs).length > 100) throw new ApiError(400, "INVALID_EDITOR", "Too many subgraph layouts");
    for (const [key, value] of Object.entries(graphs)) {
      let path: unknown;
      try { path = JSON.parse(key); } catch { throw new ApiError(400, "INVALID_EDITOR", "Invalid subgraph layout path"); }
      if (!Array.isArray(path) || !path.length || path.length > 12 || path.some(id => typeof id !== "string")) throw new ApiError(400, "INVALID_EDITOR", "Invalid subgraph layout path");
      let graph = definition;
      for (const id of path) {
        const node = (graph.nodes as WorkflowRow[]).find(node => node.id === id && node.type === "core.subgraph");
        if (!node) throw new ApiError(400, "INVALID_EDITOR", "Layout references an unknown subgraph");
        graph = workflowObject(workflowObject(node.config).graph);
        if (!Array.isArray(graph.nodes) || !Array.isArray(graph.transitions)) throw new ApiError(400, "INVALID_EDITOR", "Invalid subgraph definition");
      }
      const layout = workflowStrictBody(value, ["nodes", "edges", "viewport"], ["nodes", "edges"]);
      validateWorkflowEditor({ schemaVersion: 1, workflowId: editor.workflowId, editorRevision: editor.editorRevision, definitionRevision: editor.definitionRevision, ...layout }, graph);
    }
  }
  if (previous?.edges) for (const [id, value] of Object.entries(workflowObject(previous.edges))) {
    const old = workflowObject(value);
    if (!edgeIds.has(id) || old.routing === undefined) continue;
    if (workflowObject(old.routing).version !== 1) throw new ApiError(409, "UNSUPPORTED_EDITOR_ROUTING", "Existing routing version requires a compatible editor");
    const next = workflowObject(editor.edges)[id];
    if (!next || workflowObject(next).routing === undefined) throw new ApiError(409, "EDITOR_EXTENSION_REQUIRED", "Preserve routing or explicitly restore automatic routing before saving");
  }
  if (editor.viewport) {
    const viewport = workflowStrictBody(editor.viewport, ["x", "y", "zoom"], ["x", "y", "zoom"]);
    if ([viewport.x, viewport.y, viewport.zoom].some((v) => typeof v !== "number" || !Number.isFinite(v)) || Number(viewport.zoom) <= 0) throw new ApiError(400, "INVALID_EDITOR", "Invalid viewport");
  }
}

export function workflowSecretProjection(value: unknown) { return workflowRedact(value, serverSecretValues(), false); }

/** Safe field values are selected from raw input, never inferred from mask text. */
export function workflowInputReuse(value: unknown, secretValues = serverSecretValues()) {
  if (value === undefined) return { available: false, complete: false, fields: [], removedFields: [], reason: "missing" };
  const fields: { pointer: string; value: unknown }[] = [];
  const removedFields: { pointer: string; reason: "sensitive" | "redacted" }[] = [];
  const escape = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
  const visit = (item: unknown, pointer: string): void => {
    if (item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length) {
      const entries = Object.entries(item);
      if (entries.some(([key]) => key !== workflowRedact(key, secretValues, false))) { removedFields.push({ pointer, reason: "sensitive" }); return; }
      for (const [key, nested] of entries) {
        const path = `${pointer}/${escape(key)}`;
        if (SECRET_KEY.test(key) || privateFields.has(key.toLowerCase())) removedFields.push({ pointer: path, reason: "sensitive" });
        else visit(nested, path);
      }
      return;
    }
    // An array is one complete field; never return a sparse array containing masks.
    if (!isDeepStrictEqual(item, workflowRedact(item, secretValues))) removedFields.push({ pointer, reason: "redacted" });
    else fields.push({ pointer, value: item });
  };
  visit(value, "");
  return { available: true, complete: removedFields.length === 0, fields, removedFields };
}

export function workflowDiagnosticCorrelation(body: WorkflowRow = {}) {
  if (body.clientRequestId !== undefined && body.clientRequestId !== workflowSecretProjection(body.clientRequestId)) throw new ApiError(400, "INVALID_REQUEST", "Safe request correlation identity required");
  return { requestId: randomUUID(), ...(body.clientRequestId === undefined ? {} : { clientRequestId: workflowString(body.clientRequestId) }), ...(body.draftGeneration === undefined ? {} : { draftGeneration: workflowInteger(body.draftGeneration) }) };
}
export function workflowScopedDiagnostics(diagnostics: unknown, correlation: WorkflowRow = {}, fallback = "definition") {
  return (Array.isArray(diagnostics) ? diagnostics : []).map((item) => {
    const diagnostic = workflowObject(item);
    return { ...diagnostic, scope: diagnostic.scope ?? fallback, ...correlation };
  });
}

export function workflowUuid(value: unknown) { const id = workflowString(value); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, "INVALID_REQUEST", "UUID identity required"); return id; }
