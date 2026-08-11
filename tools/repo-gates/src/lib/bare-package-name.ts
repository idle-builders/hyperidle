/**
 * Import-specifier normalization shared by the import-vs-manifest gate
 * (tools/repo-gates/src/dep-manifest-lint.ts). Lives in src/lib so workspace test
 * projects can import it without executing the gate's main().
 */

import { builtinModules } from "node:module";

export const BUILTINS = new Set(builtinModules);

/** `@scope/name/sub` -> `@scope/name`; `name/sub` -> `name`; builtins/relative -> null. */
export function barePackageName(specifier: string): string | null {
	if (!specifier || specifier.startsWith(".") || specifier.startsWith("/")) return null;
	if (specifier.startsWith("#") || specifier.startsWith("node:")) return null;
	// Bundler virtual modules (`astro:content`, `astro:assets`) are served by the
	// package before the colon. URL imports (`https://…`, matched by "//") are not
	// packages and pass through untouched.
	const bare = specifier.includes("//") ? specifier : (specifier.split(":")[0] ?? specifier);
	const segments = bare.split("/");
	const name = bare.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
	if (!name || BUILTINS.has(name)) return null;
	return name;
}
