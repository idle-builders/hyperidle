/**
 * Connection provisioning: re-apply held connections into a spawned session.
 *
 * At spawn time: reads active held connections live from this layer's own record,
 * resolves each token against its per-row owner, SSRF-checks every outbound URL,
 * and writes the provisioned form into the session working directory. No gate;
 * re-applies every spawn; idempotent.
 *
 * @lore: connection-provisioning claude-write — .mcp.json written by session-provisioning.ts AND here (claudeNative); merges to preserve inbound hyperidle entry
 * @lore: connection-provisioning SSRF — outbound URL SSRF-checked at provision; harness re-resolves at connect; DNS-rebinding unguarded; pinning only on /validate
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { HELD_AUTH_SOURCES, type HeldAuthSource } from "@hyperidle/domain-model";
import { resolveUrlForSSRF } from "./ssrf.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * One held connection's provisioning-relevant fields (NEVER `encryptedToken`).
 * Structurally identical to `@hyperidle/connections`'s own
 * `HeldConnectionForProvisioning` — the two are wired together by the
 * Application, so this Service names the shape without importing that one.
 *
 */
export interface HeldConnectionForProvisioning {
	readonly id: string;
	readonly userId: string;
	readonly service: string;
	readonly authSource: HeldAuthSource;
	readonly serverUrl: string | null;
}

/**
 * The live, in-layer held-connection read one spawn performs.
 * Application-composed from `@hyperidle/connections`. Absent means "this
 * deployment provisions no held connections" (the graceful-degradation posture
 * `serviceConnectionResolver` already has), not "read failed".
 */
export interface HeldConnectionsReaderPort {
	listHeldForProvisioning(): Promise<readonly HeldConnectionForProvisioning[]>;
}

/** The decrypt step — stays an Application-composed direct dependency, never routed through `CoreApiPort`. */
export interface ServiceConnectionResolverPort {
	resolve(userId: string, connectionId: string): Promise<string | null>;
}

/**
 * One MCP server entry to provision into the harness config.
 * bearerToken is present for token-MCP-bearer, absent for plain mcp.
 */
export interface ProvisioningPlan {
	readonly mcpServers: readonly {
		readonly name: string;
		readonly url: string;
		readonly bearerToken?: string;
	}[];
	readonly envInjections: Readonly<Record<string, string>>;
}

// ── T2: buildProvisioningPlan ─────────────────────────────────────────────────

/**
 * Build the provisioning plan for one spawn.
 *
 * Reads active held connections LIVE from this Layer's own record, resolves
 * each token against its own owner via the resolver, SSRF-checks every
 * outbound URL (drops + logs any
 * that fail to resolve to a public IP — never throws, never blocks the
 * spawn), and returns the plan.
 *
 * The _ssrfLookup parameter is injectable for tests (overrides the DNS
 * resolution step without patching global dns.lookup).
 *
 */
