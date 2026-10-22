import type { WorkflowEnvironment } from "../../domain/v2/types";

export type EnvironmentAvailability = "loading" | "error" | "unavailable" | "ready";

/** Classifies the environment catalog without treating an empty list as "not authorized". */
export function environmentAvailability({ status, environments, selectedRef }: {
  status: "loading" | "ready" | "failed";
  environments: readonly Pick<WorkflowEnvironment, "environmentRef">[];
  selectedRef: string;
}): EnvironmentAvailability {
  if (status === "loading") return "loading";
  if (status === "failed") return "error";
  if (!environments.length) return "unavailable";
  if (!selectedRef || !environments.some(environment => environment.environmentRef === selectedRef)) return "unavailable";
  return "ready";
}
