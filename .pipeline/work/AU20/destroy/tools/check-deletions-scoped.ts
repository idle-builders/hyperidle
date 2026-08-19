/**
 * Tighter re-check: the shipped checker asks "does this NAME appear anywhere in the repo",
 * which counts a same-named symbol in another package as a survivor. This one asks the
 * question that matters: is the symbol still DECLARED in the package that convicted it?
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = ".pipeline/work/AU20/destroy";
const V1 = path.join(BASE, "verdicts"), V2 = path.join(BASE, "verdicts-revised");
const mdNames = (d: string) => fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith(".md")) : [];
const revised = new Set(mdNames(V2));
const files = [...new Set([...mdNames(V1), ...revised])].sort();

const accepted = new Set<string>();
for (const m of fs.readFileSync(path.join(BASE, "accepted-survivors.md"), "utf8").matchAll(/^-\s+`([^`]+)`/gm)) accepted.add(m[1]);

const strip = (s: string) => s.replace(/[`*]/g, "").trim();
const IDENT = /^[A-Za-z_$][\w$]*$/;

// pkg label -> real directory
const dirCache = new Map<string, string | null>();
function pkgDir(pkg: string): string | null {
  if (dirCache.has(pkg)) return dirCache.get(pkg)!;
  const bare = pkg.replace(/^fw-/, "");
  const roots = pkg.startsWith("fw-") ? ["framework"] : ["layers/core-api", "layers/agent-orchestration", "layers/agent-execution", "layers/core-ui", "framework", "applications", "tools"];
  let found: string | null = null;
  for (const r of roots) {
    const c = path.join(r, bare);
    if (fs.existsSync(path.join(c, "src"))) { found = c; break; }
  }
  dirCache.set(pkg, found);
  return found;
}

type Row = { pkg: string; name: string };
const convicted: Row[] = [];
for (const f of files) {
  const pkg = f.replace(/\.md$/, "");
  const body = fs.readFileSync(path.join(revised.has(f) ? V2 : V1, f), "utf8");
  let skipping = false;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (/^##\s/.test(t)) skipping = /what changed/i.test(t);
    if (skipping || !t.startsWith("|")) continue;
    const cells = t.split("|").slice(1, -1).map(strip);
    const vi = cells.findIndex(c => /^(DELETE|PLUGIN|FINISH|MERGE|SIMPLIFY|KEEP)$/.test(c));
    if (vi === -1 || (vi === 0 && cells.length <= 2)) continue;
    if (cells[vi] !== "DELETE") continue;
    const raw = cells.slice(0, vi).find(c => c && !/^\d+$/.test(c)) ?? "";
    const name = raw.includes(".") ? raw.split(".").pop()! : raw;
    if (IDENT.test(name)) convicted.push({ pkg, name });
  }
}
if (convicted.length === 0) { console.error("FATAL: zero rows parsed"); process.exit(1); }

const DECL = (n: string) =>
  `(export\\s+(async\\s+)?(default\\s+)?(function|class|const|let|var|type|interface|enum)\\s+${n}\\b` +
  `|^\\s*(async\\s+)?(function|class|type|interface|enum)\\s+${n}\\b` +
  `|^\\s*(export\\s+)?(const|let|var)\\s+${n}\\s*[:=]` +
  `|^\\s{2,}(public\\s+|private\\s+|protected\\s+|async\\s+|readonly\\s+)*${n}\\s*[(:<]` +
  `|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\})`;

function declaredIn(dir: string, name: string): string[] {
  try {
    return execFileSync("rg", ["-a", "-n", "--pcre2", "--type-add", "ts:*.{ts,tsx}", "-t", "ts",
      "-g", "!*.test.*", "-g", "!*.spec.*", "-g", "!__*", "-g", "!*.stories.*",
      DECL(name), dir], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n").filter(Boolean);
  } catch { return []; }
}

const seen = new Set<string>();
const alive: { pkg: string; name: string; at: string }[] = [];
const nodir = new Set<string>();
let gone = 0, acceptedN = 0;
for (const r of convicted) {
  const k = `${r.pkg}::${r.name}`;
  if (seen.has(k)) continue;
  seen.add(k);
  if (accepted.has(r.name)) { acceptedN++; continue; }
  const d = pkgDir(r.pkg);
  if (!d) { nodir.add(r.pkg); continue; }
  const hits = declaredIn(d, r.name);
  if (hits.length) alive.push({ pkg: r.pkg, name: r.name, at: hits[0].split(":").slice(0, 2).join(":") });
  else gone++;
}
console.log(`convicted symbol rows: ${seen.size}`);
console.log(`gone from its own package: ${gone}`);
console.log(`STILL DECLARED in its own package: ${alive.length}`);
console.log(`accepted survivors: ${acceptedN}`);
console.log(`packages with no resolvable dir (skipped): ${[...nodir].join(", ") || "none"}`);
const byPkg = new Map<string, typeof alive>();
for (const a of alive) byPkg.set(a.pkg, [...(byPkg.get(a.pkg) ?? []), a]);
for (const [pkg, rows] of [...byPkg].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${pkg} (${rows.length})`);
  for (const r of rows) console.log(`  ${r.name.padEnd(34)} ${r.at}`);
}
