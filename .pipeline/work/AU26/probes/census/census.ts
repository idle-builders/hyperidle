import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const root = process.argv[2];

// --- workspace packages + closure ---
type Pkg = { dir: string; deps: string[]; dev: string[] };
const pkgs = new Map<string, Pkg>();
function scanPkgs(dir: string, depth: number): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === "node_modules" || e.name === "dist") continue;
    const d = join(dir, e.name);
    const pj = join(d, "package.json");
    if (existsSync(pj)) {
      const j = JSON.parse(readFileSync(pj, "utf8"));
      if (j.name) pkgs.set(j.name, { dir: d, deps: Object.keys(j.dependencies ?? {}), dev: Object.keys(j.devDependencies ?? {}) });
    }
    if (depth < 2) scanPkgs(d, depth + 1);
  }
}
scanPkgs(join(root, "packages"), 0);

const APPS = ["@hyperidle/remote-server", "@hyperidle/desktop", "@hyperidle/remote-worker"];
function closure(includeDevAtRoots: boolean): Set<string> {
  const seen = new Set<string>(); const stack = [...APPS];
  while (stack.length) {
    const n = stack.pop()!; if (seen.has(n)) continue;
    const p = pkgs.get(n); if (!p) continue; seen.add(n);
    for (const d of p.deps) if (pkgs.has(d)) stack.push(d);
    if (includeDevAtRoots && APPS.includes(n)) for (const d of p.dev) if (pkgs.has(d)) stack.push(d);
  }
  return seen;
}

// --- tables ---
function knownTables(): Set<string> {
  const text = readFileSync(join(root, "packages/db/src/schema.ts"), "utf8");
  const names = new Set<string>();
  const re = /export const (\w+)\s*=\s*pgTable\b/g;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) if (m[1]) names.add(m[1]);
  return names;
}
const tables = knownTables();

// TABLE_OWNER from the real guard, plus AU26's 4 additions.
const guardSrc = readFileSync(join(root, "scripts/table-ownership-guard.ts"), "utf8");
const ownerBlock = guardSrc.slice(guardSrc.indexOf("const TABLE_OWNER"), guardSrc.indexOf("const UNOWNED_SHARED_TABLES"));
const OWNER: Record<string, string> = {};
for (const m of ownerBlock.matchAll(/^\t(\w+):\s*"([^"]+)"/gm)) OWNER[m[1]] = m[2];
Object.assign(OWNER, {
  sessions: "packages/agent-orchestration/run-orchestration",
  propagationLog: "packages/core-api/policy",
  taskDispatchAttempts: "packages/core-api/work",
  userSkills: "packages/core-api/users",
});

const DIRECT = new Set(["from", "insert", "update", "delete", "leftJoin", "innerJoin", "rightJoin", "fullJoin"]);

function collect(dir: string): string[] {
  const out: string[] = []; if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) { if (["node_modules","dist","__tests__"].includes(e.name)) continue; out.push(...collect(abs)); }
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(abs);
  }
  return out;
}

type F = { file: string; table: string; kind: string; line: number };
function checkAccess(abs: string): F[] {
  const rel = relative(root, abs);
  const text = readFileSync(abs, "utf8");
  const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
  const findings: F[] = [];
  const dbNs = new Set<string>();
  for (const s of ast.statements) {
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === "@hyperidle/db" && s.importClause && !s.importClause.isTypeOnly && s.importClause.namedBindings && ts.isNamespaceImport(s.importClause.namedBindings)) dbNs.add(s.importClause.namedBindings.name.text);
  }
  const consider = (name: string, kind: string, node: ts.Node) => {
    if (!tables.has(name)) return;
    const owner = OWNER[name];
    const line = ast.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    if (owner === undefined) { findings.push({ file: rel, table: name, kind: `${kind} [NO OWNER]`, line }); return; }
    if (!(rel === owner || rel.startsWith(owner + "/"))) findings.push({ file: rel, table: name, kind, line });
  };
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && DIRECT.has(n.expression.name.text)) {
      const a = n.arguments[0]; if (a && ts.isIdentifier(a)) consider(a.text, `.${n.expression.name.text}()`, n);
    }
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && n.moduleSpecifier.text === "@hyperidle/db" && n.importClause && !n.importClause.isTypeOnly && n.importClause.namedBindings && ts.isNamedImports(n.importClause.namedBindings)) {
      for (const el of n.importClause.namedBindings.elements) if (!el.isTypeOnly) consider(el.name.text, "value import", el);
    }
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && dbNs.has(n.expression.text)) consider(n.name.text, "ns access", n);
    ts.forEachChild(n, visit);
  };
  visit(ast);
  return findings;
}

