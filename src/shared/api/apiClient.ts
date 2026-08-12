import { supabaseClient } from "./supabaseClient";

type ApiErrorBody = { error?: { code?: string; message?: string } };

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });
  const body = await response.json().catch(() => ({})) as T & ApiErrorBody;
  if (!response.ok) throw new Error(body.error?.message ?? `API request failed (${response.status})`);
  return body;
}
