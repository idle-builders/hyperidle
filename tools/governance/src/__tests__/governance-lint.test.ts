/**
 * Unit tests for the architectural governance lint's pure functions, asserted against synthetic
 * inputs injected through the census's `files`/`readFile` seam — nothing here reads a source file
 * off disk. The static codebase properties themselves (zero production→development crossings, every
 * pattern alive) are enforced by `npm run lint`, per CLAUDE.md's split.
 *
 * @lore `governance-model.test.ts` stays in `framework/db` — it needs that package's live `schema.js`
 * to test real `PgTable` ownership and cannot move without losing that.
 */

import { describe, expect, it } from "vitest";
import { buildFixtureCensus, FIXTURE_CASES } from "../lib/governance-fixtures.js";
import { DeadRuleError, type Rule, runRules } from "../lib/governance-rules.js";
import {
	buildCensus,
	CLASSIFICATION_PATTERNS,
	classifyFile,
	collectSpecifiers,
	DEVELOPMENT_ROOTS,
	PRODUCTION_ROOTS,
	TEST_RUNNER_CONFIG_BASENAMES,
} from "../lib/repo-census.js";
import { classificationTotal } from "../rules/classification-total.js";
import { noProductionImportsDevelopment } from "../rules/no-production-imports-development.js";

const emptyCensus = () => buildCensus({ files: [], readFile: () => "" });

/**
 * One path that classifies under the named pattern and no earlier one.
 *
 * Array order in `CLASSIFICATION_PATTERNS` IS precedence, so each of these has to dodge every clause
 * ahead of it — which is why `default-production` is a bare `.ts` under a production root and
 * `dunder-segment` carries no name-declared suffix.
 */
// ---------------------------------------------------------------------------

describe("classifyFile — the settled production/development rule", () => {
	it.each([
		["framework/db/src/__testing__/test-utils.ts", "dunder-segment"],
		["layers/core-ui/src/pages/__fixtures__/x.ts", "dunder-segment"],
		["layers/core-api/src/__tests__/a.integration.test.ts", "test-suffix"],
		["framework/db/src/service.test.ts", "test-suffix"],
		["layers/core-ui/src/components/Card.test.tsx", "test-suffix"],
		["layers/core-ui/__e2e__/flow.spec.ts", "spec-suffix"],
		["layers/core-ui/src/flows/checkout.spec.ts", "spec-suffix"],
		["framework/design-system/src/Button.stories.tsx", "stories-suffix"],
		["tools/eval/src/cli.ts", "development-root:tools"],
		["tools/eslint-plugin-authz/src/index.ts", "development-root:tools"],
		["tools/eslint-plugin-design/src/rules/x.ts", "development-root:tools"],
		[".github/workflows/ci.yml", "outside-production-roots"],
		["docs/index.md", "outside-production-roots"],
		["vitest.config.ts", "outside-production-roots"],
		["deploy/chart/values.yaml", "outside-production-roots"],
		["deploy/bin/service", "outside-production-roots"],
		["package.json", "outside-production-roots"],
		["layers/core-ui/vitest.config.ts", "test-runner-config:vitest.config.ts"],
		["layers/core-ui/playwright.config.ts", "test-runner-config:playwright.config.ts"],
		["layers/core-ui/playwright.ah6.config.ts", "test-runner-config:playwright.*.config.ts"],
	])("%s is development via %s", (path, patternId) => {
		const record = classifyFile(path);
		expect(record.kind).toBe("development");
		expect(record.patternId).toBe(patternId);
	});

	it.each([
		"layers/core-ui/src/main.tsx",
		"framework/db/src/schema.ts",
		"framework/db/package.json",
		"layers/core-ui/vite.config.ts",
		"applications/desktop/build/icon.icns",
		"applications/remote-server/src/index.ts",
		"layers/core-api/src/app.ts",
		"layers/core-api/work/src/task-run-resolver.ts",
	])("%s is production by default", (path) => {
		const record = classifyFile(path);
		expect(record.kind).toBe("production");
		expect(record.clause).toBe("default-production");
	});

	it("is total — every path returns a kind and a clause", () => {
		for (const path of ["", "a", "layers", "layers/", "weird//path", "layers/x/y.unknown"]) {
			const record = classifyFile(path);
			expect(record.kind).toMatch(/^(production|development)$/);
			expect(record.clause).toBeTruthy();
			expect(record.patternId).toBeTruthy();
		}
	});

	it("treats `__` as development with no special cases — `__generated__` included", () => {
		// Ruling 9: "`__` means development, full stop — no provision for `__generated__` or anything
		// else that does not exist yet."
		expect(classifyFile("framework/db/src/__generated__/schema.ts").kind).toBe("development");
		expect(classifyFile("framework/db/src/__anything-at-all/x.ts").kind).toBe("development");
	});

	it("does not treat a single underscore as a `__` segment", () => {
		expect(classifyFile("layers/core-ui/src/pages/_dev/Demo.tsx").kind).toBe("production");
	});
});

