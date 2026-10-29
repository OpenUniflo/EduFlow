#!/usr/bin/env node
/**
 * Style gate for the new UI.
 *
 * `docs/design/new-ui/system/lint.py` checks design boards. This script applies
 * the same four rules to application stylesheets:
 *
 *   type   — font-size must be var(--fs-12/13/14/16/20/28)
 *   color  — no literal hex/rgb/hsl colours (use tokens / color-mix)
 *   radius — border-radius must use var(--r-8/12/16/24/full) or 0/50%
 *   shadow — box-shadow must be var(--sh-1/2/3) or none
 *
 * It also rejects raw motion timings/easings so animation stays on the token
 * durations and curves, and runs the generated-token `--check` synchroniser.
 *
 * Usage:
 *   node scripts/lint-css.mjs                 # every CSS file under src
 *   node scripts/lint-css.mjs <file|dir> ...  # focused run (tests, editors)
 *   node scripts/lint-css.mjs --strict        # also inspect legacy baseline files
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Generated from the single design source; checked by `--check` instead. */
const GENERATED = ["src/shared/styles/tokens.css"];
/** Existing page styles. They are retired page by page (DESIGN plan §3/§4). */
const LEGACY = [
  "src/shared/styles/legacy.css",
  "src/shared/styles/product.css",
  // Pre-P0 feature styles. These pages have not migrated yet; keep appearance
  // untouched and add them to the token system when their P1+ page is rebuilt.
  "src/features/actions/edgeActions.css",
  "src/features/assistant/assistantSurface.css",
  "src/features/assistant/conversation/conversationWorkspace.css",
  "src/features/course/capability/projectCapability.css",
  "src/features/course/path/coursePath.css",
  "src/features/evidence/evidence.css",
  "src/features/workflow/editor/v2/nodePanel.css",
  "src/features/workflow/editor/v2/workflowV2.css",
  "src/features/workflow/resources/resourceCenter.css",
  "src/features/workflow/resources/resourceEditor.css",
  "src/shared/components/conversationWorkbench.css",
  "src/shared/content/richText.css"
];

const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/;
const NAMED_COLOR = /^(?:black|white|red|green|blue|yellow|orange|purple|pink|brown|gray|grey|cyan|magenta|lime|navy|teal|olive|maroon|silver|gold|violet|indigo)$/i;
const COLOR_PROPERTIES = new Set(["color", "background-color", "border-color", "outline-color", "fill", "stroke"]);
const TIME = /\b\d*\.?\d+m?s\b/;
const CUBIC = /\bcubic-bezier\s*\(/;
const RADIUS_OK = /^var\(--r-(?:8|12|16|24|full)\)$/;
const SHADOW_OK = /^var\(--sh-(?:1|2|3)\)$/;
const FONT_OK = /^var\(--fs-(?:12|13|14|16|20|28)\)$/;

function cleanCss(text) {
  // Preserve offsets/newlines so diagnostics point at the source line.
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "));
}

function lineOf(text, offset) {
  let line = 1;
  let last = -1;
  for (let i = 0; i < offset; i += 1) {
    if (text[i] === "\n") {
      line += 1;
      last = i;
    }
  }
  return { line, column: offset - last };
}

function declarations(css) {
  const out = [];
  const pattern = /([a-zA-Z-]+)\s*:\s*([^;{}]+)(?=;|})/g;
  for (const match of css.matchAll(pattern)) {
    out.push({ property: match[1].toLowerCase(), value: match[2].trim(), offset: match.index ?? 0 });
  }
  return out;
}

function splitShadow(value) {
  return value.split(/,(?![^(]*\))/).map((part) => part.trim()).filter(Boolean);
}

function lintSource(file, source) {
  const violations = [];
  const css = cleanCss(source);
  for (const declaration of declarations(css)) {
    const { property, value } = declaration;
    const position = lineOf(css, declaration.offset);
    const add = (rule, message) => violations.push({ file, line: position.line, column: position.column, rule, message });

    if (COLOR.test(value) || (COLOR_PROPERTIES.has(property) && NAMED_COLOR.test(value))) {
      add("color", `${property}:${value} — 使用 token/color-mix，不写 hex/rgb/hsl 或命名颜色`);
    }
    if (property === "font-size" && !FONT_OK.test(value.replace(/\s*!important$/i, ""))) {
      add("type", `font-size:${value} — 只允许 var(--fs-12/13/14/16/20/28)`);
    }
    if (property === "border-radius") {
      const parts = value.replace(/\s*!important$/i, "").split(/[\s/]+/).filter(Boolean);
      if (!parts.every((part) => RADIUS_OK.test(part) || ["0", "0px", "50%"].includes(part))) {
        add("radius", `border-radius:${value} — 只允许 var(--r-8/12/16/24/full) 或 0/50%`);
      }
    }
    if (property === "box-shadow") {
      const normalized = value.replace(/\s*!important$/i, "");
      if (normalized !== "none" && !splitShadow(normalized).every((part) => SHADOW_OK.test(part))) {
        add("shadow", `box-shadow:${value} — 只允许 var(--sh-1/2/3) 或 none`);
      }
    }
    if ((property === "transition" || property === "animation" || property === "transition-duration" || property === "animation-duration") && TIME.test(value)) {
      add("motion", `${property}:${value} — 时长使用 var(--dur-fast/base/slow/scene)`);
    }
    if ((property === "transition" || property === "animation" || property === "transition-timing-function" || property === "animation-timing-function") && CUBIC.test(value)) {
      add("motion", `${property}:${value} — 缓动使用 var(--ease-out/inout/spring)`);
    }
  }
  return violations;
}

function walkCss(target, out) {
  if (statSync(target).isFile()) {
    if (extname(target) === ".css") out.push(target);
    return out;
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    walkCss(resolve(target, entry.name), out);
  }
  return out;
}

export function lintFiles(files) {
  return files.flatMap((file) => lintSource(file, readFileSync(file, "utf8")));
}

function main(argv) {
  const strict = argv.includes("--strict");
  const targets = argv.filter((arg) => arg !== "--strict");
  const discovered = [];
  for (const target of targets.length ? targets : ["src"]) {
    const absolute = resolve(process.cwd(), target);
    try {
      walkCss(absolute, discovered);
    } catch (error) {
      console.error(`lint:css: cannot read ${target}: ${error.message}`);
      return 2;
    }
  }

  const exempt = new Set([...GENERATED, ...(strict ? [] : LEGACY)].map((file) => resolve(ROOT, file)));
  const files = [...new Set(discovered)]
    .filter((file) => !exempt.has(resolve(file)))
    .sort();

  const violations = lintFiles(files);
  for (const violation of violations) {
    console.error(`${relative(ROOT, violation.file)}:${violation.line}:${violation.column}: [${violation.rule}] ${violation.message}`);
  }

  const tokenCheck = spawnSync(process.execPath, [resolve(ROOT, "scripts/sync-design-tokens.mjs"), "--check", "--quiet"], { encoding: "utf8" });
  if (tokenCheck.status !== 0) {
    if (tokenCheck.stdout) process.stderr.write(tokenCheck.stdout);
    if (tokenCheck.stderr) process.stderr.write(tokenCheck.stderr);
    return 1;
  }

  if (violations.length) {
    console.error(`\nlint:css: ${violations.length} violation(s) in ${files.length} file(s)`);
    return 1;
  }
  console.log(`lint:css: ${files.length} file(s) clean; design tokens in sync`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
