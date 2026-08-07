/**
 * AU28 — unit tests for the import-vs-manifest verdict.
 *
 * Tests the pure functions from scripts/lib/dep-manifest-verdict.ts: facts in,
 * divergences out. No filesystem, no mocks.
 *
 * @lore AU28: lives in framework/api-contract for the same reason
 * typecheck-verdict.test.ts does — the module under test is in scripts/lib/ and
 * vitest projects only cover workspace packages.
 */

import { describe, expect, it } from "vitest";
import {
	computeDependencyVerdict,
	computePackageDivergences,
	type DependencyField,
	definitelyTypedNameFor,
	JUSTIFIED_UNUSED,
	type PackageFacts,
	packageNameForDefinitelyTyped,
} from "../../../../scripts/lib/dep-manifest-verdict.js";

function facts(overrides: Partial<PackageFacts> = {}): PackageFacts {
	return {
		name: "@hyperidle/example",
		dir: "layers/example",
		declared: new Map<string, DependencyField>(),
		imported: new Map<string, readonly string[]>(),
		usesNodeBuiltins: false,
		cssReferences: new Set<string>(),
		testEnvironments: new Set<string>(),
		scriptTokens: new Set<string>(),
		peersOfDeclared: new Map<string, readonly string[]>(),
		...overrides,
	};
}

const dev = (...names: string[]) =>
	new Map<string, DependencyField>(names.map((n) => [n, "devDependencies" as const]));

describe("undeclared direction", () => {
	it("reports an import that the manifest does not declare", () => {
		const result = computePackageDivergences(
			facts({ imported: new Map([["hono", ["layers/example/src/app.ts"]]]) }),
		);
		expect(result).toEqual([
			{
				pkg: "@hyperidle/example",
				dir: "layers/example",
				dependency: "hono",
				direction: "undeclared",
				sites: ["layers/example/src/app.ts"],
			},
		]);
	});

	it("reports a workspace @hyperidle/* import — knip waves these through, this gate must not", () => {
		const result = computePackageDivergences(
			facts({
				imported: new Map([["@hyperidle/users", ["layers/example/src/__tests__/a.test.ts"]]]),
			}),
		);
		expect(result.map((d) => d.dependency)).toEqual(["@hyperidle/users"]);
	});

	it("does not excuse an import just because some other package declares it", () => {
		// The whole point: facts are per-package, so there is no ancestor lookup to inherit from.
		const root = facts({ name: "root", dir: ".", declared: dev("vitest") });
		const leaf = facts({ imported: new Map([["vitest", ["layers/example/src/a.test.ts"]]]) });
		const result = computeDependencyVerdict([root, leaf]);
		// Both halves are defects: the leaf still owes a declaration, and the root's
		// declaration is dead weight. Neither package excuses the other.
		expect(result.map((d) => `${d.dir}:${d.dependency}:${d.direction}`)).toEqual([
			".:vitest:unused",
			"layers/example:vitest:undeclared",
		]);
	});

	it("accepts a DefinitelyTyped-only module declared under its @types name", () => {
		const result = computePackageDivergences(
			facts({
				declared: dev("@types/estree"),
				imported: new Map([["estree", ["layers/example/src/rule.ts"]]]),
			}),
		);
		expect(result).toEqual([]);
	});

	it("ignores a self-import of the package's own name", () => {
		const result = computePackageDivergences(
			facts({ imported: new Map([["@hyperidle/example", ["layers/example/src/a.ts"]]]) }),
		);
		expect(result).toEqual([]);
	});
});

describe("unused direction", () => {
	it("reports a declaration nothing reaches", () => {
		const result = computePackageDivergences(facts({ declared: dev("@electric-sql/pglite") }));
		expect(result.map((d) => `${d.dependency}:${d.direction}`)).toEqual([
			"@electric-sql/pglite:unused",
		]);
	});

	it("credits @types/x when x is imported", () => {
		const result = computePackageDivergences(
			facts({
				declared: dev("@types/ws", "ws"),
				imported: new Map([["ws", ["layers/example/src/a.ts"]]]),
			}),
		);
		expect(result).toEqual([]);
	});

	it("credits @types/node when the package imports a node: builtin", () => {
		const result = computePackageDivergences(
			facts({ declared: dev("@types/node"), usesNodeBuiltins: true }),
		);
		expect(result).toEqual([]);
	});

	it("credits a dependency referenced only from CSS", () => {
		const result = computePackageDivergences(
			facts({ declared: dev("daisyui"), cssReferences: new Set(["daisyui"]) }),
		);
		expect(result).toEqual([]);
	});

	it("credits a dependency used only as a vitest environment", () => {
		const result = computePackageDivergences(
			facts({ declared: dev("jsdom"), testEnvironments: new Set(["jsdom"]) }),
		);
		expect(result).toEqual([]);
	});

	it("credits a dependency invoked as a binary from the package's own scripts", () => {
		const result = computePackageDivergences(
			facts({ declared: dev("drizzle-kit"), scriptTokens: new Set(["drizzle-kit", "generate"]) }),
		);
		expect(result).toEqual([]);
	});

	it("credits a required peer of a credited dependency", () => {
		// zod is never imported by framework/db; drizzle-zod cannot resolve without it.
		const result = computePackageDivergences(
			facts({
				declared: dev("drizzle-zod", "zod"),
				imported: new Map([["drizzle-zod", ["framework/db/src/zod-schemas.ts"]]]),
				peersOfDeclared: new Map([["drizzle-zod", ["zod"]]]),
			}),
		);
		expect(result).toEqual([]);
	});

	it("does not credit a peer of a dependency that is itself unreached", () => {
		const result = computePackageDivergences(
			facts({
				declared: dev("drizzle-zod", "zod"),
				peersOfDeclared: new Map([["drizzle-zod", ["zod"]]]),
			}),
		);
		expect(result.map((d) => d.dependency).sort()).toEqual(["drizzle-zod", "zod"]);
	});

	it("credits a peer of a peer (fixed-point, not one hop)", () => {
		const result = computePackageDivergences(
			facts({
				declared: dev("a", "b", "c"),
				imported: new Map([["a", ["layers/example/src/a.ts"]]]),
				peersOfDeclared: new Map([
					["a", ["b"]],
					["b", ["c"]],
				]),
			}),
		);
		expect(result).toEqual([]);
	});

	it("suppresses only the exact package+dependency pair listed as justified", () => {
		const entry = JUSTIFIED_UNUSED[0];
		expect(entry).toBeDefined();
		if (!entry) return;
		expect(entry.reason.length).toBeGreaterThan(20);

		const justified = computePackageDivergences(
			facts({ name: entry.pkg, declared: dev(entry.dependency) }),
		);
		expect(justified).toEqual([]);

		const elsewhere = computePackageDivergences(
			facts({ name: "@hyperidle/other", declared: dev(entry.dependency) }),
		);
		expect(elsewhere.map((d) => d.direction)).toEqual(["unused"]);
	});
});

describe("@types name mapping", () => {
	it("round-trips scoped and unscoped names", () => {
		expect(definitelyTypedNameFor("node")).toBe("@types/node");
		expect(definitelyTypedNameFor("@babel/core")).toBe("@types/babel__core");
		expect(packageNameForDefinitelyTyped("@types/node")).toBe("node");
		expect(packageNameForDefinitelyTyped("@types/babel__core")).toBe("@babel/core");
	});
});
