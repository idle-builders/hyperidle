/**
 * AN2 — Connector resolver.
 *
 * Enumerates the brokerable connections for a given owner user, connects out to
 * each external MCP server, lists its tools, and wraps each as a RegisteredTool.
 *
 * AN2 brokers ONLY `authSource="token"` connections. Verified against the AN1
 * resolver: resolve() returns a token only for token-source rows with non-null
 * encryptedToken. mcp-oauth rows have encryptedToken=null → null → zero tools.
 * Harness-source connections are never stored in serviceConnections at all.
 *
 * @lore AN2: The `resolveConnectorSpec` seam is deliberately minimal. AN4 replaces
 * it with the manifest/registry. Keeping it as a single function argument ensures
 * AN4 can swap it without touching the broker.
 *
 * @lore AN2: Fail-quiet on unknown spec / null credential. A connection whose
 * ConnectorSpec is not registered contributes ZERO tools (no crash, no error thrown).
 * Similarly, a connection whose resolve() returns null (null credential) is skipped.
 *
 * @lore AN2: Health filter is deferred. An expired-health token simply fails at the
 * external service call, surfaced as a normal tool error. Filtering on health="usable"
 * is a one-line tightening AN4 can add with trust-tier.
 */

import { type HyperIdleDb, serviceConnections } from "@hyperidle/db";
import type { ConnectorSpec, ConnectorToolDescriptor } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import type { ServiceConnectionResolver } from "../../services/service-connection-resolver.js";
import type { RegisteredTool } from "../../tools/tool-registry.js";
import { wrapBrokeredTool } from "./brokered-tool.js";
import { connectOutbound } from "./outbound-mcp-client.js";

export interface ResolveConnectorsDeps {
	readonly db: HyperIdleDb;
	readonly resolver: ServiceConnectionResolver;
	/** Config seam: service name → ConnectorSpec. AN4 replaces this. */
	readonly resolveSpec: (service: string) => ConnectorSpec | null;
}

/**
 * Enumerate exactly the brokerable connections for ownerUserId, connect out,
 * list tools, wrap each as a RegisteredTool.
 *
 * WHAT IT ENUMERATES:
 *   serviceConnections WHERE userId=ownerUserId AND authSource="token"
 *
 * A connection whose ConnectorSpec is unknown, or whose resolve()==null,
 * contributes ZERO tools (fail-quiet; logged via observability placeholder).
 *
 * Returns the tools + a disposer the session teardown calls.
 */
export async function resolveConnectorTools(
	deps: ResolveConnectorsDeps,
	ownerUserId: string,
): Promise<{ tools: RegisteredTool[]; dispose: () => Promise<void> }> {
	const { db, resolver, resolveSpec } = deps;

	// Enumerate only token-source connections for this user.
	// mcp-oauth rows have encryptedToken=null → resolve() returns null → skipped below.
	// harness-source is never stored in this table.
	const rows = await db
		.select()
		.from(serviceConnections)
		.where(
			and(eq(serviceConnections.userId, ownerUserId), eq(serviceConnections.authSource, "token")),
		);

	const tools: RegisteredTool[] = [];

	for (const row of rows) {
		// Get the ConnectorSpec for this service (fail-quiet if unknown)
		const spec = resolveSpec(row.service);
		if (spec === null) {
			// @lore AN2: Unknown service → no spec → contribute zero tools.
			// This is expected for services not yet registered in the config seam.
			// AN4 fills in the registry; until then, unknown services are silent no-ops.
			continue;
		}

		// Resolve the credential to check it's available before connecting.
		// (The handler also resolves at execution time — this pre-check avoids
		// spawning an outbound connection for a connection with no valid credential.)
		const token = await resolver.resolve(ownerUserId, row.id);
		if (token === null) {
			// No credential available (absent row, wrong user, or missing server secret)
			continue;
		}

		// Connect out and list tools
		let toolDescriptors: ConnectorToolDescriptor[];
		const outbound = await connectOutbound(spec, token).catch(() => null);
		if (outbound === null) {
			// Fail-quiet: external server unreachable or protocol error → no tools
			continue;
		}
		try {
			toolDescriptors = await outbound.listTools();
		} catch {
			// Fail-quiet: listTools failed — close the connection to avoid leaks, then skip
			await outbound.close();
			continue;
		}
		await outbound.close();

		// Determine trust tier (from the stored row)
		const trustTier = (row.trustTier === "vetted" ? "vetted" : "community") as
			| "vetted"
			| "community";

		// Wrap each tool as a RegisteredTool
		for (const descriptor of toolDescriptors) {
			tools.push(
				wrapBrokeredTool({
					spec,
					connectionId: row.id,
					ownerUserId,
					descriptor,
					resolver,
					trustTier,
				}),
			);
		}
	}

	// Dispose is a no-op for now (connections are closed after tool list).
	// If AN4 introduces persistent connections, dispose would close them.
	const dispose = async (): Promise<void> => {
		// @lore AN2: Per-call connections (http: one request; stdio: child process per call)
		// are opened and closed inside the handler. No persistent connection state to clean up.
	};

	return { tools, dispose };
}

/**
 * Minimal config seam: service name → ConnectorSpec.
 *
 * This is the AN2 stub implementation. AN4 replaces it with the manifest/registry.
 * The seam is a function so AN4 can inject its own implementation without modifying
 * the broker or resolver.
 *
 * Currently empty: returns null for all services (no hardcoded connectors).
 * Tests inject their own resolveSpec via the ResolveConnectorsDeps interface.
 */
export function defaultResolveConnectorSpec(_service: string): ConnectorSpec | null {
	return null;
}
