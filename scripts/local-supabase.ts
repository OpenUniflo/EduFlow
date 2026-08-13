export const LOCAL_ONLY_SUPABASE_ERROR = "This command is Local-only and refuses to modify Hosted Supabase.";

const LOCAL_SUPABASE_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function assertLocalSupabaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(LOCAL_ONLY_SUPABASE_ERROR);
  }

  if (
    url.protocol !== "http:"
    || !LOCAL_SUPABASE_HOSTS.has(url.hostname)
    || url.port !== "54321"
    || url.pathname !== "/"
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error(LOCAL_ONLY_SUPABASE_ERROR);
  }

  return url.origin;
}
