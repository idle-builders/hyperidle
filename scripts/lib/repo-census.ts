/**
 * AU28 step 1 — the repository census.
 *
 * ONE CENSUS, MANY RULES. This module is the single pass that (a) classifies every tracked file as
 * production or development and (b) resolves every import edge between tracked files. Governance
 * rules are declarative predicates over the result; they never scan for themselves.
 *
 * @lore AU28: this module performs NO I/O. The file list and a `readFile` function are injected.
 * That is not a testability nicety — it is the structural reason a rule cannot quietly acquire its
 * own discovery, and the reason every unit test runs against a synthetic tree rather than the live
 * repo. The CLI (`scripts/governance-lint.ts`) is the only place allowed to call `git ls-files` and
 * `node:fs`.
 *
 * @lore AU28: module resolution deliberately resolves ONLY into the injected file set. A specifier
 * that lands outside it (node_modules, a generated `dist/` artifact, a gitignored file) yields no
 * edge. Consequence: the census can never assert something about a file it does not also classify.
 */

import ts from "typescript";

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type FileKind = "production" | "development";

export type ClassificationClause =
	| "dunder-segment"
	| "stories-suffix"
	| "development-package"
	| "outside-packages"
	| "test-runner-config"
	| "default-production";

/**
 * A single classification pattern.
 *
 * @lore AU28: every pattern carries its OWN `minFiles` floor, not just every clause. The old guard
 * set died of dead sub-patterns hiding inside live clauses — `au6`'s `ALLOWED_DIRECT_CONSUMER_IMPORTS`
 * sat empty inside a guard that reported PASS, and the AU28 plan's own `vitest.*.config.ts`
 * sub-pattern matched zero files while its clause matched 35. A per-clause floor cannot see either.
 */
export interface ClassificationPattern {
	/** Unique, stable id. Reported verbatim when the floor is breached. */
	readonly id: string;
	readonly clause: ClassificationClause;
	readonly kind: FileKind;
	/** Human-readable statement of the rule this pattern encodes. */
	readonly description: string;
	/** Minimum number of tracked files this pattern must match. Below it, the guard hard-fails. */
	readonly minFiles: number;
	readonly matches: (repoRelativePath: string) => boolean;
}

/**
 * The three wholly-development packages, named by directory under `packages/`.
 *
 * @lore AU28: Ruling 5 says a package's ROLE never derives from its path. This is not a role — it is
 * a file KIND, and Ruling 8.3 settles that file kind must come from path or name because there is no
 * per-file manifest. The safeguard Ruling 8.3 demands is that the set be closed and enumerated, which
 * it is, and that a dead entry fail loudly, which the per-entry floors below do. Ruling 9 expects this
 * list to delete itself at step 2, when these packages move under `tools/`.
 */
export const DEVELOPMENT_PACKAGE_DIRS = ["eval", "eslint-plugin-authz", "eslint-plugin-design"] as const;

/**
 * Test-runner config filenames.
 *
 * @lore AU28: these files are development by nature but are pinned to a production path by the test
 * runner's own discovery convention (vitest and playwright look at the package root, and the root
 * `vitest.config.ts` `projects` array resolves each project by directory). Same shape of exception as
 * `.stories.tsx`, which is pinned beside its component by the TSX-first ruling. Matched on basename
 * alone: a file called `vitest.config.ts` is a runner config wherever it sits.
 *
 * `vitest.*.config.ts` is deliberately ABSENT. It matches zero files under `packages/` — the only one
 * in the repo is the root `vitest.integration.config.ts`, already development for sitting outside
 * `packages/`. A pattern that matches nothing is the defect this whole design exists to prevent.
 */
export const TEST_RUNNER_CONFIG_BASENAMES = ["vitest.config.ts", "playwright.config.ts"] as const;

const basename = (p: string): string => {
	const i = p.lastIndexOf("/");
	return i === -1 ? p : p.slice(i + 1);
};

const hasDunderSegment = (p: string): boolean => p.split("/").some((seg) => seg.startsWith("__"));

