import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTokens } from "../scripts/sync-design-tokens.mjs";

const ROOT = process.cwd();
const NODE = process.execPath;
const SOURCE = resolve(ROOT, "docs/design/new-ui/system/tokens.css");
const GENERATED = resolve(ROOT, "src/shared/styles/tokens.css");
const temp = () => mkdtempSync(join(tmpdir(), "eduflow-design-"));
const run = (script: string, args: string[]) => spawnSync(NODE, [resolve(ROOT, script), ...args], { cwd: ROOT, encoding: "utf8" });

describe("design token synchroniser", () => {
  it("re-scopes only custom properties to :root and drops board presentation", () => {
    const output = generateTokens(readFileSync(SOURCE, "utf8"), "tokens.css");
    const rules = output.slice(output.indexOf(":root"));
    expect(output).toContain(":root {");
    expect(output).toContain("--brand:#6D5DF6");
    expect(output).toContain("--dur-fast:160ms");
    expect(output).not.toMatch(/^\.ef\s*\{/m);
    expect(rules).not.toContain("min-height:960px");
    expect(rules).not.toContain("position:relative");
    expect(rules).not.toContain("background:");
    expect(output).not.toContain(".ef-btn");
  });

  it("passes --check when the generated file matches the source", () => {
    const result = run("scripts/sync-design-tokens.mjs", ["--check"]);
    expect(result.status, result.stderr).toBe(0);
  });

  it("fails --check when the generated file is tampered with", () => {
    const directory = temp();
    const output = join(directory, "tokens.css");
    writeFileSync(output, generateTokens(readFileSync(SOURCE, "utf8")), "utf8");
    expect(run("scripts/sync-design-tokens.mjs", ["--check", "--output", output]).status).toBe(0);
    writeFileSync(output, `${readFileSync(output, "utf8")}/* tampered */\n`, "utf8");
    const tampered = run("scripts/sync-design-tokens.mjs", ["--check", "--output", output]);
    expect(tampered.status).toBe(1);
    expect(tampered.stderr).toContain("out of date");
  });

  it("writes the same bytes as the committed generated file", () => {
    const directory = temp();
    const output = join(directory, "tokens.css");
    const result = run("scripts/sync-design-tokens.mjs", ["--source", SOURCE, "--output", output]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(output, "utf8")).toBe(readFileSync(GENERATED, "utf8"));
  });
});

describe("glass source", () => {
  it("keeps the inline lens filters byte-identical to glass-defs.html", () => {
    const html = readFileSync(resolve(ROOT, "docs/design/new-ui/system/glass-defs.html"), "utf8");
    const svg = html.match(/<svg[\s\S]*?<\/svg>/)![0];
    const component = readFileSync(resolve(ROOT, "src/shared/ui/GlassDefs.tsx"), "utf8");
    expect(component).toContain(svg);
  });
});

describe("new-UI style gate", () => {
  it("rejects deliberate out-of-spec type, colour, radius, shadow and motion", () => {
    const directory = temp();
    const file = join(directory, "violations.css");
    writeFileSync(file, `.bad {
  font-size: 15px;
  color: red;
  border-radius: 3px;
  box-shadow: 0 0 1px red;
  transition: color 200ms ease;
}\n`, "utf8");
    const result = run("scripts/lint-css.mjs", [file]);
    expect(result.status).toBe(1);
    for (const rule of ["type", "color", "radius", "shadow", "motion"]) expect(result.stderr, rule).toContain(`[${rule}]`);
  });

  it("accepts token-only styles", () => {
    const directory = temp();
    const file = join(directory, "clean.css");
    writeFileSync(file, `.good {
  font-size: var(--fs-14);
  color: var(--ink);
  border-radius: var(--r-12);
  box-shadow: var(--sh-1);
  transition: color var(--dur-fast) var(--ease-out);
}\n`, "utf8");
    const result = run("scripts/lint-css.mjs", [file]);
    expect(result.status, result.stderr).toBe(0);
  });

  it("includes the token --check in the style gate", () => {
    const result = execFileSync(NODE, ["scripts/lint-css.mjs"], { cwd: ROOT, encoding: "utf8" });
    expect(result).toContain("design tokens in sync");
  });
});
