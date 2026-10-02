import type { SupabaseClient } from '@supabase/supabase-js';
import { currentRoute } from './routePlanning.js';
import { ApiError } from './http.js';

/** Execution always replans active constraints against current authenticated inputs. */
export async function readPersonalCourseRoute(client: SupabaseClient, userId: string, courseId: string) {
  const { view, nodes, states } = await currentRoute(client, userId, courseId);
  if (!view.plan.valid || !view.activeVersion) throw new ApiError(422, 'route_constraints_conflict', '当前路线需要重新确认。', { conflicts: view.plan.conflicts });
  const route = view.plan.route;
  const members = new Set(route.selectedNodeIds);
  return { route, activeVersionId: view.activeVersion.id, nodes: nodes.filter(row => members.has(String(row.id))), states: states.filter(row => members.has(String(row.node_id))) };
}
