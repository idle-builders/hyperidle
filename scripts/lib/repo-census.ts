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
	| "stories-suffix"
	| "test-suffix"
	| "spec-suffix"
	| "dunder-segment"
	| "development-root"
	| "outside-production-roots"
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
 * The role roots that hold SHIPPING code. Everything under one of these is production unless a name
 * clause says otherwise; everything not under one of them is development.
 *
 * @lore AU28 step 2: this is the whole classification-by-location rule now — three production roots
 * and one development root (`tools/`), replacing "under `packages/`" plus a hand-maintained
 * three-entry list of wholly-development package directories. Ruling 9 predicted that list would
 * delete itself when `eval` / `eslint-plugin-authz` / `eslint-plugin-design` moved into `tools/`, and
 * it has: the roots ARE the statement. `deploy/` (chart, homebrew, bin) is deliberately absent from
 * both lists — it is neither shipping source nor a package, so it falls to
 * `outside-production-roots` exactly like `scripts/`, `docs/` and the repo-root files do.
 *
 * @lore AU28: Ruling 5 says a package's ROLE never derives from its path. This is not a role — it is
 * a file KIND, and Ruling 8.3 settles that file kind must come from path or name because there is no
 * per-file manifest. The safeguard Ruling 8.3 demands is that the set be closed and enumerated, which
 * it is, and that a dead root fail loudly, which the floors below do.
 */
export const PRODUCTION_ROOTS = ["layers", "framework", "applications"] as const;

/**
 * The role roots that are wholly development. One entry, one clause.
 */
export const DEVELOPMENT_ROOTS = ["tools"] as const;

/**
 * Test-runner config filenames.
 *
 * @lore AU28: these files are development by nature but are pinned to a production path by the test
 * runner's own discovery convention (vitest and playwright look at the package root, and the root
 * `vitest.config.ts` `projects` array resolves each project by directory). Same shape of exception as
 * `.stories.tsx`, which is pinned beside its component by the TSX-first ruling. Matched on basename
 * alone: a file called `vitest.config.ts` is a runner config wherever it sits.
 *
 * `vitest.*.config.ts` is deliberately ABSENT. It matches zero files under a production root — the
 * only one in the repo is the root `vitest.integration.config.ts`, already development for sitting
 * outside them. A pattern that matches nothing is the defect this whole design exists to prevent.
 */
export const TEST_RUNNER_CONFIG_BASENAMES = ["vitest.config.ts", "playwright.config.ts"] as const;

const basename = (p: string): string => {
	const i = p.lastIndexOf("/");
	return i === -1 ? p : p.slice(i + 1);
};

const hasDunderSegment = (p: string): boolean => p.split("/").some((seg) => seg.startsWith("__"));

/**
 * MECHANISM 1 — a file whose NAME declares it development is development, wherever it sits.
 *
 * @lore AU28 (Ruling 9, two-mechanism refinement): the original rule had one explicit name clause
 * (`.stories.tsx`) and caught `.test.ts` only by the coincidence that tests happen to live in
 * `__tests__/` folders. That is not a rule, it is luck, and it breaks the moment a development file
 * legitimately sits beside production code — which is already decided for eval case files. So the
 * classification has exactly two mechanisms and both are explicit: a name-declared FILE (this table)
 * and a name-declared FOLDER (`__`, below). Nothing is classified by accident.
 *
 * `.eval.ts(x)` is deliberately ABSENT. Zero such files exist today, so the clause would match nothing
 * and `pattern-live` would hard-fail on arrival. It gets added by the first eval that lands beside
 * production code — a pattern that matches nothing is the defect this whole design exists to prevent.
 */
const NAME_DECLARED_SUFFIXES: readonly {
	readonly clause: Extract<ClassificationClause, "stories-suffix" | "test-suffix" | "spec-suffix">;
	readonly suffixes: readonly string[];
	readonly description: string;
	readonly minFiles: number;
}[] = [
	{
		clause: "stories-suffix",
		suffixes: [".stories.tsx"],
		description: "a `.stories.tsx` file is a design artifact, pinned beside its component",
		minFiles: 125,
	},
	{
		clause: "test-suffix",
		suffixes: [".test.ts", ".test.tsx"],
		description: "a `.test.ts(x)` file is a test — including the `.integration.test.ts` form",
		minFiles: 800,
	},
	{
		clause: "spec-suffix",
		suffixes: [".spec.ts", ".spec.tsx"],
		description: "a `.spec.ts(x)` file is a Playwright end-to-end spec",
		minFiles: 75,
	},
];

