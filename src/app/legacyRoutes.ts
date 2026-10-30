/**
 * Transitional route table from P1. Old public links keep working by
 * redirecting to the new information architecture. The Course Center list
 * now lives in the Archive course overlay; /courses/:courseId stays intact.
 */
export function resolveLegacyRoute(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  let target = "/";

  if (pathname === "/explore") target = "/archive";
  else if (pathname === "/courses" || pathname === "/courses/") {
    target = "/archive";
    params.set("panel", "courses");
  }
  else if (pathname === "/workflows" || pathname === "/workflows/") target = "/works";
  else if (pathname.startsWith("/workflows/")) target = `/works${pathname.slice("/workflows".length)}`;
  else if (pathname === "/messages" || pathname.startsWith("/messages/")) target = "/";
  else if (pathname === "/admin/domains") target = "/admin";
  else if (pathname === "/system" || pathname.startsWith("/system/")) target = "/admin";
  else if (pathname === "/course-management") target = "/teaching";
  else if (pathname === "/profile" || pathname.startsWith("/profile/")) {
    target = "/";
    params.set("view", "knowledge");
  }

  const suffix = params.toString();
  return `${target}${suffix ? `?${suffix}` : ""}`;
}
