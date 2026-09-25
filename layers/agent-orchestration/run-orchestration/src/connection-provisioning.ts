/**
 * Connection provisioning: re-apply held connections into a spawned session.
 *
 * This module moved here from
 * `layers/core-api/connections/src/connection-provisioning.ts` — the
 * session-launch-time PROVISIONING OPERATION is `agent-orchestration`'s own
 * job now. The human-configured RECORD (the `serviceConnections` table, its
 * CRUD) is a user attribute behind `edit_user`. Earlier the held-connection
 * set reached this module through a seam call and then as a snapshot baked
 * onto the request at emit time, which went stale (a connection added
 * between emit and drain never reached the sandbox).
 *
 * The table is agent-orchestration's own now, so the read is live and
 * in-layer — `deps.connections`, one
 * injected port backed by `@hyperidle/connections`'s
 * `listHeldConnectionsForProvisioning`. Not a seam: it is this Layer reading
 * this Layer's own table. `run-orchestration` is itself a Service, so it takes
 * the reader as a port rather than importing that Service (Mechanism C); the
 * Application wires the two together. The decrypt step
 * (`resolver.resolve(userId, connectionId)`) stays a separate
 * Application-composed dependency, never routed through a seam: the
 * resolver is the ONLY plaintext path, wired to sandbox injection, never to
 * routes.
 *
 * The central act: at spawn time, read the owning human's active held
 * connections, resolve each, SSRF-check each outbound URL, and write the
 * provisioned form into the session working directory so the agent's tools
 * authenticate directly. No gate; re-apply every spawn; idempotent.
 *
 * @lore AN2 ownership: Single-founder is the locked deployment
 * (authorization-model.md:32). A multi-tenant model (agent→explicit-owner FK)
 * is a future change gated by the same trigger as RLS; not built now. Every
 * held row carries its own `userId` and its token is resolved against THAT
 * owner, so hard-rule 4 (per-user isolation) is enforced per row rather than
 * by a single resolved-owner guess. When multi-tenancy arrives, the per-agent
 * owner has to arrive ON THE REQUEST from the emitting core-api resolver —
 * orchestration must not go looking for it (it reads zero core-api state) —
 * and this builder filters on that value.
 *
 * @lore AN2 claude-two-write-sites: claude's .mcp.json is written by the inline
 * Phase 8b writer (session-provisioning.ts) AND by applyProvisioningPlan
 * (claudeNative=true). The AN2 writer MERGES into the existing file so the
 * inbound hyperidle entry is preserved. The split exists because claude uses a
 * different config format from codex/opencode, and restructuring the shipping
 * inbound path is out of AN2 scope.
 *
 * @lore AN2 SVC_MCP_TOKEN: Per-server token env var name = <UPPER_SERVICE>_MCP_TOKEN
 * (not HYPERIDLE_MCP_TOKEN which is the inbound bridge token). Distinct names
 * prevent collision. E.g. github bearer MCP → GITHUB_MCP_TOKEN.
 *
 * @lore AN2 builtin-scoped-out: builtin has mcpSupport:false, runs an in-process
 * callLlm() loop via ToolRegistry — it never spawns a child and never reads
 * mcpTokenEnv. Neither the MCP-bearer carrier nor the CLI-key carrier exists for
 * builtin. Do NOT inject mcpTokenEnv for builtin sessions (dead write).
 * Builtin's external reach is the inbound MCP bridge (HyperIdle's own registry
 * tools), a separate path AN2 does not own.
 *
 * @lore AN2 SSRF-check-only-vs-pinned: The outbound URL is SSRF-checked at
 * provisioning time via resolveUrlForSSRF. A URL resolving to a private IP is
 * dropped and logged. However, the written config carries the hostname and the
 * harness re-resolves it at connect time — AN2 cannot pin the resolved IP into
 * the harness's config (it doesn't own that connect). So the written-config
 * path is NOT DNS-rebinding-guarded. Pinning is claimed ONLY on /validate
 * (T5), where AN2 owns the connect. This is the honest boundary: the held MCP
 * URL is user-configured; pinning requires proxying (forbidden by hard-rule 6).
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
 * @lore AU26 E3: `userId` is per-ROW. Each connection's token is resolved
 * against the owner the row itself carries, so a plan can never resolve a row
 * under someone else's identity. K1's shape carried one shared `userId` for the
 * whole list, resolved from core-api's `users` at emit time; orchestration does
 * not read `users` at all.
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
 * @lore AU20 Am4: removed from barrel — no cross-package consumer.
 * Exported from this file so within-package tests can reference it.
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
 * @lore AN2 token-fork: AN1 stores no `kind` on a token connection, so
 * "is this an MCP bearer or a CLI key?" is inferred:
 *   - known CLI service slug → CLI-key (all vars injected)
 *   - serverUrl present (and not a CLI-key service) → MCP-bearer
 *   - bare token, no serverUrl, not a CLI-key service → convention
 *     <SERVICE>_TOKEN env var + logged as "carrier-by-convention" (visible gap)
 * If real usage shows this guesses wrong often, AN3/AN-future adds an
 * explicit tokenKind column (AN1 concept-doc update first).
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
	// for the same service (N3 — open question §10 resolved).
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
			// authSource === "mcp" — outbound MCP pointer
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
 * Derive a unique MCP server name for a (service, authSource) pair.
 *
 * Resolves the open-question in §10: if (github token) and (github mcp) both
 * exist as server entries, the token entry gets "github" and the mcp entry
 * gets "github-mcp" (deterministic suffix).
 *
 * @lore AN2 N3: The "-mcp" suffix is deterministic and asserted in T3 so two
 * builders can't diverge on the naming convention.
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
 * @lore AN2 claude-two-write-sites: The claude carrier writes into .mcp.json by
 * merging AN2 entries into any existing mcpServers object (e.g. the inbound
 * hyperidle entry written by Phase 8b). The merge must preserve the existing
 * entries — AN2 is additive.
 */
