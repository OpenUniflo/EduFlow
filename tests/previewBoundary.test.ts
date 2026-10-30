import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(directory: string, files: string[] = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

describe("Feature Preview boundary", () => {
  it("keeps Feature and shared production code independent of src/demo", () => {
    const files = [...walk("src/features"), ...walk("src/shared")];
    // Import specifiers only: comments may legitimately mention the seam.
    const offenders = files.filter((file) => /(?:from|import)\s+["'][^"']*(?:@\/demo(?:\/|["'])|(?:^|\/)demo\/)/m.test(readFileSync(file, "utf8")))
      .map((file) => `${file}: ${readFileSync(file, "utf8").match(/(?:from|import)\s+["'][^"']*(?:@\/demo|\/demo\/)[^"']*["']/)?.[0] ?? "demo import"}`);
    expect(offenders).toEqual([]);
  });

  it("keeps the preview source read-only and free of network/persistence calls", () => {
    for (const file of walk("src/demo/preview")) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB|apiRequest|supabase)\b/);
      expect(source, file).not.toMatch(/\bfetch\s*\(/);
    }
    expect(statSync("src/demo/preview/people/sampleFollowedPeople.ts").isFile()).toBe(true);
  });
});
