/**
 * Read-only projection of one Run's frozen fixed-reference closure.
 *
 * The Worker freezes every reachable `(workflowId, revision, environmentRef)`
 * definition into `workflow_live_runs.registry_snapshot.workflowReferences` at
 * launch. History must read that closure, never the targets' current heads.
 *
 * This module only projects owner-authorized Run data. It never reads a target
 * Definition by workflow id, never resolves an environment, and never exposes
 * the frozen registry snapshots (which belong to the Worker boundary).
 */

type Row = Record<string, unknown>;
const MAX_TARGETS = 32;
const MAX_ENVIRONMENTS = 32;

const objectValue = (value: unknown): Row | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Row : undefined;

const positiveInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647 ? value : undefined;

export type RunReferenceTargetProjection = {
  workflowId: string;
  revision: number;
  environmentRef: string;
  name: string;
  definition: Row;
};

export type RunReferenceEnvironmentProjection = {
  environmentRef: string;
  environmentRevision: string;
};

export type RunReferenceSnapshotProjection =
  | { available: false; reason: "missing" | "invalid"; targets: []; environments: [] }
  | {
      available: true;
      version: 1;
      root: { workflowId: string; revision: number };
      rootEnvironmentRef: string;
      targets: RunReferenceTargetProjection[];
      environments: RunReferenceEnvironmentProjection[];
      targetCount: number;
    };

function projectTarget(raw: unknown): RunReferenceTargetProjection | undefined {
  const target = objectValue(raw);
  if (!target) return undefined;
  const workflowId = typeof target.workflowId === "string" ? target.workflowId.trim() : "";
  const revision = positiveInteger(target.revision);
  const environmentRef = typeof target.environmentRef === "string" ? target.environmentRef.trim() : "";
  const definition = objectValue(target.definition);
  if (!workflowId || workflowId.length > 128 || revision === undefined || !environmentRef || environmentRef.length > 160) return undefined;
  if (!definition || definition.workflowId !== workflowId || definition.revision !== revision) return undefined;
  const name = typeof definition.name === "string" && definition.name.trim() ? definition.name : workflowId;
  return { workflowId, revision, environmentRef, name, definition };
}

function projectEnvironment(raw: unknown): RunReferenceEnvironmentProjection | undefined {
  const environment = objectValue(raw);
  if (!environment) return undefined;
  const environmentRef = typeof environment.environmentRef === "string" ? environment.environmentRef.trim() : "";
  const environmentRevision = typeof environment.environmentRevision === "string" ? environment.environmentRevision.trim() : "";
  if (!environmentRef || environmentRef.length > 160 || !environmentRevision || environmentRevision.length > 256) return undefined;
  return { environmentRef, environmentRevision };
}

/**
 * Converts the Worker's frozen reference envelope into the browser projection.
 * Malformed targets are dropped individually so one damaged historical row
 * cannot fabricate a target or break the rest of the Run history.
 */
export function workflowRunReferenceSnapshot(registrySnapshot: unknown): RunReferenceSnapshotProjection {
  const registry = objectValue(registrySnapshot);
  const raw = objectValue(registry?.workflowReferences);
  if (!raw) return { available: false, reason: "missing", targets: [], environments: [] };
  if (raw.version !== 1) return { available: false, reason: "invalid", targets: [], environments: [] };
  const root = objectValue(raw.root);
  const rootWorkflowId = typeof root?.workflowId === "string" ? root.workflowId.trim() : "";
  // The database closure walker serialises the root revision as text; targets
  // remain JSON numbers. Normalise only this read-only projection.
  const rawRootRevision = typeof root?.revision === "string" && /^[1-9][0-9]*$/.test(root.revision) ? Number(root.revision) : root?.revision;
  const rootRevision = positiveInteger(rawRootRevision);
  const rootEnvironmentRef = typeof raw.rootEnvironmentRef === "string" ? raw.rootEnvironmentRef.trim() : "";
  if (!rootWorkflowId || rootRevision === undefined || !rootEnvironmentRef) return { available: false, reason: "invalid", targets: [], environments: [] };
  if (!Array.isArray(raw.targets) || !Array.isArray(raw.environments)) return { available: false, reason: "invalid", targets: [], environments: [] };

  const targets: RunReferenceTargetProjection[] = [];
  const seen = new Set<string>();
  for (const candidate of raw.targets) {
    const target = projectTarget(candidate);
    if (!target) continue;
    const key = `${target.workflowId}\u0000${target.revision}\u0000${target.environmentRef}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(target);
    if (targets.length >= MAX_TARGETS) break;
  }
  const environments: RunReferenceEnvironmentProjection[] = [];
  const seenEnvironments = new Set<string>();
  for (const candidate of raw.environments) {
    const environment = projectEnvironment(candidate);
    if (!environment || seenEnvironments.has(environment.environmentRef)) continue;
    seenEnvironments.add(environment.environmentRef);
    environments.push(environment);
    if (environments.length >= MAX_ENVIRONMENTS) break;
  }
  return {
    available: true,
    version: 1,
    root: { workflowId: rootWorkflowId, revision: rootRevision },
    rootEnvironmentRef,
    targets,
    environments,
    targetCount: targets.length,
  };
}

/** A cheap flag for the Run DTO; the full definitions are loaded on demand. */
export function workflowRunReferenceCount(registrySnapshot: unknown): number {
  const snapshot = workflowRunReferenceSnapshot(registrySnapshot);
  return snapshot.available ? snapshot.targetCount : 0;
}

export function workflowRunReferencesDto(registrySnapshot: unknown): RunReferenceSnapshotProjection {
  return workflowRunReferenceSnapshot(registrySnapshot);
}