/**
 * THE CLAUSE PRECEDENCE, STATED. Array order IS precedence: `classifyFile` returns the first pattern
 * that matches. The order is Ruling 9's own clause listing, read literally:
 *
 *   1. a path segment starts with `__`
 *   2. the filename ends `.stories.tsx`
 *   3. it belongs to a wholly-development package
 *   4. it sits outside `packages/`
 *   5. it is a test-runner config
 *   6. otherwise production
 *
 * @lore AU28: the precedence is load-bearing, not cosmetic. The per-pattern counts — and therefore
 * every floor below — change with the order, and the AU28 architecture critique showed that a plan
 * which states floors without stating the order produces a guard that hard-fails on a correct
 * implementation. The floors here were measured under THIS order and are meaningless under another.
 */
export const CLASSIFICATION_PATTERNS: readonly ClassificationPattern[] = [
	{
		id: "dunder-segment",
		clause: "dunder-segment",
		kind: "development",
		description: "any path segment starting with `__` marks the file development",
		minFiles: 700,
		matches: hasDunderSegment,
	},
	{
		id: "stories-suffix",
		clause: "stories-suffix",
		kind: "development",
		description: "a `.stories.tsx` file is a design artifact, pinned beside its component",
		minFiles: 100,
		matches: (p) => p.endsWith(".stories.tsx"),
	},
	...DEVELOPMENT_PACKAGE_DIRS.map(
		(dir): ClassificationPattern => ({
			id: `development-package:${dir}`,
			clause: "development-package",
			kind: "development",
			description: `every file in the wholly-development package \`packages/${dir}\``,
			minFiles: 1,
			matches: (p) => p.startsWith(`packages/${dir}/`),
		}),
	),
	{
		id: "outside-packages",
		clause: "outside-packages",
		kind: "development",
		description: "anything outside `packages/` is repo tooling, docs or pipeline state",
		minFiles: 800,
		matches: (p) => !p.startsWith("packages/"),
	},
	...TEST_RUNNER_CONFIG_BASENAMES.map(
		(name): ClassificationPattern => ({
			id: `test-runner-config:${name}`,
			clause: "test-runner-config",
			kind: "development",
			description: `\`${name}\` — pinned to a production path by the runner's own discovery`,
			minFiles: 1,
			matches: (p) => basename(p) === name,
		}),
	),
	{
		id: "test-runner-config:playwright.*.config.ts",
		clause: "test-runner-config",
		kind: "development",
		description: "`playwright.<lane>.config.ts` — the per-lane playwright configs",
		minFiles: 1,
		matches: (p) => {
			const b = basename(p);
			return b.startsWith("playwright.") && b.endsWith(".config.ts") && b !== "playwright.config.ts";
		},
	},
	{
		id: "default-production",
		clause: "default-production",
		kind: "production",
		description: "everything else — shipping code",
		minFiles: 700,
		matches: () => true,
	},
];

export interface FileRecord {
	/** Repo-relative, forward slashes. */
	readonly path: string;
	readonly kind: FileKind;
	readonly clause: ClassificationClause;
	/** The id of the pattern that decided it. */
	readonly patternId: string;
}

/**
 * The classifier. TOTAL: every path returns a record, because the last pattern matches everything.
 */
export function classifyFile(repoRelativePath: string): FileRecord {
	for (const pattern of CLASSIFICATION_PATTERNS) {
		if (pattern.matches(repoRelativePath)) {
			return {
				path: repoRelativePath,
				kind: pattern.kind,
				clause: pattern.clause,
				patternId: pattern.id,
			};
		}
	}
	// Unreachable: `default-production` matches unconditionally. Kept as a build error rather than a
	// silent `production` default — an unclassifiable file must make noise, not a guess.
	throw new Error(
		`repo-census: no classification pattern matched ${repoRelativePath}. ` +
			`CLASSIFICATION_PATTERNS must end with an unconditional default.`,
	);
}

// ---------------------------------------------------------------------------
// Import edges
// ---------------------------------------------------------------------------

