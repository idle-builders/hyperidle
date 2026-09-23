/**
 * AU28 — pure verdict for the import-vs-manifest gate.
 *
 * Every workspace package must declare exactly what it imports: no more, no less.
 *
 * @lore AU28: knip cannot enforce this. In its default (non-strict) mode
 * `DependencyDeputy.maybeAddReferencedExternalDependency` accepts an import when
 * (a) the name is declared by ANY ancestor workspace — the root manifest is an
 * ancestor of every package, so a root devDependency satisfies all 33 packages —
 * or (b) the name is a workspace package name and the importer is private, which
 * waves through every `@hyperidle/*` import unconditionally. Both escapes are
 * switched off only by `--strict`, and knip derives `isProduction` from `strict`
 * (`create-options.js`: `isProduction = options.isProduction ?? args.production ?? n`),
 * so strict mode drops every test/config file — which is where nearly all of the
 * divergence lives. There is no knip setting that keeps test files in scope while
 * turning the ancestor/workspace escapes off, hence this gate.
 *
 * The verdict is pure: the caller supplies the observed facts, this module decides.
 */

/** Which manifest section a dependency was declared in. */
export type DependencyField =
	| "dependencies"
	| "devDependencies"
	| "peerDependencies"
	| "optionalDependencies";

/** Everything the scanner observed about one workspace package. */
export interface PackageFacts {
	/** Manifest `name`. */
	readonly name: string;
	/** Repo-relative directory, e.g. `layers/core-api`. */
	readonly dir: string;
	/** Declared dependency name -> the section it was declared in. */
	readonly declared: ReadonlyMap<string, DependencyField>;
	/** Bare package names imported from this package's own files -> example sites. */
	readonly imported: ReadonlyMap<string, readonly string[]>;
	/** True when any file imports a `node:` builtin or references the `node` types. */
	readonly usesNodeBuiltins: boolean;
	/** Package names referenced from CSS (`@import` / `@plugin`). */
	readonly cssReferences: ReadonlySet<string>;
	/** Vitest `environment` values (config field and `@vitest-environment` pragmas). */
	readonly testEnvironments: ReadonlySet<string>;
	/** Tokens appearing in this package's own `scripts` block (binary names). */
	readonly scriptTokens: ReadonlySet<string>;
	/**
	 * Declared dependency name -> that dependency's own REQUIRED peers.
	 * Optional peers (`peerDependenciesMeta[x].optional`) are excluded: drizzle-orm
	 * lists 29 of them, so crediting those would excuse almost any database driver.
	 */
	readonly peersOfDeclared: ReadonlyMap<string, readonly string[]>;
}

export interface Divergence {
	readonly pkg: string;
	readonly dir: string;
	readonly dependency: string;
	/** `undeclared`: imported but missing from the manifest. `unused`: declared but never referenced. */
	readonly direction: "undeclared" | "unused";
	/** Example import sites (`undeclared` only). */
	readonly sites: readonly string[];
}

/**
 * Declarations that are real but unreachable from any import graph. Each entry
 * needs a reason — this list is the only escape hatch and it is reviewed on sight.
 */
export const JUSTIFIED_UNUSED: ReadonlyArray<{
	readonly pkg: string;
	readonly dependency: string;
	readonly reason: string;
}> = [
	{
		pkg: "@hyperidle/desktop",
		dependency: "@electric-sql/pglite",
		reason:
			"Marked external in __scripts__/bundle.ts and shipped verbatim by electron-builder.yml; the WASM bundle is loaded from node_modules at runtime, never imported.",
	},
	{
		pkg: "@hyperidle/agent-orchestration",
		dependency: "@types/node",
		reason:
			'`tsconfig.json`\'s own `types: ["node"]` is declared explicitly for this package (ambient Node globals, not an explicit import this scanner\'s source scan can see) — `ssrf.ts`/`git-runner.ts` import real `node:` builtins, but the ambient-types declaration itself is what this allowance covers.',
	},
	{
		pkg: "@hyperidle/website",
		dependency: "cookie",
		reason:
			"Astro's emitted prerender entry imports { parseCookie } from cookie (a cookie@2 API), but Node resolves it upward from dist/.prerender/ and would hit the cookie@0.7.2 the monorepo hoists for express@5. Declaring cookie@^2 here nests it at applications/website/node_modules where the upward resolution finds it first; nothing in this package imports it directly.",
	},
];

