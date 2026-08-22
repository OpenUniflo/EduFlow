import { supabaseClient } from "./supabaseClient";

type ApiErrorBody = { error?: { code?: string; message?: string } };

export class ApiRequestError extends Error {
  constructor(readonly code: string | undefined, message: string, readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

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
  if (!response.ok) throw new ApiRequestError(body.error?.code, body.error?.message ?? `API request failed (${response.status})`, response.status);
  return body;
}
