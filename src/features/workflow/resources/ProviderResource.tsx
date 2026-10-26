import { useState } from "react";
import { useExtensions } from "../editor/v2/FunctionExecutionFields";
import { AddModelDialog } from "./AddModelDialog";
import { ProviderOverview } from "./ProviderOverview";
import type { ResourceSectionProps } from "./resourceTypes";

type DialogState = { mode: "create" } | { mode: "existing"; ref: string } | null;

/** M6 provider section: overview plus the add/edit model dialog. Keeps the M5 section props contract. */
export function ProviderResource({ environmentRef, create = false, onCreated, onResourcesChanged, onOpenReference }: Pick<ResourceSectionProps, "environmentRef" | "create" | "onCreated" | "onResourcesChanged" | "onOpenReference">) {
  const { data, error, refresh } = useExtensions(environmentRef);
  const [dialog, setDialog] = useState<DialogState>(create ? { mode: "create" } : null);

  if (!environmentRef) return <p role="alert">工作流服务暂时不可用，暂时无法读取资源。</p>;

  const connections = data?.connections ?? [];
  function handleResourcesChanged() {
    refresh();
    onResourcesChanged?.();
  }

  return <>
    <ProviderOverview
      environmentRef={environmentRef}
      connections={connections}
      loading={!data && !error}
      error={error}
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
