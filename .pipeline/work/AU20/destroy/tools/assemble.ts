/**
 * Stitch every per-service destroyer verdict into one document the founder reads
 * end to end, with a roll-up of the cut across the whole repo.
 *
 * Usage: npx tsx .pipeline/work/AU20/destroy/tools/assemble.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = ".pipeline/work/AU20/destroy";
const VERDICTS = path.join(BASE, "verdicts");
const INPUTS = path.join(BASE, "input");

if (!fs.existsSync(VERDICTS)) {
  console.error(`FATAL: no verdicts directory at ${VERDICTS}`);
  process.exit(1);
}

const files = fs.readdirSync(VERDICTS).filter((f) => f.endsWith(".md")).sort();
if (files.length === 0) {
  console.error("FATAL: verdicts directory is empty");
  process.exit(1);
}

const INPUTS_FW = path.join(BASE, "input-framework");

/** Every verdict file we expect: one per service, one per framework package, plus the door pass. */
const expected: string[] = [
  ...(fs.existsSync(INPUTS) ? fs.readdirSync(INPUTS).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")) : []),
  ...(fs.existsSync(INPUTS_FW)
    ? fs.readdirSync(INPUTS_FW).filter((f) => f.endsWith(".md")).map((f) => `fw-${f.replace(/\.md$/, "")}`)
    : []),
  "_doors",
];

if (expected.length <= 1) {
  console.error("FATAL: found no input files — the expectation set would be vacuous");
  process.exit(1);
}

type Tally = { service: string; DELETE: number; MERGE: number; SIMPLIFY: number; KEEP: number; rows: number };

/** Count verdicts by reading the verdict column of every markdown table row. */
function tally(service: string, body: string): Tally {
  const t: Tally = { service, DELETE: 0, MERGE: 0, SIMPLIFY: 0, KEEP: 0, rows: 0 };
  for (const line of body.split("\n")) {
    if (!line.trimStart().startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // A verdict cell is a bare keyword, not prose mentioning one.
    const hit = cells.find((c) => /^(DELETE|MERGE|SIMPLIFY|KEEP)$/.test(c)) as keyof Tally | undefined;
    if (!hit) continue;
    t[hit] = (t[hit] as number) + 1;
    t.rows++;
  }
  return t;
}

const tallies: Tally[] = [];
const sections: string[] = [];

for (const f of files) {
  const service = f.replace(/\.md$/, "");
  const body = fs.readFileSync(path.join(VERDICTS, f), "utf8");
  tallies.push(tally(service, body));
  sections.push(`\n\n---\n\n${body.trim()}`);
}

const missing = expected.filter((e) => !files.includes(`${e}.md`));

const sum = (k: keyof Tally) => tallies.reduce((a, t) => a + (t[k] as number), 0);
const totalRows = sum("rows");
const totalDelete = sum("DELETE");
const totalMerge = sum("MERGE");
const totalSimplify = sum("SIMPLIFY");
const totalKeep = sum("KEEP");
const pct = (n: number) => (totalRows ? `${Math.round((n / totalRows) * 100)}%` : "—");

const out: string[] = [];
out.push("# AU20 (reopened) — full destroyer audit");
out.push("");
out.push("One row per method, per door, per type. Every one carries a verdict. Nothing sampled.");
out.push("");
out.push(`Baseline at reopen (\`ba0fb454d\`): 19 services, 268 exported functions, 16 classes (38 member methods), 176 interface/type declarations (620 member signatures), 216 doors.`);
out.push("");
if (missing.length) {
  out.push(`> **INCOMPLETE — no verdict filed for: ${missing.join(", ")}.**`);
  out.push("");
}
out.push("## Roll-up");
out.push("");
out.push("| Verdict | Count | Share |");
out.push("|---|---|---|");
out.push(`| DELETE | ${totalDelete} | ${pct(totalDelete)} |`);
out.push(`| MERGE | ${totalMerge} | ${pct(totalMerge)} |`);
out.push(`| SIMPLIFY | ${totalSimplify} | ${pct(totalSimplify)} |`);
out.push(`| KEEP | ${totalKeep} | ${pct(totalKeep)} |`);
out.push(`| **Total rows** | **${totalRows}** | |`);
out.push("");
out.push(`Killed outright or folded away: **${totalDelete + totalMerge}** of ${totalRows} (${pct(totalDelete + totalMerge)}).`);
out.push("");
out.push("## Per service");
out.push("");
out.push("| Service | Rows | DELETE | MERGE | SIMPLIFY | KEEP | Kill rate |");
out.push("|---|---|---|---|---|---|---|");
for (const t of [...tallies].sort((a, b) => b.DELETE + b.MERGE - (a.DELETE + a.MERGE))) {
  const kill = t.rows ? `${Math.round(((t.DELETE + t.MERGE) / t.rows) * 100)}%` : "—";
  out.push(`| ${t.service} | ${t.rows} | ${t.DELETE} | ${t.MERGE} | ${t.SIMPLIFY} | ${t.KEEP} | ${kill} |`);
}
out.push(...sections);

const dest = path.join(BASE, "FULL-AUDIT.md");
fs.writeFileSync(dest, `${out.join("\n")}\n`);

console.log(`${files.length} verdict files, ${totalRows} verdict rows`);
console.log(`DELETE ${totalDelete} | MERGE ${totalMerge} | SIMPLIFY ${totalSimplify} | KEEP ${totalKeep}`);
if (missing.length) console.log(`MISSING VERDICTS: ${missing.join(", ")}`);
console.log(`wrote ${dest}`);
