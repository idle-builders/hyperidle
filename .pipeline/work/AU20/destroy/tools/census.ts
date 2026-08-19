/**
 * AU20 destroyer census: every exported symbol of every service package,
 * with kind, location, and whether it is reachable through the package barrel.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

const ROOT = process.argv[2] ?? process.cwd();
const LAYERS = ["core-api", "agent-orchestration", "agent-execution"];

type Rec = {
  name: string;
  kind: string;
  functionLike: boolean;
  file: string;
  line: number;
  public: boolean;
  classMethods?: string[];
};

function isProdFile(p: string): boolean {
  const base = path.basename(p);
  if (/\.(test|spec|stories)\.tsx?$/.test(base)) return false;
  if (p.split(path.sep).some((s) => s.startsWith("__"))) return false;
  if (p.includes("node_modules") || p.includes(`${path.sep}dist${path.sep}`)) return false;
  return /\.tsx?$/.test(base);
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith("__")) continue;
      walk(p, out);
    } else if (isProdFile(p)) out.push(p);
  }
  return out;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function hasExport(node: ts.Node): boolean {
  return !!(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const cands = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    base.replace(/\.js$/, ".ts"),
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const c of cands) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}

/** Names a file exports directly (declarations + named re-exports), plus files it star-re-exports. */
function fileExports(file: string): { names: Set<string>; stars: string[]; namedFrom: Array<[string, string]> } {
  const sf = parse(file);
  const names = new Set<string>();
  const stars: string[] = [];
  const namedFrom: Array<[string, string]> = [];
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
      if (!st.exportClause && spec) {
        const r = resolveSpec(file, spec);
        if (r) stars.push(r);
      } else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          names.add(el.name.text);
          if (spec) namedFrom.push([el.name.text, spec]);
        }
      }
      continue;
    }
    if (!hasExport(st)) continue;
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text);
    } else if (
      (ts.isFunctionDeclaration(st) ||
        ts.isClassDeclaration(st) ||
        ts.isInterfaceDeclaration(st) ||
        ts.isTypeAliasDeclaration(st) ||
        ts.isEnumDeclaration(st)) &&
      st.name
    ) {
      names.add(st.name.text);
    }
  }
  return { names, stars, namedFrom };
}

/** Public surface of a package = transitive closure of its barrel's exports. */
function publicNames(barrel: string): Set<string> {
  const seen = new Set<string>();
  const out = new Set<string>();
  const queue = [barrel];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const { names, stars } = fileExports(f);
    for (const n of names) out.add(n);
    queue.push(...stars);
  }
  return out;
}

function declarations(file: string, pub: Set<string>, rel: (p: string) => string): Rec[] {
  const sf = parse(file);
  const recs: Rec[] = [];
  for (const st of sf.statements) {
    if (!hasExport(st)) continue;
    const push = (name: string, kind: string, functionLike: boolean, node: ts.Node, classMethods?: string[]) =>
      recs.push({
        name,
        kind,
        functionLike,
        file: rel(file),
        line: lineOf(sf, node),
        public: pub.has(name),
        ...(classMethods ? { classMethods } : {}),
      });

    if (ts.isFunctionDeclaration(st) && st.name) {
      push(st.name.text, "function", true, st);
    } else if (ts.isClassDeclaration(st) && st.name) {
      const methods = st.members
        .filter((m) => (ts.isMethodDeclaration(m) || ts.isGetAccessor(m)) && m.name && ts.isIdentifier(m.name))
        .filter((m) => !ts.getModifiers(m)?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword))
        .map((m) => (m.name as ts.Identifier).text);
      push(st.name.text, "class", true, st, methods);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        const fn = !!init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
        push(d.name.text, fn ? "const-fn" : "const", fn, d);
      }
    } else if (ts.isInterfaceDeclaration(st) && st.name) {
      const methods = st.members
        .filter((m) => (ts.isMethodSignature(m) || ts.isPropertySignature(m)) && m.name && ts.isIdentifier(m.name))
        .map((m) => (m.name as ts.Identifier).text);
      push(st.name.text, "interface", false, st, methods);
    } else if (ts.isTypeAliasDeclaration(st) && st.name) {
      const t = st.type;
      const methods =
        t && ts.isTypeLiteralNode(t)
          ? t.members
              .filter((m) => (ts.isMethodSignature(m) || ts.isPropertySignature(m)) && m.name && ts.isIdentifier(m.name))
              .map((m) => (m.name as ts.Identifier).text)
          : undefined;
      push(st.name.text, "type", false, st, methods);
    } else if (ts.isEnumDeclaration(st) && st.name) {
      push(st.name.text, "enum", false, st);
    }
  }
  return recs;
}

const result: Record<string, { layer: string; dir: string; records: Rec[] }> = {};
const rel = (p: string) => path.relative(ROOT, p);

const SCOPE = process.env.CENSUS_SCOPE ?? "layers";
const groups: Array<{ label: string; base: string }> =
  SCOPE === "framework"
    ? [{ label: "framework", base: path.join(ROOT, "framework") }]
    : LAYERS.map((l) => ({ label: l, base: path.join(ROOT, "layers", l) }));

for (const { label: layer, base: layerDir } of groups) {
  if (!fs.existsSync(layerDir)) continue;
  for (const e of fs.readdirSync(layerDir, { withFileTypes: true })) {
    if (!e.isDirectory() || ["src", "dist", "node_modules"].includes(e.name)) continue;
    const dir = path.join(layerDir, e.name);
    const barrel = path.join(dir, "src", "index.ts");
    if (!fs.existsSync(barrel)) continue;
    const pub = publicNames(barrel);
    const files = walk(path.join(dir, "src"));
    const records = files.flatMap((f) => declarations(f, pub, rel));
    result[e.name] = { layer, dir: rel(dir), records };
  }
}

if (Object.keys(result).length === 0) {
  console.error("FATAL: census matched zero service packages");
  process.exit(1);
}

fs.writeFileSync(path.join(process.argv[3] ?? ".", "census.json"), JSON.stringify(result, null, 2));

let totalFn = 0;
let totalPubFn = 0;
let totalAll = 0;
const rows: string[] = [];
for (const [svc, v] of Object.entries(result).sort()) {
  const fns = v.records.filter((r) => r.functionLike);
  const pubFns = fns.filter((r) => r.public);
  totalFn += fns.length;
  totalPubFn += pubFns.length;
  totalAll += v.records.length;
  rows.push(`${String(fns.length).padStart(4)} fn (${String(pubFns.length).padStart(3)} public)  ${String(v.records.length).padStart(4)} exports total  ${v.layer}/${svc}`);
}
console.log(rows.join("\n"));
console.log(`\nTOTAL: ${totalFn} function-like exports (${totalPubFn} public), ${totalAll} exports across ${Object.keys(result).length} services`);