/**
 * THE CLAUSE PRECEDENCE, STATED. Array order IS precedence: `classifyFile` returns the first pattern
 * that matches. Ruling 9's clause listing, with the name-declared FILE mechanism ahead of the
 * name-declared FOLDER mechanism:
 *
 *   1. the filename declares it development — `.stories.tsx`, `.test.ts(x)`, `.spec.ts(x)`
 *   2. a path segment starts with `__`
 *   3. it sits under a wholly-development role root (`tools/`)
 *   4. it sits outside the production role roots (`layers/`, `framework/`, `applications/`)
 *   5. it is a test-runner config
 *   6. otherwise production
 *
 * @lore AU28: the precedence is load-bearing, not cosmetic. The per-pattern counts — and therefore
 * every floor below — change with the order, and the AU28 architecture critique showed that a plan
 * which states floors without stating the order produces a guard that hard-fails on a correct
 * implementation. The floors here were measured under THIS order and are meaningless under another.
 *
 * @lore AU28: suffix-before-dunder specifically. Almost every `.test.ts` in the repo also sits under
 * `__tests__/`. Put `dunder-segment` first and the folder clause claims all of them, leaving
 * `test-suffix` matching zero files — which `pattern-live` correctly rejects as a dead rule. Suffix
 * first is also the more specific signal, so it is the right precedence on the merits, not a
 * workaround. The reorder moved ~958 files from `dunder-segment` into the suffix clauses; it changed
 * WHICH clause claims a file, never WHETHER the file is development.
 *
 * @lore AU28: the floors are RECOMPUTED against the live tree whenever the tree moves under them, and
 * the recompute is part of the merge, not a follow-up. Rebasing onto AU26 + AU27 changed 632 files and
 * every magnitude below with it. A floor left at its pre-merge value is the precise rot these floors
 * exist to catch — it still passes, so nobody notices it has stopped measuring anything.
 *
 * Measured on the tree this commit produces (3,256 tracked / 789 production / 2,467 development):
 *   stories-suffix 144 · test-suffix 892 · spec-suffix 87 · dunder-segment 152 ·
 *   development-root:tools 94 · outside-production-roots 1,064 ·
 *   test-runner-config 30 + 1 + 3 · default-production 789.
 * Each magnitude floor sits at ~87-90% of its real count — tight enough that losing a package's worth
 * of files trips it, loose enough that ordinary churn does not. The enumerated-set patterns
 * (`development-root:*`, `test-runner-config:*`) stay at 1 on purpose: they are existence checks
 * over a closed list, and their job is to fail when an ENTRY dies, not when a count dips.
 *
 * @lore AU28 step 2: the role-folder move (`packages/` → `layers/` + `framework/` + `applications/` +
 * `tools/`, and root-level `bin`/`chart`/`homebrew` → `deploy/`) left EVERY number above unchanged —
 * 3,256 / 789 / 2,467, and each magnitude count identical to the digit. The only shift is which
 * pattern id owns a file: `development-package:{eval,eslint-plugin-authz,eslint-plugin-design}`
 * (41 + 7 + 46) collapsed into the single `development-root:tools` (94), and `outside-packages`
 * became `outside-production-roots` at the same 1,064. That the totals are invariant under the move
 * is the proof the rewrite re-expressed the rule rather than changing it.
 */
export const CLASSIFICATION_PATTERNS: readonly ClassificationPattern[] = [
	...NAME_DECLARED_SUFFIXES.map(
		({ clause, suffixes, description, minFiles }): ClassificationPattern => ({
			id: clause,
			clause,
			kind: "development",
			description,
			minFiles,
			matches: (p) => suffixes.some((s) => p.endsWith(s)),
		}),
	),
	{
		id: "dunder-segment",
		clause: "dunder-segment",
		kind: "development",
		description: "any path segment starting with `__` marks the file development",
		minFiles: 135,
		matches: hasDunderSegment,
	},
	...DEVELOPMENT_ROOTS.map(
		(root): ClassificationPattern => ({
			id: `development-root:${root}`,
			clause: "development-root",
			kind: "development",
			description: `every file under the wholly-development role root \`${root}/\``,
			minFiles: 1,
			matches: (p) => p.startsWith(`${root}/`),
		}),
	),
	{
		id: "outside-production-roots",
		clause: "outside-production-roots",
		kind: "development",
		description: `anything outside the production role roots (${PRODUCTION_ROOTS.map((r) => `\`${r}/\``).join(", ")}) is repo tooling, deployment assets, docs or pipeline state`,
		minFiles: 950,
		matches: (p) => !PRODUCTION_ROOTS.some((root) => p.startsWith(`${root}/`)),
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
	/** Every workspace package with its manifest-declared role. Empty when no role rules were given. */
	readonly packages: readonly WorkspacePackage[];
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

/**
 * A workspace package with the role the workspace declaration gives it.
 *
 * @lore AU28 Ruling 5: a package's role is NEVER read off its directory path. It comes from which
 * `workspaces` glob in the root manifest claims it — `layers/*` declares a layer, `layers/*\/*`
 * declares a service inside that layer. Matching the path directly is the tempting shortcut and it
 * silently mis-roles the first package that lands somewhere new.
 */