describe("step 2 — classification by ROLE ROOT", () => {
	it("keeps the production and development roots disjoint and non-empty", () => {
		expect(PRODUCTION_ROOTS.length).toBeGreaterThan(0);
		expect(DEVELOPMENT_ROOTS.length).toBeGreaterThan(0);
		const overlap = PRODUCTION_ROOTS.filter((r) =>
			(DEVELOPMENT_ROOTS as readonly string[]).includes(r),
		);
		expect(overlap).toEqual([]);
	});

	it("makes every production root default to production", () => {
		for (const root of PRODUCTION_ROOTS) {
			expect(classifyFile(`${root}/pkg/src/index.ts`).kind).toBe("production");
			expect(classifyFile(`${root}/pkg/src/index.ts`).clause).toBe("default-production");
		}
	});

	it("makes every development root development, whatever the file is called", () => {
		for (const root of DEVELOPMENT_ROOTS) {
			for (const leaf of ["src/index.ts", "package.json", "README.md", "vite.config.ts"]) {
				expect(classifyFile(`${root}/pkg/${leaf}`).clause).toBe("development-root");
			}
		}
	});

	it("matches a role root only as a LEADING path segment", () => {
		// `vendor/tools/x.ts` is not the `tools/` root, and `layers-archive/` is not `layers/`.
		for (const root of [...PRODUCTION_ROOTS, ...DEVELOPMENT_ROOTS]) {
			expect(classifyFile(`vendor/${root}/pkg/src/x.ts`).clause).toBe("outside-production-roots");
			expect(classifyFile(`${root}-archive/pkg/src/x.ts`).clause).toBe("outside-production-roots");
		}
	});

	it("leaves `deploy/` outside both root lists — it is not shipping source", () => {
		expect((PRODUCTION_ROOTS as readonly string[]).includes("deploy")).toBe(false);
		expect((DEVELOPMENT_ROOTS as readonly string[]).includes("deploy")).toBe(false);
		expect(classifyFile("deploy/chart/templates/deployment.yaml").kind).toBe("development");
	});
});

