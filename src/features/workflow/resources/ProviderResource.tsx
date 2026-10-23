import { useEffect, useState } from "react";
import { workflowApiV2 } from "../application/v2/useWorkflowV2Controller";
import { workflowErrorMessage } from "../repository/v2/WorkflowApiV2";
import { useExtensions } from "../editor/v2/FunctionExecutionFields";
import type { WorkflowEnvironment } from "../domain/v2/types";
import { AddModelDialog } from "./AddModelDialog";
import { ProviderOverview } from "./ProviderOverview";
import type { ResourceSectionProps } from "./resourceTypes";

type DialogState = { mode: "create" } | { mode: "existing"; ref: string } | null;

/** M6 provider section: overview plus the add/edit model dialog. Keeps the M5 section props contract. */
export function ProviderResource({ environmentRef, create = false, onCreated, onResourcesChanged, onOpenReference }: Pick<ResourceSectionProps, "environmentRef" | "create" | "onCreated" | "onResourcesChanged" | "onOpenReference">) {
  const { data, error, refresh } = useExtensions(environmentRef);
  const [platformProviders, setPlatformProviders] = useState<WorkflowEnvironment["providers"]>([]);
  const [platformError, setPlatformError] = useState("");
  const [platformGeneration, setPlatformGeneration] = useState(0);
  const [dialog, setDialog] = useState<DialogState>(create ? { mode: "create" } : null);

  useEffect(() => {
    if (!environmentRef) return;
    let active = true;
    workflowApiV2.environments()
      .then(result => {
        if (!active) return;
        const environment = result.items.find(item => item.environmentRef === environmentRef);
        setPlatformProviders((environment?.providers ?? []).filter(provider => (provider.origin ?? "environment") === "environment"));
        setPlatformError("");
      })
      .catch(reason => { if (active) setPlatformError(workflowErrorMessage(reason)); });
    return () => { active = false; };
  }, [environmentRef, platformGeneration]);

  if (!environmentRef) return <p role="alert">工作流服务暂时不可用，暂时无法读取资源。</p>;

  const connections = data?.connections ?? [];
  function handleResourcesChanged() {
    refresh();
    setPlatformGeneration(current => current + 1);
    onResourcesChanged?.();
  }

  return <>
    <ProviderOverview
      environmentRef={environmentRef}
      connections={connections}
      platformProviders={platformProviders}
      loading={!data && !error}
      error={error}
      platformError={platformError}
      onReload={refresh}
      onRequestAdd={() => setDialog({ mode: "create" })}
      onRequestEdit={ref => setDialog({ mode: "existing", ref })}
      onResourcesChanged={handleResourcesChanged}
      onOpenReference={onOpenReference}
    />
    {dialog ? <AddModelDialog
      key={dialog.mode === "existing" ? `existing:${dialog.ref}` : "create"}
      environmentRef={environmentRef}
      providers={connections}
      initialMode={dialog.mode}
      initialProviderRef={dialog.mode === "existing" ? dialog.ref : undefined}
      localEnvironment={import.meta.env.DEV}
      onClose={() => setDialog(null)}
      onCreated={(ref, version, content) => {
        setDialog(null);
        onCreated?.(ref, version, content);
        handleResourcesChanged();
      }}
    /> : null}
  </>;
}
