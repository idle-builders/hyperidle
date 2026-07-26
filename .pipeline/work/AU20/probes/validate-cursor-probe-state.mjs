#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const probePath = ".pipeline/work/AU20/probes/validate-cursor-harness-guard-tests.mjs";
const probeAbsolute = resolve(root, probePath);
const targetA = "packages/db/src/__tests__/ar1-honest-harness-guard.test.ts";
const targetB = "packages/db/src/__tests__/ar2-coverage-guard.test.ts";
const targetPaths = [targetA, targetB].sort();
const sha256 = value => createHash("sha256").update(value).digest("hex");
const read = path => readFileSync(resolve(root, path), "utf8");
const fail = message => {
  process.stderr.write(`FAIL ${message}\n`);
  process.exit(2);
};
const expectEqual = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
};

const frozen = {
  ".pipeline/work/AU20/architecture-amendments/cursor-probe-committed-state.md":
    "89f4664538ed4069092140bea4ff1163a81ddb81c78babd8a6a12afce77c3f35",
  ".pipeline/work/AU20/feasibility-amendments/cursor-probe-committed-state.md":
    "3af1378776c9544d0e372a6dbb152f03e8aed0de5be4ade33c233de63b2beeac",
  ".pipeline/work/AU20/architecture-amendments/cursor-ar2-format.md":
    "12978af87828fc6c442db32fe6527e30684c87fbedbe90b84c0faa687691183a",
  ".pipeline/work/AU20/feasibility-amendments/cursor-ar2-format.md":
    "4838899422a5be6c09331692dda0bdef487e3e1cfa862160be55dcac66e353ff",
  ".pipeline/work/AU20/probes/validate-cursor-ar2-format.mjs":
    "f941e7e9912cf09ee53b1cc6a5d7cab0071557c3f6253a4f5ffd6de7be45a08c",
  ".pipeline/work/AU20/red-proofs/cursor-ar2-format.json":
    "927f904cfe5f6e4830b98340e3f3a167965972ddf07b049afbc54467d74726cb",
  "plans/AU20/register-reviews/cursor-ar2-format-implementation.md":
    "ef2b2f7ace63f08703281aa251f94b00cfd7c15d23473988612fd32dc1264aec",
  ".pipeline/work/AU20/red-proofs/cursor-harness-guard-tests.json":
    "77e4381f858632ff6bac4803164ab92390a57427d2c6816c8a048a91153a83ba",
  [targetA]: "d2c6db87a0ad2efafcaa836f4daa7f5cf8327571f8f6ecd4c79add0b56892062",
  [targetB]: "40637c22d91d495e1b91d2176200974be65bf89386cd1a8849761d2e1c557e02",
  "scripts/lib/honest-harness-predicate.ts":
    "591e521d2f4891a6332656fa3b4a06df576468815c98ce9d6af5bc2d4c3a0033",
  "scripts/honest-harness-guard.ts":
    "8ef0daadf52c0ca3a4454b2d3aa66e3f26e6a9b6a8d614c224a9bebfb2cc707b",
  "package.json": "3613b72b689f045bbf0d0ff0f4e22e07672c22a66390034d628c432bebb52cf7",
  "package-lock.json": "cad0e88ea2c0f6406e67df4ad0fb6b8addab85cd0c96d136f25d248aa86418a5",
  "scripts/surface-census.ts":
    "df74ee90cce2bf075f2fd32199e6c86780871c2530c6baa981a4cc8498d0cc9b"
};
for (const [path, expected] of Object.entries(frozen)) {
  if (sha256(read(path)) !== expected) fail(`${path}: frozen hash mismatch`);
}