export async function applyProvisioningPlan(args: {
	readonly plan: ProvisioningPlan;
	readonly sandboxPath: string;
	readonly cliMcpDialect?: "codex-toml" | "opencode-json" | "cursor-json";
	readonly claudeNative: boolean;
}): Promise<{ readonly mcpTokenEnv: Record<string, string> }> {
	const { plan, sandboxPath, cliMcpDialect, claudeNative } = args;

	if (plan.mcpServers.length === 0) {
		// Nothing to write; env injections from envInjections only flow via mcpTokenEnv
		// at the Phase 8b-connections merge point in session-provisioning.ts.
		return { mcpTokenEnv: {} };
	}

	if (cliMcpDialect === "codex-toml") {
		return writeCodexTomlEntries({ sandboxPath, mcpServers: plan.mcpServers });
	}

	if (cliMcpDialect === "opencode-json") {
		writeOpencodeJsonEntries({ sandboxPath, mcpServers: plan.mcpServers });
		return { mcpTokenEnv: {} };
	}

	if (claudeNative) {
		writeClaudeMcpJsonEntries({ sandboxPath, mcpServers: plan.mcpServers });
		return { mcpTokenEnv: {} };
	}

	// No carrier (e.g. builtin or unknown harness type): no-op.
	// @lore AN2 builtin-scoped-out: builtin has no carrier — a dead write here
	// would go nowhere. The correct behavior is to write nothing.
	return { mcpTokenEnv: {} };
}

// ── Per-harness writers ───────────────────────────────────────────────────────

/**
 * Write N MCP server entries to .codex-home/config.toml.
 *
 * Returns tokenEnv for each bearer server (caller injects outside allowlist).
 * This is the generalized 1→N extension of writeCodexToml in cli-mcp-config.ts.
 *
 * @lore AN2 codex-toml: Per-server token env var = <UPPER_SERVICE>_MCP_TOKEN
 * (not HYPERIDLE_MCP_TOKEN which is the inbound bridge token).
 * Appends to the existing config.toml (the inbound hyperidle entry may already
 * be there from the AL7 writeCliMcpConfig call in Phase 8b).
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
 * @lore AN2 opencode-json: opencode loads opencode.json from the spawn cwd.
 * Token inline in headers.Authorization — matches the inbound bridge shape.
 * AN2's entries are merged alongside the existing mcp.hyperidle entry if present.
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
				// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
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
 * @lore AN2 claude-two-write-sites: The inline Phase 8b writer creates the
 * initial .mcp.json with the hyperidle inbound entry. This function merges
 * AN2's external server entries into that same file. Order matters: Phase 8b
 * runs first (creates the file), then Phase 8b-connections calls applyProvisioningPlan
 * (this function merges). If Phase 8b has not run (no inbound bridge configured),
 * this function creates the file from scratch.
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
				// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
				Authorization: `Bearer ${server.bearerToken}`,
			};
		}

		existing.mcpServers[server.name] = entry;
	}

	fs.writeFileSync(mcpJsonPath, JSON.stringify(existing, null, 2), "utf-8");
}
