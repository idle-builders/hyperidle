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
const validatorPath = ".pipeline/work/AU20/probes/validate-harness-vocabulary-evidence.mjs";
const validatorAbsolute = resolve(root, validatorPath);
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
  ".pipeline/work/AU20/red-proofs/harness-vocabulary-evidence.json":
    "9b54daf4910c5e2e5500850a432dbe278c20d8e44d00a8f51a4486eae506a0d2",
  ".pipeline/work/AU20/analysis/services/context-assembly.md":
    "7943212ec9371fb5cfa8320543d948bdee22407ccc2afc150565d80a3a0ced63",
  ".pipeline/work/AU20/rearch/run-orchestration.md":
    "406bf14a36735840fcb12e08007b358bec56aec49e4c818f97b506e821e45920",
  "scripts/harness-vocab-guard.ts":
    "3d9f09c70bcfae3f877b34c23caa1c734ad05ac908ef20b8a61da46207319fb1",
  "package.json":
    "3613b72b689f045bbf0d0ff0f4e22e07672c22a66390034d628c432bebb52cf7",
  "scripts/surface-census.ts":
    "df74ee90cce2bf075f2fd32199e6c86780871c2530c6baa981a4cc8498d0cc9b"
};
for (const [path, expected] of Object.entries(frozen)) {
  if (sha256(read(path)) !== expected) fail(`${path}: frozen hash mismatch`);
}

const cli = spawnSync("node", [validatorAbsolute], {
  cwd: root,
  encoding: "utf8",
  env: process.env
});
const cliOutput = `${cli.stdout ?? ""}${cli.stderr ?? ""}`.trim();
const exactCommittedDefect = "FAIL green scope mismatch: []";

