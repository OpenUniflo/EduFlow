export function resolveLegacyRoute(pathname:string, search:string){
  const params=new URLSearchParams(search);
  let target="/";
  if(pathname==="/course-management")target="/teaching";
  else if(pathname==="/admin/domains")target="/system";
  else if(pathname==="/profile"||pathname.startsWith("/profile/"))params.set("view","knowledge");
  const suffix=params.toString();
  return `${target}${suffix?`?${suffix}`:""}`;
}
