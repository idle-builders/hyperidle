#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ar2Path = "packages/db/src/__tests__/ar2-coverage-guard.test.ts";
const validatorPath = ".pipeline/work/AU20/probes/validate-cursor-ar2-format.mjs";
const baselineHash = "b75a3367d137dcd56a11969ee0fb91422fdfa935e7381d276cb95ddd8ec796be";
const formattedHash = "40637c22d91d495e1b91d2176200974be65bf89386cd1a8849761d2e1c557e02";
const oldFragment = `\t\tconst src = [
\t\t\t\`requireHarness("builtin")\`,
\t\t\t\`requireHarness("claude")\`,
\t\t].join("\\n");`;
const newFragment =
  '\t\tconst src = [`requireHarness("builtin")`, `requireHarness("claude")`].join("\\n");';
const frozen = {
  ".pipeline/work/AU20/architecture-amendments/cursor-ar2-format.md":
    "12978af87828fc6c442db32fe6527e30684c87fbedbe90b84c0faa687691183a",
  ".pipeline/work/AU20/feasibility-amendments/cursor-ar2-format.md":
    "4838899422a5be6c09331692dda0bdef487e3e1cfa862160be55dcac66e353ff",
  ".pipeline/work/AU20/architecture-amendments/cursor-probe-committed-state.md":
    "89f4664538ed4069092140bea4ff1163a81ddb81c78babd8a6a12afce77c3f35",
  ".pipeline/work/AU20/feasibility-amendments/cursor-probe-committed-state.md":
    "3af1378776c9544d0e372a6dbb152f03e8aed0de5be4ade33c233de63b2beeac",
  ".pipeline/work/AU20/architecture-amendments/ar2-format-validator-successor.md":
    "e44521d99448ab994c031bcf3c417cabb1b741e411cb33f4e2ec09b2391450dd",
  ".pipeline/work/AU20/feasibility-amendments/ar2-format-validator-successor.md":
    "c247e340b34ced4d0a29a7b8fc9f9c17484f6ea5ab9f5ef10abd8b6b0b103d14",
  ".pipeline/work/AU20/probes/validate-ar2-format-validator-state.mjs":
    "fe26000a8bc9b04fe655ecc0d04e6d72f033828c20ac473c70d2f69683792ec2",
  ".pipeline/work/AU20/red-proofs/ar2-format-validator-state.json":
    "425ffb0fd65d1be01a4917480713c7d02fa83ab170faa5a258159b3572c30041",
  ".pipeline/work/AU20/plan.md":
    "f6770154115b528e04706c178b62a16d5b10b0c53b3f2eb233a938f80a8bfd34",
  ".pipeline/work/AU20/probes/validate-cursor-harness-guard-tests.mjs":
    "852e6d63e6ca14fa372f6def10be2ac42e8b039015092c154639f85b53c43779",
  ".pipeline/work/AU20/probes/validate-cursor-probe-state.mjs":
    "8fc986e259148c2d570935dddb092e14f9dbb93f7e7fb9d478ad1171e2991ad6",
  ".pipeline/work/AU20/red-proofs/cursor-probe-state.json":
    "448bcad2b10d618a6f2df83ba719612cbc4c78e200e320e53b8cc85c2f94b360",
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

const read = (root, path) => readFileSync(resolve(root, path), "utf8");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = message => {
  process.stderr.write(`FAIL ${message}\n`);
  process.exit(2);
};
const run = (root, command, args, input) =>
  spawnSync(command, args, { cwd: root, encoding: "utf8", env: process.env, input });
const semanticTokens = source => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    source
  );
  const tokens = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    tokens.push([kind, scanner.getTokenText()]);
  }
  return tokens.filter(
    ([kind], index) =>
      !(
        kind === ts.SyntaxKind.CommaToken &&
        tokens[index + 1]?.[0] === ts.SyntaxKind.CloseBracketToken
      )
  );
};
const format = (root, source) =>
  run(
    root,
    "npx",
    ["biome", "format", `--stdin-file-path=${ar2Path}`],
    source
  );

export const readScopeState = cwd => {
  const readPaths = args => {
    const result = run(cwd, "git", args);
    if (result.status !== 0) fail("cannot inspect tracked scope");
    return result.stdout
      .split("\n")
      .filter(Boolean)
      .map(path => path.replaceAll("\\", "/"))
      .sort();
  };
  const stagedPaths = readPaths(["diff", "--cached", "--name-only", "--"]);
  const unstagedPaths = readPaths(["diff", "--name-only", "--"]);
  const changedPaths = [...new Set([...stagedPaths, ...unstagedPaths])].sort();
  const unstaged = new Set(unstagedPaths);
  const overlapPaths = stagedPaths.filter(path => unstaged.has(path)).sort();
  return { stagedPaths, unstagedPaths, changedPaths, overlapPaths };
};