const source = read(validatorPath);
const currentValidatorSha256 = sha256(source);
const redValidatorSha256 = "f82fb16519e31cac3c44a0eeeb9711d19c0cea2fd1217b493798fdbbe188a92b";
const requiredExports = [
  "classifyGreenScope",
  "classifyDocumentState",
  "readChangedPaths"
];
const missingExports = requiredExports.filter(
  name => !new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${name}\\b`).test(source)
);
const missingMainGuard = !/\bisMain\b/.test(source) || !/if\s*\(\s*isMain\s*\)/.test(source);

if (missingExports.length > 0 || missingMainGuard) {
  if (currentValidatorSha256 !== redValidatorSha256) {
    fail(`unreviewed red-state validator hash: ${currentValidatorSha256}`);
  }
  if (cli.status !== 2 || cliOutput !== exactCommittedDefect) {
    fail(`current committed defect changed: exit=${cli.status} output=${JSON.stringify(cliOutput)}`);
  }
  process.stderr.write(
    "RED vocabulary validator lacks committed-state seams and exits 2 on clean HEAD\n"
  );
  process.exit(1);
}

const module = await import(`${pathToFileURL(validatorAbsolute).href}?state-probe=${Date.now()}`);
for (const name of requiredExports) {
  if (typeof module[name] !== "function") fail(`${name}: export is not callable`);
}
if (cli.status !== 0) fail(`normal CLI exited ${cli.status}: ${cliOutput}`);

const targetA = ".pipeline/work/AU20/analysis/services/context-assembly.md";
const targetB = ".pipeline/work/AU20/rearch/run-orchestration.md";
const validatorSelf = ".pipeline/work/AU20/probes/validate-harness-vocabulary-evidence.mjs";
const targetPaths = [targetA, targetB];
expectEqual(module.classifyGreenScope([]), "committed-green", "clean scope");
expectEqual(
  module.classifyGreenScope(targetPaths),
  "candidate-green",
  "exact two-path scope"
);
expectEqual(
  module.classifyGreenScope([validatorSelf]),
  "validator-candidate-green",
  "validator-self scope"
);
expectEqual(module.classifyGreenScope([targetA]), "reject", "partial scope");
expectEqual(module.classifyGreenScope(["unrelated.txt"]), "reject", "unrelated scope");
expectEqual(
  module.classifyGreenScope([validatorSelf, ...targetPaths]),
  "reject",
  "validator-self plus documents scope"
);
expectEqual(
  module.classifyGreenScope([validatorSelf, "unrelated.txt"]),
  "reject",
  "validator-self plus unrelated scope"
);

const documentCases = {
  baseline: {
    [targetA]: "d6b698d1394a21fb6b40d680a27517d1051dcf2853ec0614a293b799839a8d7e",
    [targetB]: "7d6100e7a9259b94a9092a268daca722dce712e2d9dd8bd508f6a4e03f7fd9d4"
  },
  expected: {
    [targetA]: frozen[targetA],
    [targetB]: frozen[targetB]
  },
  mixed: {
    [targetA]: frozen[targetA],
    [targetB]: "7d6100e7a9259b94a9092a268daca722dce712e2d9dd8bd508f6a4e03f7fd9d4"
  },
  modified: {
    [targetA]: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    [targetB]: frozen[targetB]
  }
};
expectEqual(module.classifyDocumentState(documentCases.baseline), "baseline", "baseline documents");
expectEqual(module.classifyDocumentState(documentCases.expected), "expected", "expected documents");
expectEqual(module.classifyDocumentState(documentCases.mixed), "mixed", "mixed documents");
expectEqual(module.classifyDocumentState(documentCases.modified), "unknown", "modified documents");

const fixtureRoot = mkdtempSync(resolve(tmpdir(), "au20-vocabulary-validator-state-"));
if (!fixtureRoot.startsWith(resolve(tmpdir(), "au20-vocabulary-validator-state-"))) {
  fail("temporary fixture escaped expected prefix");
}
const git = (...args) => {
  const result = spawnSync("git", args, { cwd: fixtureRoot, encoding: "utf8" });
  if (result.status !== 0) fail(`fixture git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
};
const write = (path, content) => {
  const absolute = resolve(fixtureRoot, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
};
const reset = () => git("reset", "--hard", "HEAD");
const changed = async () => await module.readChangedPaths(fixtureRoot);
const assertGitState = async (label, expectedPaths, expectedScope) => {
  const actualPaths = await changed();
  expectEqual(actualPaths, expectedPaths, `${label} paths`);
  expectEqual(module.classifyGreenScope(actualPaths), expectedScope, `${label} scope`);
};

try {
  git("init", "-q");
  git("config", "user.email", "au20-state-probe@example.invalid");
  git("config", "user.name", "AU20 state probe");
  write(targetA, "context baseline\n");
  write(targetB, "run baseline\n");
  write(validatorSelf, "validator baseline\n");
  write("unrelated.txt", "unrelated baseline\n");
  git("add", ".");
  git("commit", "-qm", "fixture baseline");

  await assertGitState("clean", [], "committed-green");

  write(targetA, "context unstaged\n");
  await assertGitState("unstaged", [targetA], "reject");
  reset();

  write(targetA, "context staged\n");
  git("add", targetA);
  await assertGitState("staged", [targetA], "reject");
  reset();

  write(targetA, "context staged\n");
  git("add", targetA);
  write(targetB, "run unstaged\n");
  await assertGitState("mixed staged and unstaged", targetPaths, "candidate-green");
  reset();

  write(targetA, "context staged\n");
  git("add", targetA);
  write(targetA, "context baseline\n");
  await assertGitState("same-path staged reversal", [targetA], "reject");
  reset();

  write(targetA, "context exact\n");
  write(targetB, "run exact\n");
  git("add", targetA, targetB);
  await assertGitState("exact two", targetPaths, "candidate-green");
  reset();

  write(validatorSelf, "validator candidate\n");
  await assertGitState(
    "exact validator self",
    [validatorSelf],
    "validator-candidate-green"
  );
  reset();

  write(validatorSelf, "validator candidate\n");
  write(targetA, "context self-plus-document\n");
  await assertGitState(
    "validator self plus document",
    [targetA, validatorSelf].sort(),
    "reject"
  );
  reset();

  write(validatorSelf, "validator candidate\n");
  write("unrelated.txt", "unrelated self-plus-unrelated\n");
  await assertGitState(
    "validator self plus unrelated",
    [validatorSelf, "unrelated.txt"].sort(),
    "reject"
  );
  reset();

  write(targetB, "run partial\n");
  await assertGitState("partial", [targetB], "reject");
  reset();

  write("unrelated.txt", "unrelated changed\n");
  git("add", "unrelated.txt");
  await assertGitState("unrelated", ["unrelated.txt"], "reject");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

process.stdout.write("PASS vocabulary validator committed-state matrix\n");
