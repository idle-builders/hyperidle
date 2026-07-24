#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const sha256 = path => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
const fail = message => {
  process.stderr.write(`FAIL ${message}\n`);
  process.exit(2);
};

const generator = {
  path: "scripts/mock-inventory.ts",
  sha256: "cbbb99776b5c8b0f51a5b72701a3005c829d524c5137fe3df30e5dce63dd312c"
};
const sources = {
  "packages/core-api/connections/src/connection-provisioning.ts":
    "f1035b5550761c610d51d1f674614de1dec6ecbfde928bdda3c9a1301ad5ea8d",
  "packages/core-api/policy/src/lifecycle-propagation.ts":
    "e92aa1ed4952f90b261640d6777e14e1b7f6dd61010b3900600a096e657f523a"
};
const generated = {
  "plans/mock-data-purge/inventory.json":
    "3bde51578357a3f71d75bf2ecbf8eb8236a210c556ae9b09fbdb937992459a37",
  "plans/mock-data-purge/inventory.md":
    "27ac0ff5d42d043c7f8be48516192284aa0ea85ff28d1a39f9ff6e1e83c35d16",
  "plans/mock-data-purge/queue.md":
    "706169f10f67997a5dabc05423d9a6e1ab4dbc40541d5f615ba18e56c1bb9905"
};
const authored = {
  "plans/mock-data-purge/follow-ups.md":
    "c54d803d94dd41f89c928d9f5bb1d1ec28b441a3167f5852d48a0ed69f183375",
  "plans/mock-data-purge/test-coverage-gap.md":
    "7153f0b04ad581f8142ca58125065765bd868b9d90e378db8e741a592e9aaf1b"
};
const expected = {
  added: [
    {
      path: "packages/core-api/connections/src/connection-provisioning.ts",
      line: 114,
      symbol: "u-founder",
      kind: "literal-id"
    },
    {
      path: "packages/core-api/policy/src/lifecycle-propagation.ts",
      line: 470,
      symbol: "u-founder",
      kind: "literal-id"
    },
    {
      path: "packages/core-api/policy/src/lifecycle-propagation.ts",
      line: 472,
      symbol: "u-founder",
      kind: "literal-id"
    }
  ],
  removed: [
    {
      path: "packages/core-api/connections/src/connection-provisioning.ts",
      line: 97,
      symbol: "u-founder",
      kind: "literal-id"
    },
    {
      path: "packages/core-api/connections/src/connection-provisioning.ts",
      line: 113,
      symbol: "u-founder",
      kind: "literal-id"
    },
    {
      path: "packages/core-api/policy/src/lifecycle-propagation.ts",
      line: 547,
      symbol: "u-founder",
      kind: "literal-id"
    },
    {
      path: "packages/core-api/policy/src/lifecycle-propagation.ts",
      line: 549,
      symbol: "u-founder",
      kind: "literal-id"
    }
  ]
};

const assertFrozen = files => {
  for (const [path, hash] of Object.entries(files)) {
    if (sha256(path) !== hash) fail(`${path}: frozen hash mismatch`);
  }
};

assertFrozen({ [generator.path]: generator.sha256, ...sources, ...authored });

const generatorSource = readFileSync(resolve(root, generator.path), "utf8");
const ownedWrites = [
  ...generatorSource.matchAll(
    /writeFileSync\((inventoryPath|join\(outDir,\s*"([^"]+)"\))/g
  )
]
  .map(match => match[1] === "inventoryPath" ? "inventory.json" : match[2])
  .sort();
const expectedOwnedWrites = ["inventory.json", "inventory.md", "queue.md"];
if (JSON.stringify(ownedWrites) !== JSON.stringify(expectedOwnedWrites)) {
  fail(`generator ownership mismatch: ${JSON.stringify(ownedWrites)}`);
}

const parseDrift = output => {
  const drift = { added: [], removed: [] };
  for (const line of output.split("\n")) {
    const match = /^\s*([+-]) (.+):(\d+) (\S+) \(([^)]+)\)$/.exec(line);
    if (!match) continue;
    const row = {
      path: match[2],
      line: Number(match[3]),
      symbol: match[4],
      kind: match[5]
    };
    drift[match[1] === "+" ? "added" : "removed"].push(row);
  }
  return drift;
};

