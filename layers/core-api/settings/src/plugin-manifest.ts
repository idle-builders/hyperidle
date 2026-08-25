/**
 * Agent Plugins 1.0.0 manifest parser for HyperIdle.
 *
 * Follows spec: https://github.com/agentplugins/agent-plugins-spec (spec/1.0.0.md)
 *
 * Fatal violations: missing $schema or name, wrong $schema value, invalid name format.
 * Non-fatal: unknown top-level fields, non-object extensions — reported as warnings.
 *
 * Our client extension namespace is "io.hyperidle". Contributions live at
 * extensions["io.hyperidle"].contributions[].
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfigurationKind } from "@hyperidle/domain-model";
import { BUILTIN_PLUGIN_ID, CONFIGURATION_KINDS } from "@hyperidle/domain-model";

// ---------------------------------------------------------------------------
// Spec constants
// ---------------------------------------------------------------------------

const SPEC_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const OUR_NAMESPACE = "io.hyperidle";

/**
 * All top-level fields permitted by the 1.0.0 spec.
 * Unknown fields beyond these are non-fatal.
 */
const PERMITTED_TOP_LEVEL_FIELDS = new Set([
	"$schema",
	"name",
	"version",
	"description",
	"author",
	"homepage",
	"repository",
	"license",
	"keywords",
	"extensions",
]);

/**
 * Plugin name validation per spec:
 * 1–64 chars, lowercase alphanumeric, hyphens, and periods.
 * No leading/trailing hyphens or periods.
 * No consecutive hyphens/periods.
 */