const source = read(probePath);
const currentProbeSha256 = sha256(source);
const redProbeSha256 = "5829a4bb7b7f3e12e00104a738dc119bc416a5375c847590062f23b7b5071fa6";
const cli = spawnSync("node", [probeAbsolute], {
  cwd: root,
  encoding: "utf8",
  env: process.env
});
const cliOutput = `${cli.stdout ?? ""}${cli.stderr ?? ""}`.trim();
const requiredExports = ["readScopeState", "classifyGreenScope", "main"];
const missingExports = requiredExports.filter(
  name => !new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${name}\\b`).test(source)
);
const missingMainGuard =
  !source.includes("pathToFileURL") ||
  !/import\.meta\.url\s*===\s*pathToFileURL\(.*process\.argv\[1\].*\)\.href/s.test(source);

if (missingExports.length > 0 || missingMainGuard) {
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const head = git("rev-parse", "HEAD").stdout.trim();
  if (head !== "ec9f7b39409baadc3b732e269cef7cdcfc51ec32") {
    fail(`committed head mismatch: ${head}`);
  }
  const tree = git("rev-parse", "HEAD^{tree}").stdout.trim();
  if (tree !== "801242ea1aacd30168d7f51c7626665c6c4a5bd1") {
    fail(`committed tree mismatch: ${tree}`);
  }
  for (const args of [
    ["diff", "--quiet", "--"],
    ["diff", "--cached", "--quiet", "--"]
  ]) {
    const result = git(...args);
    if (result.status !== 0) fail("committed red baseline is not tracked-clean");
  }
  if (currentProbeSha256 !== redProbeSha256) {
    fail(`unreviewed red Cursor probe hash: ${currentProbeSha256}`);
  }
  if (cli.status !== 2 || cliOutput !== "FAIL green scope mismatch: []") {
    fail(`committed defect changed: exit=${cli.status} output=${JSON.stringify(cliOutput)}`);
  }
  process.stderr.write(
    "RED Cursor guard-test probe rejects byte-exact green tests at clean committed HEAD\n"
  );
  process.exit(1);
}

const importCheck = spawnSync(
  "node",
  [
    "--input-type=module",
    "--eval",
    `await import(${JSON.stringify(pathToFileURL(probeAbsolute).href)})`
  ],
  { cwd: root, encoding: "utf8", env: process.env }
);
if (importCheck.status !== 0) fail(`side-effect-free import exited ${importCheck.status}`);
if (`${importCheck.stdout}${importCheck.stderr}` !== "") fail("import produced output");

const module = await import(`${pathToFileURL(probeAbsolute).href}?state=${Date.now()}`);
for (const name of requiredExports) {
  if (typeof module[name] !== "function") fail(`${name}: export is not callable`);
}
const candidateState = await module.readScopeState(root);
expectEqual(candidateState.overlapPaths, [], "future root overlap");
const rootIsCandidate =
  JSON.stringify(candidateState.changedPaths) === JSON.stringify([probePath]);
const rootIsCommitted = candidateState.changedPaths.length === 0;
if (!rootIsCandidate && !rootIsCommitted) {
  fail(`future root scope: ${JSON.stringify(candidateState.changedPaths)}`);
}
expectEqual(
  module.classifyGreenScope(candidateState),
  rootIsCandidate ? "probe-candidate-green" : "committed-green",
  rootIsCandidate ? "future root self-candidate class" : "future root committed class"
);
if (cli.status !== 0) fail(`direct CLI exited ${cli.status}: ${cliOutput}`);

const fixtureRoot = mkdtempSync(resolve(tmpdir(), "au20-cursor-probe-state-"));
const fixtureGit = (...args) => {
  const result = spawnSync("git", args, { cwd: fixtureRoot, encoding: "utf8" });
  if (result.status !== 0) fail(`fixture git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
};
const write = (path, content) => {
  const absolute = resolve(fixtureRoot, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
};
const reset = () => fixtureGit("reset", "--hard", "HEAD");
const assertState = async (label, expectedState, expectedClass) => {
  const state = await module.readScopeState(fixtureRoot);
  expectEqual(state, expectedState, `${label} state`);
  expectEqual(module.classifyGreenScope(state), expectedClass, `${label} class`);
};
const state = (stagedPaths, unstagedPaths) => ({
  stagedPaths,
  unstagedPaths,
  changedPaths: [...new Set([...stagedPaths, ...unstagedPaths])].sort(),
  overlapPaths: stagedPaths.filter(path => unstagedPaths.includes(path)).sort()
});

try {
  fixtureGit("init", "-q");
  fixtureGit("config", "user.email", "cursor-probe-state@example.invalid");
  fixtureGit("config", "user.name", "Cursor probe state");
  write(targetA, "A baseline\n");
  write(targetB, "B baseline\n");
  write(probePath, "probe baseline\n");
  write("unrelated.txt", "unrelated baseline\n");
  fixtureGit("add", ".");
  fixtureGit("commit", "-qm", "baseline");

  await assertState("clean", state([], []), "committed-green");

  write(targetA, "A staged\n");
  write(targetB, "B staged\n");
  fixtureGit("add", targetA, targetB);
  await assertState("all staged", state(targetPaths, []), "candidate-green");
  reset();

  write(targetA, "A unstaged\n");
  write(targetB, "B unstaged\n");
  await assertState("all unstaged", state([], targetPaths), "candidate-green");
  reset();

  write(targetA, "A staged split\n");
  fixtureGit("add", targetA);
  write(targetB, "B unstaged split\n");
  await assertState("split", state([targetA], [targetB]), "candidate-green");
  reset();

  write(probePath, "probe candidate\n");
  await assertState("probe self", state([], [probePath]), "probe-candidate-green");
  reset();

  write(targetA, "A partial\n");
  await assertState("partial", state([], [targetA]), "reject");
  reset();

  write("unrelated.txt", "unrelated changed\n");
  await assertState("unrelated", state([], ["unrelated.txt"]), "reject");
  reset();

  write(probePath, "probe plus target\n");
  write(targetA, "A self combo\n");
  await assertState("self plus target", state([], [probePath, targetA].sort()), "reject");
  reset();

  write(probePath, "probe plus unrelated\n");
  write("unrelated.txt", "unrelated self combo\n");
  await assertState(
    "self plus unrelated",
    state([], [probePath, "unrelated.txt"].sort()),
    "reject"
  );
  reset();

  write(targetA, "A staged overlap\n");
  fixtureGit("add", targetA);
  write(targetA, "A unstaged overlap\n");
  await assertState(
    "partially staged overlap",
    state([targetA], [targetA]),
    "reject"
  );
  reset();

  write(targetA, "A staged cancellation\n");
  fixtureGit("add", targetA);
  write(targetA, "A baseline\n");
  await assertState("same-path cancellation", state([targetA], [targetA]), "reject");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

process.stdout.write("PASS Cursor probe committed-state matrix\n");