describe("clause precedence — declared, not incidental", () => {
	it("array order of CLASSIFICATION_PATTERNS is the precedence", () => {
		expect(CLASSIFICATION_PATTERNS.map((p) => p.clause)).toEqual([
			"stories-suffix",
			"test-suffix",
			"spec-suffix",
			"dunder-segment",
			...DEVELOPMENT_ROOTS.map(() => "development-root" as const),
			"outside-production-roots",
			...TEST_RUNNER_CONFIG_BASENAMES.map(() => "test-runner-config" as const),
			"test-runner-config",
			"default-production",
		]);
	});

	it("puts every name-declared suffix clause ahead of the folder clause", () => {
		// Load-bearing, not cosmetic: nearly every `.test.ts` also sits under `__tests__/`. With the
		// folder clause first, `test-suffix` matches zero files.
		const order = CLASSIFICATION_PATTERNS.map((p) => p.clause);
		const dunder = order.indexOf("dunder-segment");
		for (const suffixClause of ["stories-suffix", "test-suffix", "spec-suffix"] as const) {
			expect(order.indexOf(suffixClause)).toBeGreaterThanOrEqual(0);
			expect(order.indexOf(suffixClause)).toBeLessThan(dunder);
		}
	});

	it("resolves an overlapping path to the earlier clause", () => {
		// Each of these matches two clauses. The verdict is the same either way; the *clause* is not,
		// and every per-pattern floor is computed under this order.
		expect(classifyFile("tools/eval/src/__tests__/x.ts").patternId).toBe("dunder-segment");
		expect(classifyFile("tools/eval/src/Foo.stories.tsx").patternId).toBe("stories-suffix");
		expect(classifyFile("tools/eval/vitest.config.ts").patternId).toBe("development-root:tools");
		expect(classifyFile("tools/eval/src/__tests__/Foo.stories.tsx").patternId).toBe(
			"stories-suffix",
		);
	});

	it("classifies a name-declared file by its name, wherever it sits", () => {
		// Mechanism 1: the filename decides, with or without a `__` folder above it.
		expect(classifyFile("layers/app/src/__tests__/x.test.ts").patternId).toBe("test-suffix");
		expect(classifyFile("layers/app/src/x.test.ts").patternId).toBe("test-suffix");
		expect(classifyFile("layers/app/__e2e__/flow.spec.ts").patternId).toBe("spec-suffix");
		expect(classifyFile("layers/app/src/flow.spec.ts").patternId).toBe("spec-suffix");
		expect(classifyFile("layers/app/src/components/Card.stories.tsx").patternId).toBe(
			"stories-suffix",
		);
	});

	it("keeps the folder mechanism live for a file whose name declares nothing", () => {
		// Mechanism 2 is not vestigial: an unsuffixed helper inside `__tests__/` is still development,
		// and its production sibling one directory up is untouched.
		expect(classifyFile("layers/app/src/__tests__/_helpers.ts").patternId).toBe("dunder-segment");
		expect(classifyFile("layers/app/src/__testing__/factory.ts").patternId).toBe("dunder-segment");
		expect(classifyFile("layers/app/src/components/Card.tsx").kind).toBe("production");
	});

	it("ends with an unconditional default so classification cannot fall through", () => {
		const last = CLASSIFICATION_PATTERNS.at(-1);
		expect(last?.id).toBe("default-production");
		expect(last?.matches("literally anything")).toBe(true);
	});

	it("declares a unique id per pattern", () => {
		const ids = CLASSIFICATION_PATTERNS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("buildCensus — totality and injection", () => {
	it("classifies every injected file with no residue", () => {
		const files = [
			"layers/app/src/index.ts",
			"layers/app/src/__tests__/x.ts",
			"layers/app/src/Y.stories.tsx",
			"tools/eval/src/z.ts",
			"README.md",
		];
		const census = buildCensus({ files, readFile: () => "" });
		const production = census.files.filter((f) => f.kind === "production").length;
		const development = census.files.filter((f) => f.kind === "development").length;
		expect(production + development).toBe(files.length);
		expect(census.byPath.size).toBe(files.length);
	});

	it("reports a count for every pattern, including patterns that matched nothing", () => {
		const census = buildCensus({ files: ["layers/app/src/index.ts"], readFile: () => "" });
		for (const pattern of CLASSIFICATION_PATTERNS)
			expect(census.patternCounts.has(pattern.id)).toBe(true);
		expect(census.patternCounts.get("development-root:tools")).toBe(0);
		const summed = [...census.patternCounts.values()].reduce((a, b) => a + b, 0);
		expect(summed).toBe(1);
	});

	it("resolves edges only into the injected file set", () => {
		const files = ["layers/app/src/a.ts", "layers/app/src/b.ts"];
		const census = buildCensus({
			files,
			readFile: (p) =>
				p === "layers/app/src/a.ts"
					? 'import "./b.js";\nimport "./nowhere.js";\nimport "react";\n'
					: "export const b = 1;\n",
		});
		expect(census.edges).toHaveLength(1);
		expect(census.edges[0]?.to).toBe("layers/app/src/b.ts");
	});

	it("survives a file it cannot read rather than aborting the whole census", () => {
		const census = buildCensus({
			files: ["layers/app/src/a.ts", "layers/app/src/b.ts"],
			readFile: (p) => {
				if (p === "layers/app/src/a.ts") throw new Error("gone");
				return "export const b = 1;";
			},
		});
		expect(census.files).toHaveLength(2);
	});
});

describe("collectSpecifiers — AST, never regex", () => {
	it.each([
		['import { a } from "./x.js";', "./x.js"],
		['export { a } from "./x.js";', "./x.js"],
		['export * from "./x.js";', "./x.js"],
		['import type { A } from "./x.js";', "./x.js"],
		['import * as ns from "./x.js";', "./x.js"],
		['const m = await import("./x.js");', "./x.js"],
		['import a, { b } from "./x.js";', "./x.js"],
		['import {\n  a,\n} from\n  "./x.js";', "./x.js"],
		['import "./x.js";', "./x.js"],
	])("finds the specifier in %j", (source, specifier) => {
		expect(collectSpecifiers("f.ts", source).map((s) => s.specifier)).toContain(specifier);
	});

	it("ignores a path that only appears in a string or a comment", () => {
		const source = 'const p = "./x.js";\n// import { a } from "./y.js";\n';
		expect(collectSpecifiers("f.ts", source)).toHaveLength(0);
	});

	it("reports a 1-based line number", () => {
		const found = collectSpecifiers("f.ts", '\n\nimport { a } from "./x.js";\n');
		expect(found[0]?.line).toBe(3);
	});
});

describe("runRules — a rule that scans nothing is a build error", () => {
	// This is the single defect that killed the entire inherited guard set: au6 and au9 both scanned
	// `packages/server/src`, deleted two tracks earlier, and both printed PASS over zero files.
	const inert: Rule = {
		id: "inert",
		description: "does nothing",
		minScope: 1,
		scope: (census) => census.files.map((f) => f.path),
		evaluate: () => [],
	};

	it("throws DeadRuleError when the injected file list is empty", () => {
		expect(() => runRules([inert], emptyCensus())).toThrow(DeadRuleError);
	});

	it("names the dead rule in the error", () => {
		try {
			runRules([inert], emptyCensus());
			expect.unreachable("expected a throw");
		} catch (error) {
			expect(error).toBeInstanceOf(DeadRuleError);
			expect((error as DeadRuleError).ruleId).toBe("inert");
			expect((error as Error).message).toContain("inert");
			expect((error as Error).message).toContain("build error");
		}
	});

	it("throws when live scope is merely below the floor, not only at zero", () => {
		const census = buildCensus({ files: ["layers/a/src/x.ts"], readFile: () => "" });
		const demanding: Rule = { ...inert, id: "demanding", minScope: 5 };
		expect(() => runRules([demanding], census)).toThrow(DeadRuleError);
	});

	it("does not evaluate a dead rule — it cannot contribute a vacuously clean verdict", () => {
		let evaluated = false;
		const dead: Rule = {
			...inert,
			id: "dead",
			evaluate: () => {
				evaluated = true;
				return [];
			},
		};
		expect(() => runRules([dead], emptyCensus())).toThrow(DeadRuleError);
		expect(evaluated).toBe(false);
	});

	it("rejects an empty rule set", () => {
		expect(() => runRules([], emptyCensus())).toThrow(/no rules registered/);
	});

	it("rejects a duplicate rule id", () => {
		const census = buildCensus({ files: ["layers/a/src/x.ts"], readFile: () => "" });
		expect(() => runRules([inert, { ...inert }], census)).toThrow(/duplicate rule id/);
	});

	it("rejects a rule that declares a floor below 1", () => {
		const census = buildCensus({ files: ["layers/a/src/x.ts"], readFile: () => "" });
		expect(() => runRules([{ ...inert, minScope: 0 }], census)).toThrow(/must be >= 1/);
	});

	it("passes a live rule and reports its scope size", () => {
		const census = buildCensus({
			files: ["layers/a/src/x.ts", "layers/a/src/y.ts"],
			readFile: () => "",
		});
		const result = runRules([inert], census);
		expect(result.findings).toHaveLength(0);
		expect(result.scopeSizes.get("inert")).toBe(2);
	});

	it("every registered rule declares a floor above zero", () => {
		for (const rule of [classificationTotal, noProductionImportsDevelopment]) {
			expect(rule.minScope).toBeGreaterThanOrEqual(1);
		}
	});
});

describe("no-production-imports-development — the crossing rule", () => {
	const treeCensus = (tree: Record<string, string>) =>
		buildCensus({ files: Object.keys(tree), readFile: (p) => tree[p] ?? "" });

	it("reports a production file importing a development file", () => {
		const census = treeCensus({
			"layers/a/src/index.ts": 'import { h } from "./__testing__/h.js";\nexport const x = h;\n',
			"layers/a/src/__testing__/h.ts": "export const h = 1;\n",
		});
		const findings = noProductionImportsDevelopment.evaluate(census);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("error");
		expect(findings[0]?.path).toBe("layers/a/src/index.ts");
		expect(findings[0]?.line).toBe(1);
		expect(findings[0]?.message).toContain("dunder-segment");
	});

	it("allows every other direction", () => {
		const census = treeCensus({
			"layers/a/src/index.ts": "export const p = 1;\n",
			"layers/a/src/other.ts": 'import { p } from "./index.js";\n',
			"layers/a/src/__testing__/h.ts": 'import { p } from "../index.js";\nexport const h = p;\n',
			"layers/a/src/__tests__/t.ts": 'import { h } from "../__testing__/h.js";\n',
		});
		expect(noProductionImportsDevelopment.evaluate(census)).toHaveLength(0);
	});

	it("has no allowlist, no suppression and no severity override", () => {
		// Ruling 8.1 is one-directional with no exceptions; retired-guard signal 9 is that every
		// exemption apparatus in this repo got re-populated. Asserted structurally: the rule's own
		// surface is exactly {id, description, scope, minScope, evaluate}.
		expect(Object.keys(noProductionImportsDevelopment).sort()).toEqual([
			"description",
			"evaluate",
			"id",
			"minScope",
			"scope",
		]);
		const census = treeCensus({
			"layers/a/src/index.ts": 'import { h } from "./__testing__/h.js";\n',
			"layers/a/src/__testing__/h.ts": "export const h = 1;\n",
		});
		expect(
			noProductionImportsDevelopment.evaluate(census).every((f) => f.severity === "error"),
		).toBe(true);
	});

	it("scopes to production files so it cannot pass by scanning nothing", () => {
		const census = treeCensus({ "layers/a/src/__testing__/h.ts": "export const h = 1;\n" });
		expect(noProductionImportsDevelopment.scope(census)).toHaveLength(0);
		expect(() => runRules([noProductionImportsDevelopment], census)).toThrow(DeadRuleError);
	});
});

describe("classification-total", () => {
	it("is clean for a well-formed census", () => {
		const census = buildCensus({ files: ["layers/a/src/x.ts", "docs/y.md"], readFile: () => "" });
		expect(classificationTotal.evaluate(census)).toHaveLength(0);
	});

	it("reports duplicate paths in the census input", () => {
		const census = buildCensus({
			files: ["layers/a/src/x.ts", "layers/a/src/x.ts"],
			readFile: () => "",
		});
		const findings = classificationTotal.evaluate(census);
		expect(findings.map((f) => f.message).join("\n")).toContain("duplicate paths");
	});
});

// AU28's misplacement-ledger rule and its own registry (tools/governance/misplaced-files.json)
// were deleted together once the ledger's last entry (fixtures/knowledge-data.ts, since cleared)
// emptied it — "a ledger that has emptied is not a rule with nothing to say, it is a rule with
// nothing left to be about." This describe block tested that rule directly; nothing survives it.

describe("--fixtures self-test — the detector proves itself on a synthetic tree", () => {
	// The only technique that would have caught au6/au9 going no-op, because it
	// proves the detector works independently of whether the live tree happens to be clean.
	it("has cases", () => {
		expect(FIXTURE_CASES.length).toBeGreaterThan(30);
	});

	it.each(FIXTURE_CASES.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
		expect(testCase.run()).toBeNull();
	});

	it("seeds a synthetic tree that genuinely contains crossings", () => {
		// A self-test over a clean tree proves nothing. Assert the fixture is dirty by construction.
		const census = buildFixtureCensus();
		expect(noProductionImportsDevelopment.evaluate(census).length).toBeGreaterThan(10);
	});
});
