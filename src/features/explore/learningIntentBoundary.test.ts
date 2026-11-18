import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

describe("Archive demo boundary", () => {
  it("keeps concrete demo identities out of generic Archive code", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const source = [
      join(root, "learningIntent.ts"),
      join(process.cwd(), "src/features/archive/pages/ArchivePage.tsx"),
      join(process.cwd(), "src/features/archive/model/atlasModel.ts"),
      join(process.cwd(), "src/features/archive/model/assistantPresentation.ts")
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toContain("agentic-ai");
    expect(source).not.toContain("MA02");
  });
});
