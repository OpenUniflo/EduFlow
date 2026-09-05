// Run with native Node after `pnpm exec vercel build`; no transpiler or database access.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const directory = resolve(".vercel/output/functions/api/learner.func");
const config = JSON.parse(await readFile(resolve(directory, ".vc-config.json"), "utf8"));
const { default: learner } = await import(pathToFileURL(resolve(directory, config.handler)).href);
assert.equal(typeof learner, "function");
const response = {
  statusCode: 0, body: undefined,
  setHeader() {},
  status(value) { this.statusCode = value; return this; },
  json(value) { this.body = value; return this; },
};
await learner({ query: {} }, response);
assert.equal(response.statusCode, 405);
assert.equal(response.body.error.code, "method_not_allowed");

const { nativeInteractionCorrect } = await import(pathToFileURL(resolve(directory, "api/_lib/microInteraction.js")).href);
const definition = {
  type: "simulation", mode: "challenge",
  parameter: { label: "Learning rate", min: 0.01, max: 1.2, step: 0.01, initial: 0.1 },
  model: { kind: "quadratic-descent", curvature: 2, optimum: 0, initial: 4, steps: 12 },
  target: { maxLoss: 0.05, maxGrowth: 2 },
};
assert.equal(nativeInteractionCorrect(definition, { kind: "simulation", parameter: 0.3, executed: 13 }), true);
assert.equal(nativeInteractionCorrect(definition, { kind: "simulation", parameter: 1.2, executed: 13 }), false);
assert.equal(nativeInteractionCorrect(definition, { kind: "simulation", parameter: 0.3, executed: 1 }), false);
console.log("PASS: generated learner entrypoint loads in native Node; routing and calculated convergence/divergence/incomplete grading verified.");
