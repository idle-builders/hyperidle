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
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const validatorPath = ".pipeline/work/AU20/probes/validate-cursor-ar2-format.mjs";
const validatorAbsolute = resolve(root, validatorPath);
const ar2Path = "packages/db/src/__tests__/ar2-coverage-guard.test.ts";
const baselineHash = "b75a3367d137dcd56a11969ee0fb91422fdfa935e7381d276cb95ddd8ec796be";
const formattedHash = "40637c22d91d495e1b91d2176200974be65bf89386cd1a8849761d2e1c557e02";
const oldValidatorHash = "f941e7e9912cf09ee53b1cc6a5d7cab0071557c3f6253a4f5ffd6de7be45a08c";
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
const run = (command, args, cwd = root) =>
  spawnSync(command, args, { cwd, encoding: "utf8", env: process.env });

const frozen = {
  ".pipeline/work/AU20/architecture-amendments/ar2-format-validator-successor.md":
    "e44521d99448ab994c031bcf3c417cabb1b741e411cb33f4e2ec09b2391450dd",
  ".pipeline/work/AU20/feasibility-amendments/ar2-format-validator-successor.md":
    "c247e340b34ced4d0a29a7b8fc9f9c17484f6ea5ab9f5ef10abd8b6b0b103d14",
  ".pipeline/work/AU20/architecture-amendments/cursor-ar2-format.md":
    "12978af87828fc6c442db32fe6527e30684c87fbedbe90b84c0faa687691183a",
  ".pipeline/work/AU20/feasibility-amendments/cursor-ar2-format.md":
    "4838899422a5be6c09331692dda0bdef487e3e1cfa862160be55dcac66e353ff",
  ".pipeline/work/AU20/red-proofs/cursor-ar2-format.json":
    "927f904cfe5f6e4830b98340e3f3a167965972ddf07b049afbc54467d74726cb",
  ".pipeline/work/AU20/architecture-amendments/cursor-probe-committed-state.md":
    "89f4664538ed4069092140bea4ff1163a81ddb81c78babd8a6a12afce77c3f35",
  ".pipeline/work/AU20/feasibility-amendments/cursor-probe-committed-state.md":
    "3af1378776c9544d0e372a6dbb152f03e8aed0de5be4ade33c233de63b2beeac",
  ".pipeline/work/AU20/probes/validate-cursor-harness-guard-tests.mjs":
    "852e6d63e6ca14fa372f6def10be2ac42e8b039015092c154639f85b53c43779",
  ".pipeline/work/AU20/probes/validate-cursor-probe-state.mjs":
    "8fc986e259148c2d570935dddb092e14f9dbb93f7e7fb9d478ad1171e2991ad6",
  ".pipeline/work/AU20/red-proofs/cursor-probe-state.json":
    "448bcad2b10d618a6f2df83ba719612cbc4c78e200e320e53b8cc85c2f94b360",
  [ar2Path]: formattedHash,
  "packages/db/src/__tests__/ar1-honest-harness-guard.test.ts":
    "d2c6db87a0ad2efafcaa836f4daa7f5cf8327571f8f6ecd4c79add0b56892062",
  "scripts/lib/honest-harness-predicate.ts":
    "591e521d2f4891a6332656fa3b4a06df576468815c98ce9d6af5bc2d4c3a0033",
  "scripts/honest-harness-guard.ts":
    "8ef0daadf52c0ca3a4454b2d3aa66e3f26e6a9b6a8d614c224a9bebfb2cc707b",
  "package.json":
    "3613b72b689f045bbf0d0ff0f4e22e07672c22a66390034d628c432bebb52cf7",
  "package-lock.json":
    "cad0e88ea2c0f6406e67df4ad0fb6b8addab85cd0c96d136f25d248aa86418a5",
  "scripts/surface-census.ts":
    "df74ee90cce2bf075f2fd32199e6c86780871c2530c6baa981a4cc8498d0cc9b"
};
for (const [path, expected] of Object.entries(frozen)) {
  if (sha256(read(path)) !== expected) fail(`${path}: frozen hash mismatch`);
}

