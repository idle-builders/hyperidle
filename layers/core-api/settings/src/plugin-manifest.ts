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

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
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

/**
 * A skill discovered from the plugin's skills/ directory.
 * The dirName is the immediate child directory name (used as title/key).
 * The body is the full content of SKILL.md.
 *
 * @lore BA9b: Path containment is enforced before reading SKILL.md —
 * the resolved path must stay inside the plugin root to prevent traversal.
 */
export interface ParsedSkill {
	readonly dirName: string;
	readonly body: string;
}

/**
 * An agent declared in extensions["io.hyperidle"].agents[].
 * The `id` is a local key used to reference the agent from routines.
 * The route handler computes the stable DB id from pluginId + localId.
 */
export interface ParsedPluginAgent {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly agentCategory: string;
	/**
	 * Who this agent is, read from the file the manifest's `identity` names.
	 *
	 * @lore BA9g: the gap BA9f named — "a plugin contributing an agent had
	 * nothing to contribute its identity to". It does now: the identity is a
	 * document, and this is the plugin's copy of it. Absent → the agent
	 * installs bare, which is what HyperIdle itself ships.
	 */
	readonly identity: string | null;
}

/**
 * A routine declared in extensions["io.hyperidle"].routines[].
 * `agentId` references a ParsedPluginAgent.id within this manifest.
 * The route handler computes stable DB ids for both the routine and agent.
 */
export interface ParsedPluginRoutine {
	readonly id: string;
	readonly name: string;
	readonly agentId: string;
	readonly triggerType: string;
	readonly triggerConfig: string | null;
	readonly eventType: string | null;
	readonly prompt: string | null;
}

/**
 * An MCP server parsed from the plugin's mcp.json.
 * The name is the server key, the config is the server object.
 *
 * @lore BA9b: Per Agent Plugins 1.0.0 spec, ${PLUGIN_ROOT} and ${PLUGIN_DATA}
 * must be expanded by the client (at session materialisation time).
 */
export interface ParsedMcpServer {
	readonly name: string;
	readonly config: Record<string, unknown>;
}

export interface PluginManifest {
	readonly name: string;
	readonly version: string;
	readonly description: string | null;
	readonly contributions: ParsedContribution[];
	readonly warnings: ManifestWarning[];
	/** Skills discovered from the plugin's skills/ directory. */
	readonly skills: ParsedSkill[];
	/** MCP servers from the plugin's mcp.json. */
	readonly mcpServers: ParsedMcpServer[];
	/** Agents declared in extensions["io.hyperidle"].agents[]. */
	readonly agents: ParsedPluginAgent[];
	/** Routines declared in extensions["io.hyperidle"].routines[]. */
	readonly routines: ParsedPluginRoutine[];
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

	// Extract contributions, agents, and routines from our namespace
	const contributions: ParsedContribution[] = [];
	const agents: ParsedPluginAgent[] = [];
	const routines: ParsedPluginRoutine[] = [];
	if (ourExtension !== undefined) {
		if (typeof ourExtension === "object" && ourExtension !== null && !Array.isArray(ourExtension)) {
			const ext = ourExtension as Record<string, unknown>;
			if (Array.isArray(ext.contributions)) {
				for (const item of ext.contributions) {
					const contribution = parseContribution(item, warnings);
					if (contribution) contributions.push(contribution);
				}
			}
			if (Array.isArray(ext.agents)) {
				for (const item of ext.agents) {
					const agent = parsePluginAgent(item, warnings, pluginRoot);
					if (agent) agents.push(agent);
				}
			}
			if (Array.isArray(ext.routines)) {
				for (const item of ext.routines) {
					const routine = parsePluginRoutine(item, warnings);
					if (routine) routines.push(routine);
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

	const skills = scanSkills(pluginRoot, warnings);
	const mcpServers = parseMcpJson(pluginRoot, warnings);

	return {
		ok: true,
		manifest: {
			name,
			version,
			description,
			contributions,
			warnings,
			skills,
			mcpServers,
			agents,
			routines,
		},
	};
}

/**
 * Returns true iff `filePath` resolves to a path strictly inside `root`.
 * Prevents path traversal (e.g., skills/../../etc/passwd).
 *
 * @lore BA9b: BA9a deleted a containment helper because nothing used it.
 * This is the package that reads skill files — containment lives here.
 */
export function isContainedWithin(filePath: string, root: string): boolean {
	const resolvedRoot = resolve(root);
	const resolvedFile = resolve(filePath);
	return resolvedFile.startsWith(`${resolvedRoot}/`) || resolvedFile === resolvedRoot;
}

/**
 * Scan the plugin's skills/ directory for immediate child dirs with SKILL.md.
 * Reads and returns each skill's content. Silently skips unparseable entries.
 */
function scanSkills(pluginRoot: string, warnings: ManifestWarning[]): ParsedSkill[] {
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

		const skillMdPath = join(skillDir, "SKILL.md");
		if (!isContainedWithin(skillMdPath, pluginRoot)) {
			warnings.push({
				code: "UNKNOWN_TOP_LEVEL_FIELD",
				message: `Skill "${dirName}" has a SKILL.md path outside the plugin root — skipped`,
			});
			continue;
		}

		if (!existsSync(skillMdPath)) continue;

		let body: string;
		try {
			body = readFileSync(skillMdPath, "utf8");
		} catch {
			continue;
		}

		skills.push({ dirName, body });
	}
	return skills;
}

/**
 * Parse the plugin's mcp.json file.
 * Returns an empty array if the file is absent or invalid.
 * Per spec, the top-level object has server names as keys.
 */
function parseMcpJson(pluginRoot: string, warnings: ManifestWarning[]): ParsedMcpServer[] {
	const mcpPath = join(pluginRoot, "mcp.json");
	if (!existsSync(mcpPath)) return [];

	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(mcpPath, "utf8"));
	} catch {
		warnings.push({
			code: "UNKNOWN_TOP_LEVEL_FIELD",
			message: "mcp.json is not valid JSON — ignored",
		});
		return [];
	}

	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		warnings.push({
			code: "UNKNOWN_TOP_LEVEL_FIELD",
			message: "mcp.json must be a JSON object — ignored",
		});
		return [];
	}

