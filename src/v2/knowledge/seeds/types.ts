export type EdgeSeed =
  | [string, string, "prerequisite", "hard" | "soft", string]
  | [string, string, "enables" | "related", number, string];
