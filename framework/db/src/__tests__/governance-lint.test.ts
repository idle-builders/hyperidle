/**
 * AU28 step 1 — unit tests for the architectural governance lint.
 *
 * These test RUNTIME BEHAVIOUR: pure functions, imported, asserted against synthetic inputs injected
 * through the census's `files`/`readFile` seam. Nothing here reads a source file off disk — the static
 * codebase properties (zero production→development crossings, every pattern alive) are enforced by
 * `npm run lint`, per CLAUDE.md's split.
 *
 * @lore AU31: this file lives under `framework/db/src/__tests__/` alongside `governance-model.test.ts`
 * and `governance-crossings.test.ts` — its sibling, which needs `framework/db`'s live `schema.js` to
 * test real `PgTable` ownership and cannot move without losing that. `tools/governance/` (AU31) is its
 * own workspace package with its own `tsconfig.json`, typechecked directly by `typecheck-gate.ts`'s
 * package discovery — these tests are not what keeps its engine typechecked, unlike the `scripts/`
 * tree these imports used to reach into before the move.
 */

import { describe, expect, it } from "vitest";
import {
	buildFixtureCensus,
	FIXTURE_CASES,
} from "../../../../tools/governance/src/lib/governance-fixtures.js";
import type { MisplacedFiles } from "../../../../tools/governance/src/lib/governance-registry.js";
import {
	DeadRuleError,
	type Rule,
	runRules,
} from "../../../../tools/governance/src/lib/governance-rules.js";
import {
	buildCensus,
	CLASSIFICATION_PATTERNS,
	classifyFile,
	collectSpecifiers,
	DEVELOPMENT_ROOTS,
	PRODUCTION_ROOTS,
	TEST_RUNNER_CONFIG_BASENAMES,
} from "../../../../tools/governance/src/lib/repo-census.js";
import { classificationTotal } from "../../../../tools/governance/src/rules/classification-total.js";
import {
	allowedSlack,
	floorsTight,
	floorVerdict,
	suggestedFloor,
} from "../../../../tools/governance/src/rules/floors-tight.js";
import { misplacementLedger } from "../../../../tools/governance/src/rules/misplacement-ledger.js";
import { noProductionImportsDevelopment } from "../../../../tools/governance/src/rules/no-production-imports-development.js";
import { patternLive } from "../../../../tools/governance/src/rules/pattern-live.js";

const emptyCensus = () => buildCensus({ files: [], readFile: () => "" });

/**
 * One path that classifies under the named pattern and no earlier one.
 *
 * Array order in `CLASSIFICATION_PATTERNS` IS precedence, so each of these has to dodge every clause
 * ahead of it — which is why `default-production` is a bare `.ts` under a production root and
 * `dunder-segment` carries no name-declared suffix.
 */
function samplePathFor(patternId: string, index: number): string {
	switch (patternId) {
		case "stories-suffix":
			return `layers/a/src/S${index}.stories.tsx`;
		case "test-suffix":
			return `layers/a/src/t${index}.test.ts`;
		case "spec-suffix":
			return `layers/a/src/s${index}.spec.ts`;
		case "dunder-segment":
			return `layers/a/src/__tests__/helper${index}.ts`;
		case "development-root:tools":
			return `tools/bench/src/x${index}.ts`;
		case "outside-production-roots":
			return `docs/page${index}.md`;
		case "test-runner-config:vitest.config.ts":
			return `layers/v${index}/vitest.config.ts`;
		case "test-runner-config:playwright.config.ts":
			return `layers/p${index}/playwright.config.ts`;
		case "test-runner-config:playwright.*.config.ts":
			return `layers/q${index}/playwright.lane${index}.config.ts`;
		case "default-production":
			return `layers/a/src/mod${index}.ts`;
		default:
			throw new Error(
				`no sample path for pattern "${patternId}" — add one when a pattern is added`,
			);
	}
}

// ---------------------------------------------------------------------------

