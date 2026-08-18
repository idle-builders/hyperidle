/**
 * Accounting for the delete pass: for every row the audit convicted, is the symbol
 * actually gone from the shipping tree?
 *
 * Rows marked FINISH or PLUGIN belong to track BA and are never reported here.
 *
 * Usage: npx tsx .pipeline/work/AU20/destroy/tools/check-deletions.ts [--list]
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = ".pipeline/work/AU20/destroy";
const V1 = path.join(BASE, "verdicts");
const V2 = path.join(BASE, "verdicts-revised");
const SURVIVORS = path.join(BASE, "accepted-survivors.md");
const ROOTS = ["layers", "framework", "applications", "tools"];

const mdNames = (d: string) =>
  fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".md")) : [];
const revised = new Set(mdNames(V2));
const files = [...new Set([...mdNames(V1), ...revised])].sort();
if (files.length === 0) {
  console.error("FATAL: no verdict files");
  process.exit(1);
}

/** Names the founder has accepted as surviving, one `- \`name\`` bullet per line. */
const accepted = new Set<string>();
if (fs.existsSync(SURVIVORS)) {
  for (const m of fs.readFileSync(SURVIVORS, "utf8").matchAll(/^-\s+`([^`]+)`/gm)) accepted.add(m[1]);
}

const strip = (s: string) => s.replace(/[`*]/g, "").trim();
const IDENT = /^[A-Za-z_$][\w$]*$/;

type Row = { pkg: string; name: string };
const convicted: Row[] = [];
let skipped = 0;

for (const f of files) {
  const pkg = f.replace(/\.md$/, "");
  const body = fs.readFileSync(path.join(revised.has(f) ? V2 : V1, f), "utf8");
  let skipping = false;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (/^##\s/.test(t)) skipping = /what changed/i.test(t);
    if (skipping || !t.startsWith("|")) continue;
    const cells = t.split("|").slice(1, -1).map((c) => strip(c));
    const vi = cells.findIndex((c) => /^(DELETE|PLUGIN|FINISH|MERGE|SIMPLIFY|KEEP)$/.test(c));
    if (vi === -1 || (vi === 0 && cells.length <= 2)) continue;
    if (cells[vi] !== "DELETE") continue;
    const before = cells.slice(0, vi);
    const raw = before.find((c) => c && !/^\d+$/.test(c)) ?? "";
    // Class members audited as `Class.method` are searched by their member name.
    const name = raw.includes(".") ? raw.split(".").pop()! : raw;
    if (!IDENT.test(name)) {
      skipped++; // doors and route strings are checked by route inventory, not by symbol
      continue;
    }
    convicted.push({ pkg, name });
  }
}

if (convicted.length === 0) {
  console.error("FATAL: parsed zero convicted symbols — the check would be vacuous");
  process.exit(1);
}

/**
 * A symbol is "still present" only if it appears in real code. A name left behind in
 * a comment or an error-message string is residue, not a surviving reference — counting
 * those inflated the remaining set badly enough to be misleading.
 */
function stillPresent(name: string): boolean {
  let out = "";
  try {
    out = execFileSync(
      "rg",
      ["-a", "-n", "--type-add", "ts:*.{ts,tsx}", "-t", "ts", "-g", "!*.test.*", "-g", "!*.spec.*",
       "-g", "!__*", `\\b${name}\\b`, ...ROOTS],
      { stdio: ["ignore", "pipe", "ignore"] },
    ).toString();
  } catch {
    return false; // rg exits non-zero when nothing matches
  }
  return out.split("\n").some((line) => {
    const code = line.slice(line.indexOf(":") + 1).replace(/^\d+:/, "").trim();
    if (!code) return false;
    if (code.startsWith("*") || code.startsWith("//") || code.startsWith("/*")) return false;
    return true;
  });
}

const seen = new Set<string>();
const remaining: Row[] = [];
let gone = 0;
for (const r of convicted) {
  const key = `${r.pkg}::${r.name}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (accepted.has(r.name)) continue;
  if (stillPresent(r.name)) remaining.push(r);
  else gone++;
}

const total = seen.size;
console.log(`convicted symbols: ${total} (${skipped} door/route rows checked separately)`);
console.log(`removed:   ${gone}`);
console.log(`remaining: ${remaining.length}`);
console.log(`accepted survivors: ${accepted.size}`);

if (process.argv.includes("--list")) {
  const byPkg = new Map<string, string[]>();
  for (const r of remaining) byPkg.set(r.pkg, [...(byPkg.get(r.pkg) ?? []), r.name]);
  for (const [pkg, names] of [...byPkg].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${pkg} (${names.length})`);
    console.log(`  ${names.join(", ")}`);
  }
}

// Non-zero while work remains, so this can gate the pass.
process.exit(remaining.length === 0 ? 0 : 1);