const run = script => spawnSync("npm", ["run", script], {
  cwd: root,
  encoding: "utf8",
  env: process.env
});

const check = run("mock-inventory:check");
const checkOutput = `${check.stdout ?? ""}${check.stderr ?? ""}`;
if (check.status === 1) {
  assertFrozen(generated);
  const actual = parseDrift(checkOutput);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`stale drift mismatch: ${JSON.stringify(actual)}`);
  }
  process.stderr.write("RED mock inventory is stale with exact pinned 3-added/4-removed drift\n");
  process.exit(1);
}
if (check.status !== 0) fail(`mock-inventory:check exited ${check.status ?? "null"}`);

if (!process.argv.includes("--verify-generation")) {
  process.stdout.write("PASS mock inventory is current; run --verify-generation for two-run receipt\n");
  process.exit(0);
}

const utcDate = () => new Date().toISOString().slice(0, 10);
const directoryHashes = () => Object.fromEntries(
  readdirSync(resolve(root, "plans/mock-data-purge"))
    .filter(name => statSync(resolve(root, "plans/mock-data-purge", name)).isFile())
    .map(name => {
      const path = `plans/mock-data-purge/${name}`;
      return [path, sha256(path)];
    })
);
const beforeDate = utcDate();
const before = directoryHashes();
const firstRun = run("mock-inventory");
if (firstRun.status !== 0) fail(`first generator run exited ${firstRun.status ?? "null"}`);
const betweenDate = utcDate();
const first = directoryHashes();
const secondRun = run("mock-inventory");
if (secondRun.status !== 0) fail(`second generator run exited ${secondRun.status ?? "null"}`);
const afterDate = utcDate();
const second = directoryHashes();

if (new Set([beforeDate, betweenDate, afterDate]).size !== 1) {
  fail(`UTC date rollover: ${beforeDate}/${betweenDate}/${afterDate}`);
}
assertFrozen({ [generator.path]: generator.sha256, ...sources, ...authored });

const changed = Object.keys(second)
  .filter(path => before[path] !== second[path])
  .sort();
if (changed.some(path => !(path in generated))) {
  fail(`non-generator output changed: ${JSON.stringify(changed)}`);
}
for (const path of Object.keys(generated)) {
  if (first[path] !== second[path]) fail(`${path}: second run was not byte-identical`);
}
for (const path of Object.keys(authored)) {
  if (before[path] !== first[path] || first[path] !== second[path]) {
    fail(`${path}: authored evidence changed`);
  }
}

const emittedDates = Object.keys(generated)
  .filter(path => path.endsWith(".md"))
  .map(path => {
    const match = /Generated by `scripts\/mock-inventory\.ts` on (\d{4}-\d{2}-\d{2})/.exec(
      readFileSync(resolve(root, path), "utf8")
    );
    if (!match) fail(`${path}: emitted UTC date missing`);
    return match[1];
  });
if (emittedDates.some(date => date !== beforeDate)) {
  fail(`emitted date mismatch: ${JSON.stringify(emittedDates)}`);
}

const receipt = {
  utc: { before: beforeDate, between: betweenDate, after: afterDate, emitted: beforeDate },
  generator: { ...generator },
  sources,
  outputs: Object.fromEntries(Object.keys(generated).map(path => [path, {
    firstSha256: first[path],
    secondSha256: second[path]
  }])),
  authored,
  changedFiles: changed,
  firstExitCode: firstRun.status,
  secondExitCode: secondRun.status
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
