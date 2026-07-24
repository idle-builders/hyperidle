#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const baseCommit = "abf86e345b505aa5ad456bec95b6322276d2ab5c";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const read = path => readFileSync(resolve(root, path), "utf8");
const fail = message => {
  process.stderr.write(`FAIL ${message}\n`);
  process.exit(2);
};

const frozen = {
  "scripts/harness-vocab-guard.ts":
    "3d9f09c70bcfae3f877b34c23caa1c734ad05ac908ef20b8a61da46207319fb1",
  "package.json":
    "3613b72b689f045bbf0d0ff0f4e22e07672c22a66390034d628c432bebb52cf7",
  "scripts/surface-census.ts":
    "df74ee90cce2bf075f2fd32199e6c86780871c2530c6baa981a4cc8498d0cc9b"
};
for (const [path, expectedHash] of Object.entries(frozen)) {
  if (sha256(read(path)) !== expectedHash) fail(`${path}: frozen hash mismatch`);
}

const documents = {
  ".pipeline/work/AU20/analysis/services/context-assembly.md": {
    beforeSha256: "d6b698d1394a21fb6b40d680a27517d1051dcf2853ec0614a293b799839a8d7e",
    afterSha256: "7943212ec9371fb5cfa8320543d948bdee22407ccc2afc150565d80a3a0ced63",
    replacements: [
      {
        line: 29,
        oldSpan: "*materialize a session's on-disk context.*",
        newSpan: "*perform context assembly for a session's on-disk context.*"
      },
      { line: 32, oldSpan: "prompt-composition", newSpan: "context-assembly" },
      { line: 44, oldSpan: "prompt composition", newSpan: "context assembly" },
      { line: 55, oldSpan: "`composePrompt`", newSpan: "`assemblePrompt`" },
      { line: 64, oldSpan: "`composePrompt`", newSpan: "`assemblePrompt`" }
    ]
  },
  ".pipeline/work/AU20/rearch/run-orchestration.md": {
    beforeSha256: "7d6100e7a9259b94a9092a268daca722dce712e2d9dd8bd508f6a4e03f7fd9d4",
    afterSha256: "406bf14a36735840fcb12e08007b358bec56aec49e4c818f97b506e821e45920",
    replacements: [
      { line: 81, oldSpan: "prompt composition", newSpan: "context assembly" }
    ]
  }
};

const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
let state = null;
const expectedGuardLines = [];

for (const [path, contract] of Object.entries(documents)) {
  const baselineResult = git("show", `${baseCommit}:${path}`);
  if (baselineResult.status !== 0) fail(`${path}: cannot read bound baseline`);
  const baseline = baselineResult.stdout;
  if (sha256(baseline) !== contract.beforeSha256) fail(`${path}: baseline hash mismatch`);

  const originalLines = baseline.split("\n");
  const expectedLines = [...originalLines];
  for (const replacement of contract.replacements) {
    const index = replacement.line - 1;
    const oldLine = originalLines[index];
    if (!oldLine || !oldLine.includes(replacement.oldSpan)) {
      fail(`${path}:${replacement.line}: old span missing from baseline`);
    }
    if (oldLine.split(replacement.oldSpan).length !== 2) {
      fail(`${path}:${replacement.line}: old span is not unique`);
    }
    expectedGuardLines.push({
      path,
      line: replacement.line,
      content: oldLine
    });
    expectedLines[index] = oldLine.replace(replacement.oldSpan, replacement.newSpan);
  }

  const expected = expectedLines.join("\n");
  if (sha256(expected) !== contract.afterSha256) fail(`${path}: reconstructed hash mismatch`);
  const current = read(path);
  const documentState =
    current === baseline ? "red" :
    current === expected ? "green" :
    "invalid";
  if (documentState === "invalid") {
    fail(`${path}: bytes differ beyond the six accepted replacement spans`);
  }
  if (state && state !== documentState) fail("documents are in mixed red/green states");
  state = documentState;
}

const changedResult = git("diff", "--name-only");
if (changedResult.status !== 0) fail("unable to inspect tracked working-tree scope");
const changed = changedResult.stdout.trim().split("\n").filter(Boolean).sort();
const allowedChanges = Object.keys(documents).sort();
if (changed.some(path => !allowedChanges.includes(path))) {
  fail(`tracked file outside evidence scope changed: ${JSON.stringify(changed)}`);
}
if (state === "green" && JSON.stringify(changed) !== JSON.stringify(allowedChanges)) {
  fail(`green scope mismatch: ${JSON.stringify(changed)}`);
}

const guard = spawnSync("npm", ["run", "harness-vocab-guard:check"], {
  cwd: root,
  encoding: "utf8",
  env: process.env
});
const guardOutput = `${guard.stdout ?? ""}${guard.stderr ?? ""}`;
if (state === "red") {
  if (guard.status !== 1) fail(`red guard exited ${guard.status ?? "null"}`);
  for (const item of expectedGuardLines) {
    const diagnostic = `    line ${item.line}: ${item.content}`;
    if (!guardOutput.includes(diagnostic)) fail(`${item.path}:${item.line}: exact guard line missing`);
  }
  const diagnosticLines = guardOutput.split("\n").filter(line => /^\s+line \d+:/.test(line));
  if (diagnosticLines.length !== 6) fail(`guard diagnostic count ${diagnosticLines.length}, expected 6`);
  if (!guardOutput.includes("2 file(s) contain banned harness vocabulary terms.")) {
    fail("guard file count is not exactly 2");
  }
  process.stderr.write("RED harness vocabulary guard reports exact 6 lines across 2 files\n");
  process.exit(1);
}

if (guard.status !== 0) fail(`green guard exited ${guard.status ?? "null"}`);
process.stdout.write("PASS exact six-span harness vocabulary correction\n");
