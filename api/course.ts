import type { VercelRequest, VercelResponse } from "@vercel/node";
import courses from "./_handlers/courses.js";
import authoring from "./_handlers/course-authoring.js";
import { methodNotAllowed } from "./_lib/http.js";

export default async function course(request: VercelRequest, response: VercelResponse) {
  const resource = request.query.resource;
  if (resource === "courses") return courses(request, response);
  if (resource === "authoring") return authoring(request, response);
  // Generation handlers are loaded only for their resources. The local Vite config loads
  // this module directly, so static imports of feature code with the `@/` alias would break
  // config startup; the Vercel build still traces both dynamic imports.
  if (resource === "intent") { const { default: intent } = await import("./_handlers/course-intent.js"); return intent(request, response); }
  if (resource === "mapping") { const { default: mapping } = await import("./_handlers/course-mapping.js"); return mapping(request, response); }
  return methodNotAllowed(response, ["GET", "POST", "PUT", "PATCH"]);
}
