import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function typescriptFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFilesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("client secret boundary", () => {
  it("keeps the Supabase server secret name out of all client source", () => {
    const violations = typescriptFilesUnder("src")
      .filter((file) => file !== "src/shared/api/clientSecretBoundary.test.ts")
      .filter((file) => readFileSync(file, "utf8").includes("SUPABASE_SECRET_KEY"));
    expect(violations).toEqual([]);
  });

  it("keeps direct Supabase table access inside shared infrastructure and API adapters", () => {
    const directAccess = typescriptFilesUnder("src/features")
      .filter((file) => !file.endsWith("/ApiMaterialStorageService.ts"))
      .filter((file) => /from\s+["']@supabase\//.test(readFileSync(file, "utf8")));
    expect(directAccess).toEqual([]);
  });
});