export interface ImportEdge {
	/** Repo-relative path of the importing file. */
	readonly from: string;
	/** 1-based line of the import statement. */
	readonly line: number;
	/** The specifier exactly as written in the source. */
	readonly specifier: string;
	/** Repo-relative path of the resolved target — always a member of the census file set. */
	readonly to: string;
}

export interface Census {
	readonly files: readonly FileRecord[];
	readonly byPath: ReadonlyMap<string, FileRecord>;
	readonly edges: readonly ImportEdge[];
	/** Count of files decided by each pattern id. Every pattern id is present, even at zero. */
	readonly patternCounts: ReadonlyMap<string, number>;
}

const PARSEABLE = /\.(?:m|c)?[jt]sx?$/;

const dirnameOf = (p: string): string => {
	const i = p.lastIndexOf("/");
	return i === -1 ? "" : p.slice(0, i);
};

/** Pure posix-ish join that collapses `.` and `..`. No `node:path`. */
function joinPosix(base: string, rel: string): string {
	const out: string[] = base === "" ? [] : base.split("/");
	for (const seg of rel.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") out.pop();
		else out.push(seg);
	}
	return out.join("/");
}

/**
 * Candidate expansion for a resolved module base path.
 *
 * @lore AU28: TypeScript source imports its siblings with a `.js` extension that no `.js` file
 * satisfies. Resolution therefore has to try the `.ts`/`.tsx` twin of every `.js` specifier — get
 * this wrong and the whole edge set silently empties, which is exactly how a guard goes green by
 * blindness.
 */
function candidatesFor(base: string): string[] {
	const out: string[] = [base];
	const swap = (from: string, to: readonly string[]) => {
		if (!base.endsWith(from)) return;
		const stem = base.slice(0, -from.length);
		for (const ext of to) out.push(stem + ext);
	};
	swap(".js", [".ts", ".tsx", ".d.ts"]);
	swap(".jsx", [".tsx"]);
	swap(".mjs", [".mts"]);
	swap(".cjs", [".cts"]);
	for (const ext of [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx", ".json", ".css"]) {
		out.push(base + ext);
	}
	for (const ext of ["index.ts", "index.tsx", "index.js", "index.mjs"]) {
		out.push(`${base}/${ext}`);
	}
	return out;
}

type ExportsField = string | { readonly [key: string]: ExportsField } | null | undefined;

/** Pick a target path out of an `exports` condition value. */
function pickCondition(value: ExportsField): string | null {
	if (typeof value === "string") return value;
	if (value === null || value === undefined) return null;
	for (const key of ["import", "module", "default", "types", "require"]) {
		const inner = value[key];
		if (inner !== undefined) {
			const picked = pickCondition(inner);
			if (picked !== null) return picked;
		}
	}
	return null;
}

interface PackageEntry {
	readonly name: string;
	/** Repo-relative directory of the package. */
	readonly dir: string;
	readonly exports: ExportsField;
	readonly main: string | undefined;
}

function readPackageIndex(files: readonly string[], readFile: (p: string) => string): PackageEntry[] {
	const entries: PackageEntry[] = [];
	for (const file of files) {
		if (basename(file) !== "package.json") continue;
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(readFile(file)) as Record<string, unknown>;
		} catch {
			continue;
		}
		const name = parsed.name;
		if (typeof name !== "string" || name === "") continue;
		entries.push({
			name,
			dir: dirnameOf(file),
			exports: parsed.exports as ExportsField,
			main: typeof parsed.main === "string" ? parsed.main : undefined,
		});
	}
	// Longest name first so `@hyperidle/db` never shadows a hypothetical `@hyperidle/db-extra`.
	return entries.sort((a, b) => b.name.length - a.name.length);
}