	const servers: ParsedMcpServer[] = [];
	for (const [name, config] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof config !== "object" || config === null || Array.isArray(config)) {
			warnings.push({
				code: "UNKNOWN_TOP_LEVEL_FIELD",
				message: `mcp.json server "${name}" is not an object — skipped`,
			});
			continue;
		}
		servers.push({ name, config: config as Record<string, unknown> });
	}
	return servers;
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
	if (typeof obj.role !== "string" || !obj.role) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Agent "${obj.id}" missing required string "role" — skipped`,
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
	// @lore BA9d: agentCategory accepts any non-empty string here — deliberate.
	// The user-facing POST /api/agents Zod schema enforces z.enum(AGENT_CATEGORIES),
	// but plugin agents are installed server-side and trusted; gating them at the
	// parse layer would break forward-compat (a new category would silently skip
	// every existing agent). The API guard is the right choke-point.
	// `identity` names a file inside the plugin, the way a skill's body is a
	// file. A path that escapes the plugin root, or names a file that is not
	// there, drops the identity and keeps the agent — a bare agent is a valid
	// agent, so a typo must not cost you the whole contribution.
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
		role: obj.role,
		agentCategory: obj.agentCategory,
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
	const resolvedRoot = resolve(pluginRoot);
	const target = resolve(resolvedRoot, relativePath);
	if (target !== resolvedRoot && !target.startsWith(resolvedRoot + sep)) {
		return null;
	}
	try {
		return readFileSync(target, "utf8");
	} catch {
		return null;
	}
}

function parsePluginRoutine(
	item: unknown,
	warnings: ManifestWarning[],
): ParsedPluginRoutine | null {
	if (typeof item !== "object" || item === null || Array.isArray(item)) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: "Routine entry is not an object — skipped",
		});
		return null;
	}
	const obj = item as Record<string, unknown>;
	if (typeof obj.id !== "string" || !obj.id) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: 'Routine missing required string "id" — skipped',
		});
		return null;
	}
	if (typeof obj.name !== "string" || !obj.name) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Routine "${obj.id}" missing required string "name" — skipped`,
		});
		return null;
	}
	if (typeof obj.agentId !== "string" || !obj.agentId) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Routine "${obj.id}" missing required string "agentId" — skipped`,
		});
		return null;
	}
	if (typeof obj.triggerType !== "string" || !obj.triggerType) {
		warnings.push({
			code: "INVALID_CONTRIBUTION",
			message: `Routine "${obj.id}" missing required string "triggerType" — skipped`,
		});
		return null;
	}
	return {
		id: obj.id,
		name: obj.name,
		agentId: obj.agentId,
		triggerType: obj.triggerType,
		triggerConfig: typeof obj.triggerConfig === "string" ? obj.triggerConfig : null,
		eventType: typeof obj.eventType === "string" ? obj.eventType : null,
		prompt: typeof obj.prompt === "string" ? obj.prompt : null,
	};
}