describe("AU28 classifyFile — the settled production/development rule", () => {
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
		["scripts/typecheck-gate.ts", "outside-production-roots"],
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

describe("AU28 step 2 — classification by ROLE ROOT", () => {
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

describe("AU28 clause precedence — declared, not incidental", () => {
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

	it("declares a floor of at least 1 for every pattern", () => {
		for (const pattern of CLASSIFICATION_PATTERNS)
			expect(pattern.minFiles).toBeGreaterThanOrEqual(1);
	});
});

describe("AU28 buildCensus — totality and injection", () => {
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

describe("AU28 pattern-live — no classification pattern may go dead", () => {
	it("reports a pattern that has stopped matching", () => {
		const census = buildCensus({ files: ["layers/a/src/x.ts"], readFile: () => "" });
		const findings = patternLive.evaluate(census);
		const reported = findings.map((f) => f.message).join("\n");
		expect(reported).toContain("dunder-segment");
		expect(reported).toContain("development-root:tools");
		expect(findings.every((f) => f.severity === "error")).toBe(true);
	});

	/**
	 * W-TEST-1. What was here before mapped every `minFiles` to 0, then asserted a count was `>= 0`.
	 * It never called `patternLive.evaluate` — the rule could have been deleted and it stayed green.
	 * A test that cannot fail is worse than no test, because it occupies the slot where the real one
	 * would go. These two call the thing.
	 */
	it("stays silent when every pattern clears its floor", () => {
		// A synthetic tree sized to satisfy every declared floor at once. Building it from the
		// patterns themselves is what keeps this honest when a floor moves.
		const files = CLASSIFICATION_PATTERNS.flatMap((pattern) =>
			Array.from({ length: pattern.minFiles }, (_, i) => samplePathFor(pattern.id, i)),
		);
		const census = buildCensus({ files, readFile: () => "" });

		const uncovered = CLASSIFICATION_PATTERNS.filter(
			(p) => (census.patternCounts.get(p.id) ?? 0) < p.minFiles,
		).map((p) => `${p.id}: ${census.patternCounts.get(p.id) ?? 0} < ${p.minFiles}`);
		expect(uncovered, "the synthetic tree must actually populate every pattern").toEqual([]);

		expect(patternLive.evaluate(census)).toEqual([]);
	});

	it("reports exactly the pattern whose population drops by one", () => {
		const shortId = "spec-suffix";
		const files = CLASSIFICATION_PATTERNS.flatMap((pattern) =>
			Array.from({ length: pattern.minFiles - (pattern.id === shortId ? 1 : 0) }, (_, i) =>
				samplePathFor(pattern.id, i),
			),
		);
		const findings = patternLive.evaluate(buildCensus({ files, readFile: () => "" }));
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain(`"${shortId}"`);
		expect(findings[0]?.severity).toBe("error");
	});
});

describe("AU28 floors-tight — a floor with too much slack has stopped measuring", () => {
	const record = (live: number, floor: number, floorKind: "magnitude" | "existence") => ({
		id: "detector:pretend",
		live,
		floor,
		floorKind,
	});

	it.each([
		// live, floor, expected — the three states of the band, their boundaries, and the `max(…, 5)`
		// term at small n. Allowed slack at 1000 live is 200; the warning starts at three quarters of it.
		[1000, 900, "ok"],
		[1000, 850, "ok"],
		[1000, 849, "approaching"],
		[1000, 800, "approaching"],
		[1000, 799, "slack"],
		[1000, 1000, "ok"],
		[1000, 1001, "below"],
		// 20% of 11 is 3, below the floor-5 term. Allowed 5, so the warning starts past 4 of slack.
		[11, 8, "ok"],
		[11, 7, "ok"],
		[11, 6, "approaching"],
		[11, 5, "slack"],
		// 20% of 100 is 20, above the floor-5 term, so the percentage governs. Warning past 15 of slack.
		[100, 86, "ok"],
		[100, 85, "ok"],
		[100, 84, "approaching"],
		[100, 80, "approaching"],
		[100, 79, "slack"],
	])("live %i against a floor of %i is %s", (live, floor, expected) => {
		expect(floorVerdict(record(live, floor, "magnitude")).sort).toBe(expected);
	});

	it("names the MIDDLE of the band to write, never its edge", () => {
		// The edge is 800. A floor written there is one added file from red, and the error it fails with
		// says "raise the floor" — which is the reflex the band exists to prevent.
		const verdict = floorVerdict(record(1000, 500, "magnitude"));
		expect(verdict.sort).toBe("slack");
		if (verdict.sort !== "slack") expect.unreachable("expected a slack verdict");
		else expect(verdict.suggested).toBe(900);
		expect(suggestedFloor(1000)).toBe(900);
	});

	it("warns before it errors, and the warning names the command that prints the value to write", () => {
		const verdict = floorVerdict(record(1000, 800, "magnitude"));
		expect(verdict.sort).toBe("approaching");
		if (verdict.sort !== "approaching") expect.unreachable("expected an approaching verdict");
		expect(verdict.suggested).toBe(900);
		expect(verdict.message).toContain("npm run governance:floors");
	});

	it("exempts an existence floor from the band, but never from the floor itself", () => {
		// An existence pattern is a check over a closed list against many live files. Without the
		// exemption the band would demand a nonsensical floor on what only has to fail when an entry dies.
		expect(floorVerdict(record(94, 1, "existence")).sort).toBe("ok");
		expect(floorVerdict(record(0, 1, "existence")).sort).toBe("below");
	});

	it("does not let `floorKind` be used to dodge — a MAGNITUDE floor of 1 is still slack", () => {
		expect(floorVerdict(record(94, 1, "magnitude")).sort).toBe("slack");
	});

	it("computes the allowed slack as the larger of 20% and 5", () => {
		expect(allowedSlack(11)).toBe(5);
		expect(allowedSlack(1000)).toBe(200);
		expect(allowedSlack(3300)).toBe(660);
	});

	it("errors on a drifted floor, warns on one approaching the edge, and stays silent otherwise", () => {
		const census = buildCensus({ files: ["layers/a/src/x.ts"], readFile: () => "" });
		const floors = [
			{ ...record(1000, 900, "magnitude"), id: "detector:mid-band" },
			{ ...record(1000, 810, "magnitude"), id: "detector:on-the-edge" },
			{ ...record(1000, 400, "magnitude"), id: "detector:loose" },
		];
		const rule = floorsTight({
			floors: [
				...floors,
				...Array.from({ length: 17 }, (_, i) => ({
					...record(100, 95, "magnitude"),
					id: `pad-${i}`,
				})),
			],
		});
		const findings = rule.evaluate(census);
		expect(findings).toHaveLength(2);
		const errors = findings.filter((f) => f.severity === "error");
		const warnings = findings.filter((f) => f.severity === "warn");
		expect(errors).toHaveLength(1);
		expect(errors[0]?.message).toContain("detector:loose");
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.message).toContain("detector:on-the-edge");
	});

	it("a floor written at the value the tool prints survives ordinary growth", () => {
		// The regression this band exists for: recompute to the suggestion, add a file, stay green.
		const live = 3300;
		const floor = suggestedFloor(live);
		expect(floorVerdict({ id: "census:pretend", live, floor, floorKind: "magnitude" }).sort).toBe(
			"ok",
		);
		expect(
			floorVerdict({ id: "census:pretend", live: live + 1, floor, floorKind: "magnitude" }).sort,
		).toBe("ok");
	});

	it("is a dead rule when the floor set it checks has been gutted", () => {
		const census = buildCensus({ files: ["layers/a/src/x.ts"], readFile: () => "" });
		expect(() =>
			runRules([floorsTight({ floors: [record(100, 85, "magnitude")] })], census),
		).toThrow(DeadRuleError);
	});
});

describe("AU28 classification-total", () => {
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

describe("AU28 misplacement-ledger — shrink-only, in both directions", () => {
	const REASON = "a preview surface pinned to a production path until the real route lands";
	const TREE = [
		"layers/a/src/one.ts",
		"layers/a/src/two.ts",
		"layers/a/src/three.ts",
		"layers/a/src/four.test.ts",
	];
	const census = () => buildCensus({ files: TREE, readFile: () => "" });
	const ledger = (resolvedFiles: number, files: Record<string, string>): MisplacedFiles => ({
		misplacedFiles: true,
		note: "",
		resolvedFiles,
		files,
	});
	const both = { "layers/a/src/one.ts": REASON, "layers/a/src/two.ts": REASON };
	const errors = (l: MisplacedFiles): string[] =>
		misplacementLedger(l)
			.evaluate(census())
			.filter((f) => f.severity === "error")
			.map((f) => f.message);

	it("reports every entry as a warning on every run", () => {
		const findings = misplacementLedger(ledger(2, both)).evaluate(census());
		expect(findings.filter((f) => f.severity === "warn").map((f) => f.path)).toEqual([
			"layers/a/src/one.ts",
			"layers/a/src/two.ts",
		]);
	});

	it("is clean when the live count matches the committed one", () => {
		expect(errors(ledger(2, both))).toHaveLength(0);
	});

	it("fails when the ledger GROWS past its committed count", () => {
		const grown = errors(ledger(2, { ...both, "layers/a/src/three.ts": REASON }));
		expect(grown.join("\n")).toContain("may only shrink");
	});

	it("fails when a misplacement is cleared and the shrink is not committed", () => {
		const shrunk = errors(ledger(2, { "layers/a/src/one.ts": REASON }));
		expect(shrunk.join("\n")).toContain("without committing the shrink");
	});

	it("fails when an entry no longer resolves to a tracked file", () => {
		const gone = errors(ledger(2, { ...both, "layers/a/src/renamed.ts": REASON }));
		expect(gone.join("\n")).toContain("is not a tracked file");
	});

	it("fails when the classifier already calls a ledgered file development", () => {
		const moved = errors(
			ledger(2, { "layers/a/src/one.ts": REASON, "layers/a/src/four.test.ts": REASON }),
		);
		expect(moved.join("\n")).toContain("calls it development");
	});

	it("fails when an entry carries no real reason", () => {
		expect(
			errors(ledger(2, { "layers/a/src/one.ts": REASON, "layers/a/src/two.ts": "later" })).join(
				"\n",
			),
		).toContain("no real reason");
	});

	it("is dead when nothing resolves — an emptied ledger is deleted, not left registered", () => {
		const rule = misplacementLedger(ledger(0, {}));
		expect(() => runRules([rule], census())).toThrow(DeadRuleError);
	});
});

describe("AU28 --fixtures self-test — the detector proves itself on a synthetic tree", () => {
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