function isValidPluginName(name: unknown): name is string {
	if (typeof name !== "string") return false;
	if (name.length < 1 || name.length > 64) return false;
	// Must start and end with alphanumeric
	if (!(/^[a-z0-9]/.test(name) && /[a-z0-9]$/.test(name))) return false;
	// Only alphanumeric, hyphens, periods
	if (!/^[a-z0-9][\w\-.]*[a-z0-9]$/.test(name) && name.length > 1) return false;
	if (name.length === 1 && !/^[a-z0-9]$/.test(name)) return false;
	// No uppercase letters or underscores
	if (/[A-Z_]/.test(name)) return false;
	// No consecutive separators
	if (/[-.][-.]/.test(name)) return false;
	return true;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ManifestWarning {
	readonly code:
		| "UNKNOWN_TOP_LEVEL_FIELD"
		| "NON_OBJECT_EXTENSIONS"
		| "INVALID_CONTRIBUTION"
		| "RESERVED_PLUGIN_ID";
	readonly message: string;
}

export interface ParsedContribution {
	readonly kind: ConfigurationKind;
	readonly key: string;
	readonly value: Record<string, unknown>;
}

export interface PluginManifest {
	readonly name: string;
	readonly version: string;
	readonly description: string | null;
	readonly contributions: ParsedContribution[];
	readonly warnings: ManifestWarning[];
}

export type ManifestParseResult =
	| { ok: true; manifest: PluginManifest }
	| { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse and validate a plugin.json file at the given plugin root.
 *
 * Returns ok:false with a human-readable reason for fatal violations.
 * Returns ok:true with a manifest that includes non-fatal warnings.
 *
 * @lore BA9a: "builtin" is a reserved plugin ID — rejected at parse time so
 * the installer never needs to handle it as a special case.
 */
export function parsePluginManifest(pluginRoot: string): ManifestParseResult {
	const manifestPath = join(pluginRoot, "plugin.json");
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(manifestPath, "utf8"));
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { ok: false, reason: `Cannot read plugin.json: ${msg}` };
	}

	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return { ok: false, reason: "plugin.json must be a JSON object" };
	}

	const obj = raw as Record<string, unknown>;
	const warnings: ManifestWarning[] = [];

	// $schema — required, must equal the spec URL
	if (!("$schema" in obj)) {
		return { ok: false, reason: 'plugin.json is missing required field "$schema"' };
	}
	if (obj.$schema !== SPEC_SCHEMA_URL) {
		return {
			ok: false,
			reason: `plugin.json "$schema" must be "${SPEC_SCHEMA_URL}" (got: ${JSON.stringify(obj.$schema)})`,
		};
	}

	// name — required, valid format
	if (!("name" in obj)) {
		return { ok: false, reason: 'plugin.json is missing required field "name"' };
	}
	if (!isValidPluginName(obj.name)) {
		return {
			ok: false,
			reason: `plugin.json "name" is invalid: must be 1–64 lowercase alphanumeric characters, hyphens or periods; no leading/trailing or consecutive separators (got: ${JSON.stringify(obj.name)})`,
		};
	}
	const name = obj.name;

	// builtin is reserved
	if (name === BUILTIN_PLUGIN_ID) {
		return {
			ok: false,
			reason: `plugin.json "name" "${BUILTIN_PLUGIN_ID}" is reserved and cannot be used for an installed plugin`,
		};
	}

	// Unknown top-level fields — non-fatal
	for (const field of Object.keys(obj)) {
		if (!PERMITTED_TOP_LEVEL_FIELDS.has(field)) {
			warnings.push({
				code: "UNKNOWN_TOP_LEVEL_FIELD",
				message: `Unknown top-level field "${field}" — ignored per spec §manifest`,
			});
		}
	}

	// extensions — non-fatal if not an object
	let ourExtension: unknown;
	if ("extensions" in obj) {
		if (
			typeof obj.extensions !== "object" ||
			obj.extensions === null ||
			Array.isArray(obj.extensions)
		) {
			warnings.push({
				code: "NON_OBJECT_EXTENSIONS",
				message: 'plugin.json "extensions" is not an object — ignored',
			});
		} else {
			ourExtension = (obj.extensions as Record<string, unknown>)[OUR_NAMESPACE];
		}
	}

	// Extract contributions from our namespace
	const contributions: ParsedContribution[] = [];
	if (ourExtension !== undefined) {
		if (typeof ourExtension === "object" && ourExtension !== null && !Array.isArray(ourExtension)) {
			const ext = ourExtension as Record<string, unknown>;
			if (Array.isArray(ext.contributions)) {
				for (const item of ext.contributions) {
					const contribution = parseContribution(item, warnings);
					if (contribution) contributions.push(contribution);
				}
			}
		}
	}

	// version — optional, but must be a string when present (wrong type is fatal per spec)
	if ("version" in obj && typeof obj.version !== "string") {
		return {
			ok: false,
			reason: `plugin.json "version" must be a string (got: ${JSON.stringify(obj.version)})`,
		};
	}
	const version = typeof obj.version === "string" ? obj.version : "0";
	const description = typeof obj.description === "string" ? obj.description : null;

	return {
		ok: true,
		manifest: { name, version, description, contributions, warnings },
	};
}

function parseContribution(item: unknown, warnings: ManifestWarning[]): ParsedContribution | null {
	if (typeof item !== "object" || item === null || Array.isArray(item)) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: "Contribution entry is not an object — skipped",
		});
		return null;
	}
	const obj = item as Record<string, unknown>;

	const { kind, key, value } = obj;

	// kind must be a valid ConfigurationKind
	if (typeof kind !== "string" || !CONFIGURATION_KINDS.includes(kind as ConfigurationKind)) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Contribution has invalid "kind" ${JSON.stringify(kind)} — skipped (valid: ${CONFIGURATION_KINDS.join(", ")})`,
		});
		return null;
	}

	// key must be a non-empty string without "/"
	if (typeof key !== "string" || key.trim() === "") {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Contribution has invalid "key" ${JSON.stringify(key)} — skipped (must be a non-empty string)`,
		});
		return null;
	}
	if (key.includes("/")) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Contribution key ${JSON.stringify(key)} contains "/" which is not allowed — skipped`,
		});
		return null;
	}

	// value must be a plain object (not array, not null)
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Contribution "${key}" has invalid "value" — must be a JSON object, skipped`,
		});
		return null;
	}

	return {
		kind: kind as ConfigurationKind,
		key,
		value: value as Record<string, unknown>,
	};
}
