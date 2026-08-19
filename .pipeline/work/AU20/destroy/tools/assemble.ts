/**
 * Stitch the destroyer verdicts into one document, preferring a revised verdict
 * over its first-wave original wherever the founder rulings caused a re-audit.
 *
 * Usage: npx tsx .pipeline/work/AU20/destroy/tools/assemble.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = ".pipeline/work/AU20/destroy";
const V1 = path.join(BASE, "verdicts");
const V2 = path.join(BASE, "verdicts-revised");
const INPUTS = path.join(BASE, "input");
const INPUTS_FW = path.join(BASE, "input-framework");

const VERDICTS = ["DELETE", "PLUGIN", "FINISH", "MERGE", "SIMPLIFY", "KEEP"] as const;
type Verdict = (typeof VERDICTS)[number];
const RE = new RegExp(`^(${VERDICTS.join("|")})$`);

if (!fs.existsSync(V1)) {
  console.error(`FATAL: no verdicts directory at ${V1}`);
  process.exit(1);
}

const mdNames = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")) : [];

const revised = new Set(mdNames(V2));
const files = [...new Set([...mdNames(V1), ...revised])].sort();
if (files.length === 0) {
  console.error("FATAL: no verdict files found");
  process.exit(1);
}

/** Every verdict file we expect: one per service, one per framework package, plus the door pass. */
const expected: string[] = [
  ...mdNames(INPUTS).map((f) => f.replace(/\.md$/, "")),
  ...mdNames(INPUTS_FW).map((f) => `fw-${f.replace(/\.md$/, "")}`),
  "_doors",
];
if (expected.length <= 1) {
  console.error("FATAL: found no input files — the expectation set would be vacuous");
  process.exit(1);
}

type Tally = Record<Verdict, number> & { pkg: string; rows: number; revised: boolean };

/** Count verdicts by reading the verdict column of every markdown table row. */
function tally(pkg: string, body: string, isRevised: boolean): Tally {
  const t = { pkg, rows: 0, revised: isRevised } as Tally;
  for (const v of VERDICTS) t[v] = 0;
  // A revised file opens with a "What changed after the rulings" table carrying BOTH the
  // old and the new verdict per row. Tallying inside it double-counts every moved row and
  // credits the old verdict, so skip that section until the next heading.
  let skipping = false;
  for (const line of body.split("\n")) {
    if (/^##\s/.test(line.trim())) skipping = /what changed/i.test(line);
    if (skipping) continue;
    if (!line.trimStart().startsWith("|")) continue;
    // Strip emphasis/backticks: a cell written `**FINISH**` is still a verdict cell.
    const cells = line.split("|").slice(1, -1).map((c) => c.replace(/[`*]/g, "").trim());
    const idx = cells.findIndex((c) => RE.test(c));
    if (idx === -1) continue;
    // Skip each file's own `| Verdict | Count |` summary — it tallies the audit
    // rather than being part of it, and counting it inflates every package.
    if (idx === 0 && cells.length <= 2) continue;
    t[cells[idx] as Verdict]++;
    t.rows++;
  }
  return t;
}

const tallies: Tally[] = [];
const sections: string[] = [];

for (const f of files) {
  const pkg = f.replace(/\.md$/, "");
  const isRevised = revised.has(f);
  const body = fs.readFileSync(path.join(isRevised ? V2 : V1, f), "utf8");
  tallies.push(tally(pkg, body, isRevised));
  const banner = isRevised
    ? "\n\n> **REVISED after the founder rulings.** The first-wave verdict is kept at " +
      `\`${path.join(V1, f)}\` for comparison.\n`
    : "";
  sections.push(`\n\n---\n${banner}\n${body.trim()}`);
}

const missing = expected.filter((e) => !files.includes(`${e}.md`));
const sum = (v: Verdict) => tallies.reduce((a, t) => a + t[v], 0);
const totalRows = tallies.reduce((a, t) => a + t.rows, 0);
const pct = (n: number) => (totalRows ? `${Math.round((n / totalRows) * 100)}%` : "—");

const out: string[] = [];
out.push("# AU20 (reopened) — full destroyer audit");
out.push("");
out.push("One row per method, per door, per type. Every one carries a verdict. Nothing sampled.");
out.push("");
out.push(
  `Baseline at reopen (\`ba0fb454d\`): 19 services, 21 framework packages, 268 exported functions, 16 classes (38 member methods), 176 interface/type declarations (620 member signatures), 216 doors.`,
);
out.push("");
out.push(
  `**${tallies.filter((t) => t.revised).length} of ${tallies.length} packages were re-audited** after the founder rulings in \`FOUNDER-RULINGS.md\`; those sections carry a REVISED banner and supersede the first wave.`,
);
out.push("");
out.push("`PLUGIN` = leaves core and ships as a plugin. `FINISH` = work to schedule, not a survivor that needs nothing.");
out.push("");
if (missing.length) {
  out.push(`> **INCOMPLETE — no verdict filed for: ${missing.join(", ")}.**`);
  out.push("");
}
out.push("## Roll-up");
out.push("");
out.push("| Verdict | Count | Share |");
out.push("|---|---|---|");
for (const v of VERDICTS) out.push(`| ${v} | ${sum(v)} | ${pct(sum(v))} |`);
out.push(`| **Total rows** | **${totalRows}** | |`);
out.push("");
out.push(
  `Leaves core outright or folds away: **${sum("DELETE") + sum("PLUGIN") + sum("MERGE")}** of ${totalRows} (${pct(sum("DELETE") + sum("PLUGIN") + sum("MERGE"))}).`,
);
out.push("");
out.push("## Per package");
out.push("");
out.push("| Package | Rows | DELETE | PLUGIN | FINISH | MERGE | SIMPLIFY | KEEP | Out of core |");
out.push("|---|---|---|---|---|---|---|---|---|");
for (const t of [...tallies].sort(
  (a, b) => b.DELETE + b.PLUGIN + b.MERGE - (a.DELETE + a.PLUGIN + a.MERGE),
)) {
  const gone = t.DELETE + t.PLUGIN + t.MERGE;
  const rate = t.rows ? `${Math.round((gone / t.rows) * 100)}%` : "—";
  out.push(
    `| ${t.pkg}${t.revised ? " ✎" : ""} | ${t.rows} | ${t.DELETE} | ${t.PLUGIN} | ${t.FINISH} | ${t.MERGE} | ${t.SIMPLIFY} | ${t.KEEP} | ${rate} |`,
  );
}
out.push("");
out.push("✎ = revised after the founder rulings.");
out.push(...sections);

fs.writeFileSync(path.join(BASE, "FULL-AUDIT.md"), `${out.join("\n")}\n`);

console.log(`${files.length} packages (${revised.size} revised), ${totalRows} verdict rows`);
console.log(VERDICTS.map((v) => `${v} ${sum(v)}`).join(" | "));
if (missing.length) console.log(`MISSING VERDICTS: ${missing.join(", ")}`);