export const classifyGreenScope = scopeState => {
  if (scopeState.overlapPaths.length > 0) return "reject";
  if (scopeState.changedPaths.length === 0) return "committed-green";
  if (scopeState.changedPaths.length === 1 && scopeState.changedPaths[0] === ar2Path) {
    return "historical-candidate-green";
  }
  if (scopeState.changedPaths.length === 1 && scopeState.changedPaths[0] === validatorPath) {
    return "validator-candidate-green";
  }
  return "reject";
};

export const classifyValidationState = (contentState, scopeState) => {
  const scope = classifyGreenScope(scopeState);
  if (contentState === baselineHash && scope === "committed-green") return "historical-red";
  if (
    contentState === formattedHash &&
    ["committed-green", "historical-candidate-green", "validator-candidate-green"].includes(scope)
  ) {
    return "pass";
  }
  return "reject";
};

export const main = () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  for (const [path, expected] of Object.entries(frozen)) {
    if (sha256(read(root, path)) !== expected) fail(`${path}: frozen hash mismatch`);
  }
  const successorCommit = "d1d4fc799a098fef6f4634301ff28021abb86164";
  const receipt = run(root, "git", [
    "show",
    "-s",
    "--format=%H%n%T%n%P%n%s",
    successorCommit
  ]);
  if (receipt.status !== 0) fail("cannot read committed lifecycle receipt");
  const expectedReceipt = [
    successorCommit,
    "11655200ad7877d2f1c5086bdd28b012b620863e",
    "ec9f7b39409baadc3b732e269cef7cdcfc51ec32",
    "AU20: make Cursor guard evidence reproducible"
  ];
  if (JSON.stringify(receipt.stdout.trim().split("\n")) !== JSON.stringify(expectedReceipt)) {
    fail("committed lifecycle receipt mismatch");
  }
  const committedProgress = run(root, "git", [
    "show",
    `${successorCommit}:.pipeline/work/AU20/progress.json`
  ]);
  if (
    committedProgress.status !== 0 ||
    sha256(committedProgress.stdout) !==
      "1665ac08ff6d77c6b9adbb77b943d13d72a91fc683902cbcee3267c420cc0615"
  ) {
    fail("immutable committed progress mismatch");
  }
  const source = read(root, ar2Path);
  const sourceHash = sha256(source);
  const scopeState = readScopeState(root);
  const validationState = classifyValidationState(sourceHash, scopeState);
  if (validationState === "reject") {
    fail(`validation state rejected: ${sourceHash}/${JSON.stringify(scopeState)}`);
  }
  const baseline =
    sourceHash === baselineHash ? source : source.replace(newFragment, oldFragment);
  if (sha256(baseline) !== baselineHash) fail("cannot reconstruct exact red baseline");
  if (baseline.split(oldFragment).length !== 2) fail("baseline formatter target is not unique");
  const expectedFormatted = baseline.replace(oldFragment, newFragment);
  if (sha256(expectedFormatted) !== formattedHash) fail("exact formatter result hash mismatch");
  if (
    JSON.stringify(semanticTokens(baseline)) !==
    JSON.stringify(semanticTokens(expectedFormatted))
  ) {
    fail("formatter changes TypeScript semantic token stream");
  }

  const firstFormat = format(root, source);
  if (firstFormat.status !== 0) fail(`formatter exited ${firstFormat.status ?? "null"}`);
  if (firstFormat.stdout !== expectedFormatted) fail("formatter output is not the sole accepted diff");
  const secondFormat = format(root, firstFormat.stdout);
  if (secondFormat.status !== 0 || secondFormat.stdout !== firstFormat.stdout) {
    fail("formatter is not byte-idempotent");
  }

  const focused = run(root, "npx", ["biome", "check", ar2Path]);
  const focusedOutput = `${focused.stdout ?? ""}${focused.stderr ?? ""}`;
  if (validationState === "historical-red") {
    if (focused.status !== 1) fail(`focused red exited ${focused.status ?? "null"}`);
    if (!focusedOutput.includes("Formatter would have printed the following content")) {
      fail("focused red lacks formatter diagnostic");
    }
    if (!focusedOutput.includes("Found 1 error.")) fail("focused red error count mismatch");
    process.stderr.write(
      "RED Cursor AR2 differs from Biome by the exact two-element array layout only\n"
    );
    process.exit(1);
  }
  if (focused.status !== 0) fail(`focused green exited ${focused.status ?? "null"}`);
  if (JSON.stringify(semanticTokens(baseline)) !== JSON.stringify(semanticTokens(source))) {
    fail("formatted AR2 semantic token stream changed");
  }
  process.stdout.write("PASS Cursor AR2 exact formatting is semantic-only and idempotent\n");
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) main();
