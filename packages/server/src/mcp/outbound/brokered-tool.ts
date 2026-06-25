/**
 * AN2 — Brokered-tool wrapper.
 *
 * Wraps one external MCP tool as a server-side RegisteredTool.
 *
 * The handler runs in the HyperIdle server process (not the sandbox) and:
 *   1. Resolves the credential server-side (never in args, never in session).
 *   2. Connects out to the external server via connectOutbound.
 *   3. Calls the tool and maps the result to a ToolResult.
 *   4. Closes the connection.
 *
 * The tool is namespaced as conn__<service>__<toolName> so external tools
 * can never shadow internal ones.
 *
 * @lore AN2: Trust boundary for reversibility. A community (unvetted) source
 * can declare idempotentHint:true on a genuinely destructive op. If honored,
 * classifyReversibility would return "reversible" → ungated direct execution.
 * AN2 closes this: community source → annotations DROPPED → fail-closed → gated.
 * Only vetted sources may honor idempotentHint (downgrade to direct).
 *
 * @lore AN2: The handler is the broker — not a separate dispatcher. This is why
 * the whole AL7 workflow (capture/gate/CAS-consume/outcome) applies for free:
 * every tool call passes through registry.invoke → classifyReversibility → router.
 * A separate dispatcher would re-introduce a kernel-executor surface (re-failing
 * AL7-no-kernel-executor.test.ts) and duplicate all the AL7 machinery.
 */

import type { ConnectorSpec, ConnectorToolDescriptor } from "@hyperidle/shared";
import { CONNECTOR_TOOL_PREFIX } from "@hyperidle/shared";
import type { ServiceConnectionResolver } from "../../services/service-connection-resolver.js";
import type { RegisteredTool } from "../../tools/tool-registry.js";
import { err, ok } from "../../tools/tool-result.js";
import { jsonSchemaToZod } from "./json-schema-to-zod.js";
import { connectOutbound } from "./outbound-mcp-client.js";

export interface WrapBrokeredToolArgs {
	readonly spec: ConnectorSpec;
	readonly connectionId: string;
	readonly ownerUserId: string;
	readonly descriptor: ConnectorToolDescriptor;
	readonly resolver: ServiceConnectionResolver;
	/**
	 * From the Connection's `trustTier`. In AN2 effectively always "community"
	 * (no vetted path exists yet — AN4 builds it). Drives annotation honoring.
	 *
	 * @lore AN2: Only "vetted" sources may pass through annotations. "community"
	 * sources have annotations DROPPED so a forged idempotentHint:true cannot
	 * bypass the review gate (classifier sees no signal → fail-closed → irreversible).
	 */
	readonly trustTier: "vetted" | "community";
}

/**
 * Wrap one external MCP tool as a server-side RegisteredTool.
 *
 * The credential is resolved INSIDE the handler at execution time — never at
 * wrap time and never stored in the returned object.
 */
export function wrapBrokeredTool(args: WrapBrokeredToolArgs): RegisteredTool {
	const { spec, connectionId, ownerUserId, descriptor, resolver, trustTier } = args;

	// Namespace the tool name: conn__<service>__<toolName>
	const name = `${CONNECTOR_TOOL_PREFIX}${spec.service}__${descriptor.name}`;

	// Convert JSON Schema → Zod for the inputSchema
	const inputSchema = jsonSchemaToZod(descriptor.inputSchema);

	// @lore AN2 trust boundary: community sources have annotations DROPPED so a
	// forged idempotentHint:true cannot reach classifyReversibility as "reversible".
	// Only vetted sources have their annotations honored (enabling downgrade-to-direct).
	// See architecture §"Reversibility classification — the trust boundary".
	const annotations =
		trustTier === "vetted" && descriptor.annotations !== undefined
			? {
					...(descriptor.annotations.destructiveHint !== undefined
						? { destructiveHint: descriptor.annotations.destructiveHint }
						: {}),
					...(descriptor.annotations.idempotentHint !== undefined
						? { idempotentHint: descriptor.annotations.idempotentHint }
						: {}),
				}
			: undefined;

	return {
		name,
		description: descriptor.description ?? `External tool: ${descriptor.name}`,
		inputSchema,
		...(annotations !== undefined && Object.keys(annotations).length > 0 ? { annotations } : {}),
		handler: async (handlerArgs, _ctx) => {
			// 1. Resolve credential server-side (never in args, never in session)
			const token = await resolver.resolve(ownerUserId, connectionId);
			if (token === null) {
				// @lore AN2 AC3c: resolver returns null → no credential available.
				// This can happen when: row absent, cross-user access, or missing server secret.
				// Refuse the call without contacting the external server.
				return err("NO_CREDENTIAL", `No credential available for connection ${connectionId}`);
			}

			// 2. Connect out to the external server with credential attached
			const outbound = await connectOutbound(spec, token);
			try {
				// 3. Call the tool and map the result
				const result = await outbound.callTool(
					descriptor.name,
					(handlerArgs as Record<string, unknown>) ?? {},
				);
				if (result.isError) {
					return err("TOOL_ERROR", result.text);
				}
				return ok(result.text);
			} finally {
				// 4. Always close the connection
				await outbound.close();
			}
		},
	};
}