export interface WorkspacePackage {
	/** Unscoped name — how the governance registries and the census key a package. */
	readonly name: string;
	/** The full name from the manifest, e.g. `@hyperidle/work`. */
	readonly scopedName: string;
	readonly dir: string;
	readonly role: PackageRole;
	/** The layer this package lives in. A layer lives in itself; a framework package lives nowhere. */
	readonly layer: string | undefined;
}

export type PackageRole = "layer" | "service" | "framework" | "application" | "tooling" | "deployment";

/** Glob depth per role: `layers/*` is one segment under `layers`, `layers/*\/*` is two. */
export interface WorkspaceRoleRule {
	readonly pattern: string;
	readonly role: PackageRole;
}

/**
 * Turns a `workspaces` glob into (root, depth), where depth is the number of path segments a package
 * directory must have to match. `layers/*` is depth 2 (`layers/core-api`); `layers/*\/*` is depth 3.
 * Only `*` segments are supported — that is all npm uses here, and a glob shape this code does not
 * understand must fail loudly rather than silently claim the wrong packages.
 */
const globShape = (pattern: string): { root: string; depth: number } => {
	const segments = pattern.split("/");
	for (const segment of segments.slice(1)) {
		if (segment !== "*") throw new Error(`repo-census: workspace glob "${pattern}" is not of the form root/*[/*]`);
	}
	return { root: segments[0] ?? "", depth: segments.length };
};

/**
 * Every workspace package, with its manifest-declared role.
 *
 * @param roleRules maps a `workspaces` glob to the role it declares — from
 * `governance/architecture.json`, so adding a role folder is a registry edit, not a code edit.
 * @throws when a manifest sits in the tree but no glob claims it, or when a glob claims nothing.
 * A role that matches zero packages is the `au6` failure mode: it reads as clean forever.
 */
export function readWorkspacePackages(
	files: readonly string[],
	readFile: (p: string) => string,
	roleRules: readonly WorkspaceRoleRule[],
): readonly WorkspacePackage[] {
	if (roleRules.length === 0) throw new Error("repo-census: no workspace role rules — nothing could be assigned a role.");

	const shapes = roleRules.map((r) => ({ ...r, ...globShape(r.pattern) }));
	// Deepest glob first: `layers/*\/*` must claim a service before `layers/*` sees it.
	shapes.sort((a, b) => b.depth - a.depth);

	const out: WorkspacePackage[] = [];
	const unclaimed: string[] = [];
	const matched = new Map<string, number>(roleRules.map((r) => [r.pattern, 0]));

	for (const file of files) {
		if (basename(file) !== "package.json") continue;
		const dir = dirnameOf(file);
		if (dir === "" || dir.includes("node_modules")) continue;
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(readFile(file)) as Record<string, unknown>;
		} catch {
			continue;
		}
		const scopedName = parsed.name;
		if (typeof scopedName !== "string" || scopedName === "") continue;

		const segments = dir.split("/");
		const shape = shapes.find((s) => segments[0] === s.root && segments.length === s.depth);
		if (shape === undefined) {
			unclaimed.push(dir);
			continue;
		}
		matched.set(shape.pattern, (matched.get(shape.pattern) ?? 0) + 1);
		out.push({
			name: segments[segments.length - 1] ?? scopedName,
			scopedName,
			dir,
			role: shape.role,
			layer: shape.role === "layer" ? segments[1] : shape.role === "service" ? segments[1] : undefined,
		});
	}

	if (unclaimed.length > 0) {
		throw new Error(
			`repo-census: ${unclaimed.length} workspace package(s) no role rule claims: ${unclaimed.join(", ")}. ` +
				"A package with no role cannot be governed — add the glob to governance/architecture.json.",
		);
	}
	const dead = [...matched].filter(([, n]) => n === 0).map(([p]) => p);
	if (dead.length > 0) {
		throw new Error(`repo-census: role rule(s) matched zero packages: ${dead.join(", ")}. A rule that claims nothing reads as clean forever.`);
	}
	return out;
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
	/**
	 * Maps a `workspaces` glob to the role it declares — from `governance/architecture.json`.
	 * Omit it and `census.packages` is empty; the rules that need roles then have nothing to stand on,
	 * which they must treat as a build error rather than a clean result.
	 */
	readonly roleRules?: readonly WorkspaceRoleRule[];
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

	const workspacePackages =
		input.roleRules === undefined ? [] : readWorkspacePackages(input.files, input.readFile, input.roleRules);

	return { files, byPath, edges, patternCounts, packages: workspacePackages };
}
