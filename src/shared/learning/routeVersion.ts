import type { CapabilityModel, RouteConstraints, RoutePlan, RouteConflict, SelectedRoute } from './routePlanning';
export type RouteSnapshot = SelectedRoute & { valid: boolean; conflicts: RouteConflict[]; titles: Record<string, string> };
export type RouteVersion = {
  id: string; routeId: string; userId: string; courseId: string; versionNumber: number;
  parentVersionId: string | null; source: 'initial' | 'adjustment' | 'restore';
  constraints: RouteConstraints; snapshot: RouteSnapshot; structureFingerprint: string;
  createdAt: string; restoredFromVersionId: string | null;
};
export type RoutePlanView = {
  activeVersion: RouteVersion | null; model: CapabilityModel | null; plan: RoutePlan;
  structureChanged: boolean; versions?: RouteVersion[];
};
