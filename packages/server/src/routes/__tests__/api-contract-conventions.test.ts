/**
 * api-contract red phase: AC-4 (no `as never` casts), AC-6 (status-code rule),
 * AC-7 (verbatimModuleSyntax + Biome useImportType)
 *
 * Convention/grep tests that verify structural properties of the codebase
 * without executing runtime code. These tests fail right now because:
 * - AC-4: `as never` casts exist in products.ts and bets.ts (will be 0 after conversion)
 * - AC-6: products.ts uses imperative router form (not chained) — not yet converted
 * - AC-7: verbatimModuleSyntax is not yet in root tsconfig.json
 *
 * NOTE: products.ts currently has 0 `as never` casts. The test on AC-4 targets
 * products.ts specifically because it is the pilot file. After conversion it must
 * remain 0. For bets.ts the test checks the current 5 → 0 transition.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WORKTREE_ROOT = resolve(import.meta.dirname, "../../../../..");

function readFile(relPath: string): string {
	return readFileSync(resolve(WORKTREE_ROOT, relPath), "utf-8");
}

function countMatches(content: string, pattern: RegExp): number {
	return (content.match(pattern) ?? []).length;
}

// ---------------------------------------------------------------------------
// AC-4: Zero `as never` and zero `as z.infer<` casts in converted pilot files
// ---------------------------------------------------------------------------

describe("AC-4: No `as never` casts in pilot route files after conversion", () => {
	it("products.ts has zero `as never` casts", () => {
		const content = readFile("packages/server/src/routes/products.ts");
		const count = countMatches(content, /as never/g);
		expect(count, `Found ${count} 'as never' cast(s) in products.ts — expected 0`).toBe(0);
	});

	it("products.ts has zero `as z.infer<` casts", () => {
		const content = readFile("packages/server/src/routes/products.ts");
		const count = countMatches(content, /as z\.infer</g);
		expect(count, `Found ${count} 'as z.infer<' cast(s) in products.ts — expected 0`).toBe(0);
	});

	it("bets.ts has zero `as never` casts (will fail until Phase 3b converts bets.ts)", () => {
		const content = readFile("packages/server/src/routes/bets.ts");
		const count = countMatches(content, /as never/g);
		expect(count, `Found ${count} 'as never' cast(s) in bets.ts — expected 0`).toBe(0);
	});

	it("bets.ts has zero `as z.infer<` casts (will fail until Phase 3b converts bets.ts)", () => {
		const content = readFile("packages/server/src/routes/bets.ts");
		const count = countMatches(content, /as z\.infer</g);
		expect(count, `Found ${count} 'as z.infer<' cast(s) in bets.ts — expected 0`).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// AC-4 (extended): validateBody is gone from pilot files after conversion
// ---------------------------------------------------------------------------

describe("AC-4 (extended): validateBody is replaced in pilot files after conversion", () => {
	it("products.ts does not call validateBody (products.ts had 0 calls — stable check)", () => {
		const content = readFile("packages/server/src/routes/products.ts");
		// Strip import lines first to avoid matching `import { validateBody }`
		const nonImportLines = content
			.split("\n")
			.filter((line) => !line.trimStart().startsWith("import"))
			.join("\n");
		const count = countMatches(nonImportLines, /validateBody\(/g);
		expect(count, `Found ${count} validateBody() call(s) in products.ts — expected 0`).toBe(0);
	});

	it("bets.ts has zero validateBody() call sites (will fail until Phase 3b converts bets.ts)", () => {
		const content = readFile("packages/server/src/routes/bets.ts");
		// Strip import lines to count only call sites
		const nonImportLines = content
			.split("\n")
			.filter((line) => !line.trimStart().startsWith("import"))
			.join("\n");
		const count = countMatches(nonImportLines, /validateBody\(/g);
		expect(count, `Found ${count} validateBody() call site(s) in bets.ts — expected 0`).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// AC-4 (type export): ProductsRoutes and BetsRoutes are exported
// ---------------------------------------------------------------------------

describe("AC-4 (type exports): Route type exports present after conversion", () => {
	it("products.ts exports ProductsRoutes type (will fail until Phase 3b adds the export)", () => {
		const content = readFile("packages/server/src/routes/products.ts");
		// Must contain: export type ProductsRoutes
		expect(content).toMatch(/export\s+type\s+ProductsRoutes/);
	});

	it("bets.ts exports BetsRoutes type (will fail until Phase 3b adds the export)", () => {
		const content = readFile("packages/server/src/routes/bets.ts");
		expect(content).toMatch(/export\s+type\s+BetsRoutes/);
	});
});

// ---------------------------------------------------------------------------
// AC-6: Status-code rule — error paths and POST-create use explicit status codes
// ---------------------------------------------------------------------------

describe("AC-6: Status-code rule in converted pilot files", () => {
	it("products.ts has explicit status on 404 responses (should already be true)", () => {
		const content = readFile("packages/server/src/routes/products.ts");
		// Must contain c.json(..., 404) — explicit status on 404 paths
		expect(content).toMatch(/c\.json\(.*,\s*404\)/s);
	});

	it("products.ts uses the chained route form after conversion (will fail until Phase 3b)", () => {
		const content = readFile("packages/server/src/routes/products.ts");
		// Chained form must start with `return new Hono()` inside the factory
		// and NOT assign to a `const router = new Hono()` with separate statements.
		// @ambiguity: This grep checks for the chained pattern. If the arch allows
		// alternate chaining approaches this may need adjustment.
		expect(content).toMatch(/return new Hono\(\)/);
	});

	it("bets.ts POST create route uses c.json(... 201) after conversion (will fail until Phase 3b)", () => {
		const content = readFile("packages/server/src/routes/bets.ts");
		// The POST / create route must return 201
		expect(content).toMatch(/c\.json\(.*,\s*201\)/s);
	});
});

// ---------------------------------------------------------------------------
// AC-7: verbatimModuleSyntax is set in root tsconfig.json
// ---------------------------------------------------------------------------

describe("AC-7: verbatimModuleSyntax in root tsconfig.json", () => {
	it("root tsconfig.json has verbatimModuleSyntax: true (will fail until Phase 1 adds it)", () => {
		const content = readFile("tsconfig.json");
		// Must contain verbatimModuleSyntax: true
		expect(content).toMatch(/"verbatimModuleSyntax"\s*:\s*true/);
	});
});

// ---------------------------------------------------------------------------
// AC-7: Biome useImportType is already "error" (should already pass)
// ---------------------------------------------------------------------------

describe("AC-7: Biome useImportType and useExportType are error-level (already true per arch F-10)", () => {
	it("biome.json has useImportType set to error", () => {
		const content = readFile("biome.json");
		// Must contain "useImportType": "error"
		expect(content).toMatch(/"useImportType"\s*:\s*"error"/);
	});

	it("biome.json has useExportType set to error", () => {
		const content = readFile("biome.json");
		expect(content).toMatch(/"useExportType"\s*:\s*"error"/);
	});
});

// ---------------------------------------------------------------------------
// AC-7 (extended): web tsconfig.json references server project
// ---------------------------------------------------------------------------

describe("AC-7 (extended): web tsconfig.json has server project reference", () => {
	it("packages/web/tsconfig.json references ../server (will fail until Phase 1 adds it)", () => {
		const content = readFile("packages/web/tsconfig.json");
		const parsed = JSON.parse(content) as {
			references?: Array<{ path: string }>;
		};
		const refs = parsed.references ?? [];
		const hasServerRef = refs.some((r) => r.path === "../server" || r.path.includes("server"));
		expect(hasServerRef, "web tsconfig.json must reference ../server for type imports").toBe(true);
	});
});
