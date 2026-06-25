/**
 * AN2 RED — reversibility classification + trust-gated annotation unit tests (Task 4 / AC5)
 *
 * Tests FAIL until:
 *   packages/server/src/mcp/outbound/brokered-tool.ts is created and exports:
 *   - `wrapBrokeredTool(args): RegisteredTool`
 *   packages/shared/src/connector.ts is created and exports:
 *   - `CONNECTOR_TOOL_PREFIX`, `ConnectorSpec`, `ConnectorToolDescriptor`
 *   classifyReversibility is re-exported from tool-registry.ts (already exists)
 *
 * Covers:
 *   AC5(i)  — no annotations (mystery) → irreversible regardless of tier
 *   AC5(ii) — forged idempotentHint from community source → annotations DROPPED → irreversible
 *   AC5(ii) — same tool from vetted source → annotations honored → reversible (trust gate proof)
 *   AC1     — vetted source read_value (idempotentHint:true) → reversible
 *   AC3c    — null resolver → NO_CREDENTIAL err (unit, no outbound call)
 *   Name prefix invariant: conn__<service>__<toolName>
 */

import type { ConnectorSpec, ConnectorToolDescriptor } from "@hyperidle/shared";
import { CONNECTOR_TOOL_PREFIX } from "@hyperidle/shared";
import { describe, expect, it, vi } from "vitest";
import type { ServiceConnectionResolver } from "../../../services/service-connection-resolver.js";
import { classifyReversibility } from "../../../tools/tool-registry.js";
import { wrapBrokeredTool } from "../brokered-tool.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSpec(service: string): ConnectorSpec {
	return {
		service,
		transport: "http",
		url: "http://127.0.0.1:9999/mcp",
		auth: "bearer-header",
	};
}

function makeDescriptor(
	name: string,
	annotations?: { destructiveHint?: boolean; idempotentHint?: boolean },
): ConnectorToolDescriptor {
	return {
		name,
		description: `Tool ${name}`,
		inputSchema: { type: "object", properties: {} },
		...(annotations !== undefined ? { annotations } : {}),
	};
}

// Stub resolver that always returns a token (present) or null (absent)
function makeResolver(token: string | null): ServiceConnectionResolver {
	return {
		resolve: vi.fn().mockResolvedValue(token),
	} as unknown as ServiceConnectionResolver;
}

// ─────────────────────────────────────────────────────────────────────────────
// T1 — Name prefix: conn__<service>__<toolName>
// ─────────────────────────────────────────────────────────────────────────────

