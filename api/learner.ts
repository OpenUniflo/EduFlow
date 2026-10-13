import type { VercelRequest, VercelResponse } from "@vercel/node";
import edgeActions from "./_handlers/edge-actions.js";
import evidence from "./_handlers/evidence.js";
import learning from "./_handlers/learning.js";
import micro from "./_handlers/micro.js";
import progress from "./_handlers/progress.js";
import routePlan from "./_handlers/route-plan.js";
import navigation from "./_handlers/navigation.js";
import { methodNotAllowed } from "./_lib/http.js";

export default async function learner(request: VercelRequest, response: VercelResponse) {
  if (request.query.resource === "edge-actions") return edgeActions(request, response);
  if (request.query.resource === "evidence") return evidence(request, response);
  if (request.query.resource === "route-plan") return routePlan(request, response);
  if (request.query.resource === "learning") return learning(request, response);
  if (request.query.resource === "micro") return micro(request, response);
  if (request.query.resource === "progress") return progress(request, response);
  if (request.query.resource === "navigation") return navigation(request, response);
  return methodNotAllowed(response, ["GET", "POST", "PUT"]);
}
