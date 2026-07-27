#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const read = path => readFileSync(resolve(root, path), "utf8");
const fail = message => {
  process.stderr.write(`FAIL ${message}\n`);
  process.exit(2);
};

const registryPath = "scripts/lib/honest-harness-predicate.ts";
const guardPath = "scripts/honest-harness-guard.ts";
const ar1Path = "packages/db/src/__tests__/ar1-honest-harness-guard.test.ts";
const ar2Path = "packages/db/src/__tests__/ar2-coverage-guard.test.ts";
const targetPaths = [ar1Path, ar2Path].sort();
const probePath = ".pipeline/work/AU20/probes/validate-cursor-harness-guard-tests.mjs";
const historicalRedHashes = {
  [ar1Path]: "eb77040dca75e13b10a1584e117597697fb2b7d01238d0a54670127379f836a2",
  [ar2Path]: "cf49c8f47d40372380631be3cba8405d53f54bfda9ad6bd8b549bd602b8e6d33"
};
const currentGreenHashes = {
  [ar1Path]: "d2c6db87a0ad2efafcaa836f4daa7f5cf8327571f8f6ecd4c79add0b56892062",
  [ar2Path]: "40637c22d91d495e1b91d2176200974be65bf89386cd1a8849761d2e1c557e02"
};
const frozen = {
  ".pipeline/work/AU20/architecture-amendments/cursor-harness-guard-tests.md":
    "05065d957f7bf7af9aec3996104fdf5a7fb3dab6c0122cf4038803b2373a0707",
  ".pipeline/work/AU20/feasibility-amendments/cursor-harness-guard-tests.md":
    "03a324029ce1a9b1b6144a4a694d6b4c0c7681a4fa3a2f913b3f57e3f9df7f70",
  [registryPath]: "591e521d2f4891a6332656fa3b4a06df576468815c98ce9d6af5bc2d4c3a0033",
  [guardPath]: "8ef0daadf52c0ca3a4454b2d3aa66e3f26e6a9b6a8d614c224a9bebfb2cc707b",
  "package.json": "3613b72b689f045bbf0d0ff0f4e22e07672c22a66390034d628c432bebb52cf7",
  "package-lock.json": "cad0e88ea2c0f6406e67df4ad0fb6b8addab85cd0c96d136f25d248aa86418a5",
  "scripts/surface-census.ts":
    "df74ee90cce2bf075f2fd32199e6c86780871c2530c6baa981a4cc8498d0cc9b"
};

export const readScopeState = cwd => {
  const readPaths = args => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
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
  const changed = scopeState.changedPaths;
  if (changed.length === 0) return "committed-green";
  if (JSON.stringify(changed) === JSON.stringify(targetPaths)) return "candidate-green";
  if (changed.length === 1 && changed[0] === probePath) return "probe-candidate-green";
  return "reject";
};

