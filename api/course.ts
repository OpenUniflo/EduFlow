import type { VercelRequest, VercelResponse } from "@vercel/node";
import courses from "./_handlers/courses.js";
import authoring from "./_handlers/course-authoring.js";
import { methodNotAllowed } from "./_lib/http.js";

export default async function course(request: VercelRequest, response: VercelResponse) {
  const resource = request.query.resource;
  if (resource === "courses") return courses(request, response);
  if (resource === "authoring") return authoring(request, response);
  return methodNotAllowed(response, ["GET", "POST", "PUT", "PATCH"]);
}
