#!/usr/bin/env tsx
/**
 * AU19 §8 — Service package scaffold generator.
 *
 * `npx tsx scripts/scaffold-service.ts <layer> <service>` writes the four-file
 * skeleton for a nested Service package at `packages/<layer>/<service>/`:
 *   - package.json      (deps = @hyperidle/db + @hyperidle/shared; execution
 *                        Services drop db and gain no db reference)
 *   - tsconfig.json     (extends ../../../tsconfig.base.json; composite; refs)
 *   - vitest.config.ts  (project name = <service>)
 *   - src/index.ts      (barrel skeleton — typed functions only)
 *
 * It also appends `{ "path": "<service>" }` to the owning Layer package's
 * tsconfig references (if that tsconfig exists). Idempotent: existing files are
 * skipped, never overwritten, so re-running to add a sibling Service is safe.
 *
 * @lore AU19: creating ~31 Service packages by hand is error-prone repetition;
 * this generator makes it mechanical. agent-execution Services are DB-free by
 * contract (Mechanism B) — the generator omits `@hyperidle/db` from both their
 * package.json deps and their tsconfig references for that layer.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const LAYERS = new Set([
  "core-api",
  "agent-orchestration",
  "agent-execution",
]);

/** agent-execution Services hold zero DB reference (Mechanism B). */
function isExecutionLayer(layer: string): boolean {
  return layer === "agent-execution";
}

function writeIfAbsent(path: string, content: string): "written" | "skipped" {
  if (existsSync(path)) return "skipped";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return "written";
}

function packageJson(service: string, execution: boolean): string {
  const dependencies = execution
    ? { "@hyperidle/shared": "*" }
    : { "@hyperidle/db": "*", "@hyperidle/shared": "*" };
  return `${JSON.stringify(
    {
      name: `@hyperidle/${service}`,
      version: "0.0.1",
      private: true,
      type: "module",
      exports: { ".": "./src/index.ts" },
      scripts: { check: "tsc --noEmit", test: "vitest run" },
      dependencies,
    },
    null,
    "\t",
  )}\n`;
}

function tsconfig(execution: boolean): string {
  const references = execution
    ? [{ path: "../../shared" }]
    : [{ path: "../../db" }, { path: "../../shared" }];
  return `${JSON.stringify(
    {
      extends: "../../../tsconfig.base.json",
      compilerOptions: {
        composite: true,
        outDir: "dist",
        rootDir: "src",
        // @lore AU19 Increment 1a: nested Service packages that use Node builtins
        // (e.g. `node:crypto`'s randomUUID) need `types: ["node"]` explicitly —
        // top-level packages (db/shared/desktop/…) already declare this, but the
        // Inc-0 scaffold template omitted it since neither Inc-0 Service used a
        // node: import. `knowledge` (Inc 1a) is the first to hit this; fixed here
        // so every future scaffolded Service gets it for free.
        types: ["node"],
      },
      include: ["src"],
      references,
    },
    null,
    "\t",
  )}\n`;
}

function vitestConfig(service: string): string {
  return `import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "${service}",
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});
`;
}

function barrel(service: string): string {
  return `/**
 * Barrel for @hyperidle/${service}.
 *
 * Typed functions only. SQL-owning Services MUST NOT re-export a raw pgTable
 * object (Table ACL, Mechanism A). Cross-Service data flows in as a port
 * parameter wired by the owning Layer — never a direct Service import
 * (Composition boundary, Mechanism C).
 */
export {};
`;
}

/** Append a Service reference to the owning Layer's tsconfig, if present. */
function linkLayerReference(root: string, layer: string, service: string): void {
  const layerTsconfig = resolve(root, "packages", layer, "tsconfig.json");
  if (!existsSync(layerTsconfig)) return;
  const raw = JSON.parse(readFileSync(layerTsconfig, "utf8")) as {
    references?: { path: string }[];
  };
  const references = raw.references ?? [];
  if (references.some((r) => r.path === service)) return;
  references.push({ path: service });
  raw.references = references;
  writeFileSync(layerTsconfig, `${JSON.stringify(raw, null, "\t")}\n`);
}

function main(): void {
  const [layer, service] = process.argv.slice(2);
  if (!layer || !service) {
    process.stderr.write(
      "usage: scaffold-service.ts <layer> <service>\n" +
        `  <layer> ∈ { ${[...LAYERS].join(", ")} }\n`,
    );
    process.exit(1);
  }
  if (!LAYERS.has(layer)) {
    process.stderr.write(
      `scaffold-service: unknown layer "${layer}". Expected one of ${[...LAYERS].join(", ")}.\n`,
    );
    process.exit(1);
  }

  const root = process.cwd();
  const execution = isExecutionLayer(layer);
  const base = resolve(root, "packages", layer, service);

  const results = [
    ["package.json", packageJson(service, execution)],
    ["tsconfig.json", tsconfig(execution)],
    ["vitest.config.ts", vitestConfig(service)],
    ["src/index.ts", barrel(service)],
  ] as const;

  for (const [rel, content] of results) {
    const outcome = writeIfAbsent(join(base, rel), content);
    process.stdout.write(`  ${outcome}: packages/${layer}/${service}/${rel}\n`);
  }
  linkLayerReference(root, layer, service);
  process.stdout.write(`scaffold-service: @hyperidle/${service} ready.\n`);
}

main();