export const main = () => {
for (const [path, expected] of Object.entries(frozen)) {
  if (sha256(read(path)) !== expected) fail(`${path}: frozen hash mismatch`);
}

const registry = read(registryPath);
const registryMatch = registry.match(
  /export const SUPPORTED_HARNESSES = \[([\s\S]*?)\] as const;/
);
if (!registryMatch) fail("SUPPORTED_HARNESSES literal missing");
const families = [...registryMatch[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
const expectedFamilies = ["builtin", "claude", "codex", "opencode", "cursor-agent"];
if (JSON.stringify(families) !== JSON.stringify(expectedFamilies)) {
  fail(`registry mismatch: ${JSON.stringify(families)}`);
}

const scopeState = readScopeState(root);
const changedPaths = scopeState.changedPaths;
const scope = classifyGreenScope(scopeState);
const hashes = {
  [ar1Path]: sha256(read(ar1Path)),
  [ar2Path]: sha256(read(ar2Path))
};
const historicalRed =
  hashes[ar1Path] === historicalRedHashes[ar1Path] &&
  hashes[ar2Path] === historicalRedHashes[ar2Path];
const currentGreen =
  hashes[ar1Path] === currentGreenHashes[ar1Path] &&
  hashes[ar2Path] === currentGreenHashes[ar2Path];

const command = [
  "npx",
  "vitest",
  "run",
  ar1Path,
  ar2Path
];
const targeted = spawnSync(command[0], command.slice(1), {
  cwd: root,
  encoding: "utf8",
  env: process.env
});
const output = `${targeted.stdout ?? ""}${targeted.stderr ?? ""}`;

const ar1Failures = [
  "a clean harness-facing integration file (real harness) → no violation",
  "banned-import file on model-import allowlist → no violation (staged debt)",
  "banned-import file NOT on model-import allowlist → violation",
  "clean file (no banned imports) + on model-import allowlist → violation (debt paid)"
];
const ar2Failures = [
  "source with no requireHarness → all four missing",
  "source declaring only claude → missing builtin + codex + opencode",
  "source declaring all four → empty (fully covered)",
  "source declaring builtin + claude → missing codex + opencode",
  "'gh' is NOT in SUPPORTED_HARNESSES — declaring only gh still yields all four missing",
  "file that gates 3 harnesses but mentions the 4th only in a comment → missingHarnesses reports the 4th",
  "real requireHarness call is not stripped — all four declared"
];

if (historicalRed) {
  if (changedPaths.length !== 0) {
    fail(`red baseline has tracked changes: ${JSON.stringify(changedPaths)}`);
  }
  if (targeted.status !== 1) fail(`targeted red exited ${targeted.status ?? "null"}`);
  for (const failure of [...ar1Failures, ...ar2Failures]) {
    if (!output.includes(failure)) fail(`missing exact failure: ${failure}`);
  }
  if (!output.includes("Test Files  2 failed (2)")) fail("failed-file total mismatch");
  if (!output.includes("Tests  11 failed | 60 passed (71)")) fail("test total mismatch");
  const cursorDiagnostics = output.match(/cursor-agent/g)?.length ?? 0;
  if (cursorDiagnostics < 4) fail(`cursor diagnostic count ${cursorDiagnostics}, expected >=4`);
  process.stderr.write(
    "RED cursor harness guard tests omit the fifth family in 4 AR1 and 7 AR2 assertions\n"
  );
  process.exit(1);
}

if (!currentGreen) fail(`green test hashes changed: ${JSON.stringify(hashes)}`);
if (scope === "reject") {
  fail(`green scope mismatch: ${JSON.stringify(changedPaths)}`);
}
if (targeted.status !== 0) fail(`targeted green exited ${targeted.status ?? "null"}`);
if (!output.includes("Test Files  2 passed (2)")) fail("green file total mismatch");
if (!output.includes("Tests  71 passed (71)")) fail("green test total mismatch");

const ar1 = read(ar1Path);
const ar2 = read(ar2Path);
const exactFamilies = values => JSON.stringify(values) === JSON.stringify(expectedFamilies);
const literalCalls = source =>
  [...source.matchAll(/`requireHarness\("([^"]+)"\)/g)].map(match => match[1]);
const extractConstant = (source, name) => {
  const start = source.indexOf(`const ${name} = [`);
  if (start < 0) fail(`${name}: fixture missing`);
  const end = source.indexOf('].join("\\n");', start);
  if (end < 0) fail(`${name}: fixture terminator missing`);
  return source.slice(start, end);
};
const cleanCalls = literalCalls(extractConstant(ar1, "CLEAN_SRC"));
if (!exactFamilies(cleanCalls)) {
  fail(`CLEAN_SRC: expected exact five literals, got ${JSON.stringify(cleanCalls)}`);
}
const modelImportCalls = literalCalls(extractConstant(ar1, "MODEL_IMPORT_DIRTY_SRC"));
if (!exactFamilies(modelImportCalls)) {
  fail(`MODEL_IMPORT_DIRTY_SRC: expected exact five literals, got ${JSON.stringify(modelImportCalls)}`);
}
const cleanReuseCount = ar1.match(/file\(p, CLEAN_SRC\)/g)?.length ?? 0;
if (cleanReuseCount !== 3) fail(`CLEAN_SRC reuse count ${cleanReuseCount}, expected 3`);
const modelReuseCount = ar1.match(/file\(p, MODEL_IMPORT_DIRTY_SRC\)/g)?.length ?? 0;
if (modelReuseCount !== 2) {
  fail(`MODEL_IMPORT_DIRTY_SRC reuse count ${modelReuseCount}, expected 2`);
}

const extractTest = (source, namePrefix) => {
  const start = source.indexOf(`test("${namePrefix}`);
  if (start < 0) fail(`AR2 named case missing: ${namePrefix}`);
  const end = source.indexOf("\n\t});", start);
  if (end < 0) fail(`AR2 named case unterminated: ${namePrefix}`);
  return source.slice(start, end);
};
const expectedCases = [
  ["source with no requireHarness", [], expectedFamilies],
  ["source declaring only claude", ["claude"], ["builtin", "codex", "opencode", "cursor-agent"]],
  ["source declaring all", expectedFamilies, []],
  ["source declaring builtin + claude", ["builtin", "claude"], ["codex", "opencode", "cursor-agent"]],
  ["'gh' is NOT in SUPPORTED_HARNESSES", ["gh"], expectedFamilies],
  [
    "file that gates",
    ["builtin", "claude", "opencode", "cursor-agent"],
    ["codex"]
  ],
  ["real requireHarness call", expectedFamilies, []]
];
for (const [name, declarations, missing] of expectedCases) {
  const body = extractTest(ar2, name);
  const actualDeclarations = literalCalls(body);
  if (JSON.stringify(actualDeclarations) !== JSON.stringify(declarations)) {
    fail(`${name}: declarations ${JSON.stringify(actualDeclarations)}`);
  }
  const equality = body.match(/expect\(missing\)\.toEqual\(\[([\s\S]*?)\]\)/);
  if (!equality) fail(`${name}: exact missing-set equality absent`);
  const actualMissing = [...equality[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  if (JSON.stringify(actualMissing) !== JSON.stringify(missing)) {
    fail(`${name}: missing set ${JSON.stringify(actualMissing)}`);
  }
}
const declarationComplete = extractTest(ar2, "five separate requireHarness calls");
if (!exactFamilies(literalCalls(declarationComplete))) {
  fail("AR2 declaredHarnesses complete fixture is not exact five");
}

for (const retained of [
  "'gh' is NOT in SUPPORTED_HARNESSES",
  "harness name in a line comment is NOT declared",
  "harness name in a block/JSDoc comment is NOT declared",
  "harness name in a string literal is NOT declared"
]) {
  if (!ar2.includes(retained)) fail(`AR2 retained obligation missing: ${retained}`);
}
for (const retained of [
  "AR7 model-import allowlist rules",
  "banned-import file on model-import allowlist",
  "banned-import file NOT on model-import allowlist",
  "model-import debt paid"
]) {
  if (!ar1.includes(retained)) fail(`AR1 retained obligation missing: ${retained}`);
}
if (!ar1.includes("coverage-debt allowlist") || !ar1.includes("dirty + allowlisted")) {
  fail("AR1 allowlist obligations missing");
}

process.stdout.write("PASS cursor harness guard tests cover exact five-family semantics\n");
};

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
