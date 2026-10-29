#!/usr/bin/env node
/**
 * Synchronise the design-system tokens into the application stylesheet.
 *
 * The only source of truth is docs/design/new-ui/system/tokens.css. That file
 * is written for design boards: its tokens live in a `.ef` scope together with
 * board presentation such as `min-height:960px` and the decorative background.
 * Copying it verbatim into the app would create a second page shell, so this
 * script extracts only the custom properties and re-scopes them to `:root`.
 *
 * Usage:
 *   node scripts/sync-design-tokens.mjs            # write the generated file
 *   node scripts/sync-design-tokens.mjs --check    # fail when out of date
 *
 * Optional: --source <file> --output <file> (used by tests and CI jobs that
 * keep the design source at a different path).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DEFAULT_SOURCE = resolve(ROOT, "docs/design/new-ui/system/tokens.css");
const DEFAULT_OUTPUT = resolve(ROOT, "src/shared/styles/tokens.css");

const HEADER = `/*
 * Generated from docs/design/new-ui/system/tokens.css by \`pnpm tokens:sync\`.
 * Do not edit by hand: change the design source and run the sync command.
 *
 * The design source is board-scoped and also contains board presentation
 * (fixed board heights, decorative background, etc.). This output keeps only
 * custom properties, scoped to :root, so consuming the design tokens cannot
 * alter an existing page's layout or appearance.
 */`;

/** Find the body of the first `.ef { ... }` rule. */
function efBlock(source) {
  const match = /(?:^|[\s,])\.ef\s*\{/.exec(source);
  if (!match) throw new Error("design source has no .ef token block");
  const open = source.indexOf("{", match.index);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error("unterminated .ef token block");
}

function stripBoardPresentation(body, sourceName) {
  const lines = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("/*") || line.startsWith("*") || line.startsWith("*/")) {
      lines.push({ kind: "comment", text: line });
      continue;
    }
    // Keep custom-property declarations. A line may hold several declarations
    // (`--fs-12:12px; --lh-12:16px;`), which is preserved verbatim.
    if (line.startsWith("--")) {
      lines.push({ kind: "token", text: line });
      continue;
    }
    // Everything else in .ef is board presentation (position, background,
    // min-height, typography defaults, ...), deliberately dropped.
  }

  if (!lines.some((line) => line.kind === "token")) {
    throw new Error(`${sourceName}: .ef block contains no custom properties`);
  }
  // Guard against a future source that mixes board declarations onto the same
  // line as a token: make the failure visible instead of silently exporting it.
  for (const line of lines) {
    if (line.kind !== "token") continue;
    if (/\b(?:min-height|position|background|isolation|width)\s*:/.test(line.text)) {
      throw new Error(`${sourceName}: token line contains board presentation: ${line.text}`);
    }
  }
  return lines;
}

export function generateTokens(source, sourceName = "tokens.css") {
  const lines = stripBoardPresentation(efBlock(source), sourceName);
  const body = lines.map((line) => `  ${line.text}`).join("\n");
  return `${HEADER}\n:root {\n${body}\n}\n`;
}

function parseArgs(argv) {
  const args = { check: false, source: DEFAULT_SOURCE, output: DEFAULT_OUTPUT, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") args.check = true;
    else if (arg === "--quiet") args.quiet = true;
    else if (arg === "--source" || arg === "--output") {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a path`);
      args[arg.slice(2)] = resolve(process.cwd(), value);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function firstDifference(expected, actual) {
  const want = expected.split("\n");
  const got = actual.split("\n");
  const count = Math.max(want.length, got.length);
  for (let i = 0; i < count; i += 1) {
    if (want[i] !== got[i]) {
      return [
        `  line ${i + 1}:`,
        `    expected: ${want[i] === undefined ? "<end of file>" : want[i]}`,
        `    actual:   ${got[i] === undefined ? "<end of file>" : got[i]}`
      ].join("\n");
    }
  }
  return "";
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`tokens: ${error.message}`);
    return 2;
  }
  if (args.help) {
    console.log("Usage: node scripts/sync-design-tokens.mjs [--check] [--source <file>] [--output <file>]");
    return 0;
  }

  let source;
  try {
    source = readFileSync(args.source, "utf8");
  } catch (error) {
    console.error(`tokens: cannot read ${args.source}: ${error.message}`);
    return 2;
  }

  let expected;
  try {
    expected = generateTokens(source, relative(ROOT, args.source));
  } catch (error) {
    console.error(`tokens: ${error.message}`);
    return 2;
  }

  if (args.check) {
    let actual;
    try {
      actual = readFileSync(args.output, "utf8");
    } catch {
      console.error(`tokens: missing generated file ${relative(ROOT, args.output)} (run pnpm tokens:sync)`);
      return 1;
    }
    if (actual !== expected) {
      console.error(`tokens: ${relative(ROOT, args.output)} is out of date with ${relative(ROOT, args.source)}`);
      const diff = firstDifference(expected, actual);
      if (diff) console.error(diff);
      console.error("Run `pnpm tokens:sync` and commit the generated file.");
      return 1;
    }
    if (!args.quiet) console.log(`tokens: ${relative(ROOT, args.output)} is in sync`);
    return 0;
  }

  writeFileSync(args.output, expected, "utf8");
  if (!args.quiet) console.log(`tokens: wrote ${relative(ROOT, args.output)} from ${relative(ROOT, args.source)}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
