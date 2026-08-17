/**
 * Prove the audit is complete: every exported symbol in the census must be named
 * somewhere in its package's verdict file. A destroyer that sampled shows up here.
 *
 * Usage: npx tsx .pipeline/work/AU20/destroy/tools/check-coverage.ts <censusDir>
 */
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = ".pipeline/work/AU20/destroy";
const VERDICTS = path.join(BASE, "verdicts");
const censusDir = process.argv[2];

if (!censusDir) {
  console.error("FATAL: pass the directory holding census.json (services) and fw/census.json (framework)");
  process.exit(1);
}

type Rec = { name: string; kind: string; classMethods?: string[] };
const sources: Array<{ file: string; prefix: string }> = [
  { file: path.join(censusDir, "census.json"), prefix: "" },
  { file: path.join(censusDir, "fw", "census.json"), prefix: "fw-" },
];

let checked = 0;
let missingTotal = 0;
const report: string[] = [];

for (const { file, prefix } of sources) {
  if (!fs.existsSync(file)) {
    console.error(`FATAL: census not found at ${file}`);
    process.exit(1);
  }
  const census: Record<string, { records: Rec[] }> = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [pkg, v] of Object.entries(census).sort()) {
    const verdictPath = path.join(VERDICTS, `${prefix}${pkg}.md`);
    if (!fs.existsSync(verdictPath)) {
      report.push(`MISSING FILE  ${prefix}${pkg}`);
      missingTotal++;
      continue;
    }
    const body = fs.readFileSync(verdictPath, "utf8");
    const names = new Set<string>();
    for (const r of v.records) {
      names.add(r.name);
      for (const m of r.classMethods ?? []) if (r.kind === "class") names.add(m);
    }
    const absent = [...names].filter((n) => !body.includes(n));
    checked += names.size;
    if (absent.length) {
      missingTotal += absent.length;
      report.push(`${prefix}${pkg}: ${absent.length}/${names.size} unaccounted → ${absent.slice(0, 12).join(", ")}${absent.length > 12 ? " …" : ""}`);
    }
  }
}

if (checked === 0) {
  console.error("FATAL: checked zero symbols — the census is empty, the check is vacuous");
  process.exit(1);
}

console.log(`checked ${checked} exported symbols across both censuses`);
if (missingTotal === 0) {
  console.log("COMPLETE: every symbol is named in its verdict file");
} else {
  console.log(`INCOMPLETE: ${missingTotal} unaccounted\n`);
  console.log(report.join("\n"));
}
