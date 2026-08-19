import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { consolidatedResourceForPath } from "./local-api-vite-plugin";

describe("local consolidated API adapter", () => {
  it("injects the same resource as each hosted public rewrite", () => {
    expect(consolidatedResourceForPath).toEqual({
      "/api/courses": "courses",
      "/api/course-authoring": "authoring",
      "/api/learning": "learning",
      "/api/micro": "micro",
      "/api/progress": "progress"
    });
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    for (const [path, resource] of Object.entries(consolidatedResourceForPath)) {
      expect(vercel).toContain(`\"source\": \"${path}\"`);
      expect(vercel).toContain(`resource=${resource}`);
    }
  });
});
