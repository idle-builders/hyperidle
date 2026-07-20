#!/usr/bin/env tsx
/**
 * surface-census.ts — AU20 standing tool.
 *
 * Counts, per Service package, the EXPORTED DECLARATIONS at the implementation
 * site (where the `export function` / `export const` / `export class` /
 * `export type` / `export interface` / `export enum` keyword actually is) —
 * NOT resolved through barrel re-exports. Classifies each into:
 *   - methods  = export function | export const (value) | export class | export enum
 *   - types    = export type | export interface
 *
 * This is the honest "what does the implementation expose" measure: a barrel
 * re-export count overstates a collapse (internalizing drops a barrel line but
 * leaves the `export` on the declaration). Counting declarations shows what was
 * actually removed vs. merely un-exposed.
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

type Census = { methods: number; types: number };

function censusFile(file: string): Census {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  let methods = 0;
  let types = 0;
  for (const n of sf.statements) {
    if (ts.isFunctionDeclaration(n) && n.name && isExported(n)) methods++;
    else if (ts.isClassDeclaration(n) && n.name && isExported(n)) methods++;
    else if (ts.isEnumDeclaration(n) && isExported(n)) methods++;
    else if (ts.isVariableStatement(n) && isExported(n)) methods += n.declarationList.declarations.length;
    else if (ts.isInterfaceDeclaration(n) && isExported(n)) types++;
    else if (ts.isTypeAliasDeclaration(n) && isExported(n)) types++;
    // `export { x }` / `export type { x }` / `export * from` re-export lines are
    // deliberately NOT counted here — they are barrel plumbing, not the
    // implementation-site declaration.
  }
  return { methods, types };
}

const services: Array<{ service: string; layer: string } & Census & { total: number }> = [];
for (const layer of LAYERS) {
  const layerDir = join(ROOT, "packages", layer);
  if (!existsSync(layerDir)) continue;
  for (const svc of readdirSync(layerDir)) {
    const svcDir = join(layerDir, svc);
    if (!existsSync(join(svcDir, "src", "index.ts"))) continue; // only Services (have a barrel)
    const files: string[] = [];
    walk(join(svcDir, "src"), files);
    let methods = 0;
    let types = 0;
    for (const f of files) {
      const c = censusFile(f);
      methods += c.methods;
      types += c.types;
    }
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
