/**
 * Conversation source/scoping. Home keeps the main conversation; contextual
 * surfaces (the floating Assistant and the Archive panel) open or resume a
 * conversation for their own source instead of appending to Home.
 *
 * The value is a conversation partition, never authority. The server validates
 * its shape again before it reaches a query or an insert.
 */
export const ASSISTANT_HOME_SOURCE = "home";
export const ASSISTANT_ARCHIVE_PANEL_SOURCE = "archive-assistant";
export const ASSISTANT_WORKSPACE_SOURCE = "workspace";
export const ASSISTANT_SOURCE_MAX_LENGTH = 160;

const SOURCE_PATTERN = /^(home|archive-assistant|workspace|page:[a-z0-9-]+(?::[A-Za-z0-9._-]{1,80}){0,3})$/;

function pathPart(value: string): string {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* keep the raw segment when it is not valid encoding */ }
  return decoded.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 48) || "unknown";
}

/**
 * One canonical conversation entry per page. Dynamic identities keep different
 * Courses/Workflows from sharing one contextual conversation.
 */
export function assistantSessionScopeForPath(pathname: string): string {
  const path = pathname.split("?")[0].split("#")[0] || "/";
  if (path === "/") return ASSISTANT_HOME_SOURCE;
  if (path.startsWith("/archive")) return "page:archive";
  if (path === "/works") return "page:works";
  const workflow = /^\/works\/([^/]+)/.exec(path);
  if (workflow) return `page:works:${pathPart(workflow[1])}`;
  if (path === "/courses/create") return "page:course-create";
  const assignment = /^\/courses\/([^/]+)\/assignments\/([^/]+)/.exec(path);
  if (assignment) return `page:assignment:${pathPart(assignment[1])}:${pathPart(assignment[2])}`;
  const material = /^\/courses\/([^/]+)\/materials\/([^/]+)/.exec(path);
  if (material) return `page:material:${pathPart(material[1])}:${pathPart(material[2])}`;
  const course = /^\/courses\/([^/]+)/.exec(path);
  if (course) return `page:course:${pathPart(course[1])}`;
  const micro = /^\/learn\/micro\/([^/]+)/.exec(path);
  if (micro) return `page:micro:${pathPart(micro[1])}`;
  if (path === "/records") return "page:records";
  if (path === "/settings" || path.startsWith("/settings/")) return "page:settings";
  if (path === "/teaching/create") return "page:teaching-create";
  if (path === "/teaching" || path.startsWith("/teaching/")) return "page:teaching";
  if (path === "/admin" || path.startsWith("/admin/")) return "page:admin";
  const first = path.split("/").filter(Boolean)[0];
  return first ? `page:${pathPart(first)}` : "page:other";
}

/** Server-side normalization. Undefined/empty means Home. */
export function normalizeAssistantSessionSource(value: unknown, fallback = ASSISTANT_HOME_SOURCE): string {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") throw new Error("Assistant conversation source is invalid");
  const source = value.trim();
  if (source.length > ASSISTANT_SOURCE_MAX_LENGTH || !SOURCE_PATTERN.test(source)) {
    throw new Error("Assistant conversation source is invalid");
  }
  return source;
}

/** Optional filter normalization; undefined means no source filter. */
export function optionalAssistantSessionSource(value: unknown): string | null {
  if (value == null || value === "") return null;
  return normalizeAssistantSessionSource(value);
}

/** Short label for the Home history list; Home itself needs no tag. */
export function assistantSessionSourceLabel(source: string | undefined): string | undefined {
  if (!source || source === ASSISTANT_HOME_SOURCE) return undefined;
  if (source === ASSISTANT_ARCHIVE_PANEL_SOURCE) return "地图 · 小助手";
  if (source === ASSISTANT_WORKSPACE_SOURCE) return "工作台";
  if (source.startsWith("page:works")) return "工作流";
  if (source.startsWith("page:course") || source.startsWith("page:assignment") || source.startsWith("page:material") || source.startsWith("page:micro")) return "课程";
  if (source.startsWith("page:archive")) return "地图";
  if (source.startsWith("page:records")) return "记录";
  if (source.startsWith("page:settings")) return "设置";
  if (source.startsWith("page:admin")) return "管理";
  if (source.startsWith("page:teaching")) return "教学";
  return "页面对话";
}
