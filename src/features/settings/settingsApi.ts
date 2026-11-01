import { apiRequest } from "@/shared/api/apiClient";

/** Persists the signed-in user's own display name through the learner profile resource. */
export async function updateDisplayName(displayName: string): Promise<string> {
  const result = await apiRequest<{ displayName: string }>("/api/learner?resource=profile", {
    method: "PATCH",
    body: JSON.stringify({ displayName })
  });
  return result.displayName;
}