describe("AN2-classify T1 — tool name namespacing", () => {
	it("wrapped tool name is CONNECTOR_TOOL_PREFIX + service + __ + original name", () => {
		const tool = wrapBrokeredTool({
			spec: makeSpec("Acme"),
			connectionId: "sc-1",
			ownerUserId: "u-1",
			descriptor: makeDescriptor("read_value", { idempotentHint: true }),
			resolver: makeResolver("tok"),
			trustTier: "community",
		});
		expect(tool.name).toBe(`${CONNECTOR_TOOL_PREFIX}Acme__read_value`);
		expect(tool.name.startsWith(CONNECTOR_TOOL_PREFIX)).toBe(true);
	});

	it("CONNECTOR_TOOL_PREFIX is 'conn__'", () => {
		expect(CONNECTOR_TOOL_PREFIX).toBe("conn__");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — AC5(i): mystery tool (no annotations) → always irreversible
// ─────────────────────────────────────────────────────────────────────────────

describe("AN2-classify T2 — AC5: no-annotation tool is fail-closed irreversible", () => {
	it("mystery tool (no annotations) from community source → irreversible", () => {
		const tool = wrapBrokeredTool({
			spec: makeSpec("Acme"),
			connectionId: "sc-1",
			ownerUserId: "u-1",
			descriptor: makeDescriptor("mystery"),
			resolver: makeResolver("tok"),
			trustTier: "community",
		});
		expect(classifyReversibility(tool.name, tool)).toBe("irreversible");
	});

	it("mystery tool (no annotations) from vetted source → irreversible (fail-safe, not dependent on tier)", () => {
		const tool = wrapBrokeredTool({
			spec: makeSpec("Acme"),
			connectionId: "sc-1",
			ownerUserId: "u-1",
			descriptor: makeDescriptor("mystery"),
			resolver: makeResolver("tok"),
			trustTier: "vetted",
		});
		expect(classifyReversibility(tool.name, tool)).toBe("irreversible");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — AC5(ii): forged idempotentHint from community source is DROPPED
// ─────────────────────────────────────────────────────────────────────────────

describe("AN2-classify T3 — AC5: forged idempotentHint from community source → gated", () => {
	it("community source with idempotentHint:true → annotations DROPPED → irreversible (gate bypass prevented)", () => {
		const tool = wrapBrokeredTool({
			spec: makeSpec("BadActor"),
			connectionId: "sc-bad",
			ownerUserId: "u-1",
			descriptor: makeDescriptor("evil_read", { idempotentHint: true }),
			resolver: makeResolver("tok"),
			trustTier: "community",
		});
		// Even though the descriptor claims idempotentHint:true, community source drops it
		expect(classifyReversibility(tool.name, tool)).toBe("irreversible");
	});

	it("community source with destructiveHint:false, idempotentHint:true → still irreversible", () => {
		const tool = wrapBrokeredTool({
			spec: makeSpec("BadActor"),
			connectionId: "sc-bad",
			ownerUserId: "u-1",
			descriptor: makeDescriptor("sneaky_read", { destructiveHint: false, idempotentHint: true }),
			resolver: makeResolver("tok"),
			trustTier: "community",
		});
		expect(classifyReversibility(tool.name, tool)).toBe("irreversible");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — AC5(ii) positive proof: vetted source idempotentHint:true → reversible
// (confirms the trust gate blocks community, not all annotations globally)
// ─────────────────────────────────────────────────────────────────────────────

describe("AN2-classify T4 — vetted source idempotentHint honored → reversible", () => {
	it("vetted source read_value (idempotentHint:true) → reversible", () => {
		const tool = wrapBrokeredTool({
			spec: makeSpec("Acme"),
			connectionId: "sc-vetted",
			ownerUserId: "u-1",
			descriptor: makeDescriptor("read_value", { idempotentHint: true }),
			resolver: makeResolver("tok"),
			trustTier: "vetted",
		});
		expect(classifyReversibility(tool.name, tool)).toBe("reversible");
	});

	it("vetted source destructiveHint:true → irreversible (destructive wins over idempotent)", () => {
		const tool = wrapBrokeredTool({
			spec: makeSpec("Acme"),
			connectionId: "sc-vetted",
			ownerUserId: "u-1",
			descriptor: makeDescriptor("write_value", { destructiveHint: true }),
			resolver: makeResolver("tok"),
			trustTier: "vetted",
		});
		expect(classifyReversibility(tool.name, tool)).toBe("irreversible");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — AC3c unit: resolver → null → handler returns NO_CREDENTIAL
// ─────────────────────────────────────────────────────────────────────────────

describe("AN2-classify T5 — AC3c: null resolver → NO_CREDENTIAL without outbound call", () => {
	it("handler returns NO_CREDENTIAL err when resolver returns null", async () => {
		// connectOutbound must NEVER be called when resolver returns null.
		// We test via the handler directly (without a real MCP server).
		const resolver = makeResolver(null);
		const tool = wrapBrokeredTool({
			spec: makeSpec("Acme"),
			connectionId: "sc-absent",
			ownerUserId: "u-1",
			descriptor: makeDescriptor("read_value", { idempotentHint: true }),
			resolver,
			trustTier: "vetted",
		});

		// Minimal ToolContext stub (no db/eventBus needed for this path)
		const fakeCtx = {} as Parameters<typeof tool.handler>[1];
		const result = await tool.handler({}, fakeCtx);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.code).toBe("NO_CREDENTIAL");
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 — Token containment: the token must NOT appear in tool definitions
// ─────────────────────────────────────────────────────────────────────────────

describe("AN2-classify T6 — AC3b: token not present in tool definition surface", () => {
	it("inputSchema JSON and tool name contain no token substring", () => {
		const SECRET_TOKEN = "super-secret-token-12345";
		const tool = wrapBrokeredTool({
			spec: makeSpec("Acme"),
			connectionId: "sc-1",
			ownerUserId: "u-1",
			descriptor: makeDescriptor("read_value", { idempotentHint: true }),
			resolver: makeResolver(SECRET_TOKEN),
			trustTier: "vetted",
		});

		// Tool name must not contain the token
		expect(tool.name).not.toContain(SECRET_TOKEN);

		// Description must not contain the token
		expect(tool.description).not.toContain(SECRET_TOKEN);

		// inputSchema JSON representation must not contain the token
		const schemaJson = JSON.stringify(tool.inputSchema);
		expect(schemaJson).not.toContain(SECRET_TOKEN);
	});
});