const successorCommit = "d1d4fc799a098fef6f4634301ff28021abb86164";
const receipt = run("git", [
  "show",
  "-s",
  "--format=%H%n%T%n%P%n%s",
  successorCommit
]);
if (receipt.status !== 0) fail("cannot read committed lifecycle receipt");
expectEqual(
  receipt.stdout.trim().split("\n"),
  [
    "d1d4fc799a098fef6f4634301ff28021abb86164",
    "11655200ad7877d2f1c5086bdd28b012b620863e",
    "ec9f7b39409baadc3b732e269cef7cdcfc51ec32",
    "AU20: make Cursor guard evidence reproducible"
  ],
  "commit object receipt"
);
const committedProgress = run("git", [
  "show",
  `${successorCommit}:.pipeline/work/AU20/progress.json`
]);
if (committedProgress.status !== 0) fail("cannot read immutable committed progress");
if (
  sha256(committedProgress.stdout) !==
  "1665ac08ff6d77c6b9adbb77b943d13d72a91fc683902cbcee3267c420cc0615"
) {
  fail("immutable committed progress hash mismatch");
}

const source = read(validatorPath);
const sourceHash = sha256(source);
const requiredExports = [
  "readScopeState",
  "classifyGreenScope",
  "classifyValidationState",
  "main"
];
const missingExports = requiredExports.filter(
  name => !new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${name}\\b`).test(source)
);
const missingMainGuard =
  !source.includes("pathToFileURL") ||
  !/import\.meta\.url\s*===\s*pathToFileURL\(resolve\(process\.argv\[1\]\)\)\.href/s.test(source);
const cli = run("node", [validatorAbsolute]);
const cliOutput = `${cli.stdout ?? ""}${cli.stderr ?? ""}`.trim();

if (missingExports.length > 0 || missingMainGuard) {
  const head = run("git", ["rev-parse", "HEAD"]);
  if (head.status !== 0 || head.stdout.trim() !== successorCommit) {
    fail(`missing-seams red HEAD mismatch: ${head.stdout.trim()}`);
  }
  if (sourceHash !== oldValidatorHash) fail(`unreviewed old validator hash: ${sourceHash}`);
  for (const args of [
    ["diff", "--quiet", "--"],
    ["diff", "--cached", "--quiet", "--"]
  ]) {
    if (run("git", args).status !== 0) fail("red baseline is not tracked-clean");
  }
  if (
    cli.status !== 2 ||
    cliOutput !==
      "FAIL .pipeline/work/AU20/architecture-amendments/cursor-probe-committed-state.md: frozen hash mismatch"
  ) {
    fail(`stale-successor defect changed: exit=${cli.status} output=${JSON.stringify(cliOutput)}`);
  }
  process.stderr.write(
    "RED AR2 format validator rejects the exact committed Cursor successor receipt\n"
  );
  process.exit(1);
}

const importCheck = run("node", [
  "--input-type=module",
  "--eval",
  `await import(${JSON.stringify(pathToFileURL(validatorAbsolute).href)})`
]);
if (importCheck.status !== 0) fail(`side-effect-free import exited ${importCheck.status}`);
if (`${importCheck.stdout}${importCheck.stderr}` !== "") fail("import produced output");

const sourceFile = ts.createSourceFile(
  validatorPath,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS
);
const operationalInitializer = node => {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return false;
  if (
    ts.isCallExpression(node) ||
    ts.isNewExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isDeleteExpression(node)
  ) {
    return true;
  }
  return node.getChildren(sourceFile).some(operationalInitializer);
};
let mainConditionals = 0;
for (const statement of sourceFile.statements) {
  if (
    ts.isImportDeclaration(statement) ||
    ts.isFunctionDeclaration(statement) ||
    ts.isExportDeclaration(statement)
  ) {
    continue;
  }
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer && operationalInitializer(declaration.initializer)) {
        fail(`top-level operational initializer: ${declaration.name.getText(sourceFile)}`);
      }
    }
    continue;
  }
  if (ts.isIfStatement(statement)) {
    mainConditionals += 1;
    const text = statement.getText(sourceFile);
    if (
      !text.includes("import.meta.url") ||
      !text.includes("pathToFileURL(resolve(process.argv[1])).href") ||
      !/\bmain\(\)/.test(text)
    ) {
      fail("top-level conditional is not the sole is-main guard");
    }
    continue;
  }
  fail(`top-level operational statement: ${ts.SyntaxKind[statement.kind]}`);
}
if (mainConditionals !== 1) fail(`is-main conditional count ${mainConditionals}`);

const module = await import(`${pathToFileURL(validatorAbsolute).href}?state=${Date.now()}`);
for (const name of requiredExports) {
  if (typeof module[name] !== "function") fail(`${name}: export is not callable`);
}
for (const literal of [baselineHash, formattedHash, "historical-red"]) {
  if (!source.includes(literal)) fail(`content-state literal missing: ${literal}`);
}

const rootState = module.readScopeState(root);
const rootClass =
  JSON.stringify(rootState.changedPaths) === JSON.stringify([validatorPath]) &&
  rootState.overlapPaths.length === 0
    ? "validator-candidate-green"
    : rootState.changedPaths.length === 0 && rootState.overlapPaths.length === 0
      ? "committed-green"
      : "reject";
if (rootClass === "reject") {
  fail(`future root scope rejected: ${JSON.stringify(rootState)}`);
}
expectEqual(
  module.classifyGreenScope(rootState),
  rootClass,
  "future root exact accepted class"
);
if (cli.status !== 0) fail(`direct future validator exited ${cli.status}: ${cliOutput}`);

const fixtureRoot = mkdtempSync(resolve(tmpdir(), "au20-ar2-validator-state-"));
const git = (...args) => {
  const result = run("git", args, fixtureRoot);
  if (result.status !== 0) fail(`fixture git ${args.join(" ")}: ${result.stderr}`);
};
const write = (path, content) => {
  const absolute = resolve(fixtureRoot, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
};
const reset = () => git("reset", "--hard", "HEAD");
const state = (stagedPaths, unstagedPaths) => ({
  stagedPaths,
  unstagedPaths,
  changedPaths: [...new Set([...stagedPaths, ...unstagedPaths])].sort(),
  overlapPaths: stagedPaths.filter(path => unstagedPaths.includes(path)).sort()
});
const assertState = (label, expectedState, expectedClass, expectedValidation) => {
  const actual = module.readScopeState(fixtureRoot);
  expectEqual(actual, expectedState, `${label} state`);
  expectEqual(module.classifyGreenScope(actual), expectedClass, `${label} class`);
  for (const [contentHash, expected] of [
    [baselineHash, expectedValidation.baseline],
    [formattedHash, expectedValidation.formatted],
    ["unknown", expectedValidation.unknown]
  ]) {
    expectEqual(
      module.classifyValidationState(contentHash, actual),
      expected,
      `${label} combined ${contentHash}`
    );
  }
};
const cleanTruth = { baseline: "historical-red", formatted: "pass", unknown: "reject" };
const formattedCandidateTruth = { baseline: "reject", formatted: "pass", unknown: "reject" };
const rejectedTruth = { baseline: "reject", formatted: "reject", unknown: "reject" };

try {
  git("init", "-q");
  git("config", "user.email", "ar2-validator-state@example.invalid");
  git("config", "user.name", "AR2 validator state");
  write(ar2Path, "baseline\n");
  write(validatorPath, "validator baseline\n");
  write("unrelated.txt", "unrelated baseline\n");
  git("add", ".");
  git("commit", "-qm", "baseline");

  assertState("clean", state([], []), "committed-green", cleanTruth);
  write(ar2Path, "formatted staged\n");
  git("add", ar2Path);
  assertState(
    "AR2 staged",
    state([ar2Path], []),
    "historical-candidate-green",
    formattedCandidateTruth
  );
  reset();
  write(ar2Path, "formatted unstaged\n");
  assertState(
    "AR2 unstaged",
    state([], [ar2Path]),
    "historical-candidate-green",
    formattedCandidateTruth
  );
  reset();
  write(validatorPath, "validator candidate\n");
  assertState(
    "validator self",
    state([], [validatorPath]),
    "validator-candidate-green",
    formattedCandidateTruth
  );
  reset();
  write("unrelated.txt", "unrelated changed\n");
  assertState("unrelated", state([], ["unrelated.txt"]), "reject", rejectedTruth);
  reset();
  write(ar2Path, "formatted combo\n");
  write(validatorPath, "validator combo\n");
  assertState(
    "self combination",
    state([], [ar2Path, validatorPath].sort()),
    "reject",
    rejectedTruth
  );
  reset();
  write(ar2Path, "staged overlap\n");
  git("add", ar2Path);
  write(ar2Path, "unstaged overlap\n");
  assertState(
    "partial-stage overlap",
    state([ar2Path], [ar2Path]),
    "reject",
    rejectedTruth
  );
  reset();
  write(ar2Path, "staged cancellation\n");
  git("add", ar2Path);
  write(ar2Path, "baseline\n");
  assertState(
    "staged cancellation",
    state([ar2Path], [ar2Path]),
    "reject",
    rejectedTruth
  );
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

process.stdout.write("PASS AR2 format validator successor state matrix\n");
