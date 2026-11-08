/**
 * Agent Plugins 1.0.0 manifest parser for HyperIdle.
 *
 * Follows spec: https://github.com/agentplugins/agent-plugins-spec (spec/1.0.0.md)
 *
 * Fatal violations: missing $schema or name, wrong $schema value, invalid name format.
 * Non-fatal: unknown top-level fields, non-object extensions — reported as warnings.
 *
 * Our client extension namespace is "io.hyperidle": a plugin's agents and
 * subscriptions live at extensions["io.hyperidle"].agents[] / .subscriptions[].
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { OBJECT_EVENTS } from "@hyperidle/domain-model";

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
	readonly code: "UNKNOWN_TOP_LEVEL_FIELD" | "NON_OBJECT_EXTENSIONS" | "INVALID_CONTRIBUTION";
	readonly message: string;
}

// A skill from the plugin's skills/ directory. Path containment enforced before reading SKILL.md.
export interface ParsedSkill {
	readonly dirName: string;
	readonly body: string;
}

/**
 * An agent declared in extensions["io.hyperidle"].agents[].
 * The `id` is a local key used to reference the agent from subscriptions.
 * The route handler computes the stable DB id from pluginId + localId.
 */
export interface ParsedPluginAgent {
	readonly id: string;
	readonly name: string;
	/** The agent's craft — designer, developer, whatever the plugin names. Installed as `role: "agent"` plus this `discipline`; a plugin agent spec declares a discipline, never a role. */
	readonly discipline: string;
	readonly agentCategory: string;
	/** What it does, in a few words, as its page and its team show it; null when the manifest says nothing. */
	readonly what: string | null;
	/**
	 * Who this agent is, read from the file the manifest's `identity` names.
	 */
	readonly identity: string | null;
}

// A subscription declared in extensions["io.hyperidle"].subscriptions[]. Exactly one of event/schedule is set.
export interface ParsedPluginSubscription {
	readonly id: string;
	readonly name: string;
	readonly agentId: string;
	readonly event: string | null;
	readonly schedule: string | null;
	readonly prompt: string | null;
}

// An MCP server from the plugin's mcp.json. ${PLUGIN_ROOT} and ${PLUGIN_DATA} expanded at session materialisation time.
export interface ParsedMcpServer {
	readonly name: string;
	readonly config: Record<string, unknown>;
}

