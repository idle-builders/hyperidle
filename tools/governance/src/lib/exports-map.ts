/**
 * AU31 §7 — a package's `exports` field, read as a registry rather than a filesystem walk.
 *
 * Node's export map is the face: an entry a consumer may name, resolved once, here — so R1 (does an
 * entry resolve INSIDE the layer, never into a nested service package) and R3 (does an import
 * specifier name a DECLARED entry) share one reading of the same field instead of two.
 *
 * @lore AU31: deliberately duplicated in shape from `repo-census.ts`'s own (unexported)
 * `pickCondition`/`joinPosix` rather than importing them — the census's version resolves specifiers
 * for CROSSING DETECTION and silently drops what does not resolve (`buildCensus`'s `resolve()`:
 * `if (to === null) continue`), which is exactly the blind spot R3 exists to close. A governance rule
 * reading the manifest for its OWN sake must not go through the same silent-drop path it is there to
 * catch.
 */

export type ExportsField = string | { readonly [key: string]: ExportsField } | null | undefined;

/** Pick a target path out of an `exports` condition value — same preference order as `repo-census.ts`. */
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

/** Pure posix-ish join that collapses `.` and `..`. No `node:path` — banned in `src/rules/**`. */
function joinPosix(base: string, rel: string): string {
	const out: string[] = base === "" ? [] : base.split("/");
	for (const seg of rel.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") out.pop();
		else out.push(seg);
	}
	return out.join("/");
}

export interface ExportsMapEntry {
	/** The subpath a consumer writes, e.g. `.`, `./boot`. */
	readonly specifier: string;
	/** The repo-relative file the entry resolves to. */
	readonly target: string;
}

/** The raw subpath KEYS a package's `exports` field declares — `{"."}` for a bare string field. */
export function declaredSubpaths(exp: ExportsField): ReadonlySet<string> {
	if (exp === null || exp === undefined) return new Set();
	if (typeof exp === "string") return new Set(["."]);
	return new Set(Object.keys(exp));
}

/**
 * Every declared entry resolved to a repo-relative file that the census actually tracks. An entry
 * this repo's shape cannot resolve to a real file is skipped, not guessed at — every live entry in
 * this repo names its target's extension directly, so no `candidatesFor`-style extension guessing is
 * needed here.
 */
export function resolveExportsMap(
	pkgDir: string,
	exp: ExportsField,
	byPath: ReadonlyMap<string, unknown>,
): readonly ExportsMapEntry[] {
	if (exp === null || exp === undefined) return [];
	const entries = typeof exp === "string" ? ([[".", exp]] as const) : Object.entries(exp);
	const out: ExportsMapEntry[] = [];
	for (const [specifier, value] of entries) {
		const picked = pickCondition(value);
		if (picked === null) continue;
		const target = joinPosix(pkgDir, picked);
		if (byPath.has(target)) out.push({ specifier, target });
	}
	return out;
}

/** Parse a package.json's `exports` field, tolerating a missing or malformed one as "declares nothing". */
export function readExportsField(packageJsonSource: string): ExportsField {
	try {
		const parsed = JSON.parse(packageJsonSource) as { readonly exports?: unknown };
		return parsed.exports as ExportsField;
	} catch {
		return undefined;
	}
}
