import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function typescriptFilesUnder(root: string): string[] {
  return readdirSync(join(process.cwd(), root), { withFileTypes: true }).flatMap((entry) => {
    const path = `${root}/${entry.name}`;
    return entry.isDirectory() ? typescriptFilesUnder(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

function importedSpecifiers(source: string) {
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s+["']([^"']+)["']/gm
  ];
  return patterns.flatMap((pattern) => Array.from(source.matchAll(pattern), (match) => match[1]));
}

const productionFiles = (root: string) => typescriptFilesUnder(root).filter((file) => !/\.test\.(ts|tsx)$/.test(file));

describe("Workflow architecture dependency direction", () => {
  it("keeps Workflow Core independent from Demo and App composition", () => {
    const violations = productionFiles("src/features/workflow").flatMap((file) => importedSpecifiers(readFileSync(join(process.cwd(), file), "utf8"))
      .filter((specifier) => /^@\/(?:demo|app)(?:\/|$)/.test(specifier) || specifier.includes("applicationServices"))
      .map((specifier) => `${file} -> ${specifier}`));
    expect(violations).toEqual([]);
  });

  it("keeps Workflow Domain pure and browser-independent", () => {
    const violations = productionFiles("src/features/workflow/domain").flatMap((file) => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      return [
        ...importedSpecifiers(source).filter((specifier) => specifier === "react" || /^@\/(?:demo|app)(?:\/|$)/.test(specifier)),
        ...(/\b(?:localStorage|window|document)\b/.test(source) ? ["browser API"] : [])
      ].map((item) => `${file} -> ${item}`);
    });
    expect(violations).toEqual([]);
  });

  it("keeps the Runtime contract independent from Course, Learning, Demo, App, and React", () => {
    const file = "src/features/workflow/runtime/types.ts";
    const imports = importedSpecifiers(readFileSync(join(process.cwd(), file), "utf8"));
    const violations = imports.filter((specifier) => specifier === "react" || /(?:course|learning|demo|app|applicationServices)/i.test(specifier));
    expect(violations).toEqual([]);
  });

  it("keeps Shared independent from Workflow", () => {
    const violations = productionFiles("src/shared").flatMap((file) => importedSpecifiers(readFileSync(join(process.cwd(), file), "utf8"))
      .filter((specifier) => /^@\/features\/workflow(?:\/|$)/.test(specifier))
      .map((specifier) => `${file} -> ${specifier}`));
    expect(violations).toEqual([]);
  });
});
