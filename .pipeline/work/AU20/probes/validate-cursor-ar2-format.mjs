#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ar2Path = "packages/db/src/__tests__/ar2-coverage-guard.test.ts";
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
    "50cf35ca2d0ff3cd8a85aed9a8bbc5de16fd5e71d83bbaa6f77a3984f021a290",
  ".pipeline/work/AU20/feasibility-amendments/cursor-probe-committed-state.md":
    "7c19ecd8d9234c4f1fafd3306c567865eb55f5eec42996a55351c97a40bbdbdd",
  ".pipeline/work/AU20/plan.md":
    "f6770154115b528e04706c178b62a16d5b10b0c53b3f2eb233a938f80a8bfd34",
  ".pipeline/work/AU20/probes/validate-cursor-harness-guard-tests.mjs":
    "5829a4bb7b7f3e12e00104a738dc119bc416a5375c847590062f23b7b5071fa6",
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

const read = path => readFileSync(resolve(root, path), "utf8");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = message => {
  process.stderr.write(`FAIL ${message}\n`);
  process.exit(2);
};
const run = (command, args, input) =>
  spawnSync(command, args, { cwd: root, encoding: "utf8", env: process.env, input });
const trackedPaths = () => {
  const paths = new Set();
  for (const args of [
    ["diff", "--name-only", "--"],
    ["diff", "--cached", "--name-only", "--"]
  ]) {
    const result = run("git", args);
    if (result.status !== 0) fail("cannot inspect tracked scope");
    for (const path of result.stdout.split("\n").filter(Boolean)) paths.add(path);
  }
  return [...paths].sort();
};
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
const format = source =>
  run(
    "npx",
    ["biome", "format", `--stdin-file-path=${ar2Path}`],
    source
  );

for (const [path, expected] of Object.entries(frozen)) {
  if (sha256(read(path)) !== expected) fail(`${path}: frozen hash mismatch`);
}
const progress = JSON.parse(read(".pipeline/work/AU20/progress.json"));
if (progress.status !== "in_progress" || progress.reviewVerdict !== "NOT DONE") {
  fail(`closeout barrier missing: ${progress.status}/${progress.reviewVerdict}`);
}

const source = read(ar2Path);
const sourceHash = sha256(source);
if (sourceHash !== baselineHash && sourceHash !== formattedHash) {
  fail(`${ar2Path}: unexpected hash ${sourceHash}`);
}
const baseline =
  sourceHash === baselineHash ? source : source.replace(newFragment, oldFragment);
if (sha256(baseline) !== baselineHash) fail("cannot reconstruct exact red baseline");
if (baseline.split(oldFragment).length !== 2) fail("baseline formatter target is not unique");
const expectedFormatted = baseline.replace(oldFragment, newFragment);
if (sha256(expectedFormatted) !== formattedHash) fail("exact formatter result hash mismatch");
if (JSON.stringify(semanticTokens(baseline)) !== JSON.stringify(semanticTokens(expectedFormatted))) {
  fail("formatter changes TypeScript semantic token stream");
}

const firstFormat = format(source);
if (firstFormat.status !== 0) fail(`formatter exited ${firstFormat.status ?? "null"}`);
if (firstFormat.stdout !== expectedFormatted) fail("formatter output is not the sole accepted diff");
const secondFormat = format(firstFormat.stdout);
if (secondFormat.status !== 0 || secondFormat.stdout !== firstFormat.stdout) {
  fail("formatter is not byte-idempotent");
}

const changed = trackedPaths();
const focused = run("npx", ["biome", "check", ar2Path]);
const focusedOutput = `${focused.stdout ?? ""}${focused.stderr ?? ""}`;
if (sourceHash === baselineHash) {
  if (changed.length !== 0) fail(`red baseline has tracked changes: ${JSON.stringify(changed)}`);
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

if (JSON.stringify(changed) !== JSON.stringify([ar2Path])) {
  fail(`green scope mismatch: ${JSON.stringify(changed)}`);
}
if (focused.status !== 0) fail(`focused green exited ${focused.status ?? "null"}`);
if (JSON.stringify(semanticTokens(baseline)) !== JSON.stringify(semanticTokens(source))) {
  fail("formatted AR2 semantic token stream changed");
}
process.stdout.write("PASS Cursor AR2 exact formatting is semantic-only and idempotent\n");