function resolvePackageSpecifier(spec: string, packages: readonly PackageEntry[]): string | null {
	for (const pkg of packages) {
		if (spec !== pkg.name && !spec.startsWith(`${pkg.name}/`)) continue;
		const rest = spec === pkg.name ? "." : `./${spec.slice(pkg.name.length + 1)}`;
		const exp = pkg.exports;
		if (exp !== null && exp !== undefined && typeof exp === "object") {
			const direct = exp[rest];
			if (direct !== undefined) {
				const target = pickCondition(direct);
				if (target !== null) return joinPosix(pkg.dir, target);
			}
			// Minimal wildcard support: `"./x/*": "./src/x/*.ts"`.
			for (const [key, value] of Object.entries(exp)) {
				if (!key.includes("*")) continue;
				const [prefix, suffix = ""] = key.split("*");
				if (prefix === undefined) continue;
				if (!rest.startsWith(prefix) || !rest.endsWith(suffix)) continue;
				const star = rest.slice(prefix.length, rest.length - suffix.length);
				const target = pickCondition(value);
				if (target !== null) return joinPosix(pkg.dir, target.replace("*", star));
			}
			return null;
		}
		if (typeof exp === "string") return rest === "." ? joinPosix(pkg.dir, exp) : null;
		// No `exports` map: fall back to `main` for the root, plain subpath otherwise.
		if (rest === ".") return joinPosix(pkg.dir, pkg.main ?? "index.js");
		return joinPosix(pkg.dir, rest);
	}
	return null;
}

interface RawSpecifier {
	readonly specifier: string;
	readonly line: number;
}

/**
 * Collect every module specifier in a source file via the TypeScript AST.
 *
 * @lore AU28: AST, never regex. `ts.isImportDeclaration` / `isExportDeclaration` /
 * `isImportEqualsDeclaration` / dynamic `import()` / `require()` cover multi-line, aliased, namespace,
 * type-only, mixed and re-export forms BY CONSTRUCTION. The retired `demo-fixture-guard` shipped a
 * regex that matched `../demo-fixture` but not `./demo-fixture` — the form every sibling used — and
 * was "green by blindness" for a whole track.
 */
export function collectSpecifiers(filePath: string, source: string): RawSpecifier[] {
	const scriptKind = filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
	const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
	const out: RawSpecifier[] = [];

	const push = (node: ts.Node, literal: ts.Node | undefined): void => {
		if (literal === undefined || !ts.isStringLiteralLike(literal)) return;
		out.push({
			specifier: literal.text,
			line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
		});
	};

	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node)) push(node, node.moduleSpecifier);
		else if (ts.isExportDeclaration(node)) push(node, node.moduleSpecifier);
		else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
			push(node, node.moduleReference.expression);
		} else if (ts.isCallExpression(node)) {
			const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
			const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
			if (isDynamicImport || isRequire) push(node, node.arguments[0]);
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return out;
}

export interface CensusInput {
	/** Repo-relative paths, forward slashes. The authoritative file set — nothing else is known. */
	readonly files: readonly string[];
	readonly readFile: (repoRelativePath: string) => string;
}

/** Builds the census from an injected file list + reader. No fs, no git, no glob. */
export function buildCensus(input: CensusInput): Census {
	const files = input.files.map(classifyFile);
	const byPath = new Map(files.map((f) => [f.path, f]));

	const patternCounts = new Map<string, number>(CLASSIFICATION_PATTERNS.map((p) => [p.id, 0]));
	for (const record of files) {
		patternCounts.set(record.patternId, (patternCounts.get(record.patternId) ?? 0) + 1);
	}

	const packages = readPackageIndex(input.files, input.readFile);
	const edges: ImportEdge[] = [];

	const resolve = (from: string, spec: string): string | null => {
		const base = spec.startsWith(".") ? joinPosix(dirnameOf(from), spec) : resolvePackageSpecifier(spec, packages);
		if (base === null) return null;
		for (const candidate of candidatesFor(base)) {
			if (byPath.has(candidate)) return candidate;
		}
		return null;
	};

	for (const record of files) {
		if (!PARSEABLE.test(record.path)) continue;
		let source: string;
		try {
			source = input.readFile(record.path);
		} catch {
			continue;
		}
		for (const raw of collectSpecifiers(record.path, source)) {
			const to = resolve(record.path, raw.specifier);
			if (to === null || to === record.path) continue;
			edges.push({ from: record.path, line: raw.line, specifier: raw.specifier, to });
		}
	}

	return { files, byPath, edges, patternCounts };
}
