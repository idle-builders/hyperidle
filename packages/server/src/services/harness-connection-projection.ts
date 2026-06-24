/**
 * AN1 — Harness connection projection.
 *
 * Maps a harness capability descriptor / MCP config into derived
 * ServiceConnectionView[] rows. Source 1 (harness/env) is NEVER stored in the
 * serviceConnections table — it is derived live from what the harness already
 * has configured.
 *
 * @lore AN1: The harness/env rows have:
 *   - authSource: "harness" (not stored, not removable)
 *   - removable: false (the user manages auth in the harness, not here)
 *   - toolCount: null (AN2 connects out and counts; null until then)
 *   - trustTier: "vetted" (harness-registered tools are treated as vetted by default)
 *   - health: derived from the descriptor's server health field
 *   - via: "{harnessName} · {serverName or 'native'}"
 *
 * @lore AN1: This function is the list endpoint's second source after the DB
 * query. The GET /api/connections handler unions stored rows with the projection.
 */

import type { ServiceConnectionView } from "@hyperidle/shared";

/**
 * Minimal harness descriptor shape the projection needs.
 * The actual HarnessCapabilityDescriptor type (from packages/shared/src/harness)
 * carries more fields; we accept a structural subset so this function is
 * testable with simple fixture objects.
 */
interface McpServerInfo {
	name: string;
	url: string | null;
	health: "usable" | "needs-attention" | "expired";
}

interface HarnessDescriptorLike {
	name: string;
	discovery?: {
		state: string;
	};
	mcpServers?: McpServerInfo[];
}

/**
 * Project harness MCP servers into ServiceConnectionView rows.
 *
 * @param descriptor — harness capability descriptor or null (no harness detected)
 * @returns derived ServiceConnectionView[] with authSource:"harness", removable:false
 */
export function projectHarnessConnections(
	descriptor: HarnessDescriptorLike | null,
): ServiceConnectionView[] {
	if (!descriptor) return [];
	if (!descriptor.mcpServers || descriptor.mcpServers.length === 0) return [];

	return descriptor.mcpServers.map((server): ServiceConnectionView => {
		// @lore AN1: via is server-constructed (NIT-3): "{harnessName} · {serverName}".
		// Never echoes a raw URL into the view.
		const via = `${descriptor.name} · ${server.name}`;

		return {
			// @lore AN1: harness rows use a deterministic derived id from harness+server names.
			// Not a real DB row id — these rows are not DELETE-able.
			id: `harness:${descriptor.name}:${server.name}`,
			service: server.name,
			via,
			authSource: "harness",
			health: server.health,
			trustTier: "vetted",
			toolCount: null,
			removable: false,
		};
	});
}
