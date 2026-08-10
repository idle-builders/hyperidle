/**
 * AU28 — loading the governance registries.
 *
 * `tools/governance/architecture.json` and `tools/governance/table-owners.json` are the data the compact model
 * reads. This module loads and validates them. Validation is not ceremony: the table registry is the
 * weakest input to the strongest clause — four rules carrying 91 production and 4,031 development
 * crossings depend on it — and it was recovered from a guard that had been deleted.
 *
 * @lore AU28: a table missing from the registry must be a BUILD ERROR, never a skipped row. The
 * retired `au6` guard printed PASS over zero files for months because nothing forced it to say how
 * much it was about. The same failure here would read as "no ownership violations" while silently
 * covering nothing.
 */

import type { Architecture, Role } from "./governance-model.js";

export interface TableOwners {
	readonly tableOwners: true;
	readonly totals: { readonly tables: number; readonly owned: number; readonly unowned: number };
	readonly owners: Readonly<Record<string, string>>;
	readonly unowned: { readonly note: string; readonly tables: Readonly<Record<string, string>> };
}

/**
 * The misplacement ledger: production-path files that are really development and cannot move yet.
 *
 * @lore AU28: this records MISPLACED FILES, keyed by path — not a crossing violation and not
 * expressible as one, which is why it is its own record rather than a row somewhere else.
 *
 * @lore AU28: an entry names its REASON, never a successor work package. The other two registries in
 * this file once carried a work-package number in an entry and it had already gone stale by the time
 * anyone read it again. The reason survives a replan; the number does not.
 */
export interface MisplacedFiles {
	readonly misplacedFiles: true;
	readonly note: string;
	/** The committed count of entries that resolve to a tracked file. Above OR below it fails. */
	readonly resolvedFiles: number;
	/** Repo-relative path → why it is stuck in a production path. */
	readonly files: Readonly<Record<string, string>>;
}

export class RegistryError extends Error {
	constructor(message: string) {
		super(`governance registry: ${message}`);
		this.name = "RegistryError";
	}
}

const ROLES: readonly Role[] = [
	"layer",
	"service",
	"framework",
	"application",
	"tooling",
	"deployment",
];

/**
 * Validate the architecture registry.
 *
 * @param packageNames every workspace package name, so a registry entry cannot name a package that
 * does not exist — the way a stale registry usually rots.
 */
export function validateArchitecture(arch: Architecture, packageNames: ReadonlySet<string>): void {
	if (arch.containment.compositionRootRoles.length === 0) {
		throw new RegistryError("no composition roots declared — then nothing may compose the system");
	}
	for (const role of arch.containment.compositionRootRoles) {
		if (!ROLES.includes(role)) throw new RegistryError(`"${role}" is not one of the six roles`);
	}

	for (const [name, entry] of Object.entries(arch.surfaces)) {
		if (typeof entry === "string") continue; // the `note` key
		if (entry.why.trim().length < 20) {
			throw new RegistryError(
				`surface "${name}" has no real justification — every surface says why it exists`,
			);
		}
		if (Array.isArray(entry.reach)) {
			for (const who of entry.reach) {
				const known =
					ROLES.includes(who as Role) ||
					packageNames.has(who) ||
					who === "harness" ||
					who === "repo root";
				if (!known)
					throw new RegistryError(
						`surface "${name}" is reachable by "${who}", which is neither a role nor a package`,
					);
			}
		} else if (entry.reach !== "everyone" && entry.reach !== "composition roots") {
			throw new RegistryError(
				`surface "${name}" declares an unknown audience "${String(entry.reach)}"`,
			);
		}
	}

	for (const layer of arch.endpoints.httpApiLayers.layers) {
		if (!packageNames.has(layer))
			throw new RegistryError(`"${layer}" publishes an HTTP API but is not a package`);
	}
	if (!packageNames.has(arch.endpoints.mcpRouter.host)) {
		throw new RegistryError(
			`the MCP router host "${arch.endpoints.mcpRouter.host}" is not a package`,
		);
	}
	if (!packageNames.has(arch.rawRuntime.host)) {
		throw new RegistryError(`the raw-runtime host "${arch.rawRuntime.host}" is not a package`);
	}
	for (const surface of arch.oneDoorSurfaces.surfaces) {
		if (!(surface in arch.surfaces)) {
			throw new RegistryError(
				`"${surface}" is held as a one-door surface but is not declared as a surface`,
			);
		}
	}
}

/**
 * Validate the table registry against the live schema.
 *
 * @param liveTables every table the schema actually declares.
 */
export function validateTableOwners(
	registry: TableOwners,
	liveTables: ReadonlySet<string>,
	packageNames: ReadonlySet<string>,
): void {
	const claimed = new Set([
		...Object.keys(registry.owners),
		...Object.keys(registry.unowned.tables),
	]);

	const missing = [...liveTables].filter((t) => !claimed.has(t)).sort();
	if (missing.length > 0) {
		throw new RegistryError(
			`${missing.length} table(s) claimed by nobody: ${missing.join(", ")}. ` +
				"A table absent from the registry is a build error, not a skipped row — name an owner or record it as unowned with a successor.",
		);
	}

	const phantom = [...claimed].filter((t) => !liveTables.has(t)).sort();
	if (phantom.length > 0) {
		throw new RegistryError(
			`${phantom.length} registry entr(y/ies) name a table the schema does not declare: ${phantom.join(", ")}`,
		);
	}

	for (const [table, owner] of Object.entries(registry.owners)) {
		if (!packageNames.has(owner))
			throw new RegistryError(`${table} is owned by "${owner}", which is not a package`);
	}

	for (const [table, why] of Object.entries(registry.unowned.tables)) {
		if (why.trim().length < 20) {
			throw new RegistryError(
				`${table} is recorded as unowned with no reason — an unowned table needs a named successor`,
			);
		}
	}

	if (registry.totals.tables !== liveTables.size) {
		throw new RegistryError(
			`registry says ${registry.totals.tables} tables, the schema declares ${liveTables.size}`,
		);
	}
}

/** The owner of a table, or null when nobody owns it. Unknown tables throw — see the lore above. */
export function ownerOf(registry: TableOwners, table: string): string | null {
	if (table in registry.owners) return registry.owners[table] ?? null;
	if (table in registry.unowned.tables) return null;
	throw new RegistryError(
		`unknown table "${table}" — every table must be claimed before it can be checked`,
	);
}
