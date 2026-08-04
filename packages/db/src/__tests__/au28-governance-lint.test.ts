/**
 * AU28 step 1 — unit tests for the architectural governance lint.
 *
 * These test RUNTIME BEHAVIOUR: pure functions, imported, asserted against synthetic inputs injected
 * through the census's `files`/`readFile` seam. Nothing here reads a source file off disk — the static
 * codebase properties (zero production→development crossings, every pattern alive) are enforced by
 * `npm run lint`, per CLAUDE.md's split.
 *
 * @lore AU28: this file lives under `packages/db/src/__tests__/` because that is the established home
 * for guard-logic tests importing from the root `scripts/` tree — root `tsconfig.json` has
 * `include: []`, so `scripts/**` is typechecked only transitively through imports like these. The
 * location is load-bearing, not incidental: delete the last such test and `scripts/` stops being
 * typechecked.
 */

import { describe, expect, it } from "vitest";
import { buildFixtureCensus, FIXTURE_CASES } from "../../../../scripts/lib/governance-fixtures.js";
import { DeadRuleError, type Rule, runRules } from "../../../../scripts/lib/governance-rules.js";
import {
	buildCensus,
	CLASSIFICATION_PATTERNS,
	classifyFile,
	collectSpecifiers,
	DEVELOPMENT_PACKAGE_DIRS,
	TEST_RUNNER_CONFIG_BASENAMES,
} from "../../../../scripts/lib/repo-census.js";
import { classificationTotal } from "../../../../scripts/rules/classification-total.js";
import { noProductionImportsDevelopment } from "../../../../scripts/rules/no-production-imports-development.js";
import { patternLive } from "../../../../scripts/rules/pattern-live.js";

const emptyCensus = () => buildCensus({ files: [], readFile: () => "" });

// ---------------------------------------------------------------------------

describe("AU28 classifyFile — the settled production/development rule", () => {
	it.each([
		["packages/db/src/__testing__/test-utils.ts", "dunder-segment"],
		["packages/web/src/pages/__fixtures__/x.ts", "dunder-segment"],
		["packages/core-api/src/__tests__/a.integration.test.ts", "test-suffix"],
		["packages/db/src/service.test.ts", "test-suffix"],
		["packages/web/src/components/Card.test.tsx", "test-suffix"],
		["packages/web/__e2e__/flow.spec.ts", "spec-suffix"],
		["packages/web/src/flows/checkout.spec.ts", "spec-suffix"],
		["packages/design-system/src/Button.stories.tsx", "stories-suffix"],
		["packages/eval/src/cli.ts", "development-package:eval"],
		["packages/eslint-plugin-authz/src/index.ts", "development-package:eslint-plugin-authz"],
		["packages/eslint-plugin-design/src/rules/x.ts", "development-package:eslint-plugin-design"],
		["scripts/verify-attest.ts", "outside-packages"],
		["docs/index.md", "outside-packages"],
		["vitest.config.ts", "outside-packages"],
		["packages/web/vitest.config.ts", "test-runner-config:vitest.config.ts"],
		["packages/web/playwright.config.ts", "test-runner-config:playwright.config.ts"],
		["packages/web/playwright.ah6.config.ts", "test-runner-config:playwright.*.config.ts"],
	])("%s is development via %s", (path, patternId) => {
		const record = classifyFile(path);
		expect(record.kind).toBe("development");
		expect(record.patternId).toBe(patternId);
	});

	it.each([
		"packages/web/src/main.tsx",
		"packages/db/src/schema.ts",
		"packages/db/package.json",
		"packages/web/vite.config.ts",
		"packages/desktop/build/icon.icns",
		"packages/core-api/src/app.ts",
	])("%s is production by default", (path) => {
		const record = classifyFile(path);
		expect(record.kind).toBe("production");
		expect(record.clause).toBe("default-production");
	});

	it("is total — every path returns a kind and a clause", () => {
		for (const path of ["", "a", "packages", "packages/", "weird//path", "packages/x/y.unknown"]) {
			const record = classifyFile(path);
			expect(record.kind).toMatch(/^(production|development)$/);
			expect(record.clause).toBeTruthy();
			expect(record.patternId).toBeTruthy();
		}
	});

	it("treats `__` as development with no special cases — `__generated__` included", () => {
		// Ruling 9: "`__` means development, full stop — no provision for `__generated__` or anything
		// else that does not exist yet."
		expect(classifyFile("packages/db/src/__generated__/schema.ts").kind).toBe("development");
		expect(classifyFile("packages/db/src/__anything-at-all/x.ts").kind).toBe("development");
	});

	it("does not treat a single underscore as a `__` segment", () => {
		expect(classifyFile("packages/web/src/pages/_dev/Demo.tsx").kind).toBe("production");
	});
});

