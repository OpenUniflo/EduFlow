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
