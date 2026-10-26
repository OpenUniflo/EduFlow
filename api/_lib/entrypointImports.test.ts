import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Vercel runs api/*.ts as native Node ESM. Node does not add extensions or apply tsconfig
// paths, so an extensionless or aliased runtime import anywhere in an entrypoint's module
// graph crashes the Function at load time (FUNCTION_INVOCATION_FAILED) before handleApi runs.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiDirectory = join(repositoryRoot, "api");
const explicitExtensions = new Set([".js", ".mjs", ".cjs", ".json"]);

function runtimeSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const specifiers: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

function resolveSource(fromFile: string, specifier: string): string | undefined {
  const target = resolve(dirname(fromFile), specifier);
  const candidates = extname(target) === ".js" ? [target.replace(/\.js$/, ".ts"), target.replace(/\.js$/, ".tsx"), target] : [target];
  return candidates.find((candidate) => existsSync(candidate));
}

function unresolvableRuntimeImports(entrypoint: string): string[] {
  const failures: string[] = [];
  const visited = new Set<string>();
  const pending = [entrypoint];
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of runtimeSpecifiers(file)) {
      const location = `${relative(repositoryRoot, file)} -> ${specifier}`;
      if (specifier.startsWith("@/")) {
        failures.push(location);
        continue;
      }
      if (!specifier.startsWith(".")) continue;
      const explicit = explicitExtensions.has(extname(specifier));
      if (!explicit) failures.push(location);
      // Keep walking past an extensionless import so one run reports the whole graph.
      const next = resolveSource(file, explicit ? specifier : `${specifier}.js`);
      if (!explicit) {
        if (next) pending.push(next);
        continue;
      }
      if (!next) failures.push(location);
      else if (/\.tsx?$/.test(next)) pending.push(next);
    }
  }
  return failures;
}

const entrypoints = readdirSync(apiDirectory)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => join(apiDirectory, name));

describe("Vercel Function entrypoint imports", () => {
  it.each(entrypoints.map((file) => [relative(repositoryRoot, file), file]))("%s resolves every runtime import under Node ESM", (_name, file) => {
    expect(unresolvableRuntimeImports(file)).toEqual([]);
  });
});