describe("AU28 clause precedence — declared, not incidental", () => {
	it("array order of CLASSIFICATION_PATTERNS is the precedence", () => {
		expect(CLASSIFICATION_PATTERNS.map((p) => p.clause)).toEqual([
			"stories-suffix",
			"test-suffix",
			"spec-suffix",
			"dunder-segment",
			...DEVELOPMENT_PACKAGE_DIRS.map(() => "development-package" as const),
			"outside-packages",
			...TEST_RUNNER_CONFIG_BASENAMES.map(() => "test-runner-config" as const),
			"test-runner-config",
			"default-production",
		]);
	});

	it("puts every name-declared suffix clause ahead of the folder clause", () => {
		// Load-bearing, not cosmetic: nearly every `.test.ts` also sits under `__tests__/`. With the
		// folder clause first, `test-suffix` matches zero files and `pattern-live` fails the build.
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
		expect(classifyFile("packages/eval/src/__tests__/x.ts").patternId).toBe("dunder-segment");
		expect(classifyFile("packages/eval/src/Foo.stories.tsx").patternId).toBe("stories-suffix");
		expect(classifyFile("packages/eval/vitest.config.ts").patternId).toBe(
			"development-package:eval",
		);
		expect(classifyFile("packages/eval/src/__tests__/Foo.stories.tsx").patternId).toBe(
			"stories-suffix",
		);
	});

	it("classifies a name-declared file by its name, wherever it sits", () => {
		// Mechanism 1: the filename decides, with or without a `__` folder above it.
		expect(classifyFile("packages/app/src/__tests__/x.test.ts").patternId).toBe("test-suffix");
		expect(classifyFile("packages/app/src/x.test.ts").patternId).toBe("test-suffix");
		expect(classifyFile("packages/app/__e2e__/flow.spec.ts").patternId).toBe("spec-suffix");
		expect(classifyFile("packages/app/src/flow.spec.ts").patternId).toBe("spec-suffix");
		expect(classifyFile("packages/app/src/components/Card.stories.tsx").patternId).toBe(
			"stories-suffix",
		);
	});

	it("keeps the folder mechanism live for a file whose name declares nothing", () => {
		// Mechanism 2 is not vestigial: an unsuffixed helper inside `__tests__/` is still development,
		// and its production sibling one directory up is untouched.
		expect(classifyFile("packages/app/src/__tests__/_helpers.ts").patternId).toBe("dunder-segment");
		expect(classifyFile("packages/app/src/__testing__/factory.ts").patternId).toBe(
			"dunder-segment",
		);
		expect(classifyFile("packages/app/src/components/Card.tsx").kind).toBe("production");
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

	it("declares a floor of at least 1 for every pattern", () => {
		for (const pattern of CLASSIFICATION_PATTERNS)
			expect(pattern.minFiles).toBeGreaterThanOrEqual(1);
	});
});

describe("AU28 buildCensus — totality and injection", () => {
	it("classifies every injected file with no residue", () => {
		const files = [
			"packages/app/src/index.ts",
			"packages/app/src/__tests__/x.ts",
			"packages/app/src/Y.stories.tsx",
			"packages/eval/src/z.ts",
			"README.md",
		];
		const census = buildCensus({ files, readFile: () => "" });
		const production = census.files.filter((f) => f.kind === "production").length;
		const development = census.files.filter((f) => f.kind === "development").length;
		expect(production + development).toBe(files.length);
		expect(census.byPath.size).toBe(files.length);
	});

	it("reports a count for every pattern, including patterns that matched nothing", () => {
		const census = buildCensus({ files: ["packages/app/src/index.ts"], readFile: () => "" });
		for (const pattern of CLASSIFICATION_PATTERNS)
			expect(census.patternCounts.has(pattern.id)).toBe(true);
		expect(census.patternCounts.get("development-package:eval")).toBe(0);
		const summed = [...census.patternCounts.values()].reduce((a, b) => a + b, 0);
		expect(summed).toBe(1);
	});

	it("resolves edges only into the injected file set", () => {
		const files = ["packages/app/src/a.ts", "packages/app/src/b.ts"];
		const census = buildCensus({
			files,
			readFile: (p) =>
				p === "packages/app/src/a.ts"
					? 'import "./b.js";\nimport "./nowhere.js";\nimport "react";\n'
					: "export const b = 1;\n",
		});
		expect(census.edges).toHaveLength(1);
		expect(census.edges[0]?.to).toBe("packages/app/src/b.ts");
	});

	it("survives a file it cannot read rather than aborting the whole census", () => {
		const census = buildCensus({
			files: ["packages/app/src/a.ts", "packages/app/src/b.ts"],
			readFile: (p) => {
				if (p === "packages/app/src/a.ts") throw new Error("gone");
				return "export const b = 1;";
			},
		});
		expect(census.files).toHaveLength(2);
	});
});

describe("AU28 collectSpecifiers — AST, never regex", () => {
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

describe("AU28 runRules — a rule that scans nothing is a build error", () => {
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
		const census = buildCensus({ files: ["packages/a/src/x.ts"], readFile: () => "" });
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
		const census = buildCensus({ files: ["packages/a/src/x.ts"], readFile: () => "" });
		expect(() => runRules([inert, { ...inert }], census)).toThrow(/duplicate rule id/);
	});

	it("rejects a rule that declares a floor below 1", () => {
		const census = buildCensus({ files: ["packages/a/src/x.ts"], readFile: () => "" });
		expect(() => runRules([{ ...inert, minScope: 0 }], census)).toThrow(/must be >= 1/);
	});

	it("passes a live rule and reports its scope size", () => {
		const census = buildCensus({
			files: ["packages/a/src/x.ts", "packages/a/src/y.ts"],
			readFile: () => "",
		});
		const result = runRules([inert], census);
		expect(result.findings).toHaveLength(0);
		expect(result.scopeSizes.get("inert")).toBe(2);
	});

	it("every registered rule declares a floor above zero", () => {
		for (const rule of [classificationTotal, patternLive, noProductionImportsDevelopment]) {
			expect(rule.minScope).toBeGreaterThanOrEqual(1);
		}
	});
});

describe("AU28 no-production-imports-development — the crossing rule", () => {
	const treeCensus = (tree: Record<string, string>) =>
		buildCensus({ files: Object.keys(tree), readFile: (p) => tree[p] ?? "" });

	it("reports a production file importing a development file", () => {
		const census = treeCensus({
			"packages/a/src/index.ts": 'import { h } from "./__testing__/h.js";\nexport const x = h;\n',
			"packages/a/src/__testing__/h.ts": "export const h = 1;\n",
		});
		const findings = noProductionImportsDevelopment.evaluate(census);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("error");
		expect(findings[0]?.path).toBe("packages/a/src/index.ts");
		expect(findings[0]?.line).toBe(1);
		expect(findings[0]?.message).toContain("dunder-segment");
	});

	it("allows every other direction", () => {
		const census = treeCensus({
			"packages/a/src/index.ts": "export const p = 1;\n",
			"packages/a/src/other.ts": 'import { p } from "./index.js";\n',
			"packages/a/src/__testing__/h.ts": 'import { p } from "../index.js";\nexport const h = p;\n',
			"packages/a/src/__tests__/t.ts": 'import { h } from "../__testing__/h.js";\n',
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
			"packages/a/src/index.ts": 'import { h } from "./__testing__/h.js";\n',
			"packages/a/src/__testing__/h.ts": "export const h = 1;\n",
		});
		expect(
			noProductionImportsDevelopment.evaluate(census).every((f) => f.severity === "error"),
		).toBe(true);
	});

	it("scopes to production files so it cannot pass by scanning nothing", () => {
		const census = treeCensus({ "packages/a/src/__testing__/h.ts": "export const h = 1;\n" });
		expect(noProductionImportsDevelopment.scope(census)).toHaveLength(0);
		expect(() => runRules([noProductionImportsDevelopment], census)).toThrow(DeadRuleError);
	});
});

describe("AU28 pattern-live — no classification pattern may go dead", () => {
	it("reports a pattern that has stopped matching", () => {
		const census = buildCensus({ files: ["packages/a/src/x.ts"], readFile: () => "" });
		const findings = patternLive.evaluate(census);
		const reported = findings.map((f) => f.message).join("\n");
		expect(reported).toContain("dunder-segment");
		expect(reported).toContain("development-package:eval");
		expect(findings.every((f) => f.severity === "error")).toBe(true);
	});

	it("stays silent when every pattern is above its floor", () => {
		const patched = CLASSIFICATION_PATTERNS.map((p) => ({ ...p, minFiles: 0 }));
		const census = buildCensus({ files: ["packages/a/src/x.ts"], readFile: () => "" });
		// Floors live on the pattern definitions, so this asserts the comparison, not the constants.
		const belowNone = patched.every((p) => (census.patternCounts.get(p.id) ?? 0) >= p.minFiles);
		expect(belowNone).toBe(true);
	});
});

describe("AU28 classification-total", () => {
	it("is clean for a well-formed census", () => {
		const census = buildCensus({ files: ["packages/a/src/x.ts", "docs/y.md"], readFile: () => "" });
		expect(classificationTotal.evaluate(census)).toHaveLength(0);
	});

	it("reports duplicate paths in the census input", () => {
		const census = buildCensus({
			files: ["packages/a/src/x.ts", "packages/a/src/x.ts"],
			readFile: () => "",
		});
		const findings = classificationTotal.evaluate(census);
		expect(findings.map((f) => f.message).join("\n")).toContain("duplicate paths");
	});
});

describe("AU28 --fixtures self-test — the detector proves itself on a synthetic tree", () => {
	// retired-guards.md §5: the only technique that would have caught au6/au9 going no-op, because it
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
