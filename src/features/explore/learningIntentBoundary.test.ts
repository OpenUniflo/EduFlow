import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

describe("Explore demo boundary",()=>{
  it("keeps concrete demo identities out of generic Explore code",()=>{
    const root=dirname(fileURLToPath(import.meta.url));
    const source=["learningIntent.ts","pages/ExplorePage.tsx"].map((file)=>readFileSync(join(root,file),"utf8")).join("\n");
    expect(source).not.toContain("agentic-ai");
    expect(source).not.toContain("MA02");
  });
});
