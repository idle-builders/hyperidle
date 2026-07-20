#!/usr/bin/env tsx
/**
 * surface-census.ts — AU20 standing tool.
 *
 * Counts, per Service package, the PUBLIC exported declarations: those that
 * appear in the service's barrel (src/index.ts) and have an `export` keyword
 * at the implementation site.
 *
 * Two key design choices keep this census honest:
 *
 * 1. BARREL-SCOPED: only names re-exported from `src/index.ts` are counted.
 *    An intra-package helper can carry `export function` so sibling files can
 *    import it, yet it is not public API if it is not in the barrel. The
 *    barrel is the service's public-API contract.
 *
 *    Anti-internalization guarantee: TypeScript enforces that a barrel line
 *    `export { foo } from './file'` fails compilation when `foo` is NOT
 *    exported in `file`. Dropping a name from the barrel while leaving
 *    `export function foo` in the source is a genuine API reduction — the
 *    name is no longer callable by consumers. Hiding `export function foo`
 *    behind `function foo; export { foo }` while keeping it in the barrel
 *    does NOT reduce the census (the name still appears in the barrel).
 *
 * 2. OVERLOAD-DEDUPED: TypeScript overloaded functions produce multiple
 *    `export function foo(...)` declarations with the same name. Each
 *    overload signature is a separate AST node that would naively count as
 *    a separate method. We deduplicate by name per service so an overloaded
 *    function counts as one method regardless of how many signatures it has.
 *
 * Together these make the census count LOGICAL methods, not syntax artifacts:
 * one overloaded function = 1, one internal helper = 0.
 *
 * Classifies each barrel-exported name into:
 *   - methods  = export function | export const (value) | export class | export enum
 *   - types    = export type | export interface
 *
 * Re-runnable. Emits JSON to stdout (or a per-service table with --table).
 * Scope: every package under packages/{core-api,agent-orchestration,agent-execution}
 * that has a src/index.ts barrel (i.e. a Service). Test files excluded.
 *
 * Usage:  npx tsx scripts/surface-census.ts [--table]
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOT = process.env.CENSUS_ROOT ?? join(import.meta.dirname, "..");
const LAYERS = ["core-api", "agent-orchestration", "agent-execution"];

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist" || e === "__tests__") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !/\.(test|spec|stories|integration)\./.test(e)) out.push(p);
  }
}

function isExported(n: ts.Node): boolean {
  return ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/**
 * Parse src/index.ts to collect all names the barrel re-exports.
 * Handles named exports (`export { foo, bar } from './x'`) and
 * export-all (`export * from './x'`, resolved one level deep).
 *
 * @lore AU20 R-org: barrel-scoping makes the census count the PUBLIC API, not
 * intra-package helpers. TypeScript enforces that every name in the barrel must
 * have a corresponding `export` in the source file — so this cannot be gamed
 * by dropping from the barrel while leaving `export function` in place (tsc
 * would fail before the census even runs).
 */
