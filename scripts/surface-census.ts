#!/usr/bin/env tsx
/**
 * surface-census.ts — AU20 standing tool.
 *
 * Counts, per Service package, the exported declarations AT THE IMPLEMENTATION
 * SITE — every `export function/const/class/enum/type/interface` in the
 * service's src, NOT filtered through the barrel.
 *
 * WHY implementation-site, not barrel-scoped (founder directive): a
 * barrel-scoped count is gameable — a builder can drop a name from
 * `src/index.ts` while leaving `export function foo` in the source (tsc allows
 * it; `foo` is still a valid export of its own file), which a barrel census
 * reports as a "reduction" even though the sprawl (the code) still exists.
 * That is exactly the internalize-don't-delete failure this tool exists to
 * catch. Counting the declaration itself cannot be gamed that way: to lower
 * the number you must actually DELETE the `export`.
 *
 * One fair normalization kept — OVERLOAD-DEDUP: an overloaded function emits N
 * `export function foo(...)` AST nodes; we count each name once (via Sets) so
 * one logical function = 1, not N syntax artifacts.
 *
 * Classifies each exported declaration into:
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

type Census = { methods: number; types: number };

/**
 * Count the methods and types a service EXPORTS AT THE IMPLEMENTATION SITE —
 * every `export function/const/class/enum/type/interface` declaration in the
 * service's src (NOT resolved through / filtered by the barrel).
 *
 * This is deliberate (founder directive): counting only barrel-exported names
 * is gameable — a builder can drop a name from src/index.ts while leaving
 * `export function foo` in the source (tsc allows it), which the barrel census
 * would report as a reduction even though the code (the sprawl) still exists.
 * Counting the declaration itself cannot be gamed that way: to reduce the
 * number you must actually DELETE the `export`.
 *
 * The one fair normalization kept: overload dedup — an overloaded function
 * produces N `export function foo(...)` AST nodes; we count each name once
 * (via Sets), so one logical function = 1, not N syntax artifacts.
 */
function censusService(svcDir: string): Census {
  const files: string[] = [];
  walk(join(svcDir, "src"), files);

  const methodNames = new Set<string>();
  const typeNames = new Set<string>();

  for (const file of files) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const n of sf.statements) {
      if (!isExported(n)) continue;

      if (ts.isFunctionDeclaration(n) && n.name) methodNames.add(n.name.text);
      else if (ts.isClassDeclaration(n) && n.name) methodNames.add(n.name.text);
      else if (ts.isEnumDeclaration(n) && n.name) methodNames.add(n.name.text);
      else if (ts.isVariableStatement(n)) {
        for (const decl of n.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) methodNames.add(decl.name.text);
        }
      } else if (ts.isInterfaceDeclaration(n) && n.name) typeNames.add(n.name.text);
      else if (ts.isTypeAliasDeclaration(n) && n.name) typeNames.add(n.name.text);
      // `export { x }` / `export type { x }` / `export * from` re-export lines
      // are NOT counted — they are barrel plumbing, not the declaration.
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
    const { methods, types } = censusService(svcDir);
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