const TYPES_PREFIX = "@types/";

/** `@scope/name` -> `@types/scope__name`, `name` -> `@types/name`. */
export function definitelyTypedNameFor(packageName: string): string {
	if (packageName.startsWith("@")) {
		return `${TYPES_PREFIX}${packageName.slice(1).replace("/", "__")}`;
	}
	return `${TYPES_PREFIX}${packageName}`;
}

/** `@types/scope__name` -> `@scope/name`, `@types/name` -> `name`. */
export function packageNameForDefinitelyTyped(typesPackageName: string): string {
	const base = typesPackageName.slice(TYPES_PREFIX.length);
	return base.includes("__") ? `@${base.replace("__", "/")}` : base;
}

/**
 * Every dependency name the package genuinely reaches, by any route we can see:
 * an import, a CSS `@import`/`@plugin`, a vitest environment, a script binary,
 * a `@types/x` backing an imported `x`, or a peer required by something credited.
 */
function creditedDependencies(facts: PackageFacts): Set<string> {
	const credited = new Set<string>();

	for (const name of facts.imported.keys()) {
		credited.add(name);
		// An import of `x` is what makes a declared `@types/x` load-bearing.
		credited.add(definitelyTypedNameFor(name));
	}
	for (const name of facts.cssReferences) credited.add(name);
	for (const name of facts.testEnvironments) credited.add(name);
	for (const name of facts.scriptTokens) credited.add(name);
	if (facts.usesNodeBuiltins) credited.add("@types/node");

	// A declared dependency that another credited dependency lists as a REQUIRED
	// peer has to be installed for that dependency to resolve at all
	// (zod <- drizzle-zod, @tiptap/pm <- @tiptap/react, typescript <- @typescript-eslint/parser).
	// Iterate to a fixed point so a peer-of-a-peer is credited too.
	for (;;) {
		let grew = false;
		for (const [dependency, peers] of facts.peersOfDeclared) {
			if (!credited.has(dependency)) continue;
			for (const peer of peers) {
				if (facts.declared.has(peer) && !credited.has(peer)) {
					credited.add(peer);
					grew = true;
				}
			}
		}
		if (!grew) break;
	}

	return credited;
}

/**
 * Divergences for one package, both directions.
 *
 * Deliberately does NOT walk ancestor manifests: a root devDependency does not
 * excuse a package that imports it. That inheritance is exactly the hole this
 * gate exists to close.
 */
export function computePackageDivergences(facts: PackageFacts): Divergence[] {
	const divergences: Divergence[] = [];

	for (const [dependency, sites] of facts.imported) {
		if (dependency === facts.name) continue;
		if (facts.declared.has(dependency)) continue;
		// Modules that only ship on DefinitelyTyped (`estree`, `node`) are declared
		// under their `@types/` name — that is the correct declaration, not a gap.
		if (facts.declared.has(definitelyTypedNameFor(dependency))) continue;
		divergences.push({
			pkg: facts.name,
			dir: facts.dir,
			dependency,
			direction: "undeclared",
			sites,
		});
	}

	const credited = creditedDependencies(facts);
	const justified = new Set(
		JUSTIFIED_UNUSED.filter((entry) => entry.pkg === facts.name).map((e) => e.dependency),
	);
	for (const dependency of facts.declared.keys()) {
		if (credited.has(dependency)) continue;
		if (justified.has(dependency)) continue;
		divergences.push({
			pkg: facts.name,
			dir: facts.dir,
			dependency,
			direction: "unused",
			sites: [],
		});
	}

	return divergences;
}

/** Divergences across the whole repo, ordered by package then dependency. */
export function computeDependencyVerdict(packages: readonly PackageFacts[]): Divergence[] {
	return packages
		.flatMap(computePackageDivergences)
		.sort(
			(a, b) =>
				a.dir.localeCompare(b.dir) ||
				a.direction.localeCompare(b.direction) ||
				a.dependency.localeCompare(b.dependency),
		);
}