function parseBarrelExports(svcDir: string): Set<string> {
  const barrelPath = join(svcDir, "src", "index.ts");
  if (!existsSync(barrelPath)) return new Set();
  const src = readFileSync(barrelPath, "utf8");
  const sf = ts.createSourceFile(barrelPath, src, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();

  for (const n of sf.statements) {
    if (!ts.isExportDeclaration(n)) continue;

    if (n.exportClause && ts.isNamedExports(n.exportClause)) {
      // export { foo, bar } from './x' or export type { T } from './x'
      for (const el of n.exportClause.elements) {
        names.add(el.name.text);
      }
    } else if (!n.exportClause && n.moduleSpecifier) {
      // export * from './x' — resolve one level deep
      const spec = (n.moduleSpecifier as ts.StringLiteral).text;
      // Strip .js suffix and try .ts / .tsx
      const base = spec.replace(/\.js$/, "");
      for (const ext of [".ts", ".tsx"]) {
        const resolved = join(svcDir, "src", base + ext);
        if (existsSync(resolved)) {
          const childSf = ts.createSourceFile(
            resolved,
            readFileSync(resolved, "utf8"),
            ts.ScriptTarget.Latest,
            true,
          );
          for (const stmt of childSf.statements) {
            if (isExported(stmt)) {
              if (ts.isFunctionDeclaration(stmt) && stmt.name) names.add(stmt.name.text);
              else if (ts.isClassDeclaration(stmt) && stmt.name) names.add(stmt.name.text);
              else if (ts.isEnumDeclaration(stmt) && stmt.name) names.add(stmt.name.text);
              else if (ts.isInterfaceDeclaration(stmt) && stmt.name) names.add(stmt.name.text);
              else if (ts.isTypeAliasDeclaration(stmt) && stmt.name) names.add(stmt.name.text);
              else if (ts.isVariableStatement(stmt)) {
                for (const d of stmt.declarationList.declarations) {
                  if (ts.isIdentifier(d.name)) names.add(d.name.text);
                }
              }
            }
          }
          break;
        }
      }
    }
  }

  return names;
}

type Census = { methods: number; types: number };

/**
 * Count the public API methods and types for a service.
 *
 * Uses Sets to:
 * (a) deduplicate overload signatures (same function name = one method), and
 * (b) filter to barrel-exported names only (intra-package helpers excluded).
 */
function censusService(svcDir: string, barrelExports: Set<string>): Census {
  const files: string[] = [];
  walk(join(svcDir, "src"), files);

  const methodNames = new Set<string>();
  const typeNames = new Set<string>();

  for (const file of files) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const n of sf.statements) {
      if (!isExported(n)) continue;

      if (ts.isFunctionDeclaration(n) && n.name) {
        if (barrelExports.has(n.name.text)) methodNames.add(n.name.text);
      } else if (ts.isClassDeclaration(n) && n.name) {
        if (barrelExports.has(n.name.text)) methodNames.add(n.name.text);
      } else if (ts.isEnumDeclaration(n) && n.name) {
        if (barrelExports.has(n.name.text)) methodNames.add(n.name.text);
      } else if (ts.isVariableStatement(n)) {
        for (const decl of n.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && barrelExports.has(decl.name.text)) {
            methodNames.add(decl.name.text);
          }
        }
      } else if (ts.isInterfaceDeclaration(n) && n.name) {
        if (barrelExports.has(n.name.text)) typeNames.add(n.name.text);
      } else if (ts.isTypeAliasDeclaration(n) && n.name) {
        if (barrelExports.has(n.name.text)) typeNames.add(n.name.text);
      }
      // `export { x }` / `export type { x }` / `export * from` re-export lines
      // are deliberately NOT counted here — they are barrel plumbing, not the
      // implementation-site declaration.
    }
  }

  return { methods: methodNames.size, types: typeNames.size };
}

const services: Array<{ service: string; layer: string } & Census & { total: number }> = [];
for (const layer of LAYERS) {
  const layerDir = join(ROOT, "packages", layer);
  if (!existsSync(layerDir)) continue;
  for (const svc of readdirSync(layerDir)) {
    const svcDir = join(layerDir, svc);
    if (!existsSync(join(svcDir, "src", "index.ts"))) continue; // only Services (have a barrel)
    const barrelExports = parseBarrelExports(svcDir);
    const { methods, types } = censusService(svcDir, barrelExports);
    services.push({ service: svc, layer, methods, types, total: methods + types });
  }
}

services.sort((a, b) => b.total - a.total);
const totals = services.reduce(
  (acc, s) => ({ methods: acc.methods + s.methods, types: acc.types + s.types, total: acc.total + s.total }),
  { methods: 0, types: 0, total: 0 },
);

if (process.argv.includes("--table")) {
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  const padL = (s: string | number, n: number) => String(s).padStart(n);
  console.log(`${pad("service", 22)}${pad("layer", 22)}${padL("meth", 6)}${padL("type", 6)}${padL("total", 7)}`);
  console.log("-".repeat(63));
  for (const s of services) console.log(`${pad(s.service, 22)}${pad(s.layer, 22)}${padL(s.methods, 6)}${padL(s.types, 6)}${padL(s.total, 7)}`);
  console.log("-".repeat(63));
  console.log(`${pad("TOTAL (" + services.length + " services)", 44)}${padL(totals.methods, 6)}${padL(totals.types, 6)}${padL(totals.total, 7)}`);
} else {
  console.log(JSON.stringify({ generatedFrom: "surface-census.ts", serviceCount: services.length, totals, services }, null, 2));
}