// scan roots = nested service roots + every closure package's src/
function nestedServiceRoots(): string[] {
  const out: string[] = [];
  const pd = join(root, "packages");
  for (const l of readdirSync(pd, { withFileTypes: true })) {
    if (!l.isDirectory()) continue;
    for (const s of readdirSync(join(pd, l.name), { withFileTypes: true })) {
      if (!s.isDirectory()) continue;
      if (existsSync(join(pd, l.name, s.name, "package.json"))) out.push(join(pd, l.name, s.name));
    }
  }
  return out;
}

const mode = process.argv[3] ?? "closure";
const includeDev = process.argv[4] === "dev";
const roots = new Set<string>();
for (const r of nestedServiceRoots()) roots.add(join(r, "src"));
if (mode === "closure") for (const n of closure(includeDev)) roots.add(join(pkgs.get(n)!.dir, "src"));
if (mode === "all") for (const p of pkgs.values()) roots.add(join(p.dir, "src"));

const files = new Set<string>();
for (const r of roots) for (const f of collect(r)) files.add(f);

const all: F[] = [];
for (const f of files) all.push(...checkAccess(f));

const byFile = new Map<string, F[]>();
for (const f of all) { if (!byFile.has(f.file)) byFile.set(f.file, []); byFile.get(f.file)!.push(f); }
const pairs = new Set(all.map(f => `${f.file}|${f.table}`));
console.log(`FILES SCANNED: ${files.size}   FINDINGS: ${all.length}   FILE×TABLE PAIRS: ${pairs.size}   FILES WITH FINDINGS: ${byFile.size}`);
for (const [file, fs] of [...byFile.entries()].sort()) {
  console.log(`\n${file}  (${fs.length})`);
  for (const f of fs.sort((a,b)=>a.line-b.line)) console.log(`   :${f.line} ${f.kind} ${f.table} -> owner ${OWNER[f.table] ?? "NONE"}`);
}

// area breakdown
const area = (f: string) => f.startsWith("packages/eval/") ? "packages/eval/src" : f.startsWith("packages/db/") ? "packages/db/src" : f.startsWith("packages/core-api/src") ? "packages/core-api/src (Layer)" : f.split("/").slice(0,3).join("/");
const areaPairs = new Map<string, Set<string>>();
const areaFiles = new Map<string, Set<string>>();
for (const p of pairs) { const [file, t] = p.split("|"); const a = area(file);
  if(!areaPairs.has(a)){areaPairs.set(a,new Set());areaFiles.set(a,new Set());}
  areaPairs.get(a)!.add(p); areaFiles.get(a)!.add(file); }
console.log("\n==== AREA BREAKDOWN (file x table pairs / files) ====");
for (const [a,s] of [...areaPairs].sort((x,y)=>y[1].size-x[1].size)) console.log(`${String(s.size).padStart(4)} pairs  ${String(areaFiles.get(a)!.size).padStart(3)} files  ${a}`);
const tbl = new Map<string, number>();
for (const p of pairs) { const t = p.split("|")[1]; tbl.set(t,(tbl.get(t)??0)+1); }
console.log("\n==== BY TABLE ====");
for (const [t,n] of [...tbl].sort((a,b)=>b[1]-a[1])) console.log(`${String(n).padStart(4)}  ${t}  -> ${OWNER[t]}`);
