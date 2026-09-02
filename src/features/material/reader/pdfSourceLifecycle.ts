export async function loadPdfWithFreshSource<T>({ resolveSourceUrl, load, shouldRefresh = () => true }: {
  resolveSourceUrl(): Promise<string>;
  load(sourceUrl: string): Promise<T>;
  shouldRefresh?(reason: unknown): boolean;
}): Promise<T> {
  const firstSourceUrl = await resolveSourceUrl();
  try {
    return await load(firstSourceUrl);
  } catch (reason) {
    if (!shouldRefresh(reason)) throw reason;
  }
  const refreshedSourceUrl = await resolveSourceUrl();
  return load(refreshedSourceUrl);
}

export function resolvePdfSourceUrl(staticSourceUrl: string | undefined, resolveManagedSourceUrl: () => Promise<string>) {
  return staticSourceUrl ? Promise.resolve(staticSourceUrl) : resolveManagedSourceUrl();
}

export function createPdfPageRecoveryGuard(onRecover: () => void) {
  let recoveryUsed = false;
  return {
    recover(reason: unknown) {
      if (recoveryUsed || (reason instanceof Error && ["RenderingCancelledException", "PasswordException"].includes(reason.name))) return false;
      recoveryUsed = true;
      onRecover();
      return true;
    },
    reset() { recoveryUsed = false; }
  };
}
