import { useEffect, useRef, useState } from "react";
import type { RunReferenceSnapshot } from "../../domain/v2/runReferences";
import type { WorkflowRunV2 } from "../../domain/v2/types";
import { workflowApiV2 } from "../../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../../repository/v2/WorkflowApiV2";

type RunReferenceIdentity = Pick<WorkflowRunV2, "workflowId" | "revision" | "environmentRef">;

type RunReferencesState = {
  runId: string;
  snapshot: RunReferenceSnapshot | null;
  loading: boolean;
  error: string;
};

const IDLE: RunReferencesState = { runId: "", snapshot: null, loading: false, error: "" };

/**
 * A frozen closure belongs to exactly one Run identity. A response for another
 * root/revision/environment must never be shown against the selected Run.
 */
export function runReferenceSnapshotMatchesRun(snapshot: RunReferenceSnapshot, run: RunReferenceIdentity): boolean {
  if (!snapshot.available) return true;
  return snapshot.root?.workflowId === run.workflowId
    && snapshot.root?.revision === run.revision
    && snapshot.rootEnvironmentRef === run.environmentRef;
}

/**
 * Loads one Run's launch-time fixed-reference closure. This is deliberately
 * independent of any "history view" flag: a just-completed live Run needs the
 * same frozen targets in its result details before the learner selects a
 * history row. Requests are generation-guarded and snapshots are cached per
 * Run id, so switching Runs cannot mix their targets.
 */
export function useRunReferences(run: Pick<WorkflowRunV2, "runId" | "workflowId" | "revision" | "environmentRef" | "status" | "referenceCount"> | null | undefined): {
  runReferences: RunReferenceSnapshot | null;
  runReferencesLoading: boolean;
  runReferencesError: string;
} {
  const runId = run?.runId ?? "";
  const workflowId = run?.workflowId ?? "";
  const revision = run?.revision;
  const environmentRef = run?.environmentRef ?? "";
  const status = run?.status ?? "";
  const referenceCount = run?.referenceCount ?? 0;
  const [state, setState] = useState<RunReferencesState>(IDLE);
  const cache = useRef(new Map<string, RunReferenceSnapshot>());
  const generation = useRef(0);

  useEffect(() => {
    const request = ++generation.current;
    if (!runId || revision === undefined) {
      setState(IDLE);
      return;
    }
    const current = () => request === generation.current;
    const release = () => { if (generation.current === request) generation.current += 1; };
    const identity = { workflowId, revision, environmentRef };
    setState({ runId, snapshot: null, loading: true, error: "" });

    const cached = cache.current.get(runId);
    if (cached) {
      if (runReferenceSnapshotMatchesRun(cached, identity)) setState({ runId, snapshot: cached, loading: false, error: "" });
      else setState({ runId, snapshot: null, loading: false, error: "本 Run 的冻结引用快照与运行身份不一致，已停止使用该快照。" });
      return release;
    }

    void workflowApiV2.runReferences(runId).then(snapshot => {
      if (!current()) return;
      if (!runReferenceSnapshotMatchesRun(snapshot, identity)) {
        setState({ runId, snapshot: null, loading: false, error: "本 Run 的冻结引用快照与运行身份不一致，已停止使用该快照。" });
        return;
      }
      // A missing/invalid projection can still be a launch race on a live Run;
      // only an exact frozen closure is immutable enough to cache.
      if (snapshot.available) cache.current.set(runId, snapshot);
      setState({ runId, snapshot, loading: false, error: "" });
    }).catch(reason => {
      if (current()) setState({ runId, snapshot: null, loading: false, error: workflowErrorMessage(reason) });
    });
    return release;
  }, [runId, workflowId, revision, environmentRef, status, referenceCount]);

  const currentRun = state.runId === runId;
  return {
    runReferences: currentRun ? state.snapshot : null,
    runReferencesLoading: Boolean(runId) && (!currentRun || state.loading),
    runReferencesError: currentRun ? state.error : "",
  };
}
