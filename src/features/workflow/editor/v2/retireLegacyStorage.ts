/** Development-only predecessor data has no reader in the unified workspace. */
export function retireLegacyWorkflowStorage(storage: Pick<Storage,"removeItem">) {
  for(const key of ["knowledge-atlas.workflow-state.v2", "knowledge-atlas.workflow-settings.v2"]) storage.removeItem(key);
}
