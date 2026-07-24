#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_CENSUS_SCRIPT_SHA256 =
  "df74ee90cce2bf075f2fd32199e6c86780871c2530c6baa981a4cc8498d0cc9b";
const EXPECTED_SERVICE_COUNT = 23;
const METHOD_CEILING = 231;
const TYPE_CEILING = 181;

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const censusScript = join(root, "scripts/surface-census.ts");
const jsonPath = join(root, ".pipeline/work/AU20/rearch/census-after.json");
const markdownPath = join(root, "plans/AU20/surface-census.md");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const scriptHash = sha256(readFileSync(censusScript));
if (scriptHash !== EXPECTED_CENSUS_SCRIPT_SHA256) {
  console.error(
    `FAIL census implementation changed: expected ${EXPECTED_CENSUS_SCRIPT_SHA256}, got ${scriptHash}`,
  );
  process.exit(1);
}

let live;
try {
  const stdout = execFileSync(
    join(root, "node_modules/.bin/tsx"),
    [censusScript],
    { cwd: root, encoding: "utf8" },
  );
  live = JSON.parse(stdout);
} catch (error) {
  console.error(`FAIL executable census did not produce JSON: ${error.message}`);
  process.exit(1);
}

const rowKeys = ["service", "layer", "methods", "types", "total"];
const validRow = (row) =>
  row &&
  Object.keys(row).length === rowKeys.length &&
  rowKeys.every((key) => Object.hasOwn(row, key)) &&
  typeof row.service === "string" &&
  typeof row.layer === "string" &&
  Number.isInteger(row.methods) &&
  Number.isInteger(row.types) &&
  Number.isInteger(row.total) &&
  row.methods >= 0 &&
  row.types >= 0 &&
  row.total === row.methods + row.types;

const failures = [];
if (live.generatedFrom !== "surface-census.ts") failures.push("unexpected generatedFrom");
if (live.serviceCount !== EXPECTED_SERVICE_COUNT) {
  failures.push(`serviceCount ${live.serviceCount} != ${EXPECTED_SERVICE_COUNT}`);
}
if (!Array.isArray(live.services) || live.services.length !== live.serviceCount) {
  failures.push("services length does not equal serviceCount");
}
if (!live.services?.every(validRow)) failures.push("invalid per-service row shape or arithmetic");
if (new Set(live.services?.map(({ service }) => service)).size !== live.serviceCount) {
  failures.push("duplicate service row");
}

const recomputed = live.services?.reduce(
  (sum, row) => ({
    methods: sum.methods + row.methods,
    types: sum.types + row.types,
    total: sum.total + row.total,
  }),
  { methods: 0, types: 0, total: 0 },
);
if (JSON.stringify(recomputed) !== JSON.stringify(live.totals)) {
  failures.push("reported totals do not equal per-service rows");
}
if (live.totals?.methods > METHOD_CEILING) {
  failures.push(`methods ${live.totals.methods} exceed ceiling ${METHOD_CEILING}`);
}
if (live.totals?.types > TYPE_CEILING) {
  failures.push(`types ${live.totals.types} exceed ceiling ${TYPE_CEILING}`);
}

const canonicalJson = `${JSON.stringify(live, null, 2)}\n`;
const canonicalMarkdown = [
  "# AU20 current service surface census",
  "",
  `Generated from unchanged \`scripts/surface-census.ts\` (SHA-256 \`${scriptHash}\`).`,
  "",
  `**${live.serviceCount} services · ${live.totals.methods} methods · ${live.totals.types} types · ${live.totals.total} total**`,
  "",
  "| Service | Layer | Methods | Types | Total |",
  "|---|---|---:|---:|---:|",
  ...live.services.map(
    (row) =>
      `| ${row.service} | ${row.layer} | ${row.methods} | ${row.types} | ${row.total} |`,
  ),
  "",
].join("\n");

if (process.argv.includes("--write")) {
  if (failures.length > 0) {
    console.error(`FAIL live census invalid: ${failures.join("; ")}`);
    process.exit(1);
  }
  writeFileSync(jsonPath, canonicalJson);
  writeFileSync(markdownPath, canonicalMarkdown);
  console.log(
    `WROTE canonical census evidence: ${live.serviceCount} services, ${live.totals.methods} methods, ${live.totals.types} types, ${live.totals.total} total`,
  );
  process.exit(0);
}

for (const [path, expected, label] of [
  [jsonPath, canonicalJson, "JSON"],
  [markdownPath, canonicalMarkdown, "Markdown"],
]) {
  let actual;
  try {
    actual = readFileSync(path, "utf8");
  } catch (error) {
    failures.push(`${label} evidence unreadable: ${error.message}`);
    continue;
  }
  if (actual !== expected) {
    failures.push(
      `${label} evidence stale (expected SHA-256 ${sha256(expected)}, got ${sha256(actual)})`,
    );
  }
}

if (failures.length > 0) {
  console.error(`FAIL current census evidence:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `PASS current census evidence: ${live.serviceCount} services, ${live.totals.methods} methods, ${live.totals.types} types, ${live.totals.total} total`,
);