export async function buildProvisioningPlan(deps: {
	readonly connections?: HeldConnectionsReaderPort;
	readonly resolver: ServiceConnectionResolverPort;
	/** Injectable DNS resolver for tests (overrides real DNS lookup). */
	readonly _ssrfLookup?: (host: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;
}): Promise<ProvisioningPlan> {
	const { connections, resolver, _ssrfLookup } = deps;
	if (!connections) return { mcpServers: [], envInjections: {} };
	const allConnections = await connections.listHeldForProvisioning();

	// Defense in depth: the reader already filters to held auth sources
	// (`token`|`mcp`) — re-assert it here so a future reader regression can't
	// silently widen this plan builder's input.
	const heldOnly = allConnections.filter((c) =>
		(HELD_AUTH_SOURCES as readonly string[]).includes(c.authSource),
	);

	const mcpServers: Array<ProvisioningPlan["mcpServers"][number]> = [];
	const envInjections: Record<string, string> = {};

	// Track which service+authSource combos have an mcpServer entry so we can
	// generate the deterministic "-mcp" suffix when both token and mcp exist
	// for the same service.
	const mcpServerNames = new Set<string>();

	for (const conn of heldOnly) {
		if (conn.authSource === "token") {
			// Per-ROW owner: never a single shared identity.
			const token = await resolver.resolve(conn.userId, conn.id);
			if (!token) {
				// No token (e.g. null serverSecret or decryption failure) — skip silently.
				// This matches the resolver's graceful-degradation posture.
				continue;
			}

			const cliEnvVars =
				conn.service.toLowerCase() === "github" ? ["GH_TOKEN", "GITHUB_TOKEN"] : undefined;
			if (cliEnvVars) {
				// CLI-key path: inject the token under all known env vars for this service.
				for (const envVar of cliEnvVars) {
					envInjections[envVar] = token;
				}
				// No MCP server entry for CLI-key tokens.
			} else if (conn.serverUrl) {
				// MCP-bearer path: inject as server entry + per-server token env var.
				const ssrfResult = await resolveUrlForSSRF(conn.serverUrl, {
					label: `AN2 ${conn.service} serverUrl`,
					...(_ssrfLookup !== undefined ? { lookup: _ssrfLookup } : {}),
				});
				if (!ssrfResult.ok) {
					// biome-ignore lint/suspicious/noConsole: graceful-degradation, matches inbound bridge :789
					console.warn(
						`[AN2 connection-provisioning] SSRF check failed for ${conn.service} (${conn.id}): ${ssrfResult.reason} — dropping entry`,
					);
					continue;
				}

				const name = deriveMcpServerName(conn.service, "token", mcpServerNames);
				mcpServerNames.add(name);
				mcpServers.push({ name, url: conn.serverUrl, bearerToken: token });

				// Per-server token env var: <UPPER_SERVICE>_MCP_TOKEN
				const envKey = `${conn.service.toUpperCase().replace(/-/g, "_")}_MCP_TOKEN`;
				envInjections[envKey] = token;
			} else {
				// Bare token, no serverUrl, not a CLI-key service.
				// Convention carrier: inject <SERVICE>_TOKEN and log as visible gap.
				const envKey = `${conn.service.toUpperCase().replace(/-/g, "_")}_TOKEN`;
				envInjections[envKey] = token;
				// biome-ignore lint/suspicious/noConsole: graceful-degradation, matches inbound bridge :789
				console.warn(
					`[AN2 connection-provisioning] carrier-by-convention for ${conn.service} (${conn.id}): ` +
						`no serverUrl and not a known CLI-key service — injecting ${envKey} ` +
						`(the tool may not read this var; add a CLI carrier mapping if needed)`,
				);
			}
		} else {
			if (!conn.serverUrl) {
				// mcp connection without a serverUrl is a DB invariant violation; skip.
				continue;
			}

			const ssrfResult = await resolveUrlForSSRF(conn.serverUrl, {
				label: `AN2 ${conn.service} serverUrl`,
				...(_ssrfLookup !== undefined ? { lookup: _ssrfLookup } : {}),
			});
			if (!ssrfResult.ok) {
				// biome-ignore lint/suspicious/noConsole: graceful-degradation, matches inbound bridge :789
				console.warn(
					`[AN2 connection-provisioning] SSRF check failed for ${conn.service} (${conn.id}): ${ssrfResult.reason} — dropping entry`,
				);
				continue;
			}

			const name = deriveMcpServerName(conn.service, "mcp", mcpServerNames);
			mcpServerNames.add(name);
			mcpServers.push({ name, url: conn.serverUrl });
		}
	}

	return { mcpServers, envInjections };
}

/**
 * If (github token) and (github mcp) both exist as server entries, the token
 * entry gets "github" and the mcp entry gets "github-mcp".
 *
 */
function deriveMcpServerName(
	service: string,
	authSource: HeldAuthSource,
	existing: ReadonlySet<string>,
): string {
	const base = service.toLowerCase().replace(/\s+/g, "-");
	// For token entries: use base name (e.g. "github")
	// For mcp entries: use base name if available, otherwise base-mcp
	// This matches N3: the token-bearer gets the plain name; mcp gets the suffix.
	if (authSource === "mcp" && existing.has(base)) {
		return `${base}-mcp`;
	}
	return base;
}

// ── T3: applyProvisioningPlan ─────────────────────────────────────────────────

/**
 * Apply the provisioning plan to a session's sandbox.
 *
 * Writes the per-harness carrier into sandboxPath:
 *   - codex-toml: appends server entries to .codex-home/config.toml
 *   - opencode-json: writes/merges opencode.json with server entries + inline headers
 *   - claude-native: writes/merges .mcp.json with server entries + inline headers
 *   - no carrier: returns empty mcpTokenEnv (no write)
 *
 * Returns the env vars to merge into SessionConfig.mcpTokenEnv.
 * Pure filesystem + return; no DB, no network.
 *
 * @lore: applyProvisioningPlan claude — merges into existing .mcp.json; the merge must preserve existing entries (additive only)
 */
export function applyProvisioningPlan(args: {
	readonly plan: ProvisioningPlan;
	readonly sandboxPath: string;
	readonly cliMcpDialect?: "codex-toml" | "opencode-json" | "cursor-json";
	readonly claudeNative: boolean;
}): Promise<{ readonly mcpTokenEnv: Record<string, string> }> {
	const { plan, sandboxPath, cliMcpDialect, claudeNative } = args;

	if (plan.mcpServers.length === 0) {
		// Nothing to write; env injections from envInjections only flow via mcpTokenEnv
		// at the Phase 8b-connections merge point in session-provisioning.ts.
		return Promise.resolve({ mcpTokenEnv: {} });
	}

	if (cliMcpDialect === "codex-toml") {
		return Promise.resolve(writeCodexTomlEntries({ sandboxPath, mcpServers: plan.mcpServers }));
	}

	if (cliMcpDialect === "opencode-json") {
		writeOpencodeJsonEntries({ sandboxPath, mcpServers: plan.mcpServers });
		return Promise.resolve({ mcpTokenEnv: {} });
	}

	if (claudeNative) {
		writeClaudeMcpJsonEntries({ sandboxPath, mcpServers: plan.mcpServers });
		return Promise.resolve({ mcpTokenEnv: {} });
	}

	// No carrier (e.g. builtin or unknown harness type): no-op.
	return Promise.resolve({ mcpTokenEnv: {} });
}

// ── Per-harness writers ───────────────────────────────────────────────────────

/**
 * Write N MCP server entries to .codex-home/config.toml.
 *
 * Returns tokenEnv for each bearer server (caller injects outside allowlist).
 * This is the generalized 1→N extension of writeCodexToml in cli-mcp-config.ts.
 *
 */
function writeCodexTomlEntries(params: {
	sandboxPath: string;
	mcpServers: ProvisioningPlan["mcpServers"];
}): { mcpTokenEnv: Record<string, string> } {
	const { sandboxPath, mcpServers } = params;
	const codexHomeDir = path.join(sandboxPath, ".codex-home");
	const configTomlPath = path.join(codexHomeDir, "config.toml");

	fs.mkdirSync(codexHomeDir, { recursive: true });

	const tokenEnv: Record<string, string> = {};

	for (const server of mcpServers) {
		const envKey = `${server.name.toUpperCase().replace(/-/g, "_")}_MCP_TOKEN`;
		let block = `\n[mcp_servers.${server.name}]\n` + `url = "${server.url}"\n`;

		if (server.bearerToken !== undefined) {
			block += `bearer_token_env_var = "${envKey}"\n`;
			tokenEnv[envKey] = server.bearerToken;
		}

		fs.appendFileSync(configTomlPath, block, "utf-8");
	}

	return { mcpTokenEnv: tokenEnv };
}

/**
 * Write N MCP server entries to opencode.json.
 *
 * Token is inline in headers.Authorization (matches writeOpencodeJson
 * for the inbound hyperidle entry). Merges with existing opencode.json if present.
 *
 * @lore: opencode-json — token inline in headers.Authorization; merged alongside the existing mcp.hyperidle entry if present
 */
function writeOpencodeJsonEntries(params: {
	sandboxPath: string;
	mcpServers: ProvisioningPlan["mcpServers"];
}): void {
	const { sandboxPath, mcpServers } = params;
	const opencodeJsonPath = path.join(sandboxPath, "opencode.json");

	// Merge with existing opencode.json if present (e.g. inbound hyperidle entry)
	type McpEntry = {
		type: string;
		url: string;
		headers?: Record<string, string>;
		enabled: boolean;
	};
	type OpenCodeJson = {
		$schema?: string;
		mcp: Record<string, McpEntry>;
	};

	let existing: OpenCodeJson = {
		$schema: "https://opencode.ai/config.json",
		mcp: {},
	};

	if (fs.existsSync(opencodeJsonPath)) {
		try {
			existing = JSON.parse(fs.readFileSync(opencodeJsonPath, "utf-8")) as OpenCodeJson;
			if (!existing.mcp) existing.mcp = {};
		} catch {
			// Corrupted file — start fresh
			existing = { $schema: "https://opencode.ai/config.json", mcp: {} };
		}
	}

	for (const server of mcpServers) {
		const entry: McpEntry = {
			type: "remote",
			url: server.url,
			enabled: true,
		};

		if (server.bearerToken !== undefined) {
			entry.headers = {
				Authorization: `Bearer ${server.bearerToken}`,
			};
		}

		existing.mcp[server.name] = entry;
	}

	fs.writeFileSync(opencodeJsonPath, JSON.stringify(existing, null, 2), "utf-8");
}

/**
 * Write N MCP server entries to .mcp.json for claude.
 *
 * Merges with existing .mcp.json if present (preserves the inbound hyperidle
 * entry written by Phase 8b in session-provisioning.ts).
 *
 */
function writeClaudeMcpJsonEntries(params: {
	sandboxPath: string;
	mcpServers: ProvisioningPlan["mcpServers"];
}): void {
	const { sandboxPath, mcpServers } = params;
	const mcpJsonPath = path.join(sandboxPath, ".mcp.json");

	type McpServerEntry = {
		type: string;
		url: string;
		headers?: Record<string, string>;
	};
	type McpJson = {
		mcpServers: Record<string, McpServerEntry>;
	};

	// Load existing .mcp.json if present (written by Phase 8b inbound bridge)
	let existing: McpJson = { mcpServers: {} };
	if (fs.existsSync(mcpJsonPath)) {
		try {
			existing = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8")) as McpJson;
			if (!existing.mcpServers) existing.mcpServers = {};
		} catch {
			existing = { mcpServers: {} };
		}
	}

	for (const server of mcpServers) {
		const entry: McpServerEntry = {
			type: "http",
			url: server.url,
		};

		if (server.bearerToken !== undefined) {
			entry.headers = {
				Authorization: `Bearer ${server.bearerToken}`,
			};
		}

		existing.mcpServers[server.name] = entry;
	}

	fs.writeFileSync(mcpJsonPath, JSON.stringify(existing, null, 2), "utf-8");
}