export interface PluginManifest {
	readonly name: string;
	readonly version: string;
	readonly description: string | null;
	readonly warnings: ManifestWarning[];
	/** Skills discovered from the plugin's skills/ directory. */
	readonly skills: ParsedSkill[];
	/** Agents declared in extensions["io.hyperidle"].agents[]. */
	readonly agents: ParsedPluginAgent[];
	/** Subscriptions declared in extensions["io.hyperidle"].subscriptions[]. */
	readonly subscriptions: ParsedPluginSubscription[];
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
 */
export function parsePluginManifest(pluginRoot: string): ManifestParseResult {
	const manifestPath = join(pluginRoot, "plugin.json");
	let raw: unknown;
	try {
		const text = readContainedFile(pluginRoot, manifestPath);
		if (text === null) throw new Error("file is missing or outside the plugin");
		raw = JSON.parse(text);
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

	// Unknown top-level fields — non-fatal
	for (const field of Object.keys(obj)) {
		if (!PERMITTED_TOP_LEVEL_FIELDS.has(field)) {
			warnings.push({
				code: "UNKNOWN_TOP_LEVEL_FIELD",
				message: `Unknown top-level field "${field}" — ignored per the plugin spec`,
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

	// Extract agents and subscriptions from our namespace
	const agents: ParsedPluginAgent[] = [];
	const subscriptions: ParsedPluginSubscription[] = [];
	if (ourExtension !== undefined) {
		if (typeof ourExtension === "object" && ourExtension !== null && !Array.isArray(ourExtension)) {
			const ext = ourExtension as Record<string, unknown>;
			if (Array.isArray(ext.agents)) {
				for (const item of ext.agents) {
					const agent = parsePluginAgent(item, warnings, pluginRoot);
					if (agent) agents.push(agent);
				}
			}
			if (Array.isArray(ext.subscriptions)) {
				for (const item of ext.subscriptions) {
					const subscription = parsePluginSubscription(item, warnings);
					if (subscription) subscriptions.push(subscription);
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

	const skills = scanSkills(pluginRoot);

	return {
		ok: true,
		manifest: {
			name,
			version,
			description,
			warnings,
			skills,
			agents,
			subscriptions,
		},
	};
}

/**
 * Read a file only if its real path (symlinks followed) lies inside the real
 * plugin root. Returns null for a path that escapes, a broken symlink, or a
 * missing/unreadable file.
 *
 * @lore: resolve()d paths compared as text never follow symlinks, so root and file are both realpath'd.
 */
function readContainedFile(root: string, filePath: string): string | null {
	try {
		const realRoot = realpathSync(root);
		const realFile = realpathSync(filePath);
		if (realFile !== realRoot && !realFile.startsWith(realRoot + sep)) return null;
		return readFileSync(realFile, "utf8");
	} catch {
		return null;
	}
}

/**
 * Scan the plugin's skills/ directory for immediate child dirs with SKILL.md.
 * Reads and returns each skill's content. Silently skips unparseable entries.
 */
function scanSkills(pluginRoot: string): ParsedSkill[] {
	const skillsDir = join(pluginRoot, "skills");
	if (!existsSync(skillsDir)) return [];

	let entries: string[];
	try {
		entries = readdirSync(skillsDir);
	} catch {
		return [];
	}

	const skills: ParsedSkill[] = [];
	for (const dirName of entries) {
		const skillDir = join(skillsDir, dirName);
		try {
			const stat = statSync(skillDir);
			if (!stat.isDirectory()) continue;
		} catch {
			continue;
		}

		const body = readContainedFile(pluginRoot, join(skillDir, "SKILL.md"));
		if (body === null) continue;

		skills.push({ dirName, body });
	}
	return skills;
}

/**
 * Parse the plugin's mcp.json file.
 * Returns an empty array if the file is absent or not a JSON object; a server
 * entry that is not an object is skipped.
 * Per spec, the top-level object has server names as keys.
 */
export function parseMcpJson(pluginRoot: string): ParsedMcpServer[] {
	const mcpPath = join(pluginRoot, "mcp.json");
	let raw: unknown;
	try {
		const text = readContainedFile(pluginRoot, mcpPath);
		if (text === null) return [];
		raw = JSON.parse(text);
	} catch {
		return [];
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];

	const servers: ParsedMcpServer[] = [];
	for (const [name, config] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof config !== "object" || config === null || Array.isArray(config)) continue;
		servers.push({ name, config: config as Record<string, unknown> });
	}
	return servers;
}

function parsePluginAgent(
	item: unknown,
	warnings: ManifestWarning[],
	pluginRoot: string,
): ParsedPluginAgent | null {
	if (typeof item !== "object" || item === null || Array.isArray(item)) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: "Agent entry is not an object — skipped",
		});
		return null;
	}
	const obj = item as Record<string, unknown>;
	if (typeof obj.id !== "string" || !obj.id) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: 'Agent missing required string "id" — skipped',
		});
		return null;
	}
	if (typeof obj.name !== "string" || !obj.name) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Agent "${obj.id}" missing required string "name" — skipped`,
		});
		return null;
	}
	if (typeof obj.discipline !== "string" || !obj.discipline) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Agent "${obj.id}" missing required string "discipline" — skipped`,
		});
		return null;
	}
	if (typeof obj.agentCategory !== "string" || !obj.agentCategory) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Agent "${obj.id}" missing required string "agentCategory" — skipped`,
		});
		return null;
	}
	//
	// A path that escapes the plugin root or is missing drops the identity silently.
	let identity: string | null = null;
	if (typeof obj.identity === "string" && obj.identity) {
		identity = readPluginFile(pluginRoot, obj.identity);
		if (identity === null) {
			warnings.push({
				code: "INVALID_CONTRIBUTION",
				message: `Agent "${obj.id}" identity file "${obj.identity}" is missing or outside the plugin — agent installed without one`,
			});
		}
	}

	return {
		id: obj.id,
		name: obj.name,
		discipline: obj.discipline,
		agentCategory: obj.agentCategory,
		what: typeof obj.what === "string" && obj.what ? obj.what : null,
		identity,
	};
}

/**
 * Read a plugin-relative file, refusing anything that escapes the plugin root.
 *
 * A manifest is data from outside, so `../../../etc/passwd` is a path it can
 * ask for; resolving and re-checking the prefix is what stops it.
 */
function readPluginFile(pluginRoot: string, relativePath: string): string | null {
	return readContainedFile(pluginRoot, resolve(pluginRoot, relativePath));
}

// `event` must be one of the nine object events; `schedule` is a bare cron expression. Exactly one required.
function parsePluginSubscription(
	item: unknown,
	warnings: ManifestWarning[],
): ParsedPluginSubscription | null {
	if (typeof item !== "object" || item === null || Array.isArray(item)) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: "Subscription entry is not an object — skipped",
		});
		return null;
	}
	const obj = item as Record<string, unknown>;
	if (typeof obj.id !== "string" || !obj.id) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: 'Subscription missing required string "id" — skipped',
		});
		return null;
	}
	if (typeof obj.name !== "string" || !obj.name) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Subscription "${obj.id}" missing required string "name" — skipped`,
		});
		return null;
	}
	if (typeof obj.agentId !== "string" || !obj.agentId) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Subscription "${obj.id}" missing required string "agentId" — skipped`,
		});
		return null;
	}
	const event = typeof obj.event === "string" ? obj.event : null;
	const schedule = typeof obj.schedule === "string" ? obj.schedule : null;
	if ((event === null) === (schedule === null)) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Subscription "${obj.id}" must set exactly one of "event"/"schedule" — skipped`,
		});
		return null;
	}
	if (event !== null && !OBJECT_EVENTS.includes(event as (typeof OBJECT_EVENTS)[number])) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Subscription "${obj.id}" has invalid "event" ${JSON.stringify(event)} — skipped (valid: ${OBJECT_EVENTS.join(", ")})`,
		});
		return null;
	}
	return {
		id: obj.id,
		name: obj.name,
		agentId: obj.agentId,
		event,
		schedule,
		prompt: typeof obj.prompt === "string" ? obj.prompt : null,
	};
}
