export type AuthDestination = { pathname: string; search?: string; hash?: string };

export function authGateState(destination: AuthDestination) {
  return { from: { pathname: destination.pathname, search: destination.search ?? "", hash: destination.hash ?? "" } };
}

export function resolveAuthRedirect(state: unknown) {
  if (!state || typeof state !== "object" || !("from" in state)) return "/";
  const from = (state as { from?: unknown }).from;
  if (!from || typeof from !== "object" || !("pathname" in from)) return "/";
  const pathname = String((from as { pathname: unknown }).pathname);
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("\\")) return "/";
  const search = "search" in from ? String((from as { search?: unknown }).search ?? "") : "";
  const hash = "hash" in from ? String((from as { hash?: unknown }).hash ?? "") : "";
  return `${pathname}${search}${hash}`;
}
